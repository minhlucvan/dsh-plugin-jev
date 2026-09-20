/**
 * The usage store: the single source of truth for the ledger panel.
 *
 * It is built on `zustand/vanilla` rather than `zustand`, so it imports no
 * React and can be constructed and exercised in plain Node. React reaches it
 * only through the hooks, which is what keeps this file testable without a DOM.
 *
 * Unlike the settings store there is no external authority here: the panel is a
 * read-only view refreshed from the package's own routes, and a failed read
 * keeps the last good figures beside the reason instead of blanking them.
 *
 * @module dsh-plugin-system-one/client/usage-store
 */

import { createStore } from 'zustand/vanilla'
import type { StoreApi } from 'zustand/vanilla'

import type { CatalogBank, HealthReport, UsageApi, UsageReport } from './api.ts'
import { messageOf } from './store.ts'

/** How the usage panel's last read ended. */
type UsageStatus = 'loading' | 'ready' | 'error'

/** Everything the usage panel renders from. */
interface UsageState {
  /** How the last read ended. */ status: UsageStatus
  /** Liveness and model from the last successful read. */ health: HealthReport | undefined
  /** Cumulative and recent usage from the last successful read. */ report: UsageReport | undefined
  /** Question banks from the last successful read. */ banks: CatalogBank[]
  /**
   * Reason the last read failed, `undefined` when it did not. Required rather
   * than optional because clearing it must stay expressible under
   * `exactOptionalPropertyTypes`.
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
  createUsageStore,
  type UsageActions,
  type UsageState,
  type UsageStatus,
  type UsageStore,
}
