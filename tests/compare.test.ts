/**
 * Composite-scoring engine tests.
 *
 * `jev_compare` ranks in code rather than in a prompt, so the ranking is
 * arithmetic and can be pinned exactly: the fan-out's question map, the default
 * and overriding weights, the normalisation onto 0–1, and the ordering. The
 * answers are supplied directly, so nothing here touches a network.
 */
import { describe, expect, it } from 'vitest'

import {
  buildCompareQuestions,
  parseWeights,
  rankCandidates,
  summaryOf,
  winnerOf,
} from '#src/jev/composite'
import type { ComparePlan } from '#src/jev/composite'
import type { JevAnswer, JevEvaluation } from '#src/jev/contracts'

const TEST_TIMEOUT = 5000
const FIRST_INDEX = 0
const QUESTION_COUNT = 4
const DEFAULT_WEIGHT = 1
const CAUSE_WEIGHT = 3
const UNKNOWN_WEIGHT = 5
const ZERO_SCORE = 0
const HALF_SCORE = 1
const FULL_SCORE = 2
const EQUAL_WEIGHT_ALPHA = 0.75
const CONFIDENCE = 0.9
const INPUT_TOKENS = 10
const OUTPUT_TOKENS = 2

/** Two candidates, so a ranking has something to order. */
const CANDIDATES = [
  { id: 'alpha', text: 'Alpha writes the row' },
  { id: 'beta', text: 'Beta schedules the write' },
]

/** Two dimensions with a three-point scale each. */
const DIMENSIONS = [
  { id: 'cause', instructions: 'How likely is this the cause?', levels: ['No', 'Maybe', 'Yes'] },
  { id: 'cost', instructions: 'How cheap is a fix here?', levels: ['Dear', 'Fair', 'Cheap'] },
]

/** The cause dimension's ordered levels, reused in the fan-out assertion. */
const CAUSE_LEVELS = ['No', 'Maybe', 'Yes']

/** Weights used when a case does not override them: every dimension weighs one. */
const DEFAULT_WEIGHTS = { cause: DEFAULT_WEIGHT, cost: DEFAULT_WEIGHT }

/**
 * Build a plan with the supplied weights.
 *
 * @param weights - One weight per dimension id.
 * @returns The plan the engine ranks with.
 */
function planWith(weights: Record<string, number> = DEFAULT_WEIGHTS): ComparePlan {
  return { candidates: CANDIDATES, dimensions: DIMENSIONS, weights }
}

/**
 * Build an evaluation carrying one Score answer per supplied id.
 *
 * @param scores - Score value per answer id.
 * @returns An evaluation shaped like a real response.
 */
function evaluationWith(scores: Record<string, number>): JevEvaluation {
  const answers: Record<string, JevAnswer> = {}
  for (const [id, score] of Object.entries(scores)) {
    answers[id] = {
      type: 'score',
      score,
      legend: {},
      probabilities: {},
      confidence: CONFIDENCE,
    }
  }
  return {
    model: 'jev-test',
    answers,
    usage: { input_tokens: INPUT_TOKENS, output_tokens: OUTPUT_TOKENS },
  }
}

/** Every candidate is scored on every dimension, keyed candidate by dimension. */
function testBuildsTheFanOut(): void {
  expect.hasAssertions()
  const questions = buildCompareQuestions(planWith())
  expect(Object.keys(questions)).toHaveLength(QUESTION_COUNT)
  expect(questions['alpha::cause']).toMatchObject({
    type: 'score',
    criteria: CAUSE_LEVELS,
  })
}

/** Unlisted dimensions weigh one; unknown ids and non-numbers are ignored. */
function testWeightsDefaultAndOverride(): void {
  expect.hasAssertions()
  expect(parseWeights(undefined, DIMENSIONS)).toStrictEqual({
    cause: DEFAULT_WEIGHT,
    cost: DEFAULT_WEIGHT,
  })
  expect(
    parseWeights({ cause: CAUSE_WEIGHT, nope: UNKNOWN_WEIGHT, cost: 'x' }, DIMENSIONS),
  ).toStrictEqual({ cause: CAUSE_WEIGHT, cost: DEFAULT_WEIGHT })
}

/** Scores normalise onto 0–1 and the highest weighted mean wins. */
function testRanksByWeightedComposite(): void {
  expect.hasAssertions()
  const ranking = rankCandidates(
    evaluationWith({
      'alpha::cause': HALF_SCORE,
      'alpha::cost': FULL_SCORE,
      'beta::cause': FULL_SCORE,
      'beta::cost': ZERO_SCORE,
    }),
    planWith(),
  )
  expect(ranking[FIRST_INDEX]).toMatchObject({ id: 'alpha', composite: EQUAL_WEIGHT_ALPHA })
  expect(winnerOf(ranking)).toBe('alpha')
}

/** A heavier cause dimension reorders the same scores. */
function testWeightsCanChangeTheRanking(): void {
  expect.hasAssertions()
  const weighted = planWith({ cause: CAUSE_WEIGHT, cost: DEFAULT_WEIGHT })
  const ranking = rankCandidates(
    evaluationWith({
      'alpha::cause': HALF_SCORE,
      'alpha::cost': FULL_SCORE,
      'beta::cause': FULL_SCORE,
      'beta::cost': ZERO_SCORE,
    }),
    weighted,
  )
  expect(winnerOf(ranking)).toBe('beta')
  expect(summaryOf(weighted, ranking)).toContain('beta')
}

/** A missing Score answer fails loudly rather than ranking a hole. */
function testMissingScoreAnswerFails(): void {
  expect.hasAssertions()
  const evaluation = evaluationWith({ 'alpha::cause': HALF_SCORE })
  expect(() => rankCandidates(evaluation, planWith())).toThrow(/score/u)
}

describe('composite scoring', () => {
  it('fans out one question per candidate per dimension', { timeout: TEST_TIMEOUT }, testBuildsTheFanOut)

  it('defaults unlisted weights and ignores malformed ones', { timeout: TEST_TIMEOUT }, testWeightsDefaultAndOverride)

  it('ranks candidates by weighted composite', { timeout: TEST_TIMEOUT }, testRanksByWeightedComposite)

  it('lets a heavier dimension change the ranking', { timeout: TEST_TIMEOUT }, testWeightsCanChangeTheRanking)

  it('fails when a score answer is missing', { timeout: TEST_TIMEOUT }, testMissingScoreAnswerFails)
})
