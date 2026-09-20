/**
 * The credential field's store: what the provider reports about the reference
 * the settings form names, and the value a user is staging for it.
 *
 * It is separate from the settings store because the two have different
 * authorities. The settings store writes the _reference_ through the host
 * scope; this one only describes and writes the _value_ behind it through the
 * credential remote. The draft is the single place a secret is ever held here:
 * it is dropped the moment the provider accepts it, and kept when the provider
 * refuses, because losing a key to a failed call is the one outcome the user
 * cannot recover from.
 *
 * @module dsh-plugin-system-one/client/credential-store
 */

import { createStore } from 'zustand/vanilla'
import type { StoreApi } from 'zustand/vanilla'

import type { CredentialApi } from './credentials.ts'
import { messageOf } from './store.ts'

/** How the last describe of a reference ended. */
type CredentialStatus = 'loading' | 'ready' | 'error'

/** Everything the credential field renders from. */
interface CredentialState {
  /** The reference this state describes. */
  ref: string
  /** How the last describe ended. */
  status: CredentialStatus
  /** Whether the provider holds a value for the reference. */
  configured: boolean
  /** Provider layer supplying the value, when one does. */
  source: string | undefined
  /** Whether the provider accepts a write for the reference. */
  writable: boolean
  /** The value being typed; the only place one is held. */
  draft: string
  /** Whether a credential call is in flight. */
  busy: boolean
  /**
   * Reason the last call failed, `undefined` when it did not. Required rather
   * than optional: under `exactOptionalPropertyTypes` an optional field cannot
   * be explicitly set back to `undefined`.
   */
  error: string | undefined
}

/** The transitions the credential field performs. */
interface CredentialActions {
  /** Record typed text. */
  setDraft: (value: string) => void
  /** Describe a reference, replacing whatever the field described before. */
  describe: (ref: string) => Promise<void>
  /** Store the draft under the current reference. */
  save: () => Promise<void>
  /** Remove the current reference's value. */
  clear: () => Promise<void>
}

/** Read and transition the credential field's state. */
type CredentialStore = StoreApi<CredentialState & CredentialActions>

/**
 * Build a credential store bound to one credential remote.
 *
 * @param api - The remote reads and writes this store performs.
 * @returns A store carrying the credential state and its actions.
 */
function createCredentialStore(api: CredentialApi): CredentialStore {
  /*
   * Holding only the newest request's token keeps a superseded answer from
   * publishing without widening what components see. Two describes can settle
   * out of order, and the last one asked for is the one the field has to show.
   */
  let newest: symbol | undefined = undefined

  return createStore<CredentialState & CredentialActions>()((set, get) => ({
    ref: '',
    status: 'loading',
    configured: false,
    source: undefined,
    writable: true,
    draft: '',
    busy: false,
    error: undefined,

    setDraft: (value: string): void => {
      set({ draft: value })
    },

    describe: async (ref: string): Promise<void> => {
      const token = Symbol('describe')
      newest = token
      if (get().ref === ref) {
        set({ status: 'loading', error: undefined })
      } else {
        /*
         * A new reference owns a new draft: keeping the old text would offer a
         * save of the previous reference's value under the new name.
         */
        set({
          ref,
          status: 'loading',
          configured: false,
          source: undefined,
          writable: true,
          draft: '',
          error: undefined,
        })
      }
      try {
        const info = await api.describe(ref)
        if (newest !== token) {
          return
        }
        set({
          status: 'ready',
          configured: info.configured,
          source: info.source,
          writable: info.writable,
          error: undefined,
        })
      } catch (error) {
        if (newest !== token) {
          return
        }
        set({ status: 'error', error: messageOf(error) })
      }
    },

    save: async (): Promise<void> => {
      const { draft, ref, writable } = get()
      /*
       * An unwritable reference is never written to, and an empty draft has
       * nothing to store: both are states the field disables its own action
       * for, so reaching either here is a no-op rather than a failure.
       */
      if (!writable || draft === '') {
        return
      }
      set({ busy: true, error: undefined })
      try {
        await api.set(ref, draft)
        set({ busy: false, draft: '' })
        await get().describe(ref)
      } catch (error) {
        set({ busy: false, error: messageOf(error) })
      }
    },

    clear: async (): Promise<void> => {
      const { ref, writable } = get()
      if (!writable) {
        return
      }
      set({ busy: true, error: undefined })
      try {
        await api.unset(ref)
        set({ busy: false, draft: '' })
        await get().describe(ref)
      } catch (error) {
        set({ busy: false, error: messageOf(error) })
      }
    },
  }))
}

export {
  createCredentialStore,
  type CredentialActions,
  type CredentialState,
  type CredentialStatus,
  type CredentialStore,
}
