/**
 * Serializable configuration, schema, and direct-call defaults.
 *
 * Every deployment-varying choice is a field here rather than a constant in the
 * implementation, and the credential is an environment-variable *name*: the
 * secret itself never enters committed configuration.
 *
 * @module dsh-plugin-jev/config
 */

import schema from '@deepseek-ai/schemastery'

/** Environment variable read for the API key when the profile names no other. */
const DEFAULT_API_KEY_ENV = 'TYPESAFE_API_KEY'

/** TypeSafe's public evaluation endpoint. */
const DEFAULT_BASE_URL = 'https://api.typesafe.ai'

/** Model alias TypeSafe resolves to its current stable release. */
const DEFAULT_MODEL = 'jev-latest'

/** Per-attempt deadline in milliseconds. */
const DEFAULT_TIMEOUT_MS = 30_000

/** Attempts after the first one, for rate limits and transport failures. */
const DEFAULT_MAX_RETRIES = 2

/** Confidence below which an answer is never acted on without review. */
const DEFAULT_CONFIDENCE_FLOOR = 0.5

/** Confidence at or above which a high-stakes answer may act unreviewed. */
const DEFAULT_CONFIRM_FLOOR = 0.85

/** Largest state accepted, in characters. Jev's own window is 32k tokens. */
const DEFAULT_MAX_STATE_CHARS = 200_000

/** Usage entries retained for reporting; totals stay cumulative regardless. */
const DEFAULT_LEDGER_LIMIT = 500

/** Whether the agent is told, in its system prompt, to prefer Jev for decisions. */
const DEFAULT_ADOPTION_PROMPT = true

/** Lowest configurable confidence. */
const MIN_CONFIDENCE = 0

/** Highest configurable confidence. */
const MAX_CONFIDENCE = 1

/** Lowest configurable per-attempt deadline in milliseconds. */
const MIN_TIMEOUT_MS = 1000

/** Highest configurable per-attempt deadline in milliseconds. */
const MAX_TIMEOUT_MS = 600_000

/** Lowest configurable retry count. */
const MIN_RETRIES = 0

/** Highest configurable retry count. */
const MAX_RETRIES = 10

/** Smallest state limit a caller may configure, in characters. */
const MIN_STATE_CHARS = 1000

/** Smallest retention window a caller may configure. */
const MIN_LEDGER_LIMIT = 1

/** Largest retention window a caller may configure. */
const MAX_LEDGER_LIMIT = 100_000

/** Character a base URL may end with and still join cleanly. */
const TRAILING_SLASH = '/'

/** Number of characters removed when a base URL ends with a slash. */
const LAST_CHARACTER = 1

/** Index of the first character of a string. */
const FIRST_CHARACTER = 0

/** Pattern an http(s) base URL must match. */
const HTTP_URL_PATTERN = /^https?:\/\//u

/** Defaults for the fields the browser settings page can edit. */
const USER_SETTING_DEFAULTS = {
  enabled: true,
  apiKeyEnv: DEFAULT_API_KEY_ENV,
  model: DEFAULT_MODEL,
  baseUrl: DEFAULT_BASE_URL,
  confidenceFloor: DEFAULT_CONFIDENCE_FLOOR,
  confirmFloor: DEFAULT_CONFIRM_FLOOR,
  ledgerLimit: DEFAULT_LEDGER_LIMIT,
} as const

/** Per-tool switches, so a profile can publish only part of the tool face. */
interface ToolSwitches {
  /** Publish `jev_classify` (Choice). */
  classify?: boolean
  /** Publish `jev_score` (Score). */
  score?: boolean
  /** Publish `jev_check` (Noul). */
  check?: boolean
  /** Publish `jev_ask` (mixed questions in one request). */
  ask?: boolean
  /** Publish `jev_reason` (the built-in reasoning banks). */
  reason?: boolean
  /** Publish `jev_usage` (session token accounting). */
  usage?: boolean
}

/** Plugin configuration supplied by the profile composition. */
interface Config {
  /** Master switch. `false` loads the plugin without contacting TypeSafe. */
  enabled?: boolean
  /** Name of the environment variable holding the API key. */
  apiKeyEnv?: string
  /** Evaluation endpoint base URL. */
  baseUrl?: string
  /** Model id or alias sent in the `model` field. */
  model?: string
  /** Per-attempt deadline in milliseconds. */
  timeoutMs?: number
  /** Attempts after the first one. */
  maxRetries?: number
  /** Confidence below which an answer needs review before it is acted on. */
  confidenceFloor?: number
  /** Confidence at or above which a high-stakes answer may act unreviewed. */
  confirmFloor?: number
  /** Largest state accepted, in characters. */
  maxStateChars?: number
  /** Usage entries retained for reporting. */
  ledgerLimit?: number
  /** Whether the agent is told to prefer Jev for a narrow decision. */
  adoptionPrompt?: boolean
  /** Per-tool switches. */
  tools?: ToolSwitches
}

/** Per-tool switches after defaults have been resolved. */
interface ResolvedToolSwitches {
  /** Publish `jev_classify`. */
  classify: boolean
  /** Publish `jev_score`. */
  score: boolean
  /** Publish `jev_check`. */
  check: boolean
  /** Publish `jev_ask`. */
  ask: boolean
  /** Publish `jev_reason`. */
  reason: boolean
  /** Publish `jev_usage`. */
  usage: boolean
}

/** Configuration after defaults have been resolved. */
interface ResolvedConfig {
  /** Master switch. */
  enabled: boolean
  /** Name of the environment variable holding the API key. */
  apiKeyEnv: string
  /** Evaluation endpoint base URL, without a trailing slash. */
  baseUrl: string
  /** Model id or alias sent in the `model` field. */
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
  /** Per-tool switches. */
  tools: ResolvedToolSwitches
}

/** Inclusive bounds a numeric configuration field must fall inside. */
interface NumericBounds {
  /** Inclusive lower bound. */
  min: number
  /** Inclusive upper bound. */
  max: number
}

/** Loader-visible configuration schema and defaults. */
const Config: schema<Config> = schema.object({
  enabled: schema.boolean().default(true),
  apiKeyEnv: schema.string().default(DEFAULT_API_KEY_ENV),
  baseUrl: schema.string().default(DEFAULT_BASE_URL),
  model: schema.string().default(DEFAULT_MODEL),
  timeoutMs: schema.number().default(DEFAULT_TIMEOUT_MS),
  maxRetries: schema.number().default(DEFAULT_MAX_RETRIES),
  confidenceFloor: schema.number().default(DEFAULT_CONFIDENCE_FLOOR),
  confirmFloor: schema.number().default(DEFAULT_CONFIRM_FLOOR),
  maxStateChars: schema.number().default(DEFAULT_MAX_STATE_CHARS),
  ledgerLimit: schema.number().default(DEFAULT_LEDGER_LIMIT),
  adoptionPrompt: schema.boolean().default(DEFAULT_ADOPTION_PROMPT),
  tools: schema.object({
    classify: schema.boolean().default(true),
    score: schema.boolean().default(true),
    check: schema.boolean().default(true),
    ask: schema.boolean().default(true),
    reason: schema.boolean().default(true),
    usage: schema.boolean().default(true),
  }),
})

/**
 * Drop a trailing slash so path joining is unambiguous.
 *
 * @param baseUrl - Configured base URL.
 * @returns The same URL without a trailing slash.
 */
function trimTrailingSlash(baseUrl: string): string {
  if (baseUrl.endsWith(TRAILING_SLASH)) {
    return baseUrl.slice(FIRST_CHARACTER, -LAST_CHARACTER)
  }
  return baseUrl
}

/**
 * Reject a numeric field outside its supported range.
 *
 * @param label - Field name used in the message.
 * @param value - Configured value.
 * @param bounds - Inclusive lower and upper bound.
 * @throws {Error} When the value is outside the range or not finite.
 */
function assertRange(label: string, value: number, bounds: NumericBounds): void {
  if (!Number.isFinite(value) || value < bounds.min || value > bounds.max) {
    throw new Error(
      `dsh-plugin-jev: "${label}" must be between ${bounds.min} and ${bounds.max}, received ${value}`,
    )
  }
}

/**
 * Validate the resolved configuration.
 *
 * Activation is the earliest point at which the configuration can be judged, so
 * a self-contained misconfiguration fails here rather than at the first tool
 * call. The credential is environment-dependent and is judged by the runtime,
 * which alone can read the process environment.
 *
 * @param config - Fully defaulted configuration.
 * @throws {Error} When a field is out of range or empty.
 */
function assertConfig(config: ResolvedConfig): void {
  assertRange('confidenceFloor', config.confidenceFloor, {
    min: MIN_CONFIDENCE,
    max: MAX_CONFIDENCE,
  })
  assertRange('confirmFloor', config.confirmFloor, {
    min: MIN_CONFIDENCE,
    max: MAX_CONFIDENCE,
  })
  assertRange('timeoutMs', config.timeoutMs, {
    min: MIN_TIMEOUT_MS,
    max: MAX_TIMEOUT_MS,
  })
  assertRange('maxRetries', config.maxRetries, { min: MIN_RETRIES, max: MAX_RETRIES })
  assertRange('maxStateChars', config.maxStateChars, {
    min: MIN_STATE_CHARS,
    max: Number.MAX_SAFE_INTEGER,
  })
  assertRange('ledgerLimit', config.ledgerLimit, {
    min: MIN_LEDGER_LIMIT,
    max: MAX_LEDGER_LIMIT,
  })

  if (config.confidenceFloor > config.confirmFloor) {
    throw new Error(
      'dsh-plugin-jev: "confidenceFloor" must not exceed "confirmFloor"',
    )
  }
  if (config.apiKeyEnv.trim() === '') {
    throw new Error('dsh-plugin-jev: "apiKeyEnv" must name an environment variable')
  }
  if (config.model.trim() === '') {
    throw new Error('dsh-plugin-jev: "model" must not be empty')
  }
  if (!HTTP_URL_PATTERN.test(config.baseUrl)) {
    throw new Error('dsh-plugin-jev: "baseUrl" must be an http(s) URL')
  }
}

/**
 * Resolve the same defaults for direct callers that bypass Cordis Loader.
 *
 * @param config - Partial serialized configuration.
 * @returns Configuration with all defaults applied and validated.
 */
function resolveConfig(config: Config = {}): ResolvedConfig {
  const tools = config.tools ?? {}
  const resolved: ResolvedConfig = {
    enabled: config.enabled ?? true,
    apiKeyEnv: config.apiKeyEnv ?? DEFAULT_API_KEY_ENV,
    baseUrl: trimTrailingSlash(config.baseUrl ?? DEFAULT_BASE_URL),
    model: config.model ?? DEFAULT_MODEL,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
    confidenceFloor: config.confidenceFloor ?? DEFAULT_CONFIDENCE_FLOOR,
    confirmFloor: config.confirmFloor ?? DEFAULT_CONFIRM_FLOOR,
    maxStateChars: config.maxStateChars ?? DEFAULT_MAX_STATE_CHARS,
    ledgerLimit: config.ledgerLimit ?? DEFAULT_LEDGER_LIMIT,
    adoptionPrompt: config.adoptionPrompt ?? DEFAULT_ADOPTION_PROMPT,
    tools: {
      classify: tools.classify ?? true,
      score: tools.score ?? true,
      check: tools.check ?? true,
      ask: tools.ask ?? true,
      reason: tools.reason ?? true,
      usage: tools.usage ?? true,
    },
  }
  assertConfig(resolved)
  return resolved
}

export {
  Config,
  USER_SETTING_DEFAULTS,
  resolveConfig,
  type Config as JevConfig,
  type ResolvedConfig,
  type ResolvedToolSwitches,
}

