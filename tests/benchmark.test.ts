/**
 * Benchmark tests.
 *
 * The benchmark makes a public claim, so it gets a suite that pins the claim's
 * mechanics rather than its numbers: that both arms are costed, that the bank
 * shape is cheaper for the items a bank covers, that the weighted figure
 * diverges from the raw one when output is priced higher, and that the rendered
 * report states which half was measured.
 */
import { describe, expect, it } from 'vitest'

import { baselineCost, jevBankCost, jevModelledCost } from '#src/benchmark-cost'
import { CORPUS, countDecisions, getItem } from '#src/benchmark-corpus'
import { estimateTokens } from '#src/benchmark-estimator'
import { runModelledBenchmark } from '#src/benchmark'
import { buildReport, renderReport } from '#src/benchmark-report'

const TEST_TIMEOUT = 5000
const FIRST_INDEX = 0
const ZERO = 0
const ONE = 1
const EMPTY_TEXT_LENGTH = 0
const SHORT_TEXT = 'abcd'
const EXPECTED_SHORT_TOKENS = 1
const LONGER_TEXT = 'abcdefgh'
const EXPECTED_LONGER_TOKENS = 2
const WEIGHTED_OUTPUT = 4
const CHARS_PER_TOKEN = 4

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
  expect(getItem('support-ticket')).toBeDefined()
  expect(getItem('nope')).toBeUndefined()
}

function testBothArmsAreCosted(): void {
  expect.hasAssertions()
  const item = CORPUS[FIRST_INDEX]
  if (item === undefined) {
    throw new TypeError('the corpus is empty')
  }
  const baseline = baselineCost(item)
  const jev = jevModelledCost(item)
  expect(baseline.totalTokens).toBeGreaterThan(ZERO)
  expect(jev.billedInputTokens).toBeGreaterThan(ZERO)
  expect(baseline.billedInputTokens).toBe(ZERO)
}

function testBanksBeatTheAdHocCall(): void {
  expect.hasAssertions()
  const item = CORPUS.find(entry => entry.bank !== undefined)
  if (item === undefined) {
    throw new TypeError('no corpus item names a bank')
  }
  const adHoc = jevModelledCost(item)
  const bank = jevBankCost(item)
  if (bank === undefined) {
    throw new TypeError('the bank arm was not costed')
  }
  expect(bank.totalTokens).toBeLessThan(adHoc.totalTokens)
  expect(jevBankCost({ ...item, bank: 'missing' })).toBeUndefined()
}

function testWeightingChangesTheComparison(): void {
  expect.hasAssertions()
  const cheap = runModelledBenchmark()
  const priced = runModelledBenchmark({
    systemPromptTokens: cheap.assumptions.systemPromptTokens,
    toolSchemaTokens: cheap.assumptions.toolSchemaTokens,
    completionWeight: WEIGHTED_OUTPUT,
  })
  expect(priced.totals.weighted.baseline).toBeGreaterThan(cheap.totals.weighted.baseline)
  expect(priced.totals.weighted.jev).toBeGreaterThan(cheap.totals.weighted.jev)
}

function testBankArmIsTheOneThatSaves(): void {
  expect.hasAssertions()
  const report = runModelledBenchmark({
    systemPromptTokens: runModelledBenchmark().assumptions.systemPromptTokens,
    toolSchemaTokens: runModelledBenchmark().assumptions.toolSchemaTokens,
    completionWeight: WEIGHTED_OUTPUT,
  })
  expect(report.totals.bank.items).toBeGreaterThan(ZERO)
  expect(report.totals.bank.weighted.percent).toBeGreaterThan(ZERO)
  expect(report.totals.saved.percent).toBeLessThan(ZERO)
}

function testReportStatesItsMode(): void {
  expect.hasAssertions()
  const markdown = renderReport(runModelledBenchmark())
  expect(markdown).toContain('Mode: **modelled**')
  expect(markdown).toContain('Jev (bank)')
  expect(markdown).toContain('What is measured and what is modelled')
}

function testReportAggregatesRows(): void {
  expect.hasAssertions()
  const report = runModelledBenchmark()
  const manual = buildReport(report.rows, report.assumptions, report.mode)
  expect(manual.totals.items).toBe(report.rows.length)
  expect(manual.totals.decisions).toBe(report.totals.decisions)
  expect(report.totals.bank.items).toBeLessThanOrEqual(report.rows.length)
  expect(report.rows.length).toBeGreaterThan(ONE - ONE)
}

describe('benchmark', () => {
  it('estimates tokens from characters', { timeout: TEST_TIMEOUT }, testEstimatorCountsCharacters)

  it('ships a usable corpus', { timeout: TEST_TIMEOUT }, testCorpusIsUsable)

  it('costs both arms', { timeout: TEST_TIMEOUT }, testBothArmsAreCosted)

  it('finds the bank shape cheaper than an ad-hoc call', { timeout: TEST_TIMEOUT }, testBanksBeatTheAdHocCall)

  it('changes the comparison when output is priced higher', { timeout: TEST_TIMEOUT }, testWeightingChangesTheComparison)

  it('shows the bank arm as the shape that saves', { timeout: TEST_TIMEOUT }, testBankArmIsTheOneThatSaves)

  it('states its own measurement mode', { timeout: TEST_TIMEOUT }, testReportStatesItsMode)

  it('aggregates the rows it was given', { timeout: TEST_TIMEOUT }, testReportAggregatesRows)
})

