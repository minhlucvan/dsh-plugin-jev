/**
 * Custom hooks over the usage store.
 *
 * The ledger's read path lives here rather than with the settings form's hooks
 * because the two answer to different authorities: the panel is refreshed from
 * the package's own routes, and a failed read there must never touch the form's
 * draft.
 *
 * @module dsh-plugin-system-one/client/usage-hooks
 */

import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'

import { useUsageStore } from './context.tsx'
import type { UsageActions, UsageState } from './usage-store.ts'

/** The usage state the panel renders from. */
type UsageReportSlice = Pick<
  UsageState,
  'status' | 'health' | 'report' | 'banks' | 'error'
>

/**
 * Read only what the usage panel needs to render.
 *
 * @returns How the last read ended, and what it produced.
 */
function useUsageReport(): UsageReportSlice {
  return useStore(
    useUsageStore(),
    useShallow((state: UsageState): UsageReportSlice => ({
      status: state.status,
      health: state.health,
      report: state.report,
      banks: state.banks,
      error: state.error,
    })),
  )
}

/**
 * Read the usage store's single action.
 *
 * @returns The refresh action, stable for the life of the store.
 */
function useUsageActions(): Pick<UsageActions, 'load'> {
  return useStore(
    useUsageStore(),
    useShallow((state: UsageActions): Pick<UsageActions, 'load'> => ({
      load: state.load,
    })),
  )
}

export { useUsageActions, useUsageReport, type UsageReportSlice }
