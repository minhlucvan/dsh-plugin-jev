/**
 * HTTP transport mechanics: deadlines, backoff, and response classification.
 *
 * These are separated from the client because they are the parts worth testing
 * on their own — a retry policy and a `Retry-After` parse are easy to get
 * subtly wrong and cheap to pin down without a network.
 *
 * @module dsh-plugin-system-one/jev/transport
 */

import { setTimeout as delay } from 'node:timers/promises'

import { JevRequestError } from './errors.ts'
import type { JevErrorCode } from './errors.ts'

/** First backoff wait, in milliseconds. */
const DEFAULT_RETRY_BASE_MS = 500

/** Growth factor applied to the backoff wait on every attempt. */
const BACKOFF_FACTOR = 2

/** Ceiling for a single backoff wait, in milliseconds. */
const MAX_RETRY_DELAY_MS = 8000

/** Milliseconds in one second, for a `Retry-After` header. */
const SECONDS_TO_MS = 1000

/** Response characters retained in a failure message. */
const ERROR_BODY_LIMIT = 400

/** Radix for parsing a decimal `Retry-After` value. */
const DECIMAL_RADIX = 10

/** Index of the first character of a string, and of a one-character slice. */
const FIRST = 0

/** Status returned when the caller exceeded its rate limit. */
const STATUS_TOO_MANY_REQUESTS = 429

/** Status returned while the service is shedding load. */
const STATUS_OVERLOADED = 529

/** Status returned when the credential is missing or wrong. */
const STATUS_UNAUTHORIZED = 401

/** Status returned when the request body failed validation. */
const STATUS_UNPROCESSABLE = 422

/** Lowest status treated as a transient server failure. */
const STATUS_SERVER_ERROR = 500

/** Deadline and cancellation fused into one signal for a single attempt. */
interface RequestScope {
  /** Signal handed to `fetch`. */
  signal: AbortSignal
  /** Release the timer and the caller listener. */
  release: () => void
  /** Whether the deadline, rather than the caller, ended the attempt. */
  expired: () => boolean
}

/**
 * Fuse the caller's signal with this attempt's deadline.
 *
 * @param callerSignal - Cancellation supplied by the caller, if any.
 * @param timeoutMs - Deadline for the attempt.
 * @returns The fused scope, released by the caller in a `finally` block.
 */
function createRequestScope(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): RequestScope {
  const controller = new AbortController()
  let expired = false
  const onCallerAbort = (): void => {
    controller.abort()
  }
  if (callerSignal !== undefined) {
    if (callerSignal.aborted) {
      controller.abort()
    } else {
      callerSignal.addEventListener('abort', onCallerAbort, { once: true })
    }
  }
  const timer = setTimeout(() => {
    expired = true
    controller.abort()
  }, timeoutMs)
  return {
    signal: controller.signal,
    release: () => {
      clearTimeout(timer)
      callerSignal?.removeEventListener('abort', onCallerAbort)
    },
    expired: () => expired,
  }
}

/**
 * Default backoff wait, cancellable by the caller's signal.
 *
 * @param ms - Milliseconds to wait.
 * @param signal - Caller cancellation.
 * @returns A promise that settles when the wait ends.
 * @throws {JevRequestError} When the caller cancelled during the wait.
 */
async function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  try {
    if (signal === undefined) {
      await delay(ms)
      return
    }
    await delay(ms, undefined, { signal })
  } catch {
    throw new JevRequestError('backoff aborted by the caller', {
      code: 'aborted',
      retryable: false,
    })
  }
}

/**
 * Classify an HTTP status failure.
 *
 * @param status - Response status.
 * @returns The failure code and whether a retry could succeed.
 */
function classifyStatus(status: number): { code: JevErrorCode; retryable: boolean } {
  if (status === STATUS_TOO_MANY_REQUESTS) {
    return { code: 'rate-limited', retryable: true }
  }
  if (status === STATUS_OVERLOADED) {
    return { code: 'overloaded', retryable: true }
  }
  if (status >= STATUS_SERVER_ERROR) {
    return { code: 'server-error', retryable: true }
  }
  if (status === STATUS_UNAUTHORIZED) {
    return { code: 'unauthorized', retryable: false }
  }
  if (status === STATUS_UNPROCESSABLE) {
    return { code: 'invalid-request', retryable: false }
  }
  return { code: 'invalid-request', retryable: false }
}

/**
 * Read a server-requested backoff from the response.
 *
 * @param response - Failed response.
 * @returns Milliseconds to wait, capped, or `undefined` when unspecified.
 */
function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get('retry-after')
  if (header === null) {
    return undefined
  }
  const seconds = Number.parseInt(header, DECIMAL_RADIX)
  if (!Number.isFinite(seconds) || seconds < FIRST) {
    return undefined
  }
  return Math.min(seconds * SECONDS_TO_MS, MAX_RETRY_DELAY_MS)
}

/**
 * Describe an unknown thrown value.
 *
 * @param error - Whatever was thrown.
 * @returns Its message, or its string form.
 */
function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

/**
 * Trim a failure body so a large response does not become a large error.
 *
 * @param body - Raw response text.
 * @returns A bounded single-line excerpt.
 */
function excerpt(body: string): string {
  const collapsed = body.replaceAll(/\s+/gu, ' ').trim()
  if (collapsed.length <= ERROR_BODY_LIMIT) {
    return collapsed
  }
  return `${collapsed.slice(FIRST, ERROR_BODY_LIMIT)}…`
}
/**
 * Decode a response body as JSON.
 *
 * @param text - Raw response text.
 * @returns The decoded value, unvalidated.
 * @throws {JevRequestError} When the body is not JSON.
 */
function decodeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new JevRequestError(
      `TypeSafe returned a body that is not JSON: ${excerpt(text)}`,
      { code: 'invalid-response', retryable: false },
    )
  }
}


/**
 * Compute the exponential backoff wait before one retry.
 *
 * @param attempt - Zero-based attempt that just failed.
 * @param retryBaseMs - First backoff wait; defaults to half a second.
 * @returns Milliseconds to wait before the next attempt.
 */
function backoffFor(attempt: number, retryBaseMs: number = DEFAULT_RETRY_BASE_MS): number {
  return Math.min(retryBaseMs * BACKOFF_FACTOR ** attempt, MAX_RETRY_DELAY_MS)
}

export {
  DEFAULT_RETRY_BASE_MS,
  MAX_RETRY_DELAY_MS,
  backoffFor,
  classifyStatus,
  createRequestScope,
  decodeJson,
  defaultSleep,
  excerpt,
  messageOf,
  retryAfterMs,
  type RequestScope,
}

