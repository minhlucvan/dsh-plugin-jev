/**
 * Answer grading for the benchmark.
 *
 * Cost alone cannot rank integration shapes: the cheapest shape is worthless if
 * it answers the wrong question. Every live evaluation is therefore graded
 * against the answer a careful reader reaches, which the corpus already carries
 * as `expected` — the same datum the baseline arm's reference reasoning was
 * written from.
 *
 * Grading is type-aware because the three primitives answer differently. A
 * Choice answers with an option key, a Score with a distribution over ordered
 * levels, and a Noul with a probability. Comparing any of those to the expected
 * string requires the primitive's own reading rule, and using the package's
 * routing helpers keeps that rule in one place.
 *
 * @module dsh-plugin-jev/benchmark/quality
 */

import type { JevAnswer, JevScoreAnswer } from '#src/jev/contracts'
import { NOUL_YES_THRESHOLD } from '#src/jev/routing'

/** How one arm's answers scored against the corpus's expected answers. */
interface Agreement {
  /** Answers that were graded. */
  checked: number
  /** Answers that matched the expected answer. */
  matched: number
  /** Matched share, as a percentage. */
  percent: number
}

/** Scale factor converting a fraction to a percentage. */
const PERCENT_SCALE = 100

/** Probability a level may fall below and still be the leading level. */
const NO_LEADING_LEVEL = -1

/** Count of nothing, which is where every accumulator starts. */
const NO_ANSWERS = 0

/** One answer, the increment a match applies. */
const ONE_ANSWER = 1

/** Nothing graded, which is the honest reading of "no answers yet". */
const NOTHING_GRADED: Agreement = {
  checked: NO_ANSWERS,
  matched: NO_ANSWERS,
  percent: NO_ANSWERS,
}

/** The word a Noul answer reads as when it clears the yes threshold. */
const YES = 'yes'

/** The word a Noul answer reads as otherwise. */
const NO = 'no'

/**
 * Fold one answer into a comparable string.
 *
 * @param value - Text to fold.
 * @returns The text, trimmed, lower-cased, and with runs of whitespace collapsed.
 */
function fold(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/gu, ' ')
}

/**
 * Read the level a Score answer landed on.
 *
 * The probability mass is the answer: the level the model placed most of its
 * weight on is the decision, and the weighted mean is the position it was
 * pulled towards. Grading the leading level is what lets a Score answer be
 * compared with the corpus's expected label at all.
 *
 * @param answer - The Score answer.
 * @returns The leading level's description, or undefined for an empty legend.
 */
function leadingLevel(answer: JevScoreAnswer): string | undefined {
  let best: string | undefined = undefined
  let bestProbability = NO_LEADING_LEVEL
  for (const [level, probability] of Object.entries(answer.probabilities)) {
    if (probability > bestProbability) {
      bestProbability = probability
      best = answer.legend[level]
    }
  }
  return best
}

/**
 * Read one answer as the string it decided.
 *
 * @param answer - The answer to read.
 * @returns The decision as text, or undefined when it carries no comparable value.
 */
function decisionOf(answer: JevAnswer): string | undefined {
  if (answer.type === 'choice') {
    return answer.choice
  }
  if (answer.type === 'score') {
    return leadingLevel(answer)
  }
  if (answer.noul >= NOUL_YES_THRESHOLD) {
    return YES
  }
  return NO
}

/**
 * Grade one answer against the expected one.
 *
 * @param answer - Answer Jev returned.
 * @param expected - Answer a careful reader reaches.
 * @returns True when the two agree once folded.
 */
function matches(answer: JevAnswer, expected: string): boolean {
  const decision = decisionOf(answer)
  if (decision === undefined) {
    return false
  }
  return fold(decision) === fold(expected)
}

/**
 * Grade a whole evaluation.
 *
 * Questions the corpus names but Jev did not answer count as checked and
 * unmatched, so a shape that silently drops a question cannot look accurate by
 * answering only the easy ones.
 *
 * @param answers - Answers returned for the item.
 * @param expected - Expected answer per question id.
 * @returns The agreement, or an empty one when nothing was expected.
 */
function agreementOf(
  answers: Record<string, JevAnswer>,
  expected: Record<string, string>,
): Agreement {
  const ids = Object.keys(expected)
  if (ids.length === NO_ANSWERS) {
    return { ...NOTHING_GRADED }
  }
  let matched = NO_ANSWERS
  for (const id of ids) {
    const answer = answers[id]
    if (answer !== undefined && matches(answer, expected[id] ?? '')) {
      matched += ONE_ANSWER
    }
  }
  return {
    checked: ids.length,
    matched,
    percent: (matched / ids.length) * PERCENT_SCALE,
  }
}

/** Reported when a shape returned nothing for a question. */
const NO_ANSWER = 'no answer'

/** One decision a shape got wrong, in the terms a reader can check. */
interface Mismatch {
  /** Question id. */
  question: string
  /** Answer the corpus says a careful reader reaches. */
  expected: string
  /** Answer the shape produced. */
  answered: string
}

/**
 * List the decisions one set of answers got wrong.
 *
 * The counts in the report say how often a shape disagrees with a careful
 * reader; this says where, which is what a bank's author needs in order to
 * decide whether the taxonomy or the reading is at fault.
 *
 * @param answers - Answers the shape returned.
 * @param expected - Expected answer per question id.
 * @returns One entry per disagreement, in question order.
 */
function mismatchesOf(
  answers: Record<string, JevAnswer>,
  expected: Record<string, string>,
): Mismatch[] {
  const found: Mismatch[] = []
  for (const [id, want] of Object.entries(expected)) {
    const answer = answers[id]
    let answered = NO_ANSWER
    let agreed = false
    if (answer !== undefined) {
      answered = decisionOf(answer) ?? NO_ANSWER
      agreed = matches(answer, want)
    }
    if (!agreed) {
      found.push({ question: id, expected: want, answered })
    }
  }
  return found
}

/**
 * Add two agreements.
 *
 * @param left - First agreement.
 * @param right - Second agreement.
 * @returns The sum, with the percentage recomputed from the totals.
 */
function addAgreement(left: Agreement, right: Agreement): Agreement {
  const checked = left.checked + right.checked
  const matched = left.matched + right.matched
  if (checked === NO_ANSWERS) {
    return { ...NOTHING_GRADED }
  }
  return { checked, matched, percent: (matched / checked) * PERCENT_SCALE }
}

export {
  NOTHING_GRADED,
  addAgreement,
  agreementOf,
  decisionOf,
  fold,
  leadingLevel,
  matches,
  mismatchesOf,
  type Agreement,
  type Mismatch,
}
