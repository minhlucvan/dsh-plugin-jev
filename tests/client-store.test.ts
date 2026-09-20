/**
 * Settings-store tests.
 *
 * These run in plain Node with no DOM and no React: the store is deliberately
 * built on `zustand/vanilla`, so its rules are verifiable without a renderer.
 * The rules worth pinning are the ones a form gets subtly wrong — reading the
 * host's section out of the wrong object, losing a user's text when the host
 * changes underneath them, or writing an operation the host rejects. The usage
 * store's rules live in `./client-usage-store.test.ts`.
 */
import { describe, expect, it, vi } from 'vitest'

import type {
  SettingsScope,
  SettingsScopeSnapshot,
  SettingsScopeStatus,
} from '#src/client/contracts'
import type { ClientSettings } from '#src/client/settings'
import { defaultSettings, toDraft } from '#src/client/settings'
import {
  connectSettingsScope,
  createSettingsStore,
  externalUpdate,
} from '#src/client/store'
import type { SettingsState } from '#src/client/store'

const TEST_TIMEOUT = 5000
const EXPECTED_SINGLE_CALL = 1
const FIRST_INDEX = 0
const TYPED_MODEL = '  jev-typed  '
const HOST_MODEL = 'changed on the host'

/** A scope that records mutations instead of persisting them. */
interface FakeScope {
  /** The scope handed to the store. */ scope: SettingsScope<ClientSettings>
  /** The recorded writes. */ mutate: ReturnType<typeof vi.fn>
  /** The recorded unsubscriptions. */ unsubscribe: ReturnType<typeof vi.fn>
  /** Replace the section the host reports. */ setSnapshot: (value: unknown) => void
  /** Notify subscribers, as the host does after a write. */ notify: () => void
}

/** Options a fake scope can be built with. */
interface FakeScopeOptions {
  /** The section the host reports, unnormalized on purpose. */
  section?: unknown
  /** Rejection that simulates a failed write. */
  reject?: Error
  /** Whether the host document accepts writes. */
  writable?: boolean
  /** How the namespace is syncing. */
  status?: SettingsScopeStatus
}

/**
 * Build a scope that records mutations instead of persisting them.
 *
 * The section is handed back exactly as it was set, because normalizing it here
 * would stop these cases from proving the store normalizes at its own boundary.
 *
 * @param options - Section, failure switch, and host-reported sync state.
 * @returns The fake scope plus its recorders.
 */
function fakeScope(options: FakeScopeOptions = {}): FakeScope {
  let section: unknown = options.section ?? defaultSettings
  const listeners = new Set<() => void>()
  const unsubscribe = vi.fn<() => void>()
  const mutate = vi.fn<(ops: readonly unknown[]) => Promise<void>>(async () => {
    if (options.reject !== undefined) {
      await Promise.reject(options.reject)
    }
  })

  return {
    scope: {
      getSnapshot: (): SettingsScopeSnapshot<ClientSettings> => ({
        status: options.status ?? 'ready',
        // oxlint-disable-next-line no-unsafe-type-assertion -- The point of the fake: a malformed section has to reach the store.
        value: section as ClientSettings,
        revision: undefined,
        writable: options.writable ?? true,
      }),
      subscribe: (listener: () => void): (() => void) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
          unsubscribe()
        }
      },
      mutate,
    },
    mutate,
    unsubscribe,
    setSnapshot: (value: unknown): void => {
      section = value
    },
    notify: (): void => {
      for (const listener of listeners) {
        listener()
      }
    },
  }
}

/**
 * A state literal with every field the transitions read.
 *
 * @param overrides - Fields to replace.
 * @returns A complete state.
 */
function stateWith(overrides: Partial<SettingsState>): SettingsState {
  return {
    persisted: defaultSettings,
    draft: toDraft(defaultSettings),
    draftOrigin: defaultSettings,
    dirty: false,
    writable: true,
    status: 'ready',
    saving: false,
    error: undefined,
    ...overrides,
  }
}

function testCleanStateFollowsTheHost(): void {
  expect.hasAssertions()
  const next = externalUpdate(stateWith({}), { ...defaultSettings, model: HOST_MODEL })
  expect(next.persisted.model).toBe(HOST_MODEL)
  expect(next.draft.model).toBe(HOST_MODEL)
  expect(next.dirty).toBe(false)
}

function testEditedDraftSurvivesAnExternalChange(): void {
  expect.hasAssertions()
  const edited = stateWith({
    draft: { ...toDraft(defaultSettings), model: 'typed by the user' },
    dirty: true,
  })
  const next = externalUpdate(edited, { ...defaultSettings, model: HOST_MODEL })
  // The host's new value is recorded, but the user's text is not discarded.
  expect(next.persisted.model).toBe(HOST_MODEL)
  expect(next.draft.model).toBe('typed by the user')
  expect(next.dirty).toBe(true)
}

function testDraftEqualToTheOriginIsNotProtected(): void {
  expect.hasAssertions()
  /*
   * A draft that matches the snapshot it was seeded from is not an edit worth
   * protecting, even if a previous keystroke left `dirty` set — following the
   * host here is what keeps the form from showing stale text.
   */
  const stale = stateWith({ draft: toDraft(defaultSettings), dirty: true })
  const next = externalUpdate(stale, { ...defaultSettings, model: HOST_MODEL })
  expect(next.draft.model).toBe(HOST_MODEL)
  expect(next.dirty).toBe(false)
}

function testStartsFromTheNormalizedSnapshot(): void {
  expect.hasAssertions()
  const padded = createSettingsStore(fakeScope({ section: { ...defaultSettings, model: '  jev  ' } }).scope)
  expect(padded.getState().persisted.model).toBe('jev')
  expect(padded.getState().dirty).toBe(false)

  const malformed = createSettingsStore(fakeScope({ section: 42 }).scope)
  expect(malformed.getState().persisted).toStrictEqual(defaultSettings)
}

function testReadsTheSectionOutOfTheSnapshot(): void {
  expect.hasAssertions()
  /*
   * The section lives inside the snapshot, not on it. Reading the snapshot as
   * if it were the section is invisible in the UI — the form just shows its own
   * defaults — so it is pinned here rather than left to a rendered assertion.
   */
  const store = createSettingsStore(
    fakeScope({ section: { ...defaultSettings, model: HOST_MODEL } }).scope,
  )
  expect(store.getState().persisted.model).toBe(HOST_MODEL)
  expect(store.getState().draft.model).toBe(HOST_MODEL)
}

function testEditsMarkAndClearDirty(): void {
  expect.hasAssertions()
  const store = createSettingsStore(fakeScope({ section: defaultSettings }).scope)
  store.getState().setText('model', 'typed')
  expect(store.getState().dirty).toBe(true)

  store.getState().setText('model', defaultSettings.model)
  expect(store.getState().dirty).toBe(false)

  store.getState().setEnabled(false)
  expect(store.getState().draft.enabled).toBe(false)
}

function testAnEditNormalizationErasesIsNotDirty(): void {
  expect.hasAssertions()
  const store = createSettingsStore(fakeScope({ section: defaultSettings }).scope)
  /*
   * Typing text into a numeric field that normalization would discard must not
   * offer the user a save that could not change anything.
   */
  store.getState().setCount('ledgerLimit', 'many')
  expect(store.getState().dirty).toBe(false)
}

async function testSavePersistsTheNormalizedDraft(): Promise<void> {
  expect.hasAssertions()
  const fake = fakeScope({ section: defaultSettings })
  const store = createSettingsStore(fake.scope)
  store.getState().setText('model', TYPED_MODEL)
  await store.getState().save()

  /*
   * One root operation, not a value: the host namespace takes ordered path ops,
   * and the empty path is the section this form owns outright.
   */
  const ops: unknown = fake.mutate.mock.calls[FIRST_INDEX]?.[FIRST_INDEX]
  expect(fake.mutate).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL)
  expect(ops).toStrictEqual([
    { op: 'set', path: [], value: { ...defaultSettings, model: 'jev-typed' } },
  ])
  expect(store.getState().dirty).toBe(false)
}

async function testAnUnwritableNamespaceIsNeverWritten(): Promise<void> {
  expect.hasAssertions()
  const fake = fakeScope({ section: defaultSettings, writable: false })
  const store = createSettingsStore(fake.scope)
  store.getState().setText('model', 'typed')
  await store.getState().save()

  // Memory-mode and unavailable namespaces report this; a write cannot land.
  expect(fake.mutate).not.toHaveBeenCalled()
  expect(store.getState().writable).toBe(false)
}

async function testFailedSaveKeepsTheDraftAndRecordsTheReason(): Promise<void> {
  expect.hasAssertions()
  const fake = fakeScope({
    section: defaultSettings,
    reject: new Error('host refused'),
  })
  const store = createSettingsStore(fake.scope)
  store.getState().setText('model', 'typed')
  await store.getState().save()

  /*
   * This is the regression that matters: a failed write must not cost the user
   * the text they typed, and must not pretend the save succeeded.
   */
  expect(store.getState().draft.model).toBe('typed')
  expect(store.getState().dirty).toBe(true)
  expect(store.getState().saving).toBe(false)
  expect(store.getState().error).toBe('host refused')
}

function testResetRestoresThePersistedSnapshot(): void {
  expect.hasAssertions()
  const store = createSettingsStore(fakeScope({ section: defaultSettings }).scope)
  store.getState().setText('model', 'typed')
  store.getState().reset()
  expect(store.getState().draft.model).toBe(defaultSettings.model)
  expect(store.getState().dirty).toBe(false)
  expect(store.getState().error).toBeUndefined()
}

function testConnectMirrorsAndReleasesTheHost(): void {
  expect.hasAssertions()
  const fake = fakeScope({ section: defaultSettings })
  const store = createSettingsStore(fake.scope)
  const disconnect = connectSettingsScope(store, fake.scope)

  /* A host change is normalized on the way in, like every other boundary value. */
  fake.setSnapshot({ ...defaultSettings, ledgerLimit: 'many' })
  fake.notify()
  expect(store.getState().persisted.ledgerLimit).toBe(defaultSettings.ledgerLimit)

  fake.setSnapshot({ ...defaultSettings, model: HOST_MODEL })
  fake.notify()
  expect(store.getState().persisted.model).toBe(HOST_MODEL)

  disconnect()
  expect(fake.unsubscribe).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL)

  fake.setSnapshot({ ...defaultSettings, model: 'after disconnect' })
  fake.notify()
  expect(store.getState().persisted.model).toBe(HOST_MODEL)
}

describe('settings store', () => {
  it('follows the host when the draft is clean', { timeout: TEST_TIMEOUT }, testCleanStateFollowsTheHost)

  it('keeps an edited draft when the host changes', { timeout: TEST_TIMEOUT }, testEditedDraftSurvivesAnExternalChange)

  it('does not protect a draft that matches its origin', { timeout: TEST_TIMEOUT }, testDraftEqualToTheOriginIsNotProtected)

  it('starts from the normalized host snapshot', { timeout: TEST_TIMEOUT }, testStartsFromTheNormalizedSnapshot)

  it('reads the section out of the host snapshot', { timeout: TEST_TIMEOUT }, testReadsTheSectionOutOfTheSnapshot)

  it('marks and clears dirty as fields are edited', { timeout: TEST_TIMEOUT }, testEditsMarkAndClearDirty)

  it('ignores an edit that normalization would erase', { timeout: TEST_TIMEOUT }, testAnEditNormalizationErasesIsNotDirty)

  it('persists the normalized draft on save', { timeout: TEST_TIMEOUT }, testSavePersistsTheNormalizedDraft)

  it('never writes an unwritable namespace', { timeout: TEST_TIMEOUT }, testAnUnwritableNamespaceIsNeverWritten)

  it('keeps the draft and records the reason when a save fails', { timeout: TEST_TIMEOUT }, testFailedSaveKeepsTheDraftAndRecordsTheReason)

  it('restores the persisted snapshot on reset', { timeout: TEST_TIMEOUT }, testResetRestoresThePersistedSnapshot)

  it('mirrors the host and stops on unsubscribe', { timeout: TEST_TIMEOUT }, testConnectMirrorsAndReleasesTheHost)
})
