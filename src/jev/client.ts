/**
 * HTTP client for TypeSafe's evaluation endpoint.
 *
 * One request evaluates a state against every question in parallel and returns
 * every answer together, which is the property the token claim rests on: the
 * state is sent and billed once no matter how many judgments are read out of
 * it. The client is transport only — it does not know about Cordis, the
 * ledger, or the tool surface — so it stays testable against an injected
 * `fetch`.
 *
 * @module dsh-plugin-jev/jev/client
 */

import { isJevEvaluation } from './contracts.ts'
import type { JevEvaluation, JevJson, JevQuestion } from './contracts.ts'
import { JevRequestError } from './errors.ts'
import type { JevErrorOptions } from './errors.ts'
import {
  DEFAULT_RETRY_BASE_MS,
  backoffFor,
  classifyStatus,
  createRequestScope,
  decodeJson,
  defaultSleep,
  excerpt,
  messageOf,
  retryAfterMs,
} from './transport.ts'
import type { RequestScope } from './transport.ts'

/** Endpoint path appended to the configured base URL. */
const EVALUATION_PATH = '/v1/systemone'

/** First attempt index. */
const FIRST_ATTEMPT = 0

/** Increment applied to the attempt index. */
const ATTEMPT_STEP = 1

/** One evaluation request, without transport configuration. */
interface JevEvaluateInput {
  /** Content to evaluate. */
  state: JevJson
  /** Typed questions keyed by the id their answers return under. */
  questions: Record<string, JevQuestion>
  /** Model override for this request; defaults to the client's model. */
  model?: string
}

/** Per-call controls. */
interface JevEvaluateOptions {
  /** Caller cancellation, fused with the configured deadline. */
  signal?: AbortSignal
  /**
   * Credential for this call, when the caller resolves one per operation.
   *
   * A credential seam can be written while the host runs, so the client must
   * accept a fresher key than the one it was constructed with.
   */
  apiKey?: string
}

/** Transport for one configured endpoint. */
interface JevClient {
  /** Model id or alias sent when a call does not override it. */
  readonly model: string
  /**
   * Evaluate one state against one or more questions.
   *
   * @param input - State and questions.
   * @param options - Per-call controls.
   * @returns The validated evaluation response.
   */
  evaluate: (
    input: JevEvaluateInput,
    options?: JevEvaluateOptions,
  ) => Promise<JevEvaluation>
}

/** Construction options for {@link createJevClient}. */
interface JevClientOptions {
  /** Bearer credential. */
  apiKey: string
  /** Endpoint base URL without a trailing slash. */
  baseUrl: string
  /** Model id or alias. */
  model: string
  /** Per-attempt deadline in milliseconds. */
  timeoutMs: number
  /** Attempts after the first one. */
  maxRetries: number
  /** Transport; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
  /** First backoff wait; lowered in tests to keep them fast. */
  retryBaseMs?: number
  /** Backoff wait; replaced in tests so retries do not sleep. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

/** Everything one call needs, resolved once per client. */
interface AttemptContext {
  /** Transport in use. */
  fetchImpl: typeof fetch
  /** Fully qualified evaluation URL. */
  url: string
  /** Bearer credential. */
  apiKey: string
  /** Model id or alias sent when the call does not override it. */
  model: string
  /** Per-attempt deadline in milliseconds. */
  timeoutMs: number
  /** Attempts after the first one. */
  maxRetries: number
  /** First backoff wait in milliseconds. */
  retryBaseMs: number
  /** Backoff wait implementation. */
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>
}

/** One call's immutable inputs across its attempts. */
interface AttemptRequest {
  /** State and questions. */
  input: JevEvaluateInput
  /** Cancellation supplied by the caller, if any. */
  callerSignal: AbortSignal | undefined
  /** Credential for this call, when the caller resolved one. */
  apiKey: string | undefined
}

/** Everything one HTTP POST needs. */
interface PostOptions {
  /** Transport in use. */
  fetchImpl: typeof fetch
  /** Fully qualified evaluation URL. */
  url: string
  /** Bearer credential. */
  apiKey: string
  /** Encoded request body. */
  body: string
  /** Deadline and cancellation for this attempt. */
  scope: RequestScope
  /** Cancellation supplied by the caller, if any. */
  callerSignal: AbortSignal | undefined
  /** Per-attempt deadline, used only in the failure message. */
  timeoutMs: number
}

/**
 * Perform one POST, mapping transport failures onto classified errors.
 *
 * @param options - Request, transport, and deadline.
 * @returns The raw response, whatever its status.
 * @throws {JevRequestError} When the transport itself failed.
 */
async function postJson(options: PostOptions): Promise<Response> {
  try {
    return await options.fetchImpl(options.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        'content-type': 'application/json',
      },
      body: options.body,
      signal: options.scope.signal,
    })
  } catch (error) {
    if (options.callerSignal?.aborted === true) {
      throw new JevRequestError('request cancelled by the caller', {
        code: 'aborted',
        retryable: false,
      })
    }
    if (options.scope.expired()) {
      throw new JevRequestError(
        `TypeSafe did not answer within ${options.timeoutMs}ms`,
        { code: 'timeout', retryable: true },
      )
    }
    throw new JevRequestError(`TypeSafe transport failure: ${messageOf(error)}`, {
      code: 'transport',
      retryable: true,
    })
  }
}

/**
 * Decode and validate one response body.
 *
 * @param text - Raw response text.
 * @returns The validated evaluation response.
 * @throws {JevRequestError} When the body is not a usable evaluation.
 */
function parseEvaluation(text: string): JevEvaluation {
  const parsed = decodeJson(text)
  if (!isJevEvaluation(parsed)) {
    throw new JevRequestError(
      'TypeSafe returned a body that does not match the evaluation contract',
      { code: 'invalid-response', retryable: false },
    )
  }
  return parsed
}

/**
 * Build the classified error for a rejected response.
 *
 * @param response - The rejected response.
 * @param text - Its body.
 * @returns The error to throw.
 */
function rejectionFor(response: Response, text: string): JevRequestError {
  const { code, retryable } = classifyStatus(response.status)
  const options: JevErrorOptions = { code, retryable, status: response.status }
  const requested = retryAfterMs(response)
  if (requested !== undefined) {
    options.retryAfterMs = requested
  }
  return new JevRequestError(
    `TypeSafe rejected the request with ${response.status} (${code}): ${excerpt(text)}`,
    options,
  )
}

/**
 * Perform one attempt, without retrying.
 *
 * @param context - Resolved transport configuration.
 * @param request - State, questions and cancellation.
 * @returns The validated evaluation response.
 */
async function sendOnce(
  context: AttemptContext,
  request: AttemptRequest,
): Promise<JevEvaluation> {
  const scope = createRequestScope(request.callerSignal, context.timeoutMs)
  try {
    const response = await postJson({
      fetchImpl: context.fetchImpl,
      url: context.url,
      apiKey: request.apiKey ?? context.apiKey,
      body: JSON.stringify({
        state: request.input.state,
        model: request.input.model ?? context.model,
        questions: request.input.questions,
      }),
      scope,
      callerSignal: request.callerSignal,
      timeoutMs: context.timeoutMs,
    })
    const text = await response.text()
    if (!response.ok) {
      throw rejectionFor(response, text)
    }
    return parseEvaluation(text)
  } finally {
    scope.release()
  }
}

/**
 * Attempt a call, retrying transient failures with backoff.
 *
 * Written as recursion rather than a loop because the wait between attempts is
 * part of the contract: each retry must observe the caller's cancellation, and
 * a plain loop makes that easy to drop.
 *
 * @param context - Resolved transport configuration.
 * @param request - State, questions and cancellation.
 * @param attempt - Zero-based attempt index.
 * @returns The validated evaluation response.
 */
async function attemptWithRetries(
  context: AttemptContext,
  request: AttemptRequest,
  attempt: number,
): Promise<JevEvaluation> {
  try {
    return await sendOnce(context, request)
  } catch (error) {
    if (!(error instanceof JevRequestError)) {
      throw error
    }
    const exhausted = attempt >= context.maxRetries
    if (!error.retryable || exhausted || request.callerSignal?.aborted === true) {
      throw error
    }
    const wait = error.retryAfterMs ?? backoffFor(attempt, context.retryBaseMs)
    await context.sleep(wait, request.callerSignal)
    return attemptWithRetries(context, request, attempt + ATTEMPT_STEP)
  }
}

/**
 * Create an evaluation client for one endpoint.
 *
 * @param options - Endpoint, credential, and retry policy.
 * @returns A client whose calls resolve or reject with a classified error.
 */
function createJevClient(options: JevClientOptions): JevClient {
  const context: AttemptContext = {
    fetchImpl: options.fetchImpl ?? globalThis.fetch,
    url: `${options.baseUrl}${EVALUATION_PATH}`,
    apiKey: options.apiKey,
    model: options.model,
    timeoutMs: options.timeoutMs,
    maxRetries: options.maxRetries,
    retryBaseMs: options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS,
    sleep: options.sleep ?? defaultSleep,
  }
  return {
    model: options.model,
    async evaluate(input, callOptions = {}): Promise<JevEvaluation> {
      const evaluation = await attemptWithRetries(
        context,
        { input, callerSignal: callOptions.signal, apiKey: callOptions.apiKey },
        FIRST_ATTEMPT,
      )
      return evaluation
    },
  }
}

export {
  EVALUATION_PATH,
  createJevClient,
  type JevClient,
  type JevClientOptions,
  type JevEvaluateInput,
  type JevEvaluateOptions,
}

