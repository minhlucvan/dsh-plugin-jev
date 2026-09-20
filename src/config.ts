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

import { BANK_IDS } from './jev/catalog/index.ts'

import {
  DEFAULT_ADOPTION_PROMPT,
  DEFAULT_API_KEY_ENV,
  DEFAULT_BANKS,
  DEFAULT_BASE_URL,
  DEFAULT_CONFIDENCE_FLOOR,
  DEFAULT_CONFIRM_FLOOR,
  DEFAULT_LEDGER_LIMIT,
  DEFAULT_MAX_RETRIES,
  DEFAULT_MAX_STATE_CHARS,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  FIRST_CHARACTER,
  HTTP_URL_PATTERN,
  LAST_CHARACTER,
  MAX_CONFIDENCE,
  MAX_LEDGER_LIMIT,
  MAX_RETRIES,
  MAX_TIMEOUT_MS,
  MIN_CONFIDENCE,
  MIN_LEDGER_LIMIT,
  MIN_RETRIES,
  MIN_STATE_CHARS,
  MIN_TIMEOUT_MS,
  TRAILING_SLASH,
} from './config-defaults.ts'

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
  /** Ids of the question banks the agent may run; omitted means all of them. */
  banks?: string[]
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
  /** Ids of the question banks the agent may run. */
  banks: string[]
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
  banks: schema.array(schema.string()).default([...DEFAULT_BANKS]),
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
  for (const bank of config.banks) {
    if (!BANK_IDS.includes(bank)) {
      throw new Error(
        `dsh-plugin-jev: "${bank}" is not a question bank this build ships; `
        + `choose from ${BANK_IDS.join(', ')}`,
      )
    }
  }
}

/**
 * Read a configured value, or the default when the profile omitted it.
 *
 * One branch here replaces the dozen that a chain of `??` would put inside
 * {@link resolveConfig}, which is what keeps that function's complexity in hand
 * as fields are added.
 *
 * @param value - Configured value, if any.
 * @param fallback - Value used when it is absent.
 * @returns The configured value or the fallback.
 */
function or<TValue>(value: TValue | undefined, fallback: TValue): TValue {
  if (value === undefined) {
    return fallback
  }
  return value
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
    enabled: or(config.enabled, true),
    apiKeyEnv: or(config.apiKeyEnv, DEFAULT_API_KEY_ENV),
    baseUrl: trimTrailingSlash(or(config.baseUrl, DEFAULT_BASE_URL)),
    model: or(config.model, DEFAULT_MODEL),
    timeoutMs: or(config.timeoutMs, DEFAULT_TIMEOUT_MS),
    maxRetries: or(config.maxRetries, DEFAULT_MAX_RETRIES),
    confidenceFloor: or(config.confidenceFloor, DEFAULT_CONFIDENCE_FLOOR),
    confirmFloor: or(config.confirmFloor, DEFAULT_CONFIRM_FLOOR),
    maxStateChars: or(config.maxStateChars, DEFAULT_MAX_STATE_CHARS),
    ledgerLimit: or(config.ledgerLimit, DEFAULT_LEDGER_LIMIT),
    adoptionPrompt: or(config.adoptionPrompt, DEFAULT_ADOPTION_PROMPT),
    banks: [...or(config.banks, DEFAULT_BANKS)],
    tools: {
      classify: or(tools.classify, true),
      score: or(tools.score, true),
      check: or(tools.check, true),
      ask: or(tools.ask, true),
      reason: or(tools.reason, true),
      usage: or(tools.usage, true),
    },
  }
  assertConfig(resolved)
  return resolved
}

export {
  Config,
  resolveConfig,
  type Config as JevConfig,
  type ResolvedConfig,
  type ResolvedToolSwitches,
}

