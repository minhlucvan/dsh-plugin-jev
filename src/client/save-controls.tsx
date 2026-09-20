/**
 * The save and reset controls.
 *
 * Both buttons read their own enabled state from the store, so the parent does
 * not decide when committing is meaningful — a form that enables Save with
 * nothing to save is a state bug, not a layout choice.
 *
 * @module dsh-plugin-jev/client/save-controls
 */

import type { ReactElement } from 'react'

import { useSettingsControls } from './hooks.ts'
import type { Translate } from './translate.ts'

/** Props accepted by {@link SaveControls}. */
interface SaveControlsProps {
  /** Translator bound to this feature's namespace. */
  translate: Translate
}

/** Props accepted by {@link SaveError}. */
interface SaveErrorProps {
  /** The failure message, absent when the last save succeeded. */
  error: string | undefined
  /** Translator bound to this feature's namespace. */
  translate: Translate
}

/**
 * Resolve the save button's label key.
 *
 * @param saving - Whether a save is in flight.
 * @returns The message key to translate.
 */
function saveLabelKey(saving: boolean): string {
  if (saving) {
    return 'saving'
  }
  return 'save'
}

/**
 * Render the save failure, when there is one.
 *
 * A helper with an early return rather than an inline conditional, because this
 * repository bans both the ternary operator and the `null` literal in JSX.
 *
 * @param props - The failure message and the bound translator.
 * @returns The alert element, or nothing to render.
 */
function SaveError({ error, translate }: SaveErrorProps): ReactElement | undefined {
  if (error === undefined) {
    return undefined
  }
  return (
    <p role='alert'>
      {translate('saveFailed')}: {error}
    </p>
  )
}

/**
 * Render the commit controls and any failure message.
 *
 * @param props - The bound translator.
 * @returns The buttons and, when a save failed, its reason.
 */
function SaveControls({ translate }: SaveControlsProps): ReactElement {
  const { saving, dirty, error, save, reset } = useSettingsControls()

  return (
    <>
      <button
        type='button'
        disabled={saving || !dirty}
        onClick={() => {
          /*
           * React ignores a handler's return value, so the promise is
           * explicitly discarded rather than handed back.
           */
          void save()
        }}
      >
        {translate(saveLabelKey(saving))}
      </button>
      <button
        type='button'
        disabled={saving}
        onClick={() => {
          reset()
        }}
      >
        {translate('reset')}
      </button>
      <SaveError error={error} translate={translate} />
    </>
  )
}

export { SaveControls, saveLabelKey, type SaveControlsProps }
