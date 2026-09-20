/**
 * The credential field's read path.
 *
 * Split from the settings hooks because the credential answers to the host's
 * credential remote rather than to the settings scope: it holds a value the
 * settings store must never see, so its state and its transitions are kept in
 * one place a settings field cannot reach by accident.
 *
 * @module dsh-plugin-jev/client/credential-hooks
 */

import { useEffect } from 'react'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'

import { useCredentialStore, useSettingsStore } from './context.tsx'
import type { CredentialActions, CredentialState } from './credential-store.ts'
import { credentialReference } from './credentials.ts'
import { displayDraft } from './hooks.ts'
import type { SettingsState } from './store.ts'

/** The credential state the API-key field renders from. */
type CredentialSlice = Pick<
  CredentialState,
  'ref' | 'status' | 'configured' | 'source' | 'writable' | 'draft' | 'busy' | 'error'
>

/** The credential transitions the API-key field invokes. */
type CredentialControls = Pick<
  CredentialActions,
  'setDraft' | 'describe' | 'save' | 'clear'
>

/** What the API-key field reads and calls. */
type CredentialFieldBinding = CredentialSlice & CredentialControls

/**
 * Read the credential field's state and actions.
 *
 * The reference follows the form's effective draft rather than the persisted
 * snapshot, so a change to the stored variable describes the new reference
 * immediately instead of only after the settings save. A describe already in
 * flight for the previous reference never publishes over the new one — the
 * store orders them.
 *
 * @returns The credential state, and the transitions the field invokes.
 */
function useCredentialField(): CredentialFieldBinding {
  const reference = useStore(
    useSettingsStore(),
    (state: SettingsState): string =>
      credentialReference(displayDraft(state)),
  )
  const field = useStore(
    useCredentialStore(),
    useShallow((state: CredentialState & CredentialActions): CredentialFieldBinding => ({
      ref: state.ref,
      status: state.status,
      configured: state.configured,
      source: state.source,
      writable: state.writable,
      draft: state.draft,
      busy: state.busy,
      error: state.error,
      setDraft: state.setDraft,
      describe: state.describe,
      save: state.save,
      clear: state.clear,
    })),
  )
  const { describe } = field

  /*
   * The first describe is the mount-time read, and every later reference
   * change re-reads: both are the same call, so a stale answer cannot outlive
   * the reference it answered for.
   */
  useEffect(() => {
    void describe(reference)
  }, [describe, reference])

  return field
}

export {
  useCredentialField,
  type CredentialFieldBinding,
  type CredentialSlice,
}
