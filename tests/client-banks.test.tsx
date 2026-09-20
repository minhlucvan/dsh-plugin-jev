/**
 * Behavior-tab tests: the adoption switch and the question-bank group.
 *
 * The bank group is the one part of the form that is not a fixed field: its
 * checkboxes come from the catalog the usage store reads, and an empty stored
 * selection means *every* bank rather than none. These cases pin that reading,
 * the round trip back to the host, and the notice shown when the catalog could
 * not be read at all.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type {
  CatalogBank,
  CatalogReport,
  HealthReport,
  UsageApi,
  UsageReport,
} from '#src/client/api'
import type {
  SettingsScope,
  SettingsScopeSnapshot,
} from '#src/client/contracts'
import type { CredentialApi, CredentialInfo } from '#src/client/credentials'
import type { ClientSettings } from '#src/client/settings'
import { defaultSettings } from '#src/client/settings'
import { SettingsPage } from '#src/client/settings-page'

const TEST_TIMEOUT = 5000
const EXPECTED_SINGLE_CALL = 1
const FIRST_INDEX = 0
const NONE = 0
const PERSISTED_MODEL = 'from the host'
const REASONING_ID = 'reasoning'
const SAFETY_ID = 'safety'

/** A bound translator returning the key, so assertions read the key itself. */
const translate = (key: string): string => key

/** The catalog the canned api reports. */
const CATALOG: CatalogBank[] = [
  {
    id: REASONING_ID,
    title: 'Reasoning shape',
    description: 'Classify how a reasoning step is shaped.',
    questions: {},
  },
  {
    id: SAFETY_ID,
    title: 'Safety review',
    description: 'Screen a change before it is acted on.',
    questions: {},
  },
]

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

/** The health the canned api reports. */
const SAMPLE_HEALTH: HealthReport = { ok: true, enabled: true, model: PERSISTED_MODEL }

/** The report the canned api returns; these cases never read its figures. */
const SAMPLE_REPORT: UsageReport = {
  totals: { calls: NONE, inputTokens: NONE, outputTokens: NONE, questions: NONE, stateChars: NONE },
  byTool: {},
  recent: [],
}

/**
 * Build a usage api whose catalog can be made to fail.
 *
 * Each read awaits a real promise because this repository enforces both
 * `promise-function-async` and `require-await`.
 *
 * @param failure - When present, the catalog read rejects with this reason.
 * @returns The three reads the page performs.
 */
function fakeApi(failure?: Error): UsageApi {
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
      if (failure !== undefined) {
        throw new Error(failure.message)
      }
      const catalog = await Promise.resolve({ banks: CATALOG })
      return catalog
    },
  }
}

/** A scope that reports one snapshot and records its writes. */
interface FakeScope {
  /** The scope handed to the page. */ scope: SettingsScope<ClientSettings>
  /** The recorded writes. */ mutate: ReturnType<typeof vi.fn>
}

/**
 * Build a scope that reports a snapshot and records mutations.
 *
 * @param settings - The snapshot the host reports.
 * @returns The fake scope plus its recorder.
 */
function fakeScope(settings: ClientSettings): FakeScope {
  const mutate = vi.fn<(ops: readonly unknown[]) => Promise<void>>(async (): Promise<void> => {
    await Promise.resolve()
  })
  return {
    scope: {
      getSnapshot: (): SettingsScopeSnapshot<ClientSettings> => ({
        status: 'ready',
        value: settings,
        revision: undefined,
        writable: true,
      }),
      subscribe: (): (() => void) => (): void => {
        // These cases never change settings behind the page, so it never notifies.
      },
      mutate,
    },
    mutate,
  }
}

/**
 * Render the page and open the behavior tab, where these fields live.
 *
 * @param scope - The persisted scope to hand the page.
 * @param api - The usage reads to hand the page.
 * @returns The testing-library render result.
 */
function renderPage(
  scope: SettingsScope<ClientSettings>,
  api: UsageApi,
): ReturnType<typeof render> {
  const view = render(
    <SettingsPage
      scope={scope}
      translate={translate}
      api={api}
      credentials={NO_CREDENTIALS}
    />,
  )
  fireEvent.click(screen.getByRole('tab', { name: 'tabBehavior' }))
  return view
}

/**
 * Read a labelled input.
 *
 * @param label - The label the control is rendered under.
 * @returns The input element.
 */
function input(label: string): HTMLInputElement {
  return screen.getByLabelText(label)
}

/**
 * Whether a value is an indexable object.
 *
 * @param value - Candidate value.
 * @returns True for a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read the section the page last wrote to the host.
 *
 * The scope takes ordered path operations, so the section is the value of the
 * operation the form sends — one root set, not a bare object.
 *
 * @param mutate - The scope's write recorder.
 * @returns The written section, once there is one.
 */
function writtenSettings(mutate: ReturnType<typeof vi.fn>): unknown {
  const ops: unknown = mutate.mock.calls[FIRST_INDEX]?.[FIRST_INDEX]
  if (!Array.isArray(ops)) {
    return undefined
  }
  let written: unknown = undefined
  for (const op of ops) {
    if (isRecord(op) && op.op === 'set') {
      written = op.value
    }
  }
  return written
}

/**
 * Persist the current draft.
 *
 * @param mutate - The scope's write recorder.
 * @returns A promise that settles once the write was attempted.
 */
async function save(mutate: ReturnType<typeof vi.fn>): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'save' }))
  await waitFor(() => {
    expect(mutate).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL)
  })
}

async function testEveryBankIsCheckedByDefault(): Promise<void> {
  expect.hasAssertions()
  const fake = fakeScope(defaultSettings)
  renderPage(fake.scope, fakeApi())

  await waitFor(() => {
    expect(input('Reasoning shape').checked).toBe(true)
  })
  expect(input('Safety review').checked).toBe(true)
  /* The variable name is gone from the form: the key is typed, not named. */
  expect(screen.queryByLabelText('apiKeyEnvLabel')).toBeNull()
}

async function testUncheckingOneBankStoresTheSubset(): Promise<void> {
  expect.hasAssertions()
  const fake = fakeScope(defaultSettings)
  renderPage(fake.scope, fakeApi())
  await waitFor(() => {
    expect(input('Reasoning shape').checked).toBe(true)
  })

  /* Turning one off is what stores an explicit selection. */
  fireEvent.click(input('Reasoning shape'))
  expect(input('Reasoning shape').checked).toBe(false)
  expect(input('Safety review').checked).toBe(true)

  await save(fake.mutate)
  expect(writtenSettings(fake.mutate)).toMatchObject({ banks: [SAFETY_ID] })
}

async function testRecheckingEveryBankRestoresTheEmptySelection(): Promise<void> {
  expect.hasAssertions()
  const fake = fakeScope({ ...defaultSettings, banks: [SAFETY_ID] })
  renderPage(fake.scope, fakeApi())
  await waitFor(() => {
    expect(input('Safety review').checked).toBe(true)
  })
  expect(input('Reasoning shape').checked).toBe(false)

  /*
   * Selecting the last missing bank is the same setting as selecting none, so
   * the stored value goes back to the empty selection rather than an explicit
   * list that would age badly when a new bank ships.
   */
  fireEvent.click(input('Reasoning shape'))
  expect(input('Reasoning shape').checked).toBe(true)
  expect(input('Safety review').checked).toBe(true)

  await save(fake.mutate)
  expect(writtenSettings(fake.mutate)).toMatchObject({ banks: [] })
}

async function testTurningOffAdoptionGuidanceIsSaved(): Promise<void> {
  expect.hasAssertions()
  const fake = fakeScope(defaultSettings)
  renderPage(fake.scope, fakeApi())

  fireEvent.click(await screen.findByLabelText('adoptionPromptLabel'))
  expect(input('adoptionPromptLabel').checked).toBe(false)

  await save(fake.mutate)
  expect(writtenSettings(fake.mutate)).toMatchObject({ adoptionPrompt: false })
}

async function testReportsACatalogThatCouldNotBeRead(): Promise<void> {
  expect.hasAssertions()
  renderPage(fakeScope(defaultSettings).scope, fakeApi(new Error('catalog offline')))

  /*
   * An unread catalog must not look like a build that ships no banks: it is
   * reported, and no checkbox is invented for a bank nobody knows about.
   */
  const notice = await screen.findByRole('alert')
  expect(notice.textContent).toContain('banksUnavailable')
  expect(screen.queryByLabelText('Reasoning shape')).toBeNull()
}

describe('behavior tab', () => {
  it('checks every bank when the selection is empty', { timeout: TEST_TIMEOUT }, testEveryBankIsCheckedByDefault)

  it('stores the subset when one bank is unchecked', { timeout: TEST_TIMEOUT }, testUncheckingOneBankStoresTheSubset)

  it('restores the empty selection when every bank is checked', { timeout: TEST_TIMEOUT }, testRecheckingEveryBankRestoresTheEmptySelection)

  it('saves the adoption switch', { timeout: TEST_TIMEOUT }, testTurningOffAdoptionGuidanceIsSaved)

  it('reports a catalog that could not be read', { timeout: TEST_TIMEOUT }, testReportsACatalogThatCouldNotBeRead)
})
