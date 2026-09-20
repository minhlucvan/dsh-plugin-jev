/**
 * Benchmark tests.
 *
 * The benchmark makes a public claim, so it gets a suite that pins the claim's
 * mechanics rather than its numbers: that every integration shape is costed on
 * all three axes, that a shipped bank beats writing the questions by hand, that
 * a per-question fan-out beats neither, and that a fallback moves the gated
 * shape monotonically towards reasoning it out. The numbers belong in the
 * report, which is regenerated; the ordering belongs here, which is asserted.
 */
import { existsSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  APPROACHES,
  adhocCost,
  bankCost,
  gatedCost,
  reasonCost,
  splitCost,
} from '#src/benchmark/approaches'
import { breakEvenOf } from '#src/benchmark/breakeven'
import { DEFAULT_ASSUMPTIONS } from '#src/benchmark/cost'
import { CORPUS, TASKS, countDecisions, getItem } from '#src/benchmark/corpus'
import type { BenchmarkItem } from '#src/benchmark/corpus'

import { estimateTokens } from '#src/benchmark/estimator'
import { benchmarkSource, runModelledBenchmark } from '#src/benchmark'
import { renderReport } from '#src/benchmark/render'

const TEST_TIMEOUT = 5000
const NONE = 0
const ONE = 1
const ZERO_TEXT_LENGTH = 0
const SHORT_TEXT = 'abcd'
const EXPECTED_SHORT_TOKENS = 1
const LONGER_TEXT = 'abcdefgh'
const EXPECTED_LONGER_TOKENS = 2
const CHARS_PER_TOKEN = 4
const FLOAT_DIGITS = 10
const FIRST_INDEX = 0
const PRICE_MULTIPLIER = 10
const CORPUS_SOURCE = 'src/benchmark/corpus.ts'

/** The item a shipped bank covers. */
const BANK_ITEM = CORPUS.find(item => item.bank !== undefined)

/** How many corpus items a shipped bank covers. */
const BANK_ITEM_COUNT = CORPUS.filter(item => item.bank !== undefined).length

/**
 * Read the first item that a shipped bank covers.
 *
 * @returns The corpus item.
 */
function bankItem(): BenchmarkItem {
  const item = BANK_ITEM
  if (item === undefined) {
    throw new TypeError('no corpus item names a bank')
  }
  return item
}

function testEstimatorCountsCharacters(): void {
  expect.hasAssertions()
  expect(estimateTokens('')).toBe(ZERO_TEXT_LENGTH)
  expect(estimateTokens(SHORT_TEXT)).toBe(EXPECTED_SHORT_TOKENS)
  expect(estimateTokens(LONGER_TEXT)).toBe(EXPECTED_LONGER_TOKENS)
  expect(estimateTokens('x'.repeat(CHARS_PER_TOKEN))).toBe(EXPECTED_SHORT_TOKENS)
}

function testCorpusIsUsable(): void {
  expect.hasAssertions()
  expect(CORPUS.length).toBeGreaterThan(NONE)
  expect(countDecisions()).toBeGreaterThan(CORPUS.length)
  expect(getItem('coding')).toBeDefined()
  // Every item belongs to a task class the report knows how to group.
  expect(CORPUS.every(item => TASKS.includes(item.task))).toBe(true)
}

function testEveryShapeIsCosted(): void {
  expect.hasAssertions()
  const item = bankItem()
  for (const cost of [
    reasonCost(item),
    adhocCost(item),
    bankCost(item),
    splitCost(item),
    gatedCost(item, { escalated: [] }),
  ]) {
    expect(cost?.costUsd).toBeGreaterThan(NONE)
    expect(cost?.seconds).toBeGreaterThan(NONE)
  }
}

function testBanksBeatWritingTheQuestions(): void {
  expect.hasAssertions()
  const item = bankItem()
  const bank = bankCost(item)
  const adhoc = adhocCost(item)
  if (bank === undefined) {
    throw new TypeError('the bank arm was not costed')
  }
  // The whole claim: the same answers, the same round trip, fewer generated
  // Tokens — and Jev input is the cheapest token in the comparison.
  expect(bank.costUsd).toBeLessThan(adhoc.costUsd)
  expect(bank.seconds).toBeLessThan(adhoc.seconds)
  expect(bank.totalTokens).toBeLessThan(adhoc.totalTokens)
}

function testASplitFanOutBeatsNeither(): void {
  expect.hasAssertions()
  const item = bankItem()
  const adhoc = adhocCost(item)
  const split = splitCost(item)
  expect(split.costUsd).toBeGreaterThan(adhoc.costUsd)
  expect(split.seconds).toBeGreaterThan(adhoc.seconds)
  expect(split.totalTokens).toBeGreaterThan(adhoc.totalTokens)
}

function testTheGatedShapeSitsBetweenBankAndReason(): void {
  expect.hasAssertions()
  const item = bankItem()
  const bank = bankCost(item)
  const reasoned = reasonCost(item)
  const none = gatedCost(item, { escalated: [] })
  const all = gatedCost(item, { escalated: Object.keys(item.questions) })
  if (bank === undefined || none === undefined || all === undefined) {
    throw new TypeError('the gated arm was not costed')
  }
  // No fallback is the bank shape; a full fallback pays for the bank call *and*
  // The reasoning, so it is strictly worse than either alone.
  expect(none.costUsd).toBeCloseTo(bank.costUsd, FLOAT_DIGITS)
  expect(all.costUsd).toBeGreaterThan(reasoned.costUsd)
  expect(all.costUsd).toBeGreaterThan(bank.costUsd)
}

function testAnItemWithoutABankIsNotPricedOnOne(): void {
  expect.hasAssertions()
  const item = CORPUS.find(candidate => candidate.bank === undefined)
  if (item === undefined) {
    throw new TypeError('every corpus item names a bank')
  }
  expect(bankCost(item)).toBeUndefined()
  expect(gatedCost(item, { escalated: [] })).toBeUndefined()
  // The shapes that need no bank still cover it.
  expect(adhocCost(item).costUsd).toBeGreaterThan(NONE)
  expect(splitCost(item).costUsd).toBeGreaterThan(NONE)
}

function testReportCoversEveryShape(): void {
  expect.hasAssertions()
  const report = runModelledBenchmark()
  expect(report.mode).toBe('modelled')
  expect(report.approaches.map(entry => entry.id)).toStrictEqual(
    APPROACHES.map(approach => approach.id),
  )
  const bank = report.approaches.find(entry => entry.id === 'bank')
  const adhoc = report.approaches.find(entry => entry.id === 'adhoc')
  // Each shape is compared over its own scenarios, never over the whole corpus.
  expect(bank?.items).toBe(BANK_ITEM_COUNT)
  expect(adhoc?.items).toBe(CORPUS.length)
  expect(report.approaches.at(FIRST_INDEX)?.items).toBe(CORPUS.length)
}

function testReportGroupsByTask(): void {
  expect.hasAssertions()
  const report = runModelledBenchmark()
  expect(report.byTask.map(entry => entry.task)).toStrictEqual([...TASKS])
  const covered = report.byTask.filter(entry => entry.items > NONE)
  expect(covered.length).toBeGreaterThanOrEqual(ONE)
  for (const entry of covered) {
    expect(entry.cells).toHaveLength(APPROACHES.length)
  }
}

function testRaisingOutputPriceHelpsAjevShape(): void {
  expect.hasAssertions()
  const cheap = runModelledBenchmark()
  const dear = runModelledBenchmark({
    ...cheap.assumptions,
    llmOutputPricePerMtok: cheap.assumptions.llmOutputPricePerMtok * PRICE_MULTIPLIER,
  })
  const bankOf = (report: typeof cheap): number =>
    report.approaches.find(entry => entry.id === 'bank')?.cost.percent ?? NONE
  expect(bankOf(dear)).toBeGreaterThan(bankOf(cheap))
}

function testReportLeadsWithARecommendation(): void {
  expect.hasAssertions()
  const markdown = renderReport(runModelledBenchmark())
  expect(markdown).toContain('## Recommendation')
  expect(markdown).toContain('## Every shape, over what it covers')
  expect(markdown).toContain('## Per task class')
  expect(markdown).toContain('## Limitations')
}

function testSourcesNameOnlyShippedFiles(): void {
  expect.hasAssertions()
  const sources = benchmarkSource()
  // The paths are published in the report's Method section, so a stale one is a
  // Reader-visible defect rather than a private detail.
  expect(sources).toContain(CORPUS_SOURCE)
  const missing = sources.filter(
    source => !existsSync(new URL(`../${source}`, import.meta.url)),
  )
  expect(missing).toStrictEqual([])
}

function testModelledRunHasNoCurveToRead(): void {
  expect.hasAssertions()
  // The fallback curve is derived from measured confidences, so a modelled run
  // Has none — and must not invent one.
  const report = runModelledBenchmark()
  expect(report.breakEven.curve).toStrictEqual([])
  expect(report.approaches.every(entry => entry.agreement.checked === NONE)).toBe(true)
}

function testBreakEvenNeedsMeasurements(): void {
  expect.hasAssertions()
  const curve = breakEvenOf(CORPUS, new Map(), DEFAULT_ASSUMPTIONS)
  expect(curve.curve).toStrictEqual([])
  expect(curve.items).toBe(NONE)
}

describe('benchmark', () => {
  it('estimates tokens from characters', { timeout: TEST_TIMEOUT }, testEstimatorCountsCharacters)

  it('ships a usable corpus with task classes', { timeout: TEST_TIMEOUT }, testCorpusIsUsable)

  it('costs every shape on every axis', { timeout: TEST_TIMEOUT }, testEveryShapeIsCosted)

  it('finds a bank cheaper than writing the questions', { timeout: TEST_TIMEOUT }, testBanksBeatWritingTheQuestions)

  it('finds a per-question fan-out beats neither shape', { timeout: TEST_TIMEOUT }, testASplitFanOutBeatsNeither)

  it('places the gated shape between the bank and reasoning', { timeout: TEST_TIMEOUT }, testTheGatedShapeSitsBetweenBankAndReason)

  it('refuses to price a bank shape without a bank', { timeout: TEST_TIMEOUT }, testAnItemWithoutABankIsNotPricedOnOne)

  it('covers every shape in the report', { timeout: TEST_TIMEOUT }, testReportCoversEveryShape)

  it('groups the report by task class', { timeout: TEST_TIMEOUT }, testReportGroupsByTask)

  it('moves every shape when output is priced higher', { timeout: TEST_TIMEOUT }, testRaisingOutputPriceHelpsAjevShape)

  it('leads the report with a recommendation', { timeout: TEST_TIMEOUT }, testReportLeadsWithARecommendation)

  it('names only shipped corpus sources', { timeout: TEST_TIMEOUT }, testSourcesNameOnlyShippedFiles)

  it('publishes no fallback curve without measurements', { timeout: TEST_TIMEOUT }, testModelledRunHasNoCurveToRead)

  it('builds no break-even curve without measurements', { timeout: TEST_TIMEOUT }, testBreakEvenNeedsMeasurements)
})
