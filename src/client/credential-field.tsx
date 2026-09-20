/**
 * The API-key field: a password input, and the two actions that write and
 * remove the value behind the reference the form names.
 *
 * The field never displays a stored value, because no read path returns one. Its
 * job is to report what the provider says about the reference and to stage a
 * replacement — so a provider that refuses a write (an inherited environment
 * variable shadows the reference) reports the reference as not writable, and
 * both actions are disabled rather than left to fail.
 *
 * @module dsh-plugin-jev/client/credential-field
 */

import type { ReactElement } from 'react'

import type { CredentialSlice } from './credential-hooks.ts'
import { useCredentialField } from './credential-hooks.ts'
import type { MessageKey } from './locale.ts'
import type { Translate } from './translate.ts'

/** DOM id of the credential input, so its label points at it. */
const CREDENTIAL_FIELD_ID = 'dsh-plugin-jev-credential'

/** DOM id of the credential hint paragraph. */
const CREDENTIAL_HINT_ID = `${CREDENTIAL_FIELD_ID}-hint`

/** Props accepted by {@link CredentialField}. */
interface CredentialFieldProps {
  /** Translator bound to this feature's namespace. */
  translate: Translate
}

/** Props accepted by the parts that describe the field's state. */
interface CredentialStateProps {
  /** The credential state to describe. */
  state: CredentialSlice
  /** Translator bound to this feature's namespace. */
  translate: Translate
}

/**
 * Resolve the save button's label key.
 *
 * @param busy - Whether a credential call is in flight.
 * @returns The message key to translate.
 */
function credentialSaveKey(busy: boolean): MessageKey {
  if (busy) {
    return 'credentialSaving'
  }
  return 'credentialSave'
}

/**
 * Resolve the configured-or-missing line's key.
 *
 * @param configured - Whether the provider holds a value for the reference.
 * @returns The message key to translate.
 */
function credentialStateKey(configured: boolean): MessageKey {
  if (configured) {
    return 'credentialConfigured'
  }
  return 'credentialMissing'
}

/**
 * Resolve the writability line's key.
 *
 * @param writable - Whether the provider accepts a write for the reference.
 * @returns The message key to translate.
 */
function credentialWritabilityKey(writable: boolean): MessageKey {
  if (writable) {
    return 'credentialWritable'
  }
  return 'credentialReadOnly'
}

/**
 * Render the provider layer that supplies the value, when it named one.
 *
 * @param props - The state to read and the bound translator.
 * @returns The source line, or nothing when no layer was reported.
 */
function CredentialSource({
  state,
  translate,
}: CredentialStateProps): ReactElement | undefined {
  if (state.source === undefined) {
    return undefined
  }
  return (
    <p>
      {translate('credentialSource')}: {state.source}
    </p>
  )
}

/**
 * Render what the provider reports about the reference.
 *
 * A helper with early returns rather than inline conditionals, because this
 * repository bans the ternary operator in JSX.
 *
 * @param props - The state to read and the bound translator.
 * @returns The status lines, or nothing while loading or after a failed read.
 */
function CredentialStatus({
  state,
  translate,
}: CredentialStateProps): ReactElement | undefined {
  if (state.status === 'loading') {
    return (
      <p className='jev-status' role='status'>
        {translate('credentialLoading')}
      </p>
    )
  }
  if (state.status === 'error') {
    /*
     * A failed describe says nothing about the reference, so the reason below
     * is the only honest thing to show.
     */
    return undefined
  }
  return (
    <div className='jev-status'>
      <p role='status'>{translate(credentialStateKey(state.configured))}</p>
      <CredentialSource state={state} translate={translate} />
      {/*
        The reference is the one thing a user needs to act on a read-only key:
        it names the environment variable that has to go.
      */}
      <p>
        {translate('credentialReference')}: {state.ref}
      </p>
      <p>{translate(credentialWritabilityKey(state.writable))}</p>
    </div>
  )
}

/**
 * Render the failure reason, when the last call failed.
 *
 * @param props - The state to read and the bound translator.
 * @returns The alert element, or nothing to render.
 */
function CredentialError({
  state,
  translate,
}: CredentialStateProps): ReactElement | undefined {
  if (state.error === undefined) {
    return undefined
  }
  return (
    <p className='jev-alert' role='alert'>
      {translate('credentialFailed')}: {state.error}
    </p>
  )
}

/**
 * Render the API-key field.
 *
 * @param props - The bound translator.
 * @returns The labelled password input and its actions.
 */
function CredentialField({ translate }: CredentialFieldProps): ReactElement {
  const field = useCredentialField()
  /*
   * One lock covers both actions: a busy field and an unwritable reference are
   * the same instruction to the user — this value cannot be changed right now.
   */
  const locked = field.busy || !field.writable

  return (
    <div className='jev-group jev-card'>
      <div className='jev-field'>
        <label className='jev-field__label' htmlFor={CREDENTIAL_FIELD_ID}>
          {translate('credentialLabel')}
        </label>
        <input
          id={CREDENTIAL_FIELD_ID}
          className='jev-input'
          type='password'
          value={field.draft}
          disabled={locked}
          autoComplete='off'
          aria-describedby={CREDENTIAL_HINT_ID}
          onChange={(event) => {
            field.setDraft(event.target.value)
          }}
        />
        <p className='jev-field__hint' id={CREDENTIAL_HINT_ID}>
          {translate('credentialHint')}
        </p>
      </div>
      <CredentialStatus state={field} translate={translate} />
      <div className='jev-actions'>
        <button
          type='button'
          className='jev-btn jev-btn--primary'
          disabled={locked || field.draft === ''}
          onClick={() => {
            /*
             * React ignores a handler's return value, so the promise is
             * explicitly discarded rather than handed back.
             */
            void field.save()
          }}
        >
          {translate(credentialSaveKey(field.busy))}
        </button>
        <button
          type='button'
          className='jev-btn'
          disabled={locked}
          onClick={() => {
            void field.clear()
          }}
        >
          {translate('credentialClear')}
        </button>
      </div>
      <CredentialError state={field} translate={translate} />
    </div>
  )
}

export {
  CREDENTIAL_FIELD_ID,
  CREDENTIAL_HINT_ID,
  CredentialField,
  credentialSaveKey,
  credentialStateKey,
  credentialWritabilityKey,
  type CredentialFieldProps,
}
