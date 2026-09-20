/**
 * Confidence-gated routing over Jev answers.
 *
 * TypeSafe returns a decision and, for Choice and Score, a confidence that says
 * how much the probability mass agreed. Those are two different axes: the
 * answer says *what*, the confidence says *whether to act*. This module turns
 * the pair into one of three actions, so every caller applies the same rule
 * instead of inventing its own threshold.
 *
 * @module dsh-plugin-jev/jev/routing
 */

import type { JevAnswer } from './contracts.ts'

/** What the caller should do with an answer. */
type JevRoute = 'act' | 'verify' | 'escalate'

/** How costly it is to act on a wrong answer. */
type JevRisk = 'low' | 'high'

/** The two thresholds that separate the three routes. */
interface JevRoutingPolicy {
  /** Below this, the answer is not trusted at all. */
  confidenceFloor: number
  /** At or above this, even a high-risk answer may act unreviewed. */
  confirmFloor: number
}

/** Probability at or above which a Noul answer reads as "yes". */
const NOUL_YES_THRESHOLD = 0.5

/** Sum of a probability and its complement, used to mirror a Noul value. */
const COMPLEMENT = 1

/** Rank of `act` when comparing routes for strictness. */
const SEVERITY_ACT = 0

/** Rank of `verify` when comparing routes for strictness. */
const SEVERITY_VERIFY = 1

/** Rank of `escalate` when comparing routes for strictness. */
const SEVERITY_ESCALATE = 2

/** Decimal places a summary keeps on a probability-like value. */
const SUMMARY_DIGITS = 2

/** Strictness ordering over the three routes. */
const ROUTE_SEVERITY: Record<JevRoute, number> = {
  act: SEVERITY_ACT,
  verify: SEVERITY_VERIFY,
  escalate: SEVERITY_ESCALATE,
}

/**
 * Choose an action from an answer's confidence and the caller's risk.
 *
 * @param confidence - Confidence reported with the answer.
 * @param policy - Configured thresholds.
 * @param risk - Cost of acting on a wrong answer.
 * @returns The action to take.
 */
function routeFromConfidence(
  confidence: number,
  policy: JevRoutingPolicy,
  risk: JevRisk = 'low',
): JevRoute {
  if (confidence < policy.confidenceFloor) {
    return 'escalate'
  }
  if (risk === 'high' && confidence < policy.confirmFloor) {
    return 'verify'
  }
  return 'act'
}

/**
 * Reduce several routes to the strictest one.
 *
 * A question bank asks several independent questions about one state, and each
 * answer carries its own route. The caller needs one action, and the safe
 * reduction is the most cautious of them: a reasoning pass that is confident
 * about four dimensions and unsure about a fifth is not confident overall.
 *
 * @param routes - Routes to reduce; an empty list reads as `act`.
 * @returns The strictest route present.
 */
function strictestRoute(routes: readonly JevRoute[]): JevRoute {
  let strictest: JevRoute = 'act'
  for (const route of routes) {
    if (ROUTE_SEVERITY[route] > ROUTE_SEVERITY[strictest]) {
      strictest = route
    }
  }
  return strictest
}

/**
 * Read the confidence of an answer, when the primitive reports one.
 *
 * Noul deliberately carries no confidence: its probability is already the
 * signal, so a caller thresholds on the value itself rather than on a
 * derived statistic.
 *
 * @param answer - One answer from an evaluation.
 * @returns Confidence from 0 to 1, or `undefined` for a Noul answer.
 */
function answerConfidence(answer: JevAnswer): number | undefined {
  if (answer.type === 'noul') {
    return undefined
  }
  return answer.confidence
}

/**
 * Read a single confidence for any answer, including Noul.
 *
 * Choice and Score report a confidence directly. Noul deliberately does not:
 * its probability is the signal. To let one routing rule cover all three, the
 * distance of a Noul probability from an even split is used as a derived
 * statistic, so a confident yes and a confident no both read as confident
 * rather than as opposite ends of one axis.
 *
 * @param answer - One answer from an evaluation.
 * @returns A confidence-like value from 0.5 to 1.
 */
function effectiveConfidence(answer: JevAnswer): number {
  if (answer.type === 'noul') {
    const { noul } = answer
    return Math.max(noul, COMPLEMENT - noul)
  }
  return answer.confidence
}

/**
 * Read a Noul answer as a boolean.
 *
 * @param answer - One answer from an evaluation.
 * @param threshold - Probability at or above which the answer is yes.
 * @returns Whether the statement holds, or `undefined` for a non-Noul answer.
 */
function noulVerdict(
  answer: JevAnswer,
  threshold: number = NOUL_YES_THRESHOLD,
): boolean | undefined {
  if (answer.type !== 'noul') {
    return undefined
  }
  return answer.noul >= threshold
}

/**
 * Render one answer as a single compact line.
 *
 * The renderer is deliberately small: its output is what the calling model
 * reads, so every extra character here is a character the token budget pays
 * for twice — once as tool output and once as context on the next turn.
 *
 * @param id - Question id the answer came back under.
 * @param answer - The answer to describe.
 * @returns A one-line summary naming the value and its confidence.
 */
function describeAnswer(id: string, answer: JevAnswer): string {
  if (answer.type === 'noul') {
    return `${id}: noul=${answer.noul.toFixed(SUMMARY_DIGITS)}`
  }
  if (answer.type === 'choice') {
    return (
      `${id}: choice=${answer.choice} `
      + `(confidence ${answer.confidence.toFixed(SUMMARY_DIGITS)})`
    )
  }
  return (
    `${id}: score=${answer.score.toFixed(SUMMARY_DIGITS)} `
    + `(confidence ${answer.confidence.toFixed(SUMMARY_DIGITS)})`
  )
}

export {
  NOUL_YES_THRESHOLD,
  SUMMARY_DIGITS,
  answerConfidence,
  describeAnswer,
  effectiveConfidence,
  noulVerdict,
  routeFromConfidence,
  strictestRoute,
  type JevRisk,
  type JevRoute,
  type JevRoutingPolicy,
}

