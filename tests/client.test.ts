/**
 * Client-face tests.
 *
 * Two behaviours are worth regressing here, and one is not obvious.
 *
 * Normalization is the boundary that lets the form assume a valid snapshot: a
 * missing, wrongly-typed, blank or out-of-range stored value must resolve to
 * something usable rather than reach a field.
 *
 * The receiver binding is the subtle one. The host's settings scope is an object
 * whose methods read their own state through `this`, and React invokes
 * callbacks it is given as bare functions — so passing `scope.getSnapshot`
 * straight to `useSyncExternalStore` throws during render. The test uses a
 * class, whose methods live on the prototype and therefore keep their receiver
 * only if the wrapper actually calls them on the scope.
 *
 * The route reads are tested with a stand-in `fetch`.
 */
import { describe, expect, it } from 'vitest'

import type { FetchLike, FetchResponse } from '#src/client/api'
import {
  CATALOG_PATH,
  HEALTH_PATH,
  USAGE_PATH,
  createUsageApi,
} from '#src/client/api'
import { LOCALE_NAMESPACE, locales } from '#src/client/locale'
import type { ClientSettings } from '#src/client/settings'
import {
  defaultSettings,
  normalizeSettings,
  sameSettings,
  settingsScopeSource,
  toDraft,
} from '#src/client/settings'

const TEST_TIMEOUT = 5000
const NO_KEYS = 0
const EXPECTED_SINGLE_CALL = 1
const MAX_CONFIDENCE = 1
const OK_STATUS = 200
const FAILED_STATUS = 500
const FAILED_STATUS_FLOOR = 400
const SAMPLED_CALLS = 3
const ABOVE_RANGE = 5
const ABOVE_LEDGER_MAX = 10_000_000
const LEDGER_MAX = 100_000
const LEDGER_MIN = 1
const LEDGER_ROUNDED = 13
const LEDGER_TO_ROUND = 12.6
const TYPED_LEDGER = 250
const TYPED_FLOOR = 0.4
const TYPED_CONFIRM = 0.6
const FLOOR_ABOVE_CONFIRM = 0.9
const CONFIRM_BELOW_FLOOR = 0.2
const VALID_FLOOR = 0.25
const VALID_CONFIRM = 0.75
const KEPT_LEDGER = 20

/**
 * The `null` literal without writing it.
 *
 * `null` is the case worth testing most: `typeof null === 'object'`, so a
 * guard that checks only the type lets it through.
 */
const NULL_VALUE: unknown = JSON.parse('null')

/** The totals a canned usage payload reports. */
const SAMPLE_TOTALS = {
  calls: SAMPLED_CALLS, inputTokens: 1200, outputTokens: 80,
  questions: SAMPLED_CALLS, stateChars: 4000,
}

/** A scope shaped like the host's: methods on the prototype, state on `this`. */
class ClassShapedScope {
  private value: ClientSettings = { ...defaultSettings, model: 'from the host' }

  private listeners: (() => void)[] = []

  public getSnapshot(): ClientSettings {
    return this.value
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter(
        (candidate) => candidate !== listener,
      )
    }
  }

  public mutate(next: ClientSettings): void {
    this.value = next
    for (const listener of this.listeners) {
      listener()
    }
  }
}

function testNormalizesMalformedValues(): void {
  expect.hasAssertions()
  expect(normalizeSettings()).toStrictEqual(defaultSettings)
  expect(normalizeSettings(NULL_VALUE)).toStrictEqual(defaultSettings)
  expect(normalizeSettings('a string')).toStrictEqual(defaultSettings)
  expect(normalizeSettings({})).toStrictEqual(defaultSettings)
}

function testNormalizesEachField(): void {
  expect.hasAssertions()
  expect(
    normalizeSettings({
      enabled: false,
      apiKeyEnv: '  MY_KEY  ',
      model: '   ',
      baseUrl: 'https://example.test',
      confidenceFloor: VALID_FLOOR,
      confirmFloor: VALID_CONFIRM,
      ledgerLimit: KEPT_LEDGER,
    }),
  ).toStrictEqual({
    enabled: false,
    adoptionPrompt: true,
    banks: [],
    apiKeyEnv: 'MY_KEY',
    model: defaultSettings.model,
    baseUrl: 'https://example.test',
    confidenceFloor: VALID_FLOOR,
    confirmFloor: VALID_CONFIRM,
    ledgerLimit: KEPT_LEDGER,
  })
}

function testRepairsTheThresholds(): void {
  expect.hasAssertions()
  /* A floor above the confirm floor raises the confirm floor, never lowers it. */
  expect(
    normalizeSettings({
      confidenceFloor: FLOOR_ABOVE_CONFIRM,
      confirmFloor: CONFIRM_BELOW_FLOOR,
    }),
  ).toMatchObject({
    confidenceFloor: FLOOR_ABOVE_CONFIRM,
    confirmFloor: FLOOR_ABOVE_CONFIRM,
  })
}

function testClampsOutOfRangeNumbers(): void {
  expect.hasAssertions()
  expect(normalizeSettings({ confidenceFloor: ABOVE_RANGE }).confidenceFloor)
    .toBe(MAX_CONFIDENCE)
  expect(normalizeSettings({ confirmFloor: ABOVE_RANGE }).confirmFloor)
    .toBe(MAX_CONFIDENCE)
  expect(normalizeSettings({ ledgerLimit: 0 }).ledgerLimit).toBe(LEDGER_MIN)
  expect(normalizeSettings({ ledgerLimit: ABOVE_LEDGER_MAX }).ledgerLimit)
    .toBe(LEDGER_MAX)
  expect(normalizeSettings({ ledgerLimit: LEDGER_TO_ROUND }).ledgerLimit)
    .toBe(LEDGER_ROUNDED)
}

function testReadsNumbersFromTypedText(): void {
  expect.hasAssertions()
  const normalized = normalizeSettings({
    confidenceFloor: String(TYPED_FLOOR),
    confirmFloor: String(TYPED_CONFIRM),
    ledgerLimit: String(TYPED_LEDGER),
  })
  expect(normalized.confidenceFloor).toBe(TYPED_FLOOR)
  expect(normalized.confirmFloor).toBe(TYPED_CONFIRM)
  expect(normalized.ledgerLimit).toBe(TYPED_LEDGER)
  expect(normalizeSettings({ ledgerLimit: 'many' }).ledgerLimit)
    .toBe(defaultSettings.ledgerLimit)
}

function testReturnsAFreshObjectForDefaults(): void {
  expect.hasAssertions()
  const first = normalizeSettings()
  first.model = 'mutated'
  expect(normalizeSettings().model).toBe(defaultSettings.model)
}

function testRoundTripsThroughTheDraft(): void {
  expect.hasAssertions()
  const settings: ClientSettings = {
    ...defaultSettings,
    confidenceFloor: VALID_FLOOR,
    confirmFloor: VALID_CONFIRM,
    ledgerLimit: KEPT_LEDGER,
  }
  expect(normalizeSettings(toDraft(settings))).toStrictEqual(settings)
  expect(sameSettings(settings, { ...settings })).toBe(true)
  expect(sameSettings(settings, defaultSettings)).toBe(false)
}

function testScopeSourceKeepsTheReceiver(): void {
  expect.hasAssertions()
  const scope = new ClassShapedScope()
  const source = settingsScopeSource(scope)
  /* Detaching either method would throw "Cannot read properties of undefined". */
  expect(source.getSnapshot().model).toBe('from the host')

  const received: string[] = []
  const unsubscribe = source.subscribe(() => {
    received.push(source.getSnapshot().model)
  })
  scope.mutate({ ...defaultSettings, model: 'changed' })
  expect(received).toStrictEqual(['changed'])
  unsubscribe()
  expect(source.getSnapshot().model).toBe('changed')
}

function testLocaleDictionariesAgree(): void {
  expect.hasAssertions()
  expect(LOCALE_NAMESPACE).toBe('dsh-plugin-jev')

  const reference = Object.keys(locales.en ?? {}).toSorted()
  expect(reference.length).toBeGreaterThan(NO_KEYS)
  for (const [language, dictionary] of Object.entries(locales)) {
    expect(Object.keys(dictionary).toSorted(), `language ${language}`)
      .toStrictEqual(reference)
    for (const [key, value] of Object.entries(dictionary)) {
      expect(value.trim(), `key ${key}`).not.toBe('')
    }
  }
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

describe('client face', () => {
  it('normalizes an omitted, null or wrongly-typed value', { timeout: TEST_TIMEOUT }, testNormalizesMalformedValues)

  it('normalizes every field against its default', { timeout: TEST_TIMEOUT }, testNormalizesEachField)

  it('repairs a confirm floor below the confidence floor', { timeout: TEST_TIMEOUT }, testRepairsTheThresholds)

  it('clamps out-of-range numbers', { timeout: TEST_TIMEOUT }, testClampsOutOfRangeNumbers)

  it('reads numbers from typed text', { timeout: TEST_TIMEOUT }, testReadsNumbersFromTypedText)

  it('hands out a fresh object rather than a shared default', { timeout: TEST_TIMEOUT }, testReturnsAFreshObjectForDefaults)

  it('round-trips a snapshot through the draft', { timeout: TEST_TIMEOUT }, testRoundTripsThroughTheDraft)

  it('wraps a class-shaped scope without losing its receiver', { timeout: TEST_TIMEOUT }, testScopeSourceKeepsTheReceiver)

  it('keeps every locale dictionary on the reference key set', { timeout: TEST_TIMEOUT }, testLocaleDictionariesAgree)

  it('reads the health, usage and catalog routes', { timeout: TEST_TIMEOUT }, testApiReadsTheThreeRoutes)

  it('reports a failed read as an error', { timeout: TEST_TIMEOUT }, testApiReportsEveryFailureAsAnError)
})
