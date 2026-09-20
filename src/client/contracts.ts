/**
 * Narrow browser-side host contracts for the client face.
 *
 * The build stays independent of the host's client packages, exactly as the
 * server companions stay independent of its source: each contract models only
 * the members this plugin calls, and a composed profile supplies the real
 * services at runtime.
 *
 * @module dsh-plugin-jev/client/contracts
 */

/** Dictionaries keyed by language tag, then by semantic key. */
type LocaleDictionaries = Record<string, Record<string, string>>

/** Client-side sync state of one settings namespace. */
type SettingsScopeStatus = 'loading' | 'ready' | 'unavailable'

/**
 * What one settings namespace currently looks like to the browser.
 *
 * The value is nested rather than being the snapshot itself, because the host
 * also reports whether the namespace is exposed at all, whether the document
 * accepts writes, and the revision a write is fenced against. Reading the
 * section off the snapshot object directly is the mistake this shape prevents.
 */
interface SettingsScopeSnapshot<TValue> {
  /** `loading` before the first accepted section, `ready` while one stands. */
  status: SettingsScopeStatus
  /** Last accepted section, or `undefined` before the first one arrives. */
  value: TValue | undefined
  /** Revision fencing the next write. */
  revision: number | undefined
  /** Whether the host document accepts writes at all. */
  writable: boolean
}

/**
 * One ordered write against a settings namespace.
 *
 * Paths are relative to the namespace section, and the empty path addresses the
 * section root — which is how a form that owns every field in its section
 * writes the whole thing in one atomic operation.
 */
type SettingsPathOp =
  | { op: 'set'; path: string[]; value: JsonValue }
  | { op: 'unset'; path: string[] }

/** A value the wire can carry. */
type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

/**
 * Persisted settings scope handed to a slot by the host.
 *
 * These are instance methods, not bound callbacks: the scope reads its own
 * state through `this`. React invokes the callbacks it is given as bare
 * functions, so they must be wrapped before `useSyncExternalStore` sees them —
 * see `settingsScopeSource` in `./settings.ts`.
 */
interface SettingsScope<TValue> {
  /** Read the current persisted snapshot. */
  getSnapshot: () => SettingsScopeSnapshot<TValue>
  /** Subscribe to changes; returns an unsubscribe function. */
  subscribe: (listener: () => void) => () => void
  /**
   * Queue one atomic namespace mutation.
   *
   * `expectedRevision` is deliberately optional here: a form that writes its
   * whole section wants the host's latest revision, not the one this client
   * happened to render.
   */
  mutate: (ops: readonly SettingsPathOp[], expectedRevision?: number) => Promise<void>
}

/** Locale registry: dictionaries plus a translator bound to one namespace. */
interface LocaleService {
  /** Register one namespace's dictionaries. Returns the removal disposer. */
  register: (namespace: string, locales: LocaleDictionaries) => () => void
  /** Bind a translator to one namespace. */
  bind: (namespace: string) => (key: string) => string
}

/**
 * Binder for one feature's persisted settings scope.
 *
 * A feature does not receive a scope directly; it receives the binder and names
 * its own namespace, so two features cannot accidentally share storage.
 */
interface SettingsScopeBinder<TValue = unknown> {
  /** Bind a scope to one settings namespace. */
  bind: (options: { namespace: string }) => SettingsScope<TValue>
}

/** One slot registration descriptor. */
interface SlotRegistration {
  /** Slot name this seat belongs to, for example `settings.section`. */
  name: string
  /** Seat identifier, unique within the slot. */
  id: string
  /** Sort order among the slot's seats. */
  order: number
  /** Human-readable seat label, resolved at render time. */
  label: () => string
  /** Props handed to the component, resolved at render time. */
  inject: () => Record<string, unknown>
}

/** Slot registry the client registers its seats into. */
interface SlotsService {
  /** Run `callback` once the named slot exists. */
  inject: (name: string, callback: () => void) => void
  /** Seat a component in a slot. Returns the removal disposer. */
  register: (slot: SlotRegistration, component: unknown) => () => void
}

/** The three sync states a snapshot may report. */
const SCOPE_STATUSES: readonly SettingsScopeStatus[] = [
  'loading',
  'ready',
  'unavailable',
]

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
 * Read a snapshot's revision.
 *
 * @param value - The raw `revision` member.
 * @returns The revision, or undefined when the host reported none.
 */
function readRevision(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return value
  }
  return undefined
}

/**
 * Read one snapshot defensively.
 *
 * A section that throws while rendering abdicates rather than showing an error,
 * so a host that answers with an unexpected shape must degrade to "nothing to
 * show yet" instead of taking the page down with it. Unwritable is the safe
 * default: it never offers a save that cannot land.
 *
 * @param value - Whatever the scope's `getSnapshot` returned.
 * @returns A snapshot with every member present.
 */
function readScopeSnapshot(value: unknown): SettingsScopeSnapshot<unknown> {
  if (!isRecord(value)) {
    return {
      status: 'loading',
      value: undefined,
      revision: undefined,
      writable: false,
    }
  }
  const status = SCOPE_STATUSES.find((candidate) => candidate === value.status)
  return {
    status: status ?? 'loading',
    value: value.value,
    revision: readRevision(value.revision),
    writable: value.writable === true,
  }
}

/**
 * Whether a value is a settings scope.
 *
 * @param value - Candidate service.
 * @returns True when the value implements the narrow scope contract.
 */
function isSettingsScope(value: unknown): value is SettingsScope<unknown> {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  if (
    !('getSnapshot' in value)
    || !('subscribe' in value)
    || !('mutate' in value)
  ) {
    return false
  }
  return (
    typeof value.getSnapshot === 'function'
    && typeof value.subscribe === 'function'
    && typeof value.mutate === 'function'
  )
}

/**
 * Whether a value is a locale service.
 *
 * @param value - Candidate service.
 * @returns True when the value implements the narrow locale contract.
 */
function isLocaleService(value: unknown): value is LocaleService {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  if (!('register' in value) || !('bind' in value)) {
    return false
  }
  return (
    typeof value.register === 'function' && typeof value.bind === 'function'
  )
}

/**
 * Whether a value is a settings-scope binder.
 *
 * @param value - Candidate service.
 * @returns True when the value implements the narrow binder contract.
 */
function isSettingsScopeBinder(value: unknown): value is SettingsScopeBinder {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  if (!('bind' in value)) {
    return false
  }
  return typeof value.bind === 'function'
}

/**
 * Whether a value is a slot registry.
 *
 * @param value - Candidate service.
 * @returns True when the value implements the narrow slots contract.
 */
function isSlotsService(value: unknown): value is SlotsService {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  if (!('inject' in value) || !('register' in value)) {
    return false
  }
  return (
    typeof value.inject === 'function' && typeof value.register === 'function'
  )
}

export {
  isLocaleService,
  isSettingsScope,
  isSettingsScopeBinder,
  isSlotsService,
  readScopeSnapshot,
  type JsonValue,
  type LocaleDictionaries,
  type LocaleService,
  type SettingsPathOp,
  type SettingsScope,
  type SettingsScopeBinder,
  type SettingsScopeSnapshot,
  type SettingsScopeStatus,
  type SlotRegistration,
  type SlotsService,
}
