/**
 * The slot-facing page.
 *
 * This is the seam between the host and the feature's React tree: the host
 * injects the settings scope, the translator, the routes and the credential
 * remote as props, and everything below this file reads its state from the
 * scoped stores instead.
 * The page holds no state and no rendering logic of its own, so it does not
 * grow as the panel does.
 *
 * @module dsh-plugin-jev/client/settings-page
 */

import type { ReactElement } from 'react'

import type { UsageApi } from './api.ts'
import {
  CredentialStoreProvider,
  SettingsStoreProvider,
  UsageStoreProvider,
} from './context.tsx'
import type { SettingsScope } from './contracts.ts'
import type { CredentialApi } from './credentials.ts'
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
  /** The credential remote the API-key field reads and writes. */
  credentials: CredentialApi
}

/**
 * Render the settings page.
 *
 * @param props - Slot-injected scope, translator, routes and credentials.
 * @returns The provider-wrapped section.
 */
function SettingsPage({
  scope,
  translate,
  api,
  credentials,
}: SettingsPageProps): ReactElement {
  return (
    <SettingsStoreProvider scope={scope}>
      <CredentialStoreProvider api={credentials}>
        <UsageStoreProvider api={api}>
          <SettingsSection translate={translate} />
        </UsageStoreProvider>
      </CredentialStoreProvider>
    </SettingsStoreProvider>
  )
}

export { SettingsPage, type SettingsPageProps }
