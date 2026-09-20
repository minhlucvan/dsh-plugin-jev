/**
 * Grading and fallback tests.
 *
 * Two claims need pinning beyond the cost ordering: that the benchmark grades
 * answers rather than assuming them — a cheaper shape must not win while
 * answering the wrong question, and the three primitives answer differently
 * enough that grading them uniformly would be wrong — and that the fallback
 * curve is derived from measured confidences.
 */
import { describe, expect, it } from 'vitest'

import { breakEvenOf } from '#src/benchmark/breakeven'
import { DEFAULT_ASSUMPTIONS } from '#src/benchmark/cost'
import { CORPUS, getItem } from '#src/benchmark/corpus'
import type { BenchmarkItem } from '#src/benchmark/corpus'
import type { CallMeasurement, LiveMeasurement } from '#src/benchmark/live'
import { agreementOf, matches, mismatchesOf } from '#src/benchmark/quality'
import { recommended } from '#src/benchmark/render'
import { buildReport } from '#src/benchmark/report'
import { buildRow } from '#src/benchmark/rows'
import type { JevAnswer, JevJson, JevQuestion } from '#src/jev/contracts'

const TEST_TIMEOUT = 5000
const NONE = 0
const FULL = 100
const WRONG = 0
const CONFIDENT = 0.99
const UNSURPRISING = 0.5
const YES_PROBABILITY = 0.9
const NO_PROBABILITY = 0.1
const SECOND_LEVEL = 1
const FIRST_INDEX = 0
const LAST_INDEX = 1
const ONE_ANSWER = 1
const ONE_LEVEL = 1
const NO_LEVEL = -1
const COMPLEMENT = 1
const REMAINDER = 0.01
const NO = 'no'


/**
 * Read a corpus item, or fail with the reason it is missing.
 *
 * @param id - Item id.
 * @returns The item.
 */
function item(id: string): BenchmarkItem {
  const found = getItem(id)
  if (found === undefined) {
    throw new TypeError(`the corpus has no item "${id}"`)
  }
  return found
}

/**
 * Build a correct answer to one question, at a chosen confidence.
 *
 * @param question - The question being answered.
 * @param expected - The expected answer.
 * @param confidence - Confidence to report.
 * @returns An answer of the right primitive.
 */
function fold(value: string): string {
  return value.trim().toLowerCase()
}

/** Read the level a Score answer must lead with to match an expected label. */
function levelFor(criteria: readonly JevJson[], expected: string): number {
  const index = criteria.findIndex(
    level => typeof level === 'string' && fold(level) === fold(expected),
  )
  if (index === NO_LEVEL) {
    return criteria.length - ONE_LEVEL
  }
  return index
}

/** Build a correct answer to one question, at a chosen confidence. */
function answerFor(
  question: JevQuestion,
  expected: string,
  confidence: number,
): JevAnswer {
  if (question.type === 'noul') {
    let probability = confidence
    if (fold(expected) === NO) {
      probability = COMPLEMENT - confidence
    }
    return { type: 'noul', noul: probability }
  }
  if (question.type === 'score') {
    const leading = levelFor(question.criteria, expected)
    const legend: Record<string, string> = {}
    const probabilities: Record<string, number> = {}
    for (const [index, level] of question.criteria.entries()) {
      const key = String(index)
      legend[key] = expected
      if (typeof level === 'string') {
        legend[key] = level
      }
      probabilities[key] = REMAINDER
      if (index === leading) {
        probabilities[key] = confidence
      }
    }
    return { type: 'score', score: leading, legend, probabilities, confidence }
  }
  return {
    type: 'choice',
    choice: expected,
    probabilities: { [expected]: confidence },
    confidence,
  }
}

/** Answer every question of an item correctly. */
function correctAnswers(
  target: BenchmarkItem,
  confidence: number,
): Record<string, JevAnswer> {
  const answers: Record<string, JevAnswer> = {}
  for (const [id, question] of Object.entries(target.questions)) {
    answers[id] = answerFor(question, target.expected[id] ?? '', confidence)
  }
  return answers
}

/** Build a measurement for one item from answers a test chose. */
function measurementOf(
  target: BenchmarkItem,
  bankAnswers: Record<string, JevAnswer>,
  adhocAnswers: Record<string, JevAnswer>,
): LiveMeasurement {
  const call: CallMeasurement = {
    billedInputTokens: 400,
    outputTokens: 10,
    latencySeconds: 0.2,
    calls: 1,
  }
  return {
    itemId: target.id,
    model: 'jev-test',
    adhoc: call,
    split: call,
    bank: call,
    adhocAnswers,
    splitAnswers: adhocAnswers,
    bankAnswers,
    agreement: {
      adhoc: agreementOf(adhocAnswers, target.expected),
      split: agreementOf(adhocAnswers, target.expected),
      bank: agreementOf(bankAnswers, target.expected),
    },
  }
}

/**
 * Build a measurement index for every corpus item.
 *
 * @param confidence - Confidence to report on every answer.
 * @returns The measurements, keyed by item id.
 */
function confidenceIndex(confidence: number): Map<string, LiveMeasurement> {
  const index = new Map<string, LiveMeasurement>()
  for (const entry of CORPUS) {
    const answers = correctAnswers(entry, confidence)
    index.set(entry.id, measurementOf(entry, answers, answers))
  }
  return index
}

function testGradesAChoiceByItsKey(): void {
  expect.hasAssertions()
  const answers = correctAnswers(item('coding'), CONFIDENT)
  const { expected } = item('coding')
  const agreement = agreementOf(answers, expected)
  expect(agreement.checked).toBe(Object.keys(expected).length)
  expect(agreement.matched).toBe(agreement.checked)
  expect(agreement.percent).toBe(FULL)
}

function testGradesAScoreByItsLeadingLevel(): void {
  expect.hasAssertions()
  const target = item('coding')
  const { blast_radius: question } = target.questions
  const expected = target.expected.blast_radius ?? ''
  if (question === undefined) {
    throw new TypeError('the coding item has no blast_radius question')
  }
  const answer = answerFor(question, expected, CONFIDENT)
  expect(matches(answer, expected)).toBe(true)
  const shifted: JevAnswer = {
    type: 'score',
    score: SECOND_LEVEL,
    legend: { [String(FIRST_INDEX)]: 'one file', [String(SECOND_LEVEL)]: expected },
    probabilities: { [String(FIRST_INDEX)]: CONFIDENT, [String(SECOND_LEVEL)]: WRONG },
    confidence: CONFIDENT,
  }
  expect(matches(shifted, expected)).toBe(false)
}

function testGradesANoulByItsThreshold(): void {
  expect.hasAssertions()
  const yes: JevAnswer = { type: 'noul', noul: YES_PROBABILITY }
  const no: JevAnswer = { type: 'noul', noul: NO_PROBABILITY }
  expect(matches(yes, 'yes')).toBe(true)
  expect(matches(no, 'yes')).toBe(false)
}

function testAnUnansweredQuestionCountsAgainst(): void {
  expect.hasAssertions()
  const target = item('exploring')
  const answers = correctAnswers(target, CONFIDENT)
  const [firstId] = Object.keys(answers)
  if (firstId === undefined) {
    throw new TypeError('the exploring item has no questions')
  }
  const partial: Record<string, JevAnswer> = {}
  for (const [id, answer] of Object.entries(answers)) {
    if (id !== firstId) {
      partial[id] = answer
    }
  }
  const agreement = agreementOf(partial, target.expected)
  expect(agreement.checked).toBe(Object.keys(target.expected).length)
  expect(agreement.matched).toBe(agreement.checked - ONE_ANSWER)
  // The disagreement is named, so a bank's author can see which one moved.
  expect(mismatchesOf(partial, target.expected)).toStrictEqual([
    { question: firstId, expected: target.expected[firstId] ?? '', answered: 'no answer' },
  ])
}

function testAnEmptyExpectationAgreesWithNothing(): void {
  expect.hasAssertions()
  const agreement = agreementOf({}, {})
  expect(agreement.checked).toBe(NONE)
  expect(agreement.percent).toBe(NONE)
}

function testTheCurveOnlyEverCostsMore(): void {
  expect.hasAssertions()
  const curve = breakEvenOf(CORPUS, confidenceIndex(CONFIDENT), DEFAULT_ASSUMPTIONS)
  expect(curve.items).toBe(CORPUS.length)
  expect(curve.curve.length).toBeGreaterThan(NONE)
  const costs = curve.curve.map(point => point.costPercent)
  const times = curve.curve.map(point => point.timePercent)
  // Escalating more answers can only ever give back part of the saving.
  expect(costs).toStrictEqual(costs.toSorted((left, right) => right - left))
  expect(times).toStrictEqual(times.toSorted((left, right) => right - left))
  expect(costs.at(FIRST_INDEX)).toBeGreaterThan(costs.at(-LAST_INDEX) ?? NONE)
}

function testTheBreakEvenIsReadFromTheCurve(): void {
  expect.hasAssertions()
  const curve = breakEvenOf(CORPUS, confidenceIndex(CONFIDENT), DEFAULT_ASSUMPTIONS)
  const winning = curve.curve.filter(point => point.costPercent >= NONE)
  const lastWinning = winning.at(-LAST_INDEX)?.escalatePercent ?? NONE
  expect(curve.costPercent).toBe(lastWinning)
  expect(curve.decisions).toBeGreaterThan(NONE)
}

function testAConfidentRunEscalatesNothing(): void {
  expect.hasAssertions()
  const index = confidenceIndex(CONFIDENT)
  const rows = CORPUS.map(entry => buildRow(entry, DEFAULT_ASSUMPTIONS, index.get(entry.id)))
  const coding = rows.find(row => row.id === 'coding')
  // Every answer cleared the confirm floor, so the fallback keeps nothing.
  expect(coding?.escalated).toBe(NONE)
}

function testAnUnsureRunEscalatesEverything(): void {
  expect.hasAssertions()
  const index = confidenceIndex(UNSURPRISING)
  const rows = CORPUS.map(entry => buildRow(entry, DEFAULT_ASSUMPTIONS, index.get(entry.id)))
  const coding = rows.find(row => row.id === 'coding')
  const decisions = Object.keys(item('coding').questions).length
  expect(coding?.escalated).toBe(decisions)
}

function testRecommendationSkipsAShapeThatAnswersWrong(): void {
  expect.hasAssertions()
  const target = item('coding')
  const index = new Map<string, LiveMeasurement>()
  for (const entry of CORPUS) {
    const good = correctAnswers(entry, CONFIDENT)
    const bad = correctAnswers(entry, CONFIDENT)
    for (const id of Object.keys(bad)) {
      bad[id] = { type: 'noul', noul: NO_PROBABILITY }
    }
    index.set(entry.id, measurementOf(entry, bad, good))
  }
  const rows = CORPUS.map(entry => buildRow(entry, DEFAULT_ASSUMPTIONS, index.get(entry.id)))
  const report = buildReport(rows, {
    breakEven: breakEvenOf(CORPUS, index, DEFAULT_ASSUMPTIONS),
    mode: 'measured',
  })
  const best = recommended(report)
  // The bank shape is the cheapest, and wrong; the ad-hoc shape answered
  // Everything, so it is the only shape worth recommending.
  expect(target.bank).toBeDefined()
  expect(best?.id).toBe('adhoc')
  expect(best?.agreement.percent).toBe(FULL)
  expect(report.mismatches.length).toBeGreaterThan(NONE)
  expect(report.mismatches.every(miss => miss.answered === 'no')).toBe(true)
}

describe('benchmark grading and fallback', () => {
  it('grades a choice by the key it selected', { timeout: TEST_TIMEOUT }, testGradesAChoiceByItsKey)

  it('grades a score by its leading level', { timeout: TEST_TIMEOUT }, testGradesAScoreByItsLeadingLevel)

  it('grades a noul by its threshold', { timeout: TEST_TIMEOUT }, testGradesANoulByItsThreshold)

  it('counts an unanswered question against the shape', { timeout: TEST_TIMEOUT }, testAnUnansweredQuestionCountsAgainst)

  it('reads an empty expectation as no agreement', { timeout: TEST_TIMEOUT }, testAnEmptyExpectationAgreesWithNothing)

  it('never lets more fallback cost less', { timeout: TEST_TIMEOUT }, testTheCurveOnlyEverCostsMore)

  it('reads the break-even off the curve', { timeout: TEST_TIMEOUT }, testTheBreakEvenIsReadFromTheCurve)

  it('escalates nothing when every answer is confident', { timeout: TEST_TIMEOUT }, testAConfidentRunEscalatesNothing)

  it('escalates everything when no answer is confident', { timeout: TEST_TIMEOUT }, testAnUnsureRunEscalatesEverything)

  it('will not recommend a shape that answers wrong', { timeout: TEST_TIMEOUT }, testRecommendationSkipsAShapeThatAnswersWrong)

})
