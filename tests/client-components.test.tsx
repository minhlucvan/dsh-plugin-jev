/**
 * Client component and hook tests.
 *
 * These render a real React tree, because the layering being verified only
 * exists at render time: the providers creating one store per mount, the hooks
 * selecting from them through context, and the components reading state with no
 * props threaded through them. A store unit test cannot show that a component
 * outside the provider fails loudly, or that two trees do not share state.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { CatalogReport, HealthReport, UsageApi, UsageReport } from '#src/client/api'
import { SettingsStoreProvider, useSettingsStore } from '#src/client/context'
import type { SettingsScope } from '#src/client/contracts'
import type { CredentialApi, CredentialInfo } from '#src/client/credentials'
import { useSettingsDraft } from '#src/client/hooks'
import type { ClientSettings } from '#src/client/settings'
import { defaultSettings } from '#src/client/settings'
import { SettingsPage } from '#src/client/settings-page'

const TEST_TIMEOUT = 5000
const EXPECTED_SINGLE_CALL = 1
const FIRST_INDEX = 0
const SECOND_INDEX = 1
const TYPED_MODEL = 'jev-typed'
const PERSISTED_MODEL = 'from the host'
const LEDGER_ABOVE_MAX = '999999'

/** A bound translator returning the key, so assertions read the key itself. */
const translate = (key: string): string => key

/** The report the canned api returns; these cases never read its figures. */
const SAMPLE_REPORT: UsageReport = {
  totals: { calls: 0, inputTokens: 0, outputTokens: 0, questions: 0, stateChars: 0 },
  byTool: {},
  recent: [],
}

/** The health the canned api reports. */
const SAMPLE_HEALTH: HealthReport = { ok: true, enabled: true, model: PERSISTED_MODEL }

/** A credential remote that reports no stored key and never writes. */
const NO_CREDENTIALS: CredentialApi = {
  describe: async (): Promise<CredentialInfo> => {
    const info: CredentialInfo = {
      configured: false,
      source: undefined,
      writable: true,
    }
    const answer = await Promise.resolve(info)
    return answer
  },
  set: async (): Promise<void> => {
    await Promise.resolve()
  },
  unset: async (): Promise<void> => {
    await Promise.resolve()
  },
}

/** A scope that records mutations instead of persisting them. */
interface FakeScope {
  /** The scope handed to the page. */ scope: SettingsScope<ClientSettings>
  /** The recorded writes. */ mutate: ReturnType<typeof vi.fn>
  /** Replace the snapshot the host reports. */ setSnapshot: (value: ClientSettings) => void
  /** Notify subscribers, as the host does after a write. */ notify: () => void
}

/**
 * Build a settings snapshot for a fake host.
 *
 * @param model - Model id the host reports.
 * @returns A complete snapshot.
 */
function snapshot(model: string): ClientSettings {
  return { ...defaultSettings, model }
}

/**
 * Build a scope that records mutations instead of persisting them.
 *
 * @returns The fake scope plus its recorders.
 */
function fakeScope(): FakeScope {
  let snapshotValue: ClientSettings = snapshot(PERSISTED_MODEL)
  const listeners = new Set<() => void>()
  const mutate = vi.fn<(value: ClientSettings) => Promise<void>>(async (): Promise<void> => {
    await Promise.resolve()
  })

  return {
    scope: {
      getSnapshot: (): ClientSettings => snapshotValue,
      subscribe: (listener: () => void): (() => void) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
      mutate,
    },
    mutate,
    setSnapshot: (value: ClientSettings): void => {
      snapshotValue = value
    },
    notify: (): void => {
      for (const listener of listeners) {
        listener()
      }
    },
  }
}

/** A canned api plus its read counter. */
interface FakeApi {
  /** The reads handed to the page. */ api: UsageApi
  /** How many usage reads were attempted. */ loads: () => number
}

/**
 * Build a canned usage api.
 *
 * @param failure - When present, every usage read rejects with this reason.
 * @returns The api plus its read counter.
 */
function fakeApi(failure?: Error): FakeApi {
  let loads = 0
  const api: UsageApi = {
    health: async (): Promise<HealthReport> => {
      const health = await Promise.resolve(SAMPLE_HEALTH)
      return health
    },
    usage: async (): Promise<UsageReport> => {
      loads += EXPECTED_SINGLE_CALL
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
  return { api, loads: (): number => loads }
}

/**
 * Render the real slot-facing page with fake host services.
 *
 * @param scope - The persisted scope to hand the page.
 * @param api - The routes to hand the page.
 * @returns The testing-library render result.
 */
function renderPage(
  scope: SettingsScope<ClientSettings>,
  api: UsageApi,
): ReturnType<typeof render> {
  return render(
    <SettingsPage
      scope={scope}
      translate={translate}
      api={api}
      credentials={NO_CREDENTIALS}
    />,
  )
}

/**
 * Read a labelled input.
 *
 * @param label - The label key the field is rendered under.
 * @returns The input element.
 */
function input(label: string): HTMLInputElement {
  return screen.getByLabelText(label)
}

/** A probe that renders the store's own view of the persisted model. */
function DraftProbe(): ReactElement {
  const { persisted } = useSettingsDraft()
  return <output data-testid='probe'>{persisted.model}</output>
}

/** A component that reads the store with no provider above it. */
function UnscopedConsumer(): ReactElement {
  const store = useSettingsStore()
  return <output>{store.getState().persisted.model}</output>
}

function testRendersThePersistedSnapshot(): void {
  expect.hasAssertions()
  renderPage(fakeScope().scope, fakeApi().api)
  expect(input('modelLabel').value).toBe(PERSISTED_MODEL)
  expect(input('ledgerLimitLabel').value).toBe(String(defaultSettings.ledgerLimit))
  expect(input('enabledLabel').checked).toBe(true)
}

function testTypingMarksTheFormDirty(): void {
  expect.hasAssertions()
  renderPage(fakeScope().scope, fakeApi().api)

  // A clean form has nothing to commit, so the control is disabled.
  expect(screen.getByRole('button', { name: 'save' }).hasAttribute('disabled')).toBe(true)
  fireEvent.change(input('modelLabel'), { target: { value: TYPED_MODEL } })
  expect(input('modelLabel').value).toBe(TYPED_MODEL)
  expect(screen.getByRole('button', { name: 'save' }).hasAttribute('disabled')).toBe(false)
}

function testResetRestoresThePersistedValue(): void {
  expect.hasAssertions()
  renderPage(fakeScope().scope, fakeApi().api)
  fireEvent.change(input('modelLabel'), { target: { value: TYPED_MODEL } })
  fireEvent.click(screen.getByRole('button', { name: 'reset' }))
  expect(input('modelLabel').value).toBe(PERSISTED_MODEL)
}

async function testSavePersistsTheNormalizedDraft(): Promise<void> {
  expect.hasAssertions()
  const fake = fakeScope()
  renderPage(fake.scope, fakeApi().api)

  /* A ledger above the host's ceiling is clamped on the way out. */
  fireEvent.change(input('modelLabel'), { target: { value: '  jev  ' } })
  fireEvent.change(input('ledgerLimitLabel'), { target: { value: LEDGER_ABOVE_MAX } })
  fireEvent.click(screen.getByRole('button', { name: 'save' }))

  await waitFor(() => {
    expect(fake.mutate).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL)
  })
  const written: unknown = fake.mutate.mock.calls[FIRST_INDEX]?.[FIRST_INDEX]
  expect(written).toMatchObject({ model: 'jev', ledgerLimit: 100_000 })
}

async function testFailedSaveKeepsTheDraftAndReports(): Promise<void> {
  expect.hasAssertions()
  const fake = fakeScope()
  fake.mutate.mockRejectedValueOnce(new Error('host refused'))
  renderPage(fake.scope, fakeApi().api)

  fireEvent.change(input('modelLabel'), { target: { value: TYPED_MODEL } })
  fireEvent.click(screen.getByRole('button', { name: 'save' }))

  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain('saveFailed')
  expect(alert.textContent).toContain('host refused')
  // The typed text is still there: a failed write must not cost the user input.
  expect(input('modelLabel').value).toBe(TYPED_MODEL)
}

function testCleanFormFollowsAHostChange(): void {
  expect.hasAssertions()
  const fake = fakeScope()
  renderPage(fake.scope, fakeApi().api)

  /*
   * A host change arrives outside React's event system, so its re-render is
   * scheduled rather than synchronous. `act` flushes it; without that the
   * assertion reads the DOM before React has committed.
   */
  act(() => {
    fake.setSnapshot(snapshot('changed on the host'))
    fake.notify()
  })
  expect(input('modelLabel').value).toBe('changed on the host')
  expect(input('ledgerLimitLabel').value).toBe(String(defaultSettings.ledgerLimit))
}

function testTwoProvidersDoNotShareState(): void {
  expect.hasAssertions()
  const first = fakeScope()
  const second = fakeScope()
  second.setSnapshot(snapshot('second'))

  render(
    <SettingsStoreProvider scope={first.scope}>
      <DraftProbe />
    </SettingsStoreProvider>,
  )
  render(
    <SettingsStoreProvider scope={second.scope}>
      <DraftProbe />
    </SettingsStoreProvider>,
  )

  const probes = screen.getAllByTestId('probe')
  expect(probes[FIRST_INDEX]?.textContent).toBe(PERSISTED_MODEL)
  expect(probes[SECOND_INDEX]?.textContent).toBe('second')
}

function testHookOutsideProviderFailsLoudly(): void {
  expect.hasAssertions()
  /*
   * The failure must name the cause. Rendering without the provider and getting
   * `undefined` reads as a random render crash; this is the wiring mistake the
   * context exists to catch, so it says so.
   */
  expect(() => render(<UnscopedConsumer />)).toThrow(/SettingsStoreProvider/u)
}

describe('settings page', () => {
  it('renders the persisted snapshot', { timeout: TEST_TIMEOUT }, testRendersThePersistedSnapshot)

  it('marks the form dirty on typing', { timeout: TEST_TIMEOUT }, testTypingMarksTheFormDirty)

  it('restores the persisted value on reset', { timeout: TEST_TIMEOUT }, testResetRestoresThePersistedValue)

  it('persists the normalized draft on save', { timeout: TEST_TIMEOUT }, testSavePersistsTheNormalizedDraft)

  it('keeps the draft and reports the reason when a save fails', { timeout: TEST_TIMEOUT }, testFailedSaveKeepsTheDraftAndReports)

  it('follows a host change while clean', { timeout: TEST_TIMEOUT }, testCleanFormFollowsAHostChange)

  it('scopes one store per provider', { timeout: TEST_TIMEOUT }, testTwoProvidersDoNotShareState)

  it('fails loudly when a hook is used outside the provider', { timeout: TEST_TIMEOUT }, testHookOutsideProviderFailsLoudly)
})
