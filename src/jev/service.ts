/**
 * The Jev service one plugin instance provides to its companions.
 *
 * The service owns everything the tool, route, command and browser faces share:
 * the configured client, the local pre-flight validation that keeps a malformed
 * request from being billed, the usage ledger, and the confidence policy. The
 * faces stay thin because the decisions live here once.
 *
 * @module dsh-plugin-jev/jev/service
 */

import { createJevClient } from './client.ts'
import type { JevClient, JevClientOptions, JevEvaluateOptions } from './client.ts'
import type { JevEvaluation, JevJson, JevQuestion } from './contracts.ts'
import { JevRequestError } from './errors.ts'
import { createUsageLedger } from './ledger.ts'
import type { JevUsageEntry, JevUsageLedger, JevUsageTotals } from './ledger.ts'
import type { JevRoutingPolicy } from './routing.ts'

/** Maximum options Jev accepts in one Choice question. */
const MAX_CHOICE_OPTIONS = 255

/** Minimum ordered levels Jev accepts in one Score question. */
const MIN_SCORE_LEVELS = 2

/** Maximum ordered levels Jev accepts in one Score question. */
const MAX_SCORE_LEVELS = 10

/** Minimum questions a request must carry to be worth sending. */
const MIN_QUESTIONS = 1

/** Per-tool switches the service reports to its faces. */
interface JevToolSwitches {
  /** Publish \`jev_classify\`. */
  classify: boolean
  /** Publish \`jev_score\`. */
  score: boolean
  /** Publish \`jev_check\`. */
  check: boolean
  /** Publish \`jev_ask\`. */
  ask: boolean
  /** Publish \`jev_reason\`. */
  reason: boolean
  /** Publish \`jev_usage\`. */
  usage: boolean
}

/**
 * The configuration subset this service needs.
 *
 * Declared here rather than imported from the plugin's config module so the
 * service directory stays self-contained: a resolved configuration is
 * structurally assignable to it, and no module has to reach outside the
 * directory to describe its own inputs.
 */
interface JevServiceConfig {
  /** Master switch. */
  enabled: boolean
  /** Evaluation endpoint base URL, without a trailing slash. */
  baseUrl: string
  /** Model id or alias sent in the \`model\` field. */
  model: string
  /** Per-attempt deadline in milliseconds. */
  timeoutMs: number
  /** Attempts after the first one. */
  maxRetries: number
  /** Confidence below which an answer needs review before it is acted on. */
  confidenceFloor: number
  /** Confidence at or above which a high-stakes answer may act unreviewed. */
  confirmFloor: number
  /** Largest state accepted, in characters. */
  maxStateChars: number
  /** Usage entries retained for reporting. */
  ledgerLimit: number
  /** Per-tool switches. */
  tools: JevToolSwitches
}

/** One evaluation, as the faces request it. */
interface JevEvaluateInput {
  /** Content to evaluate. */
  state: JevJson
  /** Typed questions keyed by answer id. */
  questions: Record<string, JevQuestion>
  /** Surface that issued the call, recorded in the ledger. */
  source: string
  /** Caller cancellation. */
  signal?: AbortSignal
}

/** Usage as the faces read it. */
interface JevUsageReport {
  /** Cumulative totals since construction or the last reset. */
  totals: JevUsageTotals
  /** Cumulative totals per surface. */
  byTool: Record<string, JevUsageTotals>
  /** Most recent evaluations, newest first. */
  recent: JevUsageEntry[]
}

/** Everything a face may read from or ask of the plugin. */
interface JevService {
  /** Whether the plugin is configured to reach TypeSafe at all. */
  readonly enabled: boolean
  /** Model id or alias sent when a call does not override it. */
  readonly model: string
  /** Effective confidence thresholds. */
  readonly policy: JevRoutingPolicy
  /** Largest state accepted, in characters. */
  readonly maxStateChars: number
  /** Which tools the profile asked this plugin to publish. */
  readonly tools: JevToolSwitches
  /**
   * Evaluate one state against one or more questions.
   *
   * @param input - State, questions, and the surface issuing the call.
   * @returns The validated evaluation response.
   */
  evaluate: (input: JevEvaluateInput) => Promise<JevEvaluation>
  /**
   * Read cumulative and recent usage.
   *
   * @param limit - Maximum recent entries to return.
   * @returns Totals, per-tool totals, and recent entries.
   */
  usage: (limit?: number) => JevUsageReport
  /**
   * Recheck the ledger's accounting identity.
   *
   * @returns A description of the violated relationship, or `undefined`.
   */
  verifyUsage: () => string | undefined
  /** Discard retained usage and reset the cumulative counters. */
  resetUsage: () => void
}

/** Substitutable collaborators, so the service is testable without a network. */
interface JevServiceDeps {
  /** Credential resolved from the environment. */
  apiKey: string
  /** Transport override. */
  fetchImpl?: typeof fetch
  /** Backoff override; tests pass a no-op so retries do not sleep. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  /** Clock override. */
  now?: () => number
}

/**
 * Measure a state and refuse one that exceeds the configured limit.
 *
 * The check runs locally because the alternative is paying for a request that
 * TypeSafe will reject, or worse, silently truncating the evidence a judgement
 * was supposed to rest on.
 *
 * @param state - Content to evaluate.
 * @param maxChars - Configured ceiling.
 * @returns The serialized character count.
 * @throws {JevRequestError} When the state is larger than the ceiling.
 */
function measureState(state: JevJson, maxChars: number): number {
  let serialized = JSON.stringify(state)
  if (typeof state === 'string') {
    serialized = state
  }
  if (serialized.length > maxChars) {
    throw new JevRequestError(
      `state is ${serialized.length} characters, above the configured maxStateChars of ${maxChars}`,
      { code: 'invalid-request', retryable: false },
    )
  }
  return serialized.length
}

/**
 * Refuse one question Jev would reject, before it is billed.
 *
 * @param id - Answer id the question was filed under.
 * @param question - Question about to be sent.
 * @throws {JevRequestError} When the question is malformed.
 */
function assertQuestion(id: string, question: JevQuestion): void {
  if (question.type === 'choice') {
    const options = Object.keys(question.criteria).length
    if (options < MIN_SCORE_LEVELS || options > MAX_CHOICE_OPTIONS) {
      throw new JevRequestError(
        `choice question "${id}" has ${String(options)} options; Jev accepts ${String(MIN_SCORE_LEVELS)} to ${String(MAX_CHOICE_OPTIONS)}`,
        { code: 'invalid-request', retryable: false },
      )
    }
  }
  if (question.type === 'score') {
    const levels = question.criteria.length
    if (levels < MIN_SCORE_LEVELS || levels > MAX_SCORE_LEVELS) {
      throw new JevRequestError(
        `score question "${id}" has ${String(levels)} levels; Jev accepts ${String(MIN_SCORE_LEVELS)} to ${String(MAX_SCORE_LEVELS)}`,
        { code: 'invalid-request', retryable: false },
      )
    }
  }
}

/**
 * Refuse a question set Jev would reject, before it is billed.
 *
 * @param questions - Questions about to be sent.
 * @throws {JevRequestError} When the set is empty or a question is malformed.
 */
function assertQuestions(questions: Record<string, JevQuestion>): void {
  const ids = Object.keys(questions)
  if (ids.length < MIN_QUESTIONS) {
    throw new JevRequestError('a request needs at least one question', {
      code: 'invalid-request',
      retryable: false,
    })
  }
  for (const id of ids) {
    const question = questions[id]
    if (question !== undefined) {
      assertQuestion(id, question)
    }
  }
}

/**
 * Build the client options for one resolved configuration.
 *
 * @param config - Resolved plugin configuration.
 * @param deps - Credential and transport overrides.
 * @returns Client construction options.
 */
function clientOptionsOf(config: JevServiceConfig, deps: JevServiceDeps): JevClientOptions {
  const options: JevClientOptions = {
    apiKey: deps.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
  }
  if (deps.fetchImpl !== undefined) {
    options.fetchImpl = deps.fetchImpl
  }
  if (deps.sleep !== undefined) {
    options.sleep = deps.sleep
  }
  return options
}

/**
 * Build the service one plugin instance provides.
 *
 * @param config - Resolved plugin configuration.
 * @param deps - Credential, transport, and clock.
 * @returns The service the companions inject.
 */
function createJevService(config: JevServiceConfig, deps: JevServiceDeps): JevService {
  const ledger: JevUsageLedger = createUsageLedger(config.ledgerLimit)
  const now = deps.now ?? Date.now
  const client: JevClient = createJevClient(clientOptionsOf(config, deps))

  return {
    enabled: config.enabled,
    model: config.model,
    maxStateChars: config.maxStateChars,
    tools: config.tools,
    policy: {
      confidenceFloor: config.confidenceFloor,
      confirmFloor: config.confirmFloor,
    },
    async evaluate(input: JevEvaluateInput): Promise<JevEvaluation> {
      if (!config.enabled) {
        throw new JevRequestError(
          'the Jev plugin is mounted with "enabled: false", so no evaluation was sent',
          { code: 'invalid-request', retryable: false },
        )
      }
      const stateChars = measureState(input.state, config.maxStateChars)
      assertQuestions(input.questions)

      const callOptions: JevEvaluateOptions = {}
      if (input.signal !== undefined) {
        callOptions.signal = input.signal
      }

      const startedAt = now()
      const evaluation = await client.evaluate(
        { state: input.state, questions: input.questions },
        callOptions,
      )
      ledger.record({
        at: startedAt,
        tool: input.source,
        model: evaluation.model,
        questions: Object.keys(input.questions).length,
        stateChars,
        inputTokens: evaluation.usage.input_tokens,
        outputTokens: evaluation.usage.output_tokens,
        durationMs: now() - startedAt,
      })
      return evaluation
    },
    usage(limit?: number): JevUsageReport {
      return {
        totals: ledger.totals(),
        byTool: ledger.byTool(),
        recent: ledger.recent(limit),
      }
    },
    verifyUsage(): string | undefined {
      return ledger.verify()
    },
    resetUsage(): void {
      ledger.reset()
    },
  }
}

export {
  MAX_CHOICE_OPTIONS,
  MAX_SCORE_LEVELS,
  MIN_QUESTIONS,
  MIN_SCORE_LEVELS,
  assertQuestions,
  createJevService,
  measureState,
  type JevEvaluateInput,
  type JevService,
  type JevServiceDeps,
  type JevServiceConfig,
  type JevUsageReport,
}

