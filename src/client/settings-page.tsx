/**
 * The slot-facing page.
 *
 * This is the seam between the host and the feature's React tree: the host
 * injects the settings scope, the translator and the routes as props, and
 * everything below this file reads its state from the scoped stores instead.
 * The page holds no state and no rendering logic of its own, so it does not
 * grow as the panel does.
 *
 * @module dsh-plugin-jev/client/settings-page
 */

import type { ReactElement } from 'react'

import type { UsageApi } from './api.ts'
import { SettingsStoreProvider, UsageStoreProvider } from './context.tsx'
import type { SettingsScope } from './contracts.ts'
import { SettingsSection } from './settings-section.tsx'
import type { ClientSettings } from './settings.ts'
import type { Translate } from './translate.ts'

/** Props the slot injects into this page. */
interface SettingsPageProps {
  /** Persisted settings scope this instance edits. */
  scope: SettingsScope<ClientSettings>
  /** Translator bound to this feature's namespace. */
  translate: Translate
  /** The plugin's own routes, read by the usage panel. */
  api: UsageApi
}

/**
 * Render the settings page.
 *
 * @param props - Slot-injected scope, translator and routes.
 * @returns The provider-wrapped section.
 */
function SettingsPage({ scope, translate, api }: SettingsPageProps): ReactElement {
  return (
    <SettingsStoreProvider scope={scope}>
      <UsageStoreProvider api={api}>
        <SettingsSection translate={translate} />
      </UsageStoreProvider>
    </SettingsStoreProvider>
  )
}

export { SettingsPage, type SettingsPageProps }
