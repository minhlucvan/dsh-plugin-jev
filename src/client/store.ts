/**
 * The feature's zustand stores: the single sources of truth for settings state
 * and for the usage panel.
 *
 * Both stores are built on `zustand/vanilla` rather than `zustand`, so they
 * import no React and can be constructed and exercised in plain Node. React
 * reaches them only through `./hooks.ts`, which is what keeps this file
 * testable without a DOM and keeps the components free of state logic.
 *
 * Settings state is deliberately split: the store holds the _mutable_ draft,
 * while `SettingsScope` is the _external_ authority. `connectSettingsScope`
 * mirrors the host into the store and `save` writes back through it, so a
 * host-side change is never silently divergent. The usage store has no host
 * authority at all: it is refreshed from the package's own routes and keeps the
 * last good figures when a read fails.
 *
 * @module dsh-plugin-jev/client/store
 */

import { createStore } from 'zustand/vanilla'
import type { StoreApi } from 'zustand/vanilla'

import type { CatalogBank, HealthReport, UsageApi, UsageReport } from './api.ts'
import type { SettingsScope } from './contracts.ts'
import type {
  ClientSettings,
  DraftSettings,
  NumberFieldName,
  TextFieldName,
} from './settings.ts'
import { normalizeSettings, sameSettings, toDraft } from './settings.ts'

/** Reason recorded when a rejection carries no message of its own. */ const GENERIC_FAILURE = 'request failed'

/** Everything the settings form renders from. */
interface SettingsState {
  /** The snapshot the host currently holds, normalized. */ persisted: ClientSettings
  /** The text the user has typed. */ draft: DraftSettings
  /**
   * The persisted snapshot the current draft was seeded from.
   *
   * Comparing this against `persisted` distinguishes an edit worth protecting
   * from a host change the form should follow.
   */
  draftOrigin: ClientSettings
  /** Whether the normalized draft differs from what the host holds. */ dirty: boolean
  /** Whether a save is in flight. */ saving: boolean
  /**
   * Reason the last save failed, `undefined` when it did not.
   *
   * Required rather than optional: under `exactOptionalPropertyTypes` an
   * optional field cannot be explicitly set back to `undefined`.
   */
  error: string | undefined
}

/** The state transitions the form performs. */
interface SettingsActions {
  /** Record text typed into a string field. */ setText: (field: TextFieldName, value: string) => void
  /** Record text typed into a numeric field. */ setCount: (field: NumberFieldName, value: string) => void
  /** Record the master switch. */ setEnabled: (value: boolean) => void
  /** Discard the draft and fall back to the persisted snapshot. */ reset: () => void
  /** Persist the normalized draft through the host scope. */ save: () => Promise<void>
  /** Adopt an externally-provided persisted snapshot. */ sync: (persisted: ClientSettings) => void
}

/** Read and transition the settings state. */
type SettingsStore = StoreApi<SettingsState & SettingsActions>

/** How the usage panel's last read ended. */
type UsageStatus = 'loading' | 'ready' | 'error'

/** Everything the usage panel renders from. */
interface UsageState {
  /** How the last read ended. */ status: UsageStatus
  /** Liveness and model from the last successful read. */ health: HealthReport | undefined
  /** Cumulative and recent usage from the last successful read. */ report: UsageReport | undefined
  /** Question banks from the last successful read. */ banks: CatalogBank[]
  /**
   * Reason the last read failed, `undefined` when it did not. Required for the
   * same reason as the settings form's error: clearing it must be expressible.
   */
  error: string | undefined
}

/** The state transitions the usage panel performs. */
interface UsageActions {
  /** Re-read health, usage and catalog from the package's routes. */ load: () => Promise<void>
}

/** Read and transition the usage panel state. */
type UsageStore = StoreApi<UsageState & UsageActions>

/**
 * Turn a thrown value into a message worth showing.
 *
 * @param error - Whatever the host or the network rejected with. Not
 *   necessarily an `Error`, which is why this narrows rather than casts.
 * @returns The error's message, or a generic one for a non-`Error` rejection.
 */
function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return GENERIC_FAILURE
}

/**
 * Resolve the state an external persisted snapshot produces.
 *
 * Pure so the "protect an edited draft" rule is testable without a store. A
 * state whose draft still matches the snapshot it was seeded from follows the
 * new value; one holding a user's edit keeps the edit and only rebases.
 *
 * @param state - Current state.
 * @param persisted - The snapshot the host now holds.
 * @returns The state fields an external update replaces.
 */
function externalUpdate(
  state: SettingsState,
  persisted: ClientSettings,
): Pick<SettingsState, 'persisted' | 'draft' | 'draftOrigin' | 'dirty'> {
  if (state.dirty && !sameSettings(normalizeSettings(state.draft), state.draftOrigin)) {
    return {
      persisted,
      draft: state.draft,
      draftOrigin: persisted,
      dirty: true,
    }
  }
  return { persisted, draft: toDraft(persisted), draftOrigin: persisted, dirty: false }
}

/**
 * Resolve the state a reset produces.
 *
 * @param state - Current state.
 * @returns The state fields a reset replaces.
 */
function resetState(
  state: SettingsState,
): Pick<SettingsState, 'draft' | 'draftOrigin' | 'dirty' | 'error'> {
  return {
    draft: toDraft(state.persisted),
    draftOrigin: state.persisted,
    dirty: false,
    error: undefined,
  }
}

/**
 * Resolve the state one draft edit produces.
 *
 * Dirty is recomputed from the normalized draft, so a change that normalization
 * would erase — a blank model, a number beyond its range — does not offer the
 * user a save that would do nothing.
 *
 * @param state - Current state.
 * @param draft - The edited draft.
 * @returns The state fields an edit replaces.
 */
function draftChange(
  state: SettingsState,
  draft: DraftSettings,
): Pick<SettingsState, 'draft' | 'dirty'> {
  return {
    draft,
    dirty: !sameSettings(normalizeSettings(draft), state.persisted),
  }
}

/**
 * Replace one string field of a draft.
 *
 * @param draft - Draft to edit.
 * @param field - Field to replace.
 * @param value - Text typed into the field.
 * @returns A new draft.
 */
function withText(
  draft: DraftSettings,
  field: TextFieldName,
  value: string,
): DraftSettings {
  if (field === 'apiKeyEnv') {
    return { ...draft, apiKeyEnv: value }
  }
  if (field === 'model') {
    return { ...draft, model: value }
  }
  return { ...draft, baseUrl: value }
}

/**
 * Replace one numeric field of a draft.
 *
 * @param draft - Draft to edit.
 * @param field - Field to replace.
 * @param value - Text typed into the field.
 * @returns A new draft.
 */
function withCount(
  draft: DraftSettings,
  field: NumberFieldName,
  value: string,
): DraftSettings {
  if (field === 'confidenceFloor') {
    return { ...draft, confidenceFloor: value }
  }
  if (field === 'confirmFloor') {
    return { ...draft, confirmFloor: value }
  }
  return { ...draft, ledgerLimit: value }
}

/**
 * Build a settings store bound to one host scope.
 *
 * @param scope - The host's persisted settings scope for this namespace.
 * @returns A store carrying the settings state and its actions.
 */
function createSettingsStore(scope: SettingsScope<ClientSettings>): SettingsStore {
  const initial = normalizeSettings(scope.getSnapshot())

  return createStore<SettingsState & SettingsActions>()((set, get) => ({
    persisted: initial,
    draft: toDraft(initial),
    draftOrigin: initial,
    dirty: false,
    saving: false,
    error: undefined,

    setText: (field: TextFieldName, value: string): void => {
      set((state) => draftChange(state, withText(state.draft, field, value)))
    },

    setCount: (field: NumberFieldName, value: string): void => {
      set((state) => draftChange(state, withCount(state.draft, field, value)))
    },

    setEnabled: (value: boolean): void => {
      set((state) => draftChange(state, { ...state.draft, enabled: value }))
    },

    reset: (): void => {
      set((state) => resetState(state))
    },

    sync: (persisted: ClientSettings): void => {
      set((state) => externalUpdate(state, persisted))
    },

    save: async (): Promise<void> => {
      set({ saving: true, error: undefined })
      try {
        await scope.mutate(normalizeSettings(get().draft))
        set({ saving: false, dirty: false })
      } catch (error) {
        /*
         * Keep the draft on failure: discarding a user's text because the write
         * failed is the one outcome they cannot recover from. The reason is
         * recorded instead so the UI can surface it.
         */
        set({ saving: false, error: messageOf(error) })
      }
    },
  }))
}

/**
 * Mirror the host scope into a settings store.
 *
 * The subscription is returned rather than registered so the caller owns
 * disposal: in the browser that is the plugin fiber, which must release it on
 * unload or the store outlives the component that created it.
 *
 * @param store - Store to keep in sync.
 * @param scope - The host's persisted settings scope.
 * @returns The unsubscribe function.
 */
function connectSettingsScope(
  store: SettingsStore,
  scope: SettingsScope<ClientSettings>,
): () => void {
  store.getState().sync(normalizeSettings(scope.getSnapshot()))
  return scope.subscribe(() => {
    store.getState().sync(normalizeSettings(scope.getSnapshot()))
  })
}

/**
 * Build a usage store bound to one set of reads.
 *
 * @param api - The routes this panel reads.
 * @returns A store carrying the usage state and its single action.
 */
function createUsageStore(api: UsageApi): UsageStore {
  return createStore<UsageState & UsageActions>()((set) => ({
    status: 'loading',
    health: undefined,
    report: undefined,
    banks: [],
    error: undefined,

    load: async (): Promise<void> => {
      set({ status: 'loading', error: undefined })
      try {
        const [health, report, catalog] = await Promise.all([
          api.health(),
          api.usage(),
          api.catalog(),
        ])
        set({
          status: 'ready',
          health,
          report,
          banks: [...catalog.banks],
          error: undefined,
        })
      } catch (error) {
        /*
         * The previous read is kept: a failed refresh has to show the reason
         * beside the last known figures rather than blanking the panel, and a
         * rejected read must never escape as an unhandled rejection.
         */
        set({ status: 'error', error: messageOf(error) })
      }
    },
  }))
}

export {
  connectSettingsScope,
  createSettingsStore,
  createUsageStore,
  draftChange,
  externalUpdate,
  messageOf,
  resetState,
  withCount,
  withText,
  type SettingsActions,
  type SettingsState,
  type SettingsStore,
  type UsageActions,
  type UsageState,
  type UsageStatus,
  type UsageStore,
}
