/**
 * Benchmark tests.
 *
 * The benchmark makes a public claim, so it gets a suite that pins the claim's
 * mechanics rather than its numbers: that all three axes are costed, that the
 * bank shape is cheaper than reasoning in context in both dollars and seconds,
 * and that the ad-hoc shape is not — which is the distinction the whole report
 * exists to make.
 */
import { describe, expect, it } from 'vitest'

import { DEFAULT_ASSUMPTIONS, baselineCost, jevBankCost, jevMeasuredCost, jevModelledCost } from '#src/benchmark/cost'
import { CORPUS, countDecisions, getItem } from '#src/benchmark/corpus'
import type { BenchmarkItem } from '#src/benchmark/corpus'
import { estimateTokens } from '#src/benchmark/estimator'
import { runModelledBenchmark } from '#src/benchmark'
import { renderReport } from '#src/benchmark/render'

const TEST_TIMEOUT = 5000
const FIRST_INDEX = 0
const ZERO = 0
const EMPTY_TEXT_LENGTH = 0
const SHORT_TEXT = 'abcd'
const EXPECTED_SHORT_TOKENS = 1
const LONGER_TEXT = 'abcdefgh'
const EXPECTED_LONGER_TOKENS = 2
const CHARS_PER_TOKEN = 4
const MEASURED_INPUT_TOKENS = 9001
const MEASURED_LATENCY_SECONDS = 0.25
const PRICE_MULTIPLIER = 10
const FLOAT_DIGITS = 5

/** The item the bank-shape assertions read. */
const BANK_ITEM = CORPUS.find(item => item.bank !== undefined)

/** How many corpus items a shipped bank covers. */
const BANK_ITEM_COUNT = CORPUS.filter(item => item.bank !== undefined).length

/**
 * Read the first item that a shipped bank covers.
 *
 * @returns The corpus item.
 */
function bankItem(): BenchmarkItem {
  if (BANK_ITEM === undefined) {
    throw new TypeError('no corpus item names a bank')
  }
  return BANK_ITEM
}

function testEstimatorCountsCharacters(): void {
  expect.hasAssertions()
  expect(estimateTokens('')).toBe(EMPTY_TEXT_LENGTH)
  expect(estimateTokens(SHORT_TEXT)).toBe(EXPECTED_SHORT_TOKENS)
  expect(estimateTokens(LONGER_TEXT)).toBe(EXPECTED_LONGER_TOKENS)
  expect(estimateTokens('x'.repeat(CHARS_PER_TOKEN))).toBe(EXPECTED_SHORT_TOKENS)
}

function testCorpusIsUsable(): void {
  expect.hasAssertions()
  expect(CORPUS.length).toBeGreaterThan(ZERO)
  expect(countDecisions()).toBeGreaterThan(CORPUS.length)
  expect(getItem('coding')).toBeDefined()
}

function testEveryAxisIsCosted(): void {
  expect.hasAssertions()
  const item = CORPUS[FIRST_INDEX]
  if (item === undefined) {
    throw new TypeError('the corpus is empty')
  }
  const baseline = baselineCost(item)
  const jev = jevModelledCost(item)
  expect(baseline.costUsd).toBeGreaterThan(ZERO)
  expect(baseline.seconds).toBeGreaterThan(ZERO)
  expect(baseline.billedInputTokens).toBe(ZERO)
  expect(jev.costUsd).toBeGreaterThan(ZERO)
  expect(jev.seconds).toBeGreaterThan(ZERO)
}

function testBanksBeatTheAdHocCall(): void {
  expect.hasAssertions()
  const item = bankItem()
  const adHoc = jevModelledCost(item)
  const bank = jevBankCost(item)
  if (bank === undefined) {
    throw new TypeError('the bank arm was not costed')
  }
  expect(bank.totalTokens).toBeLessThan(adHoc.totalTokens)
  expect(bank.costUsd).toBeLessThan(adHoc.costUsd)
  expect(jevBankCost({ ...item, bank: 'missing' })).toBeUndefined()
}

function testTheBankShapeIsCheaperInDollarsAndSeconds(): void {
  expect.hasAssertions()
  const report = runModelledBenchmark()
  expect(report.bank.cost.percent).toBeGreaterThan(ZERO)
  expect(report.bank.time.percent).toBeGreaterThan(ZERO)
  expect(report.bank.jev.usd).toBeLessThan(report.bank.baseline.usd)
  expect(report.bank.jev.seconds).toBeLessThan(report.bank.baseline.seconds)
}

function testTheAdHocShapeIsNot(): void {
  expect.hasAssertions()
  const report = runModelledBenchmark()
  expect(report.all.cost.percent).toBeLessThan(ZERO)
  expect(report.all.time.percent).toBeLessThan(ZERO)
  expect(report.all.decisions).toBeGreaterThan(ZERO)
}

function testRaisingOutputPriceHelpsJev(): void {
  expect.hasAssertions()
  const cheap = runModelledBenchmark()
  const dear = runModelledBenchmark({
    ...cheap.assumptions,
    llmOutputPricePerMtok: cheap.assumptions.llmOutputPricePerMtok * PRICE_MULTIPLIER,
  })
  expect(dear.bank.cost.percent).toBeGreaterThan(cheap.bank.cost.percent)
  expect(dear.all.cost.percent).toBeLessThan(cheap.all.cost.percent)
}

function testMeasuredArmReplacesTheEstimate(): void {
  expect.hasAssertions()
  const item = bankItem()
  const modelled = jevModelledCost(item)
  const measured = jevMeasuredCost(item, {
    billedInputTokens: MEASURED_INPUT_TOKENS,
    latencySeconds: MEASURED_LATENCY_SECONDS,
  })
  expect(measured.billedInputTokens).toBe(MEASURED_INPUT_TOKENS)
  expect(measured.totalTokens).not.toBe(modelled.totalTokens)
  expect(measured.costUsd).not.toBe(modelled.costUsd)
  // Generation time is unchanged; only the round trip is substituted.
  expect(measured.seconds).toBeCloseTo(
    modelled.seconds - DEFAULT_ASSUMPTIONS.jevLatencySeconds + MEASURED_LATENCY_SECONDS,
    FLOAT_DIGITS,
  )
}

function testMeasuredBankArmUsesTheReportedFigures(): void {
  expect.hasAssertions()
  const item = bankItem()
  const modelled = jevBankCost(item)
  const measured = jevBankCost(item, undefined, {
    billedInputTokens: MEASURED_INPUT_TOKENS,
    latencySeconds: MEASURED_LATENCY_SECONDS,
  })
  if (measured === undefined || modelled === undefined) {
    throw new TypeError('the bank arm was not costed')
  }
  expect(measured.billedInputTokens).toBe(MEASURED_INPUT_TOKENS)
  // The measured round trip replaces the modelled one; both feed the total.
  expect(measured.seconds).toBeCloseTo(
    modelled.seconds - DEFAULT_ASSUMPTIONS.jevLatencySeconds + MEASURED_LATENCY_SECONDS,
    FLOAT_DIGITS,
  )
}

function testReportLeadsWithCostAndTime(): void {
  expect.hasAssertions()
  const markdown = renderReport(runModelledBenchmark())
  expect(markdown).toContain('cost, time, and tokens')
  expect(markdown).toContain('| | Cost | Time | Tokens |')
  expect(markdown).toContain('Jev vs without')
  expect(markdown).toContain('Mode: **modelled**')
}

function testReportPricesBothCallShapes(): void {
  expect.hasAssertions()
  const report = runModelledBenchmark()
  // The bank table prices a strict subset of the corpus, and stays the better deal.
  expect(report.all.items).toBe(CORPUS.length)
  expect(report.bank.items).toBe(BANK_ITEM_COUNT)
  expect(report.bank.items).toBeLessThan(report.all.items)
  expect(report.bank.cost.percent).toBeGreaterThan(report.all.cost.percent)
}

describe('benchmark', () => {
  it('estimates tokens from characters', { timeout: TEST_TIMEOUT }, testEstimatorCountsCharacters)

  it('ships a usable corpus', { timeout: TEST_TIMEOUT }, testCorpusIsUsable)

  it('costs every axis of both arms', { timeout: TEST_TIMEOUT }, testEveryAxisIsCosted)

  it('finds the bank shape cheaper than an ad-hoc call', { timeout: TEST_TIMEOUT }, testBanksBeatTheAdHocCall)

  it('shows the bank shape cheaper in dollars and seconds', { timeout: TEST_TIMEOUT }, testTheBankShapeIsCheaperInDollarsAndSeconds)

  it('shows the ad-hoc shape is not', { timeout: TEST_TIMEOUT }, testTheAdHocShapeIsNot)

  it('improves Jev position when output is priced higher', { timeout: TEST_TIMEOUT }, testRaisingOutputPriceHelpsJev)

  it('replaces the estimate when the API reported usage', { timeout: TEST_TIMEOUT }, testMeasuredArmReplacesTheEstimate)

  it('uses reported figures for the measured bank arm', { timeout: TEST_TIMEOUT }, testMeasuredBankArmUsesTheReportedFigures)

  it('leads the report with cost and time', { timeout: TEST_TIMEOUT }, testReportLeadsWithCostAndTime)

  it('prices both call shapes over the corpus', { timeout: TEST_TIMEOUT }, testReportPricesBothCallShapes)
})

