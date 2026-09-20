/**
 * Client settings model: the persisted shape, the text draft the form edits,
 * defaults, and boundary normalization.
 *
 * Normalization is the single place a stored value is judged. Everything above
 * it — the store, the hooks, the fields — may then assume a complete, in-range
 * snapshot, which is what keeps defensive checks out of every render.
 *
 * @module dsh-plugin-jev/client/settings
 */

import type { SettingsScope } from './contracts.ts'
import {
  ALL_BANKS,
  normalizeBanks,
  normalizeFlag,
  normalizeNumber,
  normalizeText,
  sameBanks,
} from './settings-bounds.ts'
import type { NumberBounds } from './settings-bounds.ts'

/** Settings this feature persists. */
interface ClientSettings {
  /** Master switch; a disabled plugin never contacts TypeSafe. */
  enabled: boolean
  /** Whether the agent is told, in its system prompt, to prefer Jev. */
  adoptionPrompt: boolean
  /**
   * Question banks the deployment allows, by id.
   *
   * Empty means every bank the build ships, which is the default: the package
   * ships a bank because its author thought the judgement worth asking, so
   * narrowing the set is a deployment's decision rather than the package's.
   */
  banks: string[]
  /** Name of the environment variable holding the API key. */
  apiKeyEnv: string
  /** Model id or alias sent in the `model` field. */
  model: string
  /** Evaluation endpoint base URL. */
  baseUrl: string
  /** Confidence below which an answer needs review before it is acted on. */
  confidenceFloor: number
  /** Confidence at or above which a high-stakes answer may act unreviewed. */
  confirmFloor: number
  /** Usage entries retained for reporting. */
  ledgerLimit: number
}

/**
 * The shape the form edits: every typed field is held as text.
 *
 * Keeping the draft as text rather than as the persisted types is what lets a
 * half-typed number survive a keystroke. The text is parsed and clamped at the
 * boundary, so normalization never fights the caret while a value is typed.
 */
interface DraftSettings {
  /** Master switch. */
  enabled: boolean
  /** Whether the agent is told to prefer Jev. */
  adoptionPrompt: boolean
  /** Allowed question banks, by id; empty means all of them. */
  banks: string[]
  /** Name of the environment variable holding the API key. */
  apiKeyEnv: string
  /** Model id or alias. */
  model: string
  /** Evaluation endpoint base URL. */
  baseUrl: string
  /** Confidence floor, as typed. */
  confidenceFloor: string
  /** Confirm floor, as typed. */
  confirmFloor: string
  /** Ledger retention, as typed. */
  ledgerLimit: string
}

/** String-valued fields, edited by a text input. */
type TextFieldName = 'apiKeyEnv' | 'model' | 'baseUrl'

/** Numeric fields, edited by a numeric text input. */
type NumberFieldName = 'confidenceFloor' | 'confirmFloor' | 'ledgerLimit'

/** Boolean fields, edited by a switch. */
type ToggleFieldName = 'enabled' | 'adoptionPrompt'

/** Every field the form edits. */
type SettingsFieldName = keyof DraftSettings

/** Whether the plugin is live when nothing is persisted. */
const DEFAULT_ENABLED = true

/** Whether the agent is told to prefer Jev when nothing is persisted. */
const DEFAULT_ADOPTION_PROMPT = true

/** Environment variable read for the API key when the profile names no other. */
const DEFAULT_API_KEY_ENV = 'TYPESAFE_API_KEY'

/** Model alias TypeSafe resolves to its current stable release. */
const DEFAULT_MODEL = 'jev-latest'

/** TypeSafe's public evaluation endpoint. */
const DEFAULT_BASE_URL = 'https://api.typesafe.ai'

/** Confidence below which an answer is never acted on without review. */
const DEFAULT_CONFIDENCE_FLOOR = 0.5

/** Confidence at or above which a high-stakes answer may act unreviewed. */
const DEFAULT_CONFIRM_FLOOR = 0.85

/** Lowest and highest configurable confidence. */
const MIN_CONFIDENCE = 0
const MAX_CONFIDENCE = 1

/** Inclusive range a confidence threshold must fall inside. */
const CONFIDENCE_BOUNDS: NumberBounds = {
  min: MIN_CONFIDENCE,
  max: MAX_CONFIDENCE,
}

/** Usage entries retained for reporting when nothing is persisted. */
const DEFAULT_LEDGER_LIMIT = 500

/** Smallest and largest retention window the host accepts. */
const MIN_LEDGER_LIMIT = 1
const MAX_LEDGER_LIMIT = 100_000

/** Inclusive range the retention window must fall inside. */
const LEDGER_BOUNDS: NumberBounds = {
  min: MIN_LEDGER_LIMIT,
  max: MAX_LEDGER_LIMIT,
}

/** Defaults applied when nothing is persisted or a value is unusable. */
const defaultSettings: ClientSettings = {
  enabled: DEFAULT_ENABLED,
  adoptionPrompt: DEFAULT_ADOPTION_PROMPT,
  banks: [...ALL_BANKS],
  apiKeyEnv: DEFAULT_API_KEY_ENV,
  model: DEFAULT_MODEL,
  baseUrl: DEFAULT_BASE_URL,
  confidenceFloor: DEFAULT_CONFIDENCE_FLOOR,
  confirmFloor: DEFAULT_CONFIRM_FLOOR,
  ledgerLimit: DEFAULT_LEDGER_LIMIT,
}

/**
 * Whether a value is an indexable object.
 *
 * @param value - Candidate value.
 * @returns True for a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Normalize whatever the host hands back, or the form's own draft, into a valid
 * snapshot.
 *
 * Missing, legacy, wrong-typed, blank and out-of-range values all resolve here
 * rather than reaching the form, so the draft never starts from `undefined`.
 * The two thresholds are repaired together: a confidence floor above the
 * confirm floor would make the routing policy contradictory, and the safe
 * repair is to raise the confirm floor rather than to lower the floor the
 * caller asked for.
 *
 * @param value - The raw value, however malformed. Omitted is itself a valid
 *   malformed input and resolves to the defaults.
 * @returns A complete, valid settings snapshot.
 */
function normalizeSettings(value?: unknown): ClientSettings {
  if (!isRecord(value)) {
    return { ...defaultSettings }
  }
  const confidenceFloor = normalizeNumber(
    value.confidenceFloor,
    CONFIDENCE_BOUNDS,
    DEFAULT_CONFIDENCE_FLOOR,
  )
  const confirmFloor = normalizeNumber(
    value.confirmFloor,
    CONFIDENCE_BOUNDS,
    DEFAULT_CONFIRM_FLOOR,
  )
  return {
    enabled: normalizeFlag(value.enabled, DEFAULT_ENABLED),
    adoptionPrompt: normalizeFlag(value.adoptionPrompt, DEFAULT_ADOPTION_PROMPT),
    banks: normalizeBanks(value.banks),
    apiKeyEnv: normalizeText(value.apiKeyEnv, DEFAULT_API_KEY_ENV),
    model: normalizeText(value.model, DEFAULT_MODEL),
    baseUrl: normalizeText(value.baseUrl, DEFAULT_BASE_URL),
    confidenceFloor,
    confirmFloor: Math.max(confirmFloor, confidenceFloor),
    ledgerLimit: Math.round(
      normalizeNumber(value.ledgerLimit, LEDGER_BOUNDS, DEFAULT_LEDGER_LIMIT),
    ),
  }
}

/**
 * Render a persisted snapshot as the text the form edits.
 *
 * @param settings - A normalized snapshot.
 * @returns The same settings, with numbers rendered as their field text.
 */
function toDraft(settings: ClientSettings): DraftSettings {
  return {
    enabled: settings.enabled,
    adoptionPrompt: settings.adoptionPrompt,
    banks: [...settings.banks],
    apiKeyEnv: settings.apiKeyEnv,
    model: settings.model,
    baseUrl: settings.baseUrl,
    confidenceFloor: String(settings.confidenceFloor),
    confirmFloor: String(settings.confirmFloor),
    ledgerLimit: String(settings.ledgerLimit),
  }
}

/**
 * Whether two snapshots carry the same settings.
 *
 * @param left - First snapshot.
 * @param right - Second snapshot.
 * @returns True when every field matches.
 */
function sameSettings(left: ClientSettings, right: ClientSettings): boolean {
  return (
    left.enabled === right.enabled
    && left.adoptionPrompt === right.adoptionPrompt
    && sameBanks(left.banks, right.banks)
    && left.apiKeyEnv === right.apiKeyEnv
    && left.model === right.model
    && left.baseUrl === right.baseUrl
    && left.confidenceFloor === right.confidenceFloor
    && left.confirmFloor === right.confirmFloor
    && left.ledgerLimit === right.ledgerLimit
  )
}

/** Read-only source React can consume through `useSyncExternalStore`. */
interface SettingsSource<TValue> {
  /** Read the current snapshot. */
  getSnapshot: () => TValue
  /** Subscribe to changes; returns an unsubscribe function. */
  subscribe: (listener: () => void) => () => void
}

/**
 * Wrap a settings scope so React can call its members safely.
 *
 * The host scope exposes instance methods that read their own state through
 * `this`. React invokes the callbacks it is handed as bare functions, so
 * `useSyncExternalStore(scope.subscribe, scope.getSnapshot)` throws during
 * render — and a section that crashes while rendering abdicates, which removes
 * its nav row instead of showing an error. Returning an object of arrow
 * functions keeps the receiver by construction.
 *
 * @param scope - The host settings scope.
 * @returns A receiver-safe source.
 */
function settingsScopeSource<TValue>(
  scope: SettingsScope<TValue>,
): SettingsSource<TValue> {
  return {
    getSnapshot: () => scope.getSnapshot(),
    subscribe: (listener: () => void) => scope.subscribe(listener),
  }
}

export {
  defaultSettings,
  normalizeSettings,
  sameSettings,
  settingsScopeSource,
  toDraft,
  type ClientSettings,
  type DraftSettings,
  type NumberFieldName,
  type SettingsFieldName,
  type SettingsSource,
  type TextFieldName,
  type ToggleFieldName,
}
