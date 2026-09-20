/**
 * The settings section: layout only.
 *
 * It composes the three tabs — configuration, the API key, and the ledger — and
 * owns nothing else: no state, no effects, no store access. Its children read
 * the stores through hooks, which is what keeps this file stable as the panel
 * grows: adding a field is a change to the fields, not to the section.
 *
 * Structure and class names only. Every rule lives in `styles.ts`, so the
 * markup here reads as an outline of the panel.
 *
 * @module dsh-plugin-jev/client/settings-section
 */

import type { ReactElement } from 'react'

import { CredentialField } from './credential-field.tsx'
import { SaveControls } from './save-controls.tsx'
import { SettingsFields } from './settings-fields.tsx'
import { SettingsTabs } from './tabs.tsx'
import type { SettingsTab } from './tabs.tsx'
import type { Translate } from './translate.ts'
import { UsagePanel } from './usage-panel.tsx'

/** Props accepted by {@link SettingsSection}. */
interface SettingsSectionProps {
  /** Translator bound to this feature's namespace. */
  translate: Translate
}

/**
 * Build the tabs this section shows.
 *
 * The key sits in its own tab rather than under the form because it has its own
 * save action: two buttons labelled Save on one screen is a question the user
 * should not have to answer.
 *
 * @param translate - Translator bound to this feature's namespace.
 * @returns The tabs, in display order.
 */
function tabsOf(translate: Translate): SettingsTab[] {
  return [
    {
      id: 'settings',
      label: translate('tabSettings'),
      content: (
        <div className='jev-group__fields'>
          <SettingsFields translate={translate} />
          <SaveControls translate={translate} />
        </div>
      ),
    },
    {
      id: 'credential',
      label: translate('tabCredential'),
      content: <CredentialField translate={translate} />,
    },
    {
      id: 'usage',
      label: translate('tabUsage'),
      content: <UsagePanel translate={translate} />,
    },
  ]
}

/**
 * Render the settings form's layout.
 *
 * @param props - The bound translator, passed down to the composed parts.
 * @returns The section element.
 */
function SettingsSection({ translate }: SettingsSectionProps): ReactElement {
  return (
    <section className='jev' aria-label={translate('nav')}>
      <header>
        <h2 className='jev__title'>{translate('heading')}</h2>
        <p className='jev__intro'>{translate('description')}</p>
      </header>
      <SettingsTabs tabs={tabsOf(translate)} />
    </section>
  )
}

export { SettingsSection, tabsOf, type SettingsSectionProps }

