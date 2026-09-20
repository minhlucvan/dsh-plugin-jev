/**
 * Usage panel tests.
 *
 * The panel is a read-only view over the plugin's token ledger, so these cases
 * are about the three states a read can produce: the loading line before the
 * reads settle, the figures a successful read publishes, and the reason a
 * failed one shows without taking the rest of the page down with it.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { CatalogReport, HealthReport, UsageApi, UsageReport } from '#src/client/api'
import type { SettingsScope } from '#src/client/contracts'
import type { CredentialApi, CredentialInfo } from '#src/client/credentials'
import type { ClientSettings } from '#src/client/settings'
import { defaultSettings } from '#src/client/settings'
import { SettingsPage } from '#src/client/settings-page'

const TEST_TIMEOUT = 5000
const EXPECTED_SINGLE_CALL = 1
const EXPECTED_DOUBLE_CALLS = 2
const FIRST_INDEX = 0
const SAMPLED_CALLS = 3
const SAMPLE_INPUT_TOKENS = 1_200_000
const MEGA_FIGURE = '1.2000'
const TOOL_NAME = 'jev_classify'
const PERSISTED_MODEL = 'from the host'

/** A bound translator returning the key, so assertions read the key itself. */
const translate = (key: string): string => key

/** The totals the canned report carries. */
const SAMPLE_TOTALS = { calls: SAMPLED_CALLS, inputTokens: SAMPLE_INPUT_TOKENS, outputTokens: 40, questions: SAMPLED_CALLS, stateChars: 300 }

/** One recorded evaluation, as the canned report lists it. */
const SAMPLE_ENTRY = { at: 0, tool: TOOL_NAME, model: PERSISTED_MODEL, questions: 1, stateChars: 100, inputTokens: SAMPLE_INPUT_TOKENS, outputTokens: 40, durationMs: 250 }

/** The report the canned api returns. */
const SAMPLE_REPORT: UsageReport = {
  totals: SAMPLE_TOTALS,
  byTool: { [TOOL_NAME]: SAMPLE_TOTALS },
  recent: [SAMPLE_ENTRY],
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
 * Build a settings scope that reports the defaults.
 *
 * @returns The scope handed to the page.
 */
function fakeScope(): SettingsScope<ClientSettings> {
  return {
    getSnapshot: (): ClientSettings => ({ ...defaultSettings }),
    subscribe: (): (() => void) => (): void => {
      // This suite never writes settings, so the fake never notifies.
    },
    mutate: async (): Promise<void> => {
      await Promise.resolve()
    },
  }
}

/**
 * Render the real slot-facing page with a fake ledger.
 *
 * @param api - The usage reads to hand the page.
 * @returns The testing-library render result.
 */
function renderPage(api: UsageApi): ReturnType<typeof render> {
  return render(
    <SettingsPage
      scope={fakeScope()}
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

async function testPanelShowsTotalsToolsAndRecent(): Promise<void> {
  expect.hasAssertions()
  renderPage(fakeApi().api)

  /* The reads cannot have settled inside a synchronous render. */
  expect(screen.getByText('usageLoading')).toBeDefined()

  await screen.findByText(MEGA_FIGURE)
  expect(screen.getAllByText(MEGA_FIGURE)).toHaveLength(EXPECTED_SINGLE_CALL)
  expect(screen.getAllByText(TOOL_NAME).length).toBeGreaterThan(FIRST_INDEX)
}

async function testPanelRefreshReReadsTheLedger(): Promise<void> {
  expect.hasAssertions()
  const fake = fakeApi()
  renderPage(fake.api)
  await screen.findByText(MEGA_FIGURE)

  fireEvent.click(screen.getByRole('button', { name: 'usageRefresh' }))
  await waitFor(() => {
    expect(fake.loads()).toBe(EXPECTED_DOUBLE_CALLS)
  })
}

async function testPanelReportsAFailedReadWithoutThrowing(): Promise<void> {
  expect.hasAssertions()
  renderPage(fakeApi(new Error('ledger offline')).api)

  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain('usageFailed')
  expect(alert.textContent).toContain('ledger offline')
  // The page around the panel is untouched by the failure.
  expect(input('modelLabel').value).toBe(defaultSettings.model)
}

describe('usage panel', () => {
  it('shows the totals, the per-tool rows and the recent evaluations', { timeout: TEST_TIMEOUT }, testPanelShowsTotalsToolsAndRecent)

  it('re-reads the ledger when refreshed', { timeout: TEST_TIMEOUT }, testPanelRefreshReReadsTheLedger)

  it('reports a failed read without throwing', { timeout: TEST_TIMEOUT }, testPanelReportsAFailedReadWithoutThrowing)
})
