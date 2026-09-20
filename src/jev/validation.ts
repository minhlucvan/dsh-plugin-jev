/**
 * Pre-flight validation: cheaper than a billed rejection.
 *
 * Everything here runs before a request leaves the process. TypeSafe would
 * reject each of these anyway, but a rejection costs a round trip and, for the
 * state limit, risks silently truncating the evidence a judgement was supposed
 * to rest on. Catching them locally turns a wasted call into an immediate,
 * specific message.
 *
 * @module dsh-plugin-jev/jev/validation
 */

import type { JevJson, JevQuestion } from './contracts.ts'
import { JevRequestError } from './errors.ts'

/** Maximum options Jev accepts in one Choice question. */
const MAX_CHOICE_OPTIONS = 255

/** Minimum ordered levels Jev accepts in one Score question. */
const MIN_SCORE_LEVELS = 2

/** Maximum ordered levels Jev accepts in one Score question. */
const MAX_SCORE_LEVELS = 10

/** Minimum questions a request must carry to be worth sending. */
const MIN_QUESTIONS = 1

/**
 * Measure a state and refuse one that exceeds the configured limit.
 *
 * @param state - Content to evaluate.
 * @param maxChars - Configured ceiling.
 * @returns The serialized character count.
 * @throws {JevRequestError} When the state is larger than the ceiling.
 */
function measureState(state: JevJson, maxChars: number): number {
  let serialized = JSON.stringify(state)
  if (typeof state === 'string') {
    serialized = state
  }
  if (serialized.length > maxChars) {
    throw new JevRequestError(
      `state is ${serialized.length} characters, above the configured maxStateChars of ${maxChars}`,
      { code: 'invalid-request', retryable: false },
    )
  }
  return serialized.length
}

/**
 * Refuse one question Jev would reject, before it is billed.
 *
 * @param id - Answer id the question was filed under.
 * @param question - Question about to be sent.
 * @throws {JevRequestError} When the question is malformed.
 */
function assertQuestion(id: string, question: JevQuestion): void {
  if (question.type === 'choice') {
    const options = Object.keys(question.criteria).length
    if (options < MIN_SCORE_LEVELS || options > MAX_CHOICE_OPTIONS) {
      throw new JevRequestError(
        `choice question "${id}" has ${String(options)} options; Jev accepts ${String(MIN_SCORE_LEVELS)} to ${String(MAX_CHOICE_OPTIONS)}`,
        { code: 'invalid-request', retryable: false },
      )
    }
  }
  if (question.type === 'score') {
    const levels = question.criteria.length
    if (levels < MIN_SCORE_LEVELS || levels > MAX_SCORE_LEVELS) {
      throw new JevRequestError(
        `score question "${id}" has ${String(levels)} levels; Jev accepts ${String(MIN_SCORE_LEVELS)} to ${String(MAX_SCORE_LEVELS)}`,
        { code: 'invalid-request', retryable: false },
      )
    }
  }
}

/**
 * Refuse a question set Jev would reject, before it is billed.
 *
 * @param questions - Questions about to be sent.
 * @throws {JevRequestError} When the set is empty or a question is malformed.
 */
function assertQuestions(questions: Record<string, JevQuestion>): void {
  const ids = Object.keys(questions)
  if (ids.length < MIN_QUESTIONS) {
    throw new JevRequestError('a request needs at least one question', {
      code: 'invalid-request',
      retryable: false,
    })
  }
  for (const id of ids) {
    const question = questions[id]
    if (question !== undefined) {
      assertQuestion(id, question)
    }
  }
}

export {
  MAX_CHOICE_OPTIONS,
  MAX_SCORE_LEVELS,
  MIN_QUESTIONS,
  MIN_SCORE_LEVELS,
  assertQuestion,
  assertQuestions,
  measureState,
}

