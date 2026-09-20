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
import { assertQuestions, measureState } from './validation.ts'
import type { JevUsageEntry, JevUsageLedger, JevUsageTotals } from './ledger.ts'
import type { JevRoutingPolicy } from './routing.ts'

/** Per-tool switches the service reports to its faces. */
interface JevToolSwitches {
  /** Publish jev_classify. */
  classify: boolean
  /** Publish jev_score. */
  score: boolean
  /** Publish jev_check. */
  check: boolean
  /** Publish jev_ask. */
  ask: boolean
  /** Publish jev_reason. */
  reason: boolean
  /** Publish jev_compare. */
  compare: boolean
  /** Publish jev_usage. */
  usage: boolean
}

/**
 * The configuration subset this service needs.
 *
 * Declared here rather than imported from the plugin config module so the core
 * directory stays self-contained: a resolved configuration is structurally
 * assignable to it, and no module has to reach outside the directory to
 * describe its own inputs.
 */
interface JevServiceConfig {
  /** Master switch. */
  enabled: boolean
  /** Name of the environment variable or credential the key is read from. */
  apiKeyEnv: string
  /** Evaluation endpoint base URL, without a trailing slash. */
  baseUrl: string
  /** Model id or alias sent in the model field. */
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
  /** Whether the agent is told to prefer Jev for a narrow decision. */
  adoptionPrompt: boolean
  /** Ids of the question banks the agent may run. */
  banks: readonly string[]
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
  /** Whether the agent is told to prefer Jev for a narrow decision. */
  readonly adoptionPrompt: boolean
  /** Ids of the question banks the agent may run. */
  readonly banks: readonly string[]
  /**
   * Adopt a configuration that changed while the plugin was running.
   *
   * A settings change can rename the credential's variable as well as the
   * endpoint, so the resolver is replaced together with the configuration
   * rather than left pointing at the previous name. The ledger and the tool
   * switches are deliberately not re-derived: usage history is the user's, and
   * the published catalog is fixed when the fiber mounts.
   *
   * @param next - The new effective configuration.
   * @param credential - Resolver for the new configuration's credential.
   */
  reconfigure: (
    next: JevServiceConfig,
    credential: () => Promise<string | undefined>,
  ) => void
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
  /** Credential used when no per-call resolver is supplied. */
  apiKey?: string
  /**
   * Per-call credential lookup.
   *
   * Resolution is per operation on purpose: a key written from the settings
   * page must reach the next call without restarting the host.
   */
  resolveApiKey?: () => Promise<string | undefined>
  /** Transport override. */
  fetchImpl?: typeof fetch
  /** Backoff override; tests pass a no-op so retries do not sleep. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  /** Clock override. */
  now?: () => number
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
    apiKey: deps.apiKey ?? '',
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
  let current = config
  let client: JevClient = createJevClient(clientOptionsOf(current, deps))
  let resolveKey: () => Promise<string | undefined> = async (): Promise<string | undefined> => {
    await Promise.resolve()
    return deps.apiKey ?? ''
  }
  if (deps.resolveApiKey !== undefined) {
    resolveKey = deps.resolveApiKey
  }

  return {
    get enabled(): boolean {
      return current.enabled
    },
    get model(): string {
      return current.model
    },
    get maxStateChars(): number {
      return current.maxStateChars
    },
    get tools(): JevToolSwitches {
      return current.tools
    },
    get adoptionPrompt(): boolean {
      return current.adoptionPrompt
    },
    get banks(): readonly string[] {
      return current.banks
    },
    get policy(): JevRoutingPolicy {
      return {
        confidenceFloor: current.confidenceFloor,
        confirmFloor: current.confirmFloor,
      }
    },
    reconfigure(
      next: JevServiceConfig,
      credential: () => Promise<string | undefined>,
    ): void {
      current = next
      resolveKey = credential
      client = createJevClient(clientOptionsOf(current, deps))
    },
    async evaluate(input: JevEvaluateInput): Promise<JevEvaluation> {
      if (!current.enabled) {
        throw new JevRequestError(
          'the Jev plugin is mounted with "enabled: false", so no evaluation was sent',
          { code: 'invalid-request', retryable: false },
        )
      }
      const apiKey = (await resolveKey()) ?? ''
      if (apiKey === '') {
        throw new JevRequestError(
          `no TypeSafe API key: "${current.apiKeyEnv}" is unset. Set it in the plugin `
          + 'settings, or export it before starting the host.',
          { code: 'invalid-request', retryable: false },
        )
      }
      const stateChars = measureState(input.state, current.maxStateChars)
      assertQuestions(input.questions)

      const callOptions: JevEvaluateOptions = { apiKey }
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
  createJevService,
  type JevEvaluateInput,
  type JevService,
  type JevServiceDeps,
  type JevServiceConfig,
  type JevUsageReport,
}

