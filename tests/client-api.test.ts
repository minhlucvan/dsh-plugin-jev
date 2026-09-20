/**
 * Route-read tests for the usage panel's client.
 *
 * The panel asks the routes this package owns rather than a Cordis service, so
 * every read goes through a stand-in `fetch` here: the paths it claims, the
 * payloads it accepts, and the two failures that would otherwise surface as an
 * undefined field deep inside the panel — a non-success status, and a success
 * status carrying a body this version cannot read.
 */
import { describe, expect, it } from 'vitest'

import type { FetchLike, FetchResponse } from '#src/client/api'
import {
  CATALOG_PATH,
  HEALTH_PATH,
  USAGE_PATH,
  createUsageApi,
} from '#src/client/api'

const TEST_TIMEOUT = 5000
const EXPECTED_SINGLE_CALL = 1
const OK_STATUS = 200
const FAILED_STATUS = 500
const FAILED_STATUS_FLOOR = 400
const SAMPLED_CALLS = 3

/** The totals a canned usage payload reports. */
const SAMPLE_TOTALS = {
  calls: SAMPLED_CALLS, inputTokens: 1200, outputTokens: 80,
  questions: SAMPLED_CALLS, stateChars: 4000,
}

/**
 * Answer each route with a payload that route can use.
 *
 * @param path - Absolute path the read asked for.
 * @returns A body shaped for that path.
 */
function bodyFor(path: string): unknown {
  if (path === HEALTH_PATH) {
    return { ok: true, enabled: true, model: 'jev-test' }
  }
  if (path === USAGE_PATH) {
    return { totals: SAMPLE_TOTALS, byTool: {}, recent: [] }
  }
  const bank = { id: 'reasoning', title: 'Reasoning shape', description: 'Classify.', questions: {} }
  return { banks: [bank] }
}

/**
 * Decode one canned body.
 *
 * Written as an async function with a real await because this repository
 * enforces both `promise-function-async` and `require-await`: a stand-in that
 * merely returned `Promise.resolve(...)` would fail one of the two.
 *
 * @param value - Body to hand back.
 * @returns The body.
 */
async function decodeJson(value: unknown): Promise<unknown> {
  const decoded = await Promise.resolve(value)
  return decoded
}

/**
 * Wrap one canned body in the response shape the client reads.
 *
 * @param status - HTTP status to report.
 * @param body - Decoded body to report.
 * @returns A stand-in response.
 */
async function cannedResponse(status: number, body: unknown): Promise<FetchResponse> {
  const decoded = await decodeJson(body)
  return { ok: status < FAILED_STATUS_FLOOR, status, json: decodeJson.bind(undefined, decoded) }
}

/** A fetch that records its paths and answers each with a usable body. */
function routedFetch(): { fetchImpl: FetchLike; paths: string[] } {
  const paths: string[] = []
  const fetchImpl: FetchLike = async (path: string): Promise<FetchResponse> => {
    const response = await cannedResponse(OK_STATUS, bodyFor(path))
    paths.push(path)
    return response
  }
  return { fetchImpl, paths }
}

/**
 * Build a fetch that answers every path with one canned response.
 *
 * @param status - HTTP status to report.
 * @param body - Decoded body to report.
 * @returns A stand-in fetch.
 */
function cannedFetch(status: number, body: unknown): FetchLike {
  const fetchImpl: FetchLike = async (_path: string): Promise<FetchResponse> => {
    const response = await cannedResponse(status, body)
    return response
  }
  return fetchImpl
}

async function testApiReadsTheThreeRoutes(): Promise<void> {
  expect.hasAssertions()
  const recorder = routedFetch()
  const api = createUsageApi(recorder.fetchImpl)

  const health = await api.health()
  const report = await api.usage()
  const catalog = await api.catalog()

  expect(recorder.paths).toStrictEqual([HEALTH_PATH, USAGE_PATH, CATALOG_PATH])
  expect(health.enabled).toBe(true)
  expect(report.totals.calls).toBe(SAMPLED_CALLS)
  expect(catalog.banks).toHaveLength(EXPECTED_SINGLE_CALL)
}

async function testApiReportsEveryFailureAsAnError(): Promise<void> {
  expect.hasAssertions()
  const failed = createUsageApi(cannedFetch(FAILED_STATUS, { error: 'boom' }))
  await expect(failed.usage()).rejects.toThrow(String(FAILED_STATUS))

  /*
   * A success status with an unusable body is the failure that would otherwise
   * surface as an undefined field deep inside the panel.
   */
  const unusable = createUsageApi(cannedFetch(OK_STATUS, { banks: 'not a list' }))
  await expect(unusable.catalog()).rejects.toThrow(/unrecognized/u)
}

describe('client api', () => {
  it('reads the health, usage and catalog routes', { timeout: TEST_TIMEOUT }, testApiReadsTheThreeRoutes)

  it('reports a failed read as an error', { timeout: TEST_TIMEOUT }, testApiReportsEveryFailureAsAnError)
})
