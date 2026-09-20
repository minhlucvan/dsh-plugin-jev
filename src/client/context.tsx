/**
 * React context that scopes one store to one plugin instance.
 *
 * A zustand store created at module scope would be shared by every instance of
 * this plugin — and by every test that mounts it — so two mounted copies would
 * silently edit each other's state. Each provider creates its store once per
 * mount instead and hands it down through context, which is what makes a
 * store's lifetime match the component tree's.
 *
 * The settings store and the usage store are separate because they have
 * different authorities: the host's persisted scope for the form, and the
 * package's own routes for the panel. Keeping them apart means a failed ledger
 * read cannot mark the form dirty, or the reverse. The credential store is
 * separate for the same reason: it answers to the credential remote, not to the
 * settings scope, and it holds a value the others must never see.
 *
 * @module dsh-plugin-jev/client/context
 */

import type { ReactElement, ReactNode } from 'react'
import { createContext, useContext, useEffect, useState } from 'react'

import type { UsageApi } from './api.ts'
import type { CredentialStore } from './credential-store.ts'
import { createCredentialStore } from './credential-store.ts'
import type { CredentialApi } from './credentials.ts'
import type { SettingsScope } from './contracts.ts'
import type { ClientSettings } from './settings.ts'
import type { SettingsStore, UsageStore } from './store.ts'
import { connectSettingsScope, createSettingsStore, createUsageStore } from './store.ts'

/**
 * The scoped settings store, or `undefined` when read outside its provider.
 *
 * `undefined` rather than a throw-on-read proxy: the consumer is
 * `useSettingsStore` below, which turns the absent value into an error naming
 * the mis-wiring.
 */
const SettingsStoreContext = createContext<SettingsStore | undefined>(undefined)

/** The scoped usage store, or `undefined` when read outside its provider. */
const UsageStoreContext = createContext<UsageStore | undefined>(undefined)

/** The scoped credential store, or `undefined` when read outside its provider. */
const CredentialStoreContext = createContext<CredentialStore | undefined>(undefined)

/** Props accepted by {@link SettingsStoreProvider}. */
interface SettingsStoreProviderProps {
  /** The host's persisted settings scope this store mirrors. */
  scope: SettingsScope<ClientSettings>
  /** The tree allowed to read the store. */
  children: ReactNode
}

/** Props accepted by {@link UsageStoreProvider}. */
interface UsageStoreProviderProps {
  /** The routes the panel reads. */
  api: UsageApi
  /** The tree allowed to read the store. */
  children: ReactNode
}

/** Props accepted by {@link CredentialStoreProvider}. */
interface CredentialStoreProviderProps {
  /** The credential remote this store reads and writes. */
  api: CredentialApi
  /** The tree allowed to read the store. */
  children: ReactNode
}

/**
 * Create this instance's settings store and expose it to `children`.
 *
 * The store is created in a `useState` initializer, not a `useMemo`: a memo is
 * permitted to discard and rebuild its value, which would reset user state
 * mid-session, while state is guaranteed to persist across renders.
 *
 * @param props - The host scope and the subtree to scope it to.
 * @returns The provider element.
 */
function SettingsStoreProvider({
  scope,
  children,
}: SettingsStoreProviderProps): ReactElement {
  const [store] = useState(() => createSettingsStore(scope))

  /*
   * The host scope is the external authority. Subscribing here — rather than in
   * the store — keeps the store free of React, and returning the unsubscribe
   * from the effect ties the subscription to this component's lifetime.
   */
  useEffect(() => connectSettingsScope(store, scope), [store, scope])

  return (
    <SettingsStoreContext.Provider value={store}>
      {children}
    </SettingsStoreContext.Provider>
  )
}

/**
 * Create this instance's usage store and expose it to `children`.
 *
 * The first read is kicked off here for the same reason the host subscription
 * is: the panel then renders state that already exists, instead of owning an
 * effect of its own that has to be repeated for every copy.
 *
 * @param props - The routes to read and the subtree to scope them to.
 * @returns The provider element.
 */
function UsageStoreProvider({
  api,
  children,
}: UsageStoreProviderProps): ReactElement {
  const [store] = useState(() => createUsageStore(api))

  useEffect(() => {
    void store.getState().load()
  }, [store])

  return (
    <UsageStoreContext.Provider value={store}>
      {children}
    </UsageStoreContext.Provider>
  )
}

/**
 * Create this instance's credential store and expose it to `children`.
 *
 * `api` is deliberately not an effect dependency: a store carries the remote it
 * was built with for its whole life, and rebuilding it because a new props
 * object arrived would discard state the user is looking at.
 *
 * @param props - The credential remote and the subtree to scope it to.
 * @returns The provider element.
 */
function CredentialStoreProvider({
  api,
  children,
}: CredentialStoreProviderProps): ReactElement {
  const [store] = useState(() => createCredentialStore(api))

  return (
    <CredentialStoreContext.Provider value={store}>
      {children}
    </CredentialStoreContext.Provider>
  )
}

/**
 * Read the scoped settings store, or fail with the reason it is missing.
 *
 * @returns The settings store for the nearest provider.
 * @throws {Error} When called outside {@link SettingsStoreProvider}.
 */
function useSettingsStore(): SettingsStore {
  const store = useContext(SettingsStoreContext)
  if (store === undefined) {
    throw new Error(
      'useSettingsStore must be called inside a SettingsStoreProvider; '
        + 'render the component through the plugin slot rather than in isolation',
    )
  }
  return store
}

/**
 * Read the scoped credential store, or fail with the reason it is missing.
 *
 * @returns The credential store for the nearest provider.
 * @throws {Error} When called outside {@link CredentialStoreProvider}.
 */
function useCredentialStore(): CredentialStore {
  const store = useContext(CredentialStoreContext)
  if (store === undefined) {
    throw new Error(
      'useCredentialStore must be called inside a CredentialStoreProvider; '
        + 'render the component through the plugin slot rather than in isolation',
    )
  }
  return store
}

/**
 * Read the scoped usage store, or fail with the reason it is missing.
 *
 * @returns The usage store for the nearest provider.
 * @throws {Error} When called outside {@link UsageStoreProvider}.
 */
function useUsageStore(): UsageStore {
  const store = useContext(UsageStoreContext)
  if (store === undefined) {
    throw new Error(
      'useUsageStore must be called inside a UsageStoreProvider; '
        + 'render the component through the plugin slot rather than in isolation',
    )
  }
  return store
}

export {
  CredentialStoreProvider,
  SettingsStoreProvider,
  UsageStoreProvider,
  useCredentialStore,
  useSettingsStore,
  useUsageStore,
  type CredentialStoreProviderProps,
  type SettingsStoreProviderProps,
  type UsageStoreProviderProps,
}
