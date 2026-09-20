/**
 * Store tests.
 *
 * These run in plain Node with no DOM and no React: both stores are deliberately
 * built on `zustand/vanilla`, so their rules are verifiable without a renderer.
 * The settings rules worth pinning are the ones a form gets subtly wrong —
 * losing a user's text when the host changes underneath them, or clearing a
 * draft after a failed save. The usage rules are the ones a dashboard gets
 * wrong: blanking its figures, or throwing, when one read fails.
 */
import { describe, expect, it, vi } from 'vitest'

import type { CatalogReport, HealthReport, UsageApi, UsageReport } from '#src/client/api'
import type { SettingsScope } from '#src/client/contracts'
import type { ClientSettings } from '#src/client/settings'
import { defaultSettings, toDraft } from '#src/client/settings'
import {
  connectSettingsScope,
  createSettingsStore,
  createUsageStore,
  externalUpdate,
} from '#src/client/store'
import type { SettingsState } from '#src/client/store'

const TEST_TIMEOUT = 5000
const EXPECTED_SINGLE_CALL = 1
const ONE_READ = 1
const FIRST_INDEX = 0
const SAMPLED_CALLS = 3
const TYPED_MODEL = '  jev-typed  '
const HOST_MODEL = 'changed on the host'

/** The health a canned api reports. */
const SAMPLE_HEALTH: HealthReport = { ok: true, enabled: true, model: 'jev-test' }

/** The report a canned api returns. */
const SAMPLE_REPORT: UsageReport = {
  totals: { calls: SAMPLED_CALLS, inputTokens: 900, outputTokens: 40, questions: SAMPLED_CALLS, stateChars: 300 },
  byTool: {},
  recent: [],
}

/** A scope that records mutations instead of persisting them. */
interface FakeScope {
  /** The scope handed to the store. */ scope: SettingsScope<ClientSettings>
  /** The recorded writes. */ mutate: ReturnType<typeof vi.fn>
  /** The recorded unsubscriptions. */ unsubscribe: ReturnType<typeof vi.fn>
  /** Replace the snapshot the host reports. */ setSnapshot: (value: unknown) => void
  /** Notify subscribers, as the host does after a write. */ notify: () => void
}

/**
 * Build a scope that records mutations instead of persisting them.
 *
 * @param options - Initial snapshot and an optional rejection that simulates a
 *   failed write.
 * @returns The fake scope plus its recorders.
 */
function fakeScope(options: { snapshot?: unknown; reject?: Error } = {}): FakeScope {
  let snapshot: unknown = options.snapshot ?? defaultSettings
  const listeners = new Set<() => void>()
  const unsubscribe = vi.fn<() => void>()
  const mutate = vi.fn<(value: ClientSettings) => Promise<void>>(async () => {
    if (options.reject !== undefined) {
      await Promise.reject(options.reject)
    }
  })

  return {
    scope: {
      // oxlint-disable-next-line no-unsafe-type-assertion -- See fakeScope above.
      getSnapshot: (): ClientSettings => snapshot as ClientSettings,
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
      snapshot = value
    },
    notify: (): void => {
      for (const listener of listeners) {
        listener()
      }
    },
  }
}

/** A canned api whose usage read can be made to fail on demand. */
interface FakeApi {
  /** The reads handed to the store. */ api: UsageApi
  /** How many usage reads were attempted. */ loads: () => number
  /** Make every later usage read reject with this reason. */ fail: (error: Error) => void
}

/**
 * Build a canned usage api.
 *
 * Each read is an async function with a real await because this repository
 * enforces both `promise-function-async` and `require-await`.
 *
 * @returns The api plus its recorder and failure switch.
 */
function fakeApi(): FakeApi {
  let loads = 0
  let failure: Error | undefined = undefined
  const api: UsageApi = {
    health: async (): Promise<HealthReport> => {
      const health = await Promise.resolve(SAMPLE_HEALTH)
      return health
    },
    usage: async (): Promise<UsageReport> => {
      loads += ONE_READ
      if (failure !== undefined) {
        throw new Error(failure.message)
      }
      const report = await Promise.resolve(SAMPLE_REPORT)
      return report
    },
    catalog: async (): Promise<CatalogReport> => {
      const catalog = await Promise.resolve({ banks: [] })
      return catalog
    },
  }
  return {
    api,
    loads: (): number => loads,
    fail: (error: Error): void => {
      failure = error
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
  const padded = createSettingsStore(fakeScope({ snapshot: { ...defaultSettings, model: '  jev  ' } }).scope)
  expect(padded.getState().persisted.model).toBe('jev')
  expect(padded.getState().dirty).toBe(false)

  const malformed = createSettingsStore(fakeScope({ snapshot: 42 }).scope)
  expect(malformed.getState().persisted).toStrictEqual(defaultSettings)
}

function testEditsMarkAndClearDirty(): void {
  expect.hasAssertions()
  const store = createSettingsStore(fakeScope({ snapshot: defaultSettings }).scope)
  store.getState().setText('model', 'typed')
  expect(store.getState().dirty).toBe(true)

  store.getState().setText('model', defaultSettings.model)
  expect(store.getState().dirty).toBe(false)

  store.getState().setEnabled(false)
  expect(store.getState().draft.enabled).toBe(false)
}

function testAnEditNormalizationErasesIsNotDirty(): void {
  expect.hasAssertions()
  const store = createSettingsStore(fakeScope({ snapshot: defaultSettings }).scope)
  /*
   * Typing text into a numeric field that normalization would discard must not
   * offer the user a save that could not change anything.
   */
  store.getState().setCount('ledgerLimit', 'many')
  expect(store.getState().dirty).toBe(false)
}

async function testSavePersistsTheNormalizedDraft(): Promise<void> {
  expect.hasAssertions()
  const fake = fakeScope({ snapshot: defaultSettings })
  const store = createSettingsStore(fake.scope)
  store.getState().setText('model', TYPED_MODEL)
  await store.getState().save()

  const written: unknown = fake.mutate.mock.calls[FIRST_INDEX]?.[FIRST_INDEX]
  expect(fake.mutate).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL)
  expect(written).toMatchObject({ model: 'jev-typed' })
  expect(store.getState().dirty).toBe(false)
  expect(store.getState().saving).toBe(false)
}

async function testFailedSaveKeepsTheDraftAndRecordsTheReason(): Promise<void> {
  expect.hasAssertions()
  const fake = fakeScope({
    snapshot: defaultSettings,
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
  const store = createSettingsStore(fakeScope({ snapshot: defaultSettings }).scope)
  store.getState().setText('model', 'typed')
  store.getState().reset()
  expect(store.getState().draft.model).toBe(defaultSettings.model)
  expect(store.getState().dirty).toBe(false)
  expect(store.getState().error).toBeUndefined()
}

function testConnectMirrorsAndReleasesTheHost(): void {
  expect.hasAssertions()
  const fake = fakeScope({ snapshot: defaultSettings })
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

async function testUsageLoadPublishesTheReport(): Promise<void> {
  expect.hasAssertions()
  const fake = fakeApi()
  const store = createUsageStore(fake.api)
  expect(store.getState().status).toBe('loading')

  await store.getState().load()

  expect(store.getState().status).toBe('ready')
  expect(store.getState().report?.totals.calls).toBe(SAMPLED_CALLS)
  expect(fake.loads()).toBe(EXPECTED_SINGLE_CALL)
}

async function testUsageFailureKeepsTheLastRead(): Promise<void> {
  expect.hasAssertions()
  const fake = fakeApi()
  const store = createUsageStore(fake.api)
  await store.getState().load()

  fake.fail(new Error('ledger offline'))
  await store.getState().load()

  expect(store.getState().status).toBe('error')
  expect(store.getState().error).toBe('ledger offline')
  /* The last good figures stay visible beside the reason. */
  expect(store.getState().report?.totals.calls).toBe(SAMPLED_CALLS)
}

describe('settings store', () => {
  it('follows the host when the draft is clean', { timeout: TEST_TIMEOUT }, testCleanStateFollowsTheHost)

  it('keeps an edited draft when the host changes', { timeout: TEST_TIMEOUT }, testEditedDraftSurvivesAnExternalChange)

  it('does not protect a draft that matches its origin', { timeout: TEST_TIMEOUT }, testDraftEqualToTheOriginIsNotProtected)

  it('starts from the normalized host snapshot', { timeout: TEST_TIMEOUT }, testStartsFromTheNormalizedSnapshot)

  it('marks and clears dirty as fields are edited', { timeout: TEST_TIMEOUT }, testEditsMarkAndClearDirty)

  it('ignores an edit that normalization would erase', { timeout: TEST_TIMEOUT }, testAnEditNormalizationErasesIsNotDirty)

  it('persists the normalized draft on save', { timeout: TEST_TIMEOUT }, testSavePersistsTheNormalizedDraft)

  it('keeps the draft and records the reason when a save fails', { timeout: TEST_TIMEOUT }, testFailedSaveKeepsTheDraftAndRecordsTheReason)

  it('restores the persisted snapshot on reset', { timeout: TEST_TIMEOUT }, testResetRestoresThePersistedSnapshot)

  it('mirrors the host and stops on unsubscribe', { timeout: TEST_TIMEOUT }, testConnectMirrorsAndReleasesTheHost)
})

describe('usage store', () => {
  it('publishes the report after a successful read', { timeout: TEST_TIMEOUT }, testUsageLoadPublishesTheReport)

  it('keeps the last read and records the reason on failure', { timeout: TEST_TIMEOUT }, testUsageFailureKeepsTheLastRead)
})
