/**
 * The settings section: layout only.
 *
 * It composes the form, the commit controls and the usage panel, and owns
 * nothing else — no state, no effects, no store access. Its children read the
 * stores through hooks, which is what keeps this file stable as the form grows:
 * adding a field is a change to the fields, not to the section.
 *
 * @module dsh-plugin-jev/client/settings-section
 */

import type { ReactElement } from 'react'

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
    <section aria-label={translate('nav')}>
      <h2>{translate('heading')}</h2>
      <p>{translate('description')}</p>
      <SettingsFields translate={translate} />
      <SaveControls translate={translate} />
      <UsagePanel translate={translate} />
    </section>
  )
}

export { SettingsSection, type SettingsSectionProps }
