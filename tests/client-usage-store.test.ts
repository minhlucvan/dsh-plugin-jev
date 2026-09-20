/**
 * Usage-store tests.
 *
 * The store is built on `zustand/vanilla`, so a dashboard's rules — keep the
 * last good read when a refresh fails, report `loading` before the first answer
 * — are verifiable in plain Node with no DOM and no renderer.
 */
import { describe, expect, it } from 'vitest'

import type {
  CatalogReport,
  HealthReport,
  UsageApi,
  UsageReport,
} from '#src/client/api'
import { createUsageStore } from '#src/client/usage-store'

const TEST_TIMEOUT = 5000
const EXPECTED_SINGLE_CALL = 1
const ONE_READ = 1
const SAMPLED_CALLS = 3

/** The health a canned api reports. */
const SAMPLE_HEALTH: HealthReport = { ok: true, enabled: true, model: 'jev-test' }

/** The report a canned api returns. */
const SAMPLE_REPORT: UsageReport = {
  totals: { calls: SAMPLED_CALLS, inputTokens: 900, outputTokens: 40, questions: SAMPLED_CALLS, stateChars: 300 },
  byTool: {},
  recent: [],
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

describe('usage store', () => {
  it('publishes the report after a successful read', { timeout: TEST_TIMEOUT }, testUsageLoadPublishesTheReport)

  it('keeps the last read and records the reason on failure', { timeout: TEST_TIMEOUT }, testUsageFailureKeepsTheLastRead)
})
