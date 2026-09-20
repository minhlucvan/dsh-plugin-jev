/**
 * Core library tests.
 *
 * These cover the parts of the package that have no host dependency: the wire
 * contracts, the usage ledger and its accounting identity, the confidence
 * routing rule, and the shipped question banks. They are the layers every other
 * suite builds on, so a regression here would show up everywhere and be hard to
 * attribute.
 */
import { describe, expect, it } from 'vitest'

import { BANKS, BANK_IDS, getBank } from '#src/jev/catalog'
import { isJevAnswer, isJevEvaluation } from '#src/jev/contracts'
import type { JevQuestion } from '#src/jev/contracts'
import type { JevUsageEntry } from '#src/jev/ledger'
import { createUsageLedger } from '#src/jev/ledger'
import {
  effectiveConfidence,
  noulVerdict,
  routeFromConfidence,
  strictestRoute,
} from '#src/jev/routing'

const TEST_TIMEOUT = 5000
const FIRST_INDEX = 0
const ONE = 1
const LEDGER_LIMIT = 2
const TOKENS_A = 100
const TOKENS_B = 50
const TOKENS_C = 25
const QUESTIONS = 3
const STATE_CHARS = 40
const DURATION_MS = 12
const FLOOR = 0.5
const CONFIRM = 0.85
const BELOW_FLOOR = 0.4
const BETWEEN = 0.7
const ABOVE_CONFIRM = 0.95
const NOUL_YES = 0.95
const NOUL_NO = 0.05
const NOUL_EVEN = 0.5
const MAX_SCORE_LEVELS = 10
const MIN_SCORE_LEVELS = 2
const MIN_CHOICE_OPTIONS = 2
const NEGATIVE_TOKENS = -1

/** A response body that satisfies the evaluation contract. */
const GOOD_BODY = {
  model: 'jev-1.13.0',
  answers: {
    route: { type: 'choice', choice: 'billing', probabilities: { billing: 1 }, confidence: 0.9 },
    level: { type: 'score', score: 1.2, legend: { '1': 'mid' }, probabilities: { '1': 1 }, confidence: 0.8 },
    flag: { type: 'noul', noul: NOUL_YES },
  },
  usage: { input_tokens: TOKENS_A, output_tokens: TOKENS_B },
}

/** Stable clock value for recorded entries. */
const ZERO_TIME = 0

/**
 * Build one ledger entry.
 *
 * @param inputTokens - Billed tokens to record.
 * @returns The entry.
 */
function entry(inputTokens: number): JevUsageEntry {
  return {
    at: ZERO_TIME,
    tool: 'jev_ask',
    model: 'jev-1.13.0',
    questions: QUESTIONS,
    stateChars: STATE_CHARS,
    inputTokens,
    outputTokens: TOKENS_B,
    durationMs: DURATION_MS,
  }
}

function testContractsAcceptGoodBody(): void {
  expect.hasAssertions()
  expect(isJevEvaluation(GOOD_BODY)).toBe(true)
  expect(isJevAnswer({ type: 'noul', noul: NOUL_NO })).toBe(true)
}

function testContractsRejectBadBodies(): void {
  expect.hasAssertions()
  expect(isJevEvaluation({ model: 'x', answers: {}, usage: { input_tokens: 1 } })).toBe(false)
  expect(isJevEvaluation({ model: 'x', answers: { answer: { type: 'weird' } }, usage: { input_tokens: 1, output_tokens: 1 } })).toBe(false)
  expect(isJevAnswer({ type: 'choice', choice: 4 })).toBe(false)
}

function testLedgerAccumulatesAndEvicts(): void {
  expect.hasAssertions()
  const ledger = createUsageLedger(LEDGER_LIMIT)
  ledger.record(entry(TOKENS_A))
  ledger.record(entry(TOKENS_B))
  ledger.record(entry(TOKENS_C))

  expect(ledger.recent()).toHaveLength(LEDGER_LIMIT)
  expect(ledger.totals().calls).toBe(LEDGER_LIMIT + ONE)
  expect(ledger.totals().inputTokens).toBe(TOKENS_A + TOKENS_B + TOKENS_C)
  expect(ledger.verify()).toBeUndefined()
}

function testLedgerReportsAnUnsoundEntry(): void {
  expect.hasAssertions()
  const ledger = createUsageLedger(LEDGER_LIMIT)
  ledger.record(entry(NEGATIVE_TOKENS))
  const problem = ledger.verify()
  expect(problem).toBeDefined()
  expect(problem).toContain('negative')
}

function testLedgerResets(): void {
  expect.hasAssertions()
  const ledger = createUsageLedger(LEDGER_LIMIT)
  ledger.record(entry(TOKENS_A))
  ledger.reset()
  expect(ledger.totals().calls).toBe(FIRST_INDEX)
  expect(ledger.recent()).toHaveLength(FIRST_INDEX)
  expect(ledger.verify()).toBeUndefined()
}

function testRoutingThresholds(): void {
  expect.hasAssertions()
  const policy = { confidenceFloor: FLOOR, confirmFloor: CONFIRM }
  expect(routeFromConfidence(BELOW_FLOOR, policy)).toBe('escalate')
  expect(routeFromConfidence(ABOVE_CONFIRM, policy, 'high')).toBe('act')
  expect(routeFromConfidence(BETWEEN, policy, 'high')).toBe('verify')
}

function testRoutingReducesToTheStrictest(): void {
  expect.hasAssertions()
  expect(strictestRoute(['act', 'verify', 'act'])).toBe('verify')
  expect(strictestRoute(['verify', 'escalate'])).toBe('escalate')
  expect(strictestRoute([])).toBe('act')
}

function testNoulCarriesNoConfidenceOfItsOwn(): void {
  expect.hasAssertions()
  const yes = { type: 'noul' as const, noul: NOUL_YES }
  expect(effectiveConfidence(yes)).toBeCloseTo(NOUL_YES)
  expect(effectiveConfidence({ type: 'noul', noul: NOUL_EVEN })).toBeCloseTo(FLOOR)
  expect(noulVerdict(yes)).toBe(true)
  expect(noulVerdict({ type: 'noul', noul: NOUL_NO })).toBe(false)
}

/**
 * Assert that every question in a bank has a shape Jev will accept.
 *
 * @param questions - Question map to inspect.
 */
function assertQuestionShape(questions: Record<string, JevQuestion>): void {
  for (const question of Object.values(questions)) {
    if (question.type === 'score') {
      const levels = question.criteria
      if (!Array.isArray(levels)) {
        throw new TypeError('a score question has no level array')
      }
      expect(levels.length).toBeGreaterThanOrEqual(MIN_SCORE_LEVELS)
      expect(levels.length).toBeLessThanOrEqual(MAX_SCORE_LEVELS)
    }
    if (question.type === 'choice') {
      expect(Object.keys(question.criteria).length).toBeGreaterThanOrEqual(MIN_CHOICE_OPTIONS)
    }
  }
}

function testBanksAreWellFormed(): void {
  expect.hasAssertions()
  expect(new Set(BANK_IDS).size).toBe(BANKS.length)
  for (const bank of BANKS) {
    expect(Object.keys(bank.questions).length).toBeGreaterThan(FIRST_INDEX)
    assertQuestionShape(bank.questions)
  }
}

function testLookupFindsABank(): void {
  expect.hasAssertions()
  expect(getBank('reasoning')?.id).toBe('reasoning')
  expect(getBank('nope')).toBeUndefined()
  expect(routeFromConfidence(ABOVE_CONFIRM, { confidenceFloor: FLOOR, confirmFloor: CONFIRM })).toBe('act')
}

describe('jev core', () => {
  it('accepts a conforming evaluation body', { timeout: TEST_TIMEOUT }, testContractsAcceptGoodBody)

  it('rejects malformed evaluation bodies', { timeout: TEST_TIMEOUT }, testContractsRejectBadBodies)

  it('accumulates totals while evicting the ring', { timeout: TEST_TIMEOUT }, testLedgerAccumulatesAndEvicts)

  it('reports an unsound ledger entry', { timeout: TEST_TIMEOUT }, testLedgerReportsAnUnsoundEntry)

  it('resets counters and ring together', { timeout: TEST_TIMEOUT }, testLedgerResets)

  it('applies the configured confidence thresholds', { timeout: TEST_TIMEOUT }, testRoutingThresholds)

  it('reduces several routes to the strictest', { timeout: TEST_TIMEOUT }, testRoutingReducesToTheStrictest)

  it('derives a confidence for Noul answers', { timeout: TEST_TIMEOUT }, testNoulCarriesNoConfidenceOfItsOwn)

  it('ships well-formed question banks', { timeout: TEST_TIMEOUT }, testBanksAreWellFormed)

  it('looks a bank up by id', { timeout: TEST_TIMEOUT }, testLookupFindsABank)
})

