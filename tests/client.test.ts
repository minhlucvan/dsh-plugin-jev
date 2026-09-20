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

import type {
  SettingsPathOp,
  SettingsScopeSnapshot,
} from '#src/client/contracts'
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
const MAX_CONFIDENCE = 1
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

/** A scope shaped like the host's: methods on the prototype, state on `this`. */
class ClassShapedScope {
  private value: ClientSettings = { ...defaultSettings, model: 'from the host' }

  private listeners: (() => void)[] = []

  public getSnapshot(): SettingsScopeSnapshot<ClientSettings> {
    return {
      status: 'ready',
      value: this.value,
      revision: undefined,
      writable: true,
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter(
        (candidate) => candidate !== listener,
      )
    }
  }

  public async mutate(ops: readonly SettingsPathOp[]): Promise<void> {
    for (const op of ops) {
      if (op.op === 'set') {
        this.value = normalizeSettings(op.value)
      }
    }
    for (const listener of this.listeners) {
      listener()
    }
    await Promise.resolve()
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

async function testScopeSourceKeepsTheReceiver(): Promise<void> {
  expect.hasAssertions()
  const scope = new ClassShapedScope()
  const source = settingsScopeSource(scope)
  /* Detaching either method would throw "Cannot read properties of undefined". */
  expect(source.getSnapshot().value?.model).toBe('from the host')

  const received: (string | undefined)[] = []
  const unsubscribe = source.subscribe(() => {
    received.push(source.getSnapshot().value?.model)
  })
  await scope.mutate([
    { op: 'set', path: [], value: { ...defaultSettings, model: 'changed' } },
  ])
  expect(received).toStrictEqual(['changed'])
  unsubscribe()
  expect(source.getSnapshot().value?.model).toBe('changed')
}

function testLocaleDictionariesAgree(): void {
  expect.hasAssertions()
  expect(LOCALE_NAMESPACE).toBe('dsh-plugin-system-one')

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
})

