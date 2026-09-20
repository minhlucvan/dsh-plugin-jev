/**
 * Credential field component tests.
 *
 * These render the real settings page, because the field's behaviour only
 * exists at render time: the reference the stored settings resolve to, the store
 * that orders describe responses, and the disabled state a shadowed reference
 * produces. What a user must never see is pinned here too — no read path
 * renders a stored value, and a failed call shows the provider's own reason
 * instead of leaving a spinner behind.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { CatalogReport, HealthReport, UsageApi, UsageReport } from '#src/client/api'
import type {
  SettingsScope,
  SettingsScopeSnapshot,
} from '#src/client/contracts'
import type { CredentialApi, CredentialInfo } from '#src/client/credentials'
import type { ClientSettings } from '#src/client/settings'
import { defaultSettings } from '#src/client/settings'
import { SettingsPage } from '#src/client/settings-page'

const TEST_TIMEOUT = 5000
const REFERENCE = defaultSettings.apiKeyEnv
const OTHER_REFERENCE = 'JEV_BROWSER_KEY'
const TYPED_VALUE = 'typed-secret'
const PROVIDER_MESSAGE = 'the provider refused the write'
const FILE_SOURCE = 'file'

/** A bound translator returning the key, so assertions read the key itself. */
const translate = (key: string): string => key

/** A reference the provider holds a writable value for. */
const CONFIGURED: CredentialInfo = {
  configured: true,
  source: FILE_SOURCE,
  writable: true,
}

/** A reference an inherited variable shadows, so it cannot be written here. */
const READ_ONLY: CredentialInfo = {
  configured: true,
  source: 'env',
  writable: false,
}

/** The health the canned usage api reports. */
const SAMPLE_HEALTH: HealthReport = { ok: true, enabled: true, model: 'jev-test' }

/** The report the canned usage api returns. */
const SAMPLE_REPORT: UsageReport = {
  totals: { calls: 0, inputTokens: 0, outputTokens: 0, questions: 0, stateChars: 0 },
  byTool: {},
  recent: [],
}

/** A credential api whose answers and failures a test can steer. */
interface FakeCredentials {
  /** The reads and writes handed to the page. */
  api: CredentialApi
  /** Values written, as `ref=value` pairs. */
  writes: string[]
  /** References passed to `unset`. */
  clearances: string[]
  /** References describe was called with, in order. */
  described: string[]
  /** Replace the view every later describe answers with. */
  answer: (info: CredentialInfo) => void
  /** Make every later write reject with this reason. */
  rejectSave: (error: Error) => void
}

/**
 * Build a credential api that answers immediately.
 *
 * Each call awaits a real promise because this repository enforces both
 * `promise-function-async` and `require-await`.
 *
 * @returns The api plus its recorders and switches.
 */
function fakeCredentials(): FakeCredentials {
  const writes: string[] = []
  const clearances: string[] = []
  const described: string[] = []
  let info: CredentialInfo = {
    configured: false,
    source: undefined,
    writable: true,
  }
  let failure: Error | undefined = undefined
  const api: CredentialApi = {
    describe: async (ref: string): Promise<CredentialInfo> => {
      described.push(ref)
      const answer = await Promise.resolve(info)
      return answer
    },
    set: async (ref: string, value: string): Promise<void> => {
      writes.push(`${ref}=${value}`)
      if (failure !== undefined) {
        throw new Error(failure.message)
      }
      await Promise.resolve()
    },
    unset: async (ref: string): Promise<void> => {
      clearances.push(ref)
      await Promise.resolve()
    },
  }
  return {
    api,
    writes,
    clearances,
    described,
    answer: (next: CredentialInfo): void => {
      info = next
    },
    rejectSave: (error: Error): void => {
      failure = error
    },
  }
}

/**
 * Build a usage api that answers immediately.
 *
 * @returns The three reads the page performs.
 */
function fakeUsageApi(): UsageApi {
  return {
    health: async (): Promise<HealthReport> => {
      const health = await Promise.resolve(SAMPLE_HEALTH)
      return health
    },
    usage: async (): Promise<UsageReport> => {
      const report = await Promise.resolve(SAMPLE_REPORT)
      return report
    },
    catalog: async (): Promise<CatalogReport> => {
      const catalog = await Promise.resolve({ banks: [] })
      return catalog
    },
  }
}

/**
 * Build a settings scope that reports the defaults.
 *
 * @param reference - The key reference the stored settings name.
 * @returns The scope handed to the page.
 */
function fakeScope(reference: string = REFERENCE): SettingsScope<ClientSettings> {
  return {
    getSnapshot: (): SettingsScopeSnapshot<ClientSettings> => ({
      status: 'ready',
      value: { ...defaultSettings, apiKeyEnv: reference },
      revision: undefined,
      writable: true,
    }),
    subscribe: (): (() => void) => (): void => {
      // The page never writes in these cases, so this fake never notifies.
    },
    mutate: async (): Promise<void> => {
      await Promise.resolve()
    },
  }
}

/**
 * Render the real slot-facing page with fake host services.
 *
 * @param credentials - The credential remote to hand the page.
 * @param reference - The key reference the stored settings name.
 * @returns The testing-library render result.
 */
function renderPage(
  credentials: CredentialApi,
  reference: string = REFERENCE,
): ReturnType<typeof render> {
  const view = render(
    <SettingsPage
      scope={fakeScope(reference)}
      translate={translate}
      api={fakeUsageApi()}
      credentials={credentials}
    />,
  )
  /* The key lives in its own tab, so open it before reading the field. */
  fireEvent.click(screen.getByRole('tab', { name: 'tabApiKey' }))
  return view
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

async function testShowsAConfiguredReference(): Promise<void> {
  expect.hasAssertions()
  const credentials = fakeCredentials()
  credentials.answer(CONFIGURED)
  renderPage(credentials.api)

  await expect(screen.findByText('credentialConfigured')).resolves.toBeDefined()
  expect(screen.getByText(new RegExp(FILE_SOURCE, 'u'))).toBeDefined()
  expect(input('credentialLabel').disabled).toBe(false)
}

async function testShowsAnUnconfiguredReference(): Promise<void> {
  expect.hasAssertions()
  renderPage(fakeCredentials().api)
  await expect(screen.findByText('credentialMissing')).resolves.toBeDefined()
}

async function testSavingAKeyClearsTheDraft(): Promise<void> {
  expect.hasAssertions()
  const credentials = fakeCredentials()
  credentials.answer(CONFIGURED)
  renderPage(credentials.api)
  await screen.findByText('credentialConfigured')

  fireEvent.change(input('credentialLabel'), { target: { value: TYPED_VALUE } })
  fireEvent.click(screen.getByRole('button', { name: 'credentialSave' }))
  await waitFor(() => {
    expect(input('credentialLabel').value).toBe('')
  })
  expect(credentials.writes).toStrictEqual([`${REFERENCE}=${TYPED_VALUE}`])
}

async function testAFailedSaveShowsTheReasonAndKeepsTheDraft(): Promise<void> {
  expect.hasAssertions()
  const credentials = fakeCredentials()
  credentials.answer(CONFIGURED)
  credentials.rejectSave(new Error(PROVIDER_MESSAGE))
  renderPage(credentials.api)
  await screen.findByText('credentialConfigured')

  fireEvent.change(input('credentialLabel'), { target: { value: TYPED_VALUE } })
  fireEvent.click(screen.getByRole('button', { name: 'credentialSave' }))

  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain('credentialFailed')
  expect(alert.textContent).toContain(PROVIDER_MESSAGE)
  // A rejected write must not cost the user the value they staged.
  expect(input('credentialLabel').value).toBe(TYPED_VALUE)
}

async function testAnInheritedReferenceCannotBeEdited(): Promise<void> {
  expect.hasAssertions()
  const credentials = fakeCredentials()
  credentials.answer(READ_ONLY)
  renderPage(credentials.api)
  await screen.findByText('credentialReadOnly')

  const save = screen.getByRole('button', { name: 'credentialSave' })
  const clear = screen.getByRole('button', { name: 'credentialClear' })
  expect(save.hasAttribute('disabled')).toBe(true)
  expect(clear.hasAttribute('disabled')).toBe(true)
  expect(input('credentialLabel').disabled).toBe(true)
  // The reference is named, because it is the variable the user has to unset.
  expect(screen.getByText(new RegExp(REFERENCE, 'u'))).toBeDefined()
}

async function testResolvesTheReferenceFromTheStoredSettings(): Promise<void> {
  expect.hasAssertions()
  const credentials = fakeCredentials()
  renderPage(credentials.api, OTHER_REFERENCE)
  await waitFor(() => {
    expect(credentials.described).toStrictEqual([OTHER_REFERENCE])
  })
}

async function testClearingRemovesTheStoredKey(): Promise<void> {
  expect.hasAssertions()
  const credentials = fakeCredentials()
  credentials.answer(CONFIGURED)
  renderPage(credentials.api)
  await screen.findByText('credentialConfigured')

  fireEvent.click(screen.getByRole('button', { name: 'credentialClear' }))
  await waitFor(() => {
    expect(credentials.clearances).toStrictEqual([REFERENCE])
  })
}

describe('credential field', () => {
  it('shows a configured reference and its source', { timeout: TEST_TIMEOUT }, testShowsAConfiguredReference)

  it('shows an unconfigured reference', { timeout: TEST_TIMEOUT }, testShowsAnUnconfiguredReference)

  it('clears the draft after a successful save', { timeout: TEST_TIMEOUT }, testSavingAKeyClearsTheDraft)

  it('shows the reason and keeps the draft when a save fails', { timeout: TEST_TIMEOUT }, testAFailedSaveShowsTheReasonAndKeepsTheDraft)

  it('disables both actions for an inherited reference', { timeout: TEST_TIMEOUT }, testAnInheritedReferenceCannotBeEdited)

  it('resolves the reference the stored settings name', { timeout: TEST_TIMEOUT }, testResolvesTheReferenceFromTheStoredSettings)

  it('removes the stored key when cleared', { timeout: TEST_TIMEOUT }, testClearingRemovesTheStoredKey)
})
