/**
 * The save and reset controls.
 *
 * Both buttons read their own enabled state from the store, so the parent does
 * not decide when committing is meaningful — a form that enables Save with
 * nothing to save is a state bug, not a layout choice.
 *
 * @module dsh-plugin-system-one/client/save-controls
 */

import type { ReactElement } from 'react'

import { useSettingsControls } from './hooks.ts'
import type { Translate } from './translate.ts'

/** Props accepted by {@link SaveControls}. */
interface SaveControlsProps {
  /** Translator bound to this feature's namespace. */
  translate: Translate
}

/** Props accepted by {@link ReadOnlyNotice}. */
interface ReadOnlyNoticeProps {
  /** Whether the host document accepts writes. */
  writable: boolean
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
 * Explain why the form cannot be saved, when it cannot.
 *
 * The host reports an unwritable namespace for a browser connection that keeps
 * preferences process-local, which is a deployment fact rather than a user
 * error: the honest thing is to say so instead of offering a disabled button
 * with no reason beside it.
 *
 * @param props - Whether the namespace is writable and the bound translator.
 * @returns The notice element, or nothing when the form is writable.
 */
function ReadOnlyNotice({
  writable,
  translate,
}: ReadOnlyNoticeProps): ReactElement | undefined {
  if (writable) {
    return undefined
  }
  return (
    <p className='jev-status' role='status'>
      {translate('settingsReadOnly')}
    </p>
  )
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
    <p className='jev-alert' role='alert'>
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
  const { saving, writable, dirty, error, save, reset } = useSettingsControls()

  return (
    <div className='jev-group'>
      <ReadOnlyNotice writable={writable} translate={translate} />
      <div className='jev-actions'>
        <button
          type='button'
          className='jev-btn jev-btn--primary'
          disabled={saving || !writable || !dirty}
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
          className='jev-btn jev-btn--quiet'
          disabled={saving || !writable}
          onClick={() => {
            reset()
          }}
        >
          {translate('reset')}
        </button>
      </div>
      <SaveError error={error} translate={translate} />
    </div>
  )
}

export {
  ReadOnlyNotice,
  SaveControls,
  saveLabelKey,
  type ReadOnlyNoticeProps,
  type SaveControlsProps,
}

