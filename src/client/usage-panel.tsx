/**
 * The usage panel: the read-only view over the plugin's token ledger.
 *
 * The panel is deliberately unopinionated about failure. A route that is absent,
 * slow or answering with something unrecognized produces a described state in
 * the store, and this file renders whichever of those states applies without
 * throwing — a settings section that crashes while rendering abdicates and takes
 * its nav row with it, which is a far worse outcome than a visible error line.
 *
 * @module dsh-plugin-jev/client/usage-panel
 */

import type { ReactElement } from 'react'

import type { HealthReport } from './api.ts'
import { useUsageActions, useUsageReport } from './hooks.ts'
import type { MessageKey } from './locale.ts'
import type { UsageStatus } from './store.ts'
import type { Translate } from './translate.ts'
import {
  UsageByTool,
  UsageCatalog,
  UsageRecent,
  UsageTotalsList,
} from './usage-tables.tsx'

/** Props accepted by every part of the panel. */
interface UsagePanelProps {
  /** Translator bound to this feature's namespace. */
  translate: Translate
}

/**
 * Resolve the refresh button's label key.
 *
 * @param status - How the last read ended.
 * @returns The message key to translate.
 */
function refreshKey(status: UsageStatus): MessageKey {
  if (status === 'loading') {
    return 'usageRefreshing'
  }
  return 'usageRefresh'
}

/**
 * Resolve the liveness label's key.
 *
 * @param health - Liveness as the last read reported it.
 * @returns The message key to translate.
 */
function healthKey(health: HealthReport): MessageKey {
  if (health.enabled) {
    return 'healthLive'
  }
  return 'healthDisabled'
}

/**
 * Read the failure reason, or the placeholder used when none was recorded.
 *
 * @param error - The reason the last read failed, when there was one.
 * @param translate - Translator bound to this feature's namespace.
 * @returns The reason to display.
 */
function reasonOf(error: string | undefined, translate: Translate): string {
  if (error === undefined) {
    return translate('usageUnknown')
  }
  return error
}

/**
 * Render the liveness line.
 *
 * @param props - The bound translator.
 * @returns The line, or nothing before the first read settles.
 */
function UsageHealth({ translate }: UsagePanelProps): ReactElement | undefined {
  const { health } = useUsageReport()
  if (health === undefined) {
    return undefined
  }
  return (
    <p className='jev-status'>
      {translate('healthLabel')}: {translate(healthKey(health))} ({health.model})
    </p>
  )
}

/**
 * Render the panel body for whichever state the last read produced.
 *
 * @param props - The bound translator.
 * @returns The loading, failure or ready state.
 */
function UsageBody({ translate }: UsagePanelProps): ReactElement {
  const { status, error } = useUsageReport()

  if (status === 'error') {
    return (
      <p className='jev-alert' role='alert'>
        {translate('usageFailed')}: {reasonOf(error, translate)}
      </p>
    )
  }
  if (status === 'loading') {
    return (
      <p className='jev-status' role='status'>
        {translate('usageLoading')}
      </p>
    )
  }
  return (
    <>
      <UsageHealth translate={translate} />
      <UsageTotalsList translate={translate} />
      <UsageByTool translate={translate} />
      <UsageRecent translate={translate} />
      <UsageCatalog translate={translate} />
    </>
  )
}

/**
 * Render the usage panel.
 *
 * @param props - The bound translator.
 * @returns The refreshable panel.
 */
function UsagePanel({ translate }: UsagePanelProps): ReactElement {
  const { status } = useUsageReport()
  const { load } = useUsageActions()

  return (
    <section className='jev-group jev-card' aria-label={translate('usageHeading')}>
      <h3 className='jev-group__title'>{translate('usageHeading')}</h3>
      <p className='jev-field__hint'>{translate('usageDescription')}</p>
      <div className='jev-actions'>
      <button
        type='button'
        className='jev-btn'
        disabled={status === 'loading'}
        onClick={() => {
          /*
           * React ignores a handler's return value, so the promise is
           * explicitly discarded rather than handed back.
           */
          void load()
        }}
      >
        {translate(refreshKey(status))}
      </button>
      </div>
      <UsageBody translate={translate} />
    </section>
  )
}

export { UsagePanel, healthKey, reasonOf, refreshKey, type UsagePanelProps }
