import { BANK_IDS } from './jev/catalog/index.ts'

/**
 * Defaults and bounds for every configurable field.
 *
 * Values live apart from the schema and the resolver so neither file has to be
 * read past a wall of numbers to reach the logic, and so a bound has exactly one
 * home: a range stated in the schema and restated in the validator is a range
 * that will eventually disagree with itself.
 *
 * @module dsh-plugin-jev/config-defaults
 */

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

/**
 * Banks the agent may run when nothing else is configured.
 *
 * Every shipped bank is on by default: a bank the package ships is a judgement
 * its author thought worth asking, and turning one off is a deployment's
 * decision rather than the package's.
 */
const DEFAULT_BANKS: string[] = [...BANK_IDS]

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
  adoptionPrompt: DEFAULT_ADOPTION_PROMPT,
  banks: [...DEFAULT_BANKS],
  apiKeyEnv: DEFAULT_API_KEY_ENV,
  model: DEFAULT_MODEL,
  baseUrl: DEFAULT_BASE_URL,
  confidenceFloor: DEFAULT_CONFIDENCE_FLOOR,
  confirmFloor: DEFAULT_CONFIRM_FLOOR,
  ledgerLimit: DEFAULT_LEDGER_LIMIT,
} as const

export {
  DEFAULT_API_KEY_ENV,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_CONFIDENCE_FLOOR,
  DEFAULT_CONFIRM_FLOOR,
  DEFAULT_MAX_STATE_CHARS,
  DEFAULT_LEDGER_LIMIT,
  DEFAULT_ADOPTION_PROMPT,
  DEFAULT_BANKS,
  MIN_CONFIDENCE,
  MAX_CONFIDENCE,
  MIN_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MIN_RETRIES,
  MAX_RETRIES,
  MIN_STATE_CHARS,
  MIN_LEDGER_LIMIT,
  MAX_LEDGER_LIMIT,
  TRAILING_SLASH,
  LAST_CHARACTER,
  FIRST_CHARACTER,
  HTTP_URL_PATTERN,
  USER_SETTING_DEFAULTS,
}
