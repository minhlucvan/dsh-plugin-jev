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
  getSnapshot: () => TValue
  /** Subscribe to changes; returns an unsubscribe function. */
  subscribe: (listener: () => void) => () => void
  /** Persist a normalized value. */
  mutate: (value: TValue) => void | Promise<void>
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
  type LocaleDictionaries,
  type LocaleService,
  type SettingsScope,
  type SettingsScopeBinder,
  type SlotRegistration,
  type SlotsService,
}
