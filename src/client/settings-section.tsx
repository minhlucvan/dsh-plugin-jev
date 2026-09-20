/**
 * The settings section: layout only.
 *
 * It composes the form, the API-key field, the commit controls and the usage
 * panel, and owns nothing else — no state, no effects, no store access. Its
 * children read the stores through hooks, which is what keeps this file stable
 * as the form grows: adding a field is a change to the fields, not to the
 * section.
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
import type { Translate } from './translate.ts'
import { UsagePanel } from './usage-panel.tsx'

/** Props accepted by {@link SettingsSection}. */
interface SettingsSectionProps {
  /** Translator bound to this feature's namespace. */
  translate: Translate
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
      <div className='jev-group__fields'>
        <SettingsFields translate={translate} />
      </div>
      <CredentialField translate={translate} />
      <SaveControls translate={translate} />
      <UsagePanel translate={translate} />
    </section>
  )
}

export { SettingsSection, type SettingsSectionProps }

