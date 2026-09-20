/**
 * The composite-scoring engine behind `jev_compare`.
 *
 * TypeSafe's composite-scoring pattern asks one narrow Score question per
 * candidate per dimension and evaluates all of them in parallel against one
 * state. The engine's two jobs live here: building that fan-out, and combining
 * the answers arithmetically instead of asking a model to weigh several factors
 * at once. Keeping the arithmetic out of the tool file is what makes the
 * ranking testable on its own.
 *
 * @module dsh-plugin-jev/jev/tools/composite
 */

import { isRecord } from './contracts.ts'
import type { JevEvaluation, JevJson, JevQuestion } from './contracts.ts'
import { SUMMARY_DIGITS } from './routing.ts'
import { requireScoreAnswer } from './tool-support.ts'

/** Separator between a candidate id and a dimension id in a question key. */
const KEY_SEPARATOR = '::'

/** Weight assumed for a dimension the caller did not weigh. */
const DEFAULT_WEIGHT = 1

/** Count that means "none", used for absent totals and malformed entries. */
const NONE = 0

/** Index of the first entry in an ordered list. */
const FIRST_INDEX = 0

/** Offset from a level count to the widest score that scale can return. */
const LEVEL_SPAN_OFFSET = 1

/** One candidate to rank. */
interface CompareCandidate {
  /** Stable id the ranking reports. */
  id: string
  /** The text the dimensions are scored against. */
  text: string
}

/** One dimension every candidate is scored on. */
interface CompareDimension {
  /** Stable id the ranking reports. */
  id: string
  /** What to judge, as one narrow question. */
  instructions: string
  /** Ordered level descriptions, lowest first. */
  levels: string[]
}

/** Parsed arguments plus the weights the ranking combines them with. */
interface ComparePlan {
  /** Candidates to rank. */
  candidates: readonly CompareCandidate[]
  /** Dimensions each candidate is scored on. */
  dimensions: readonly CompareDimension[]
  /** One weight per dimension id. */
  weights: Record<string, number>
}

/**
 * Read the caller's per-dimension weights.
 *
 * Unlisted dimensions weigh {@link DEFAULT_WEIGHT}, so a heavier dimension is
 * expressed as a larger number rather than by repeating it.
 *
 * @param value - Raw `weights` argument.
 * @param dimensions - The dimensions being scored.
 * @returns One weight per dimension id.
 */
function parseWeights(
  value: unknown,
  dimensions: readonly CompareDimension[],
): Record<string, number> {
  const weights: Record<string, number> = {}
  for (const dimension of dimensions) {
    weights[dimension.id] = DEFAULT_WEIGHT
  }
  if (!isRecord(value)) {
    return weights
  }
  for (const [id, weight] of Object.entries(value)) {
    if (id in weights && typeof weight === 'number' && Number.isFinite(weight)) {
      weights[id] = weight
    }
  }
  return weights
}

/**
 * Build the question map one comparison fans out to.
 *
 * Every question is scored against the whole state rather than against its own
 * candidate alone, so the model can still judge a candidate relative to the
 * others — which is what makes a ranking meaningful rather than a set of
 * unrelated scores.
 *
 * @param plan - Parsed candidates, dimensions and weights.
 * @returns The question map, keyed `candidate::dimension`.
 */
function buildCompareQuestions(plan: ComparePlan): Record<string, JevQuestion> {
  const questions: Record<string, JevQuestion> = {}
  for (const candidate of plan.candidates) {
    const others: string[] = []
    for (const other of plan.candidates) {
      if (other.id !== candidate.id) {
        others.push(other.text)
      }
    }
    for (const dimension of plan.dimensions) {
      questions[`${candidate.id}${KEY_SEPARATOR}${dimension.id}`] = {
        type: 'score',
        instructions: {
          candidate: candidate.text,
          others,
          question:
            `Scored against the state, ${dimension.instructions} Judge only the candidate `
            + 'named in `candidate`, using `others` for contrast.',
        },
        criteria: dimension.levels,
      }
    }
  }
  return questions
}

/**
 * Widest score a dimension's scale can return.
 *
 * @param dimension - Dimension being scored.
 * @returns The number of steps between the lowest and highest level.
 */
function levelSpan(dimension: CompareDimension): number {
  return dimension.levels.length - LEVEL_SPAN_OFFSET
}

/**
 * Average a weighted total, tolerating a dimension set that weighs nothing.
 *
 * @param total - Sum of weighted, normalized scores.
 * @param weight - Sum of the weights applied.
 * @returns The weighted mean, or the raw total when every weight is zero.
 */
function average(total: number, weight: number): number {
  if (weight === NONE) {
    return total
  }
  return total / weight
}

/**
 * Score one candidate on every dimension and combine the results.
 *
 * @param plan - Parsed candidates, dimensions and weights.
 * @param candidate - Candidate to score.
 * @param evaluation - The response to read scores from.
 * @returns The candidate's composite score and its per-dimension parts.
 */
function compositeOf(
  plan: ComparePlan,
  candidate: CompareCandidate,
  evaluation: JevEvaluation,
): JevJson {
  let weightedTotal = 0
  let totalWeight = 0
  const scores: Record<string, JevJson> = {}
  for (const dimension of plan.dimensions) {
    const key = `${candidate.id}${KEY_SEPARATOR}${dimension.id}`
    const answer = requireScoreAnswer(evaluation, key)
    const weight = plan.weights[dimension.id] ?? DEFAULT_WEIGHT
    const normalized = answer.score / levelSpan(dimension)
    weightedTotal += normalized * weight
    totalWeight += weight
    scores[dimension.id] = {
      score: answer.score,
      normalized,
      confidence: answer.confidence,
    }
  }
  return { id: candidate.id, composite: average(weightedTotal, totalWeight), scores }
}

/**
 * Read a composite score back off a ranking entry.
 *
 * @param entry - One entry of the ranking.
 * @returns The composite score, or zero when the entry is malformed.
 */
function compositeValue(entry: JevJson): number {
  if (!isRecord(entry)) {
    return NONE
  }
  const { composite } = entry
  if (typeof composite !== 'number') {
    return NONE
  }
  return composite
}

/**
 * Rank every candidate, highest composite first.
 *
 * @param evaluation - The response to read scores from.
 * @param plan - Parsed candidates, dimensions and weights.
 * @returns One entry per candidate, best first.
 */
function rankCandidates(evaluation: JevEvaluation, plan: ComparePlan): JevJson[] {
  const ranking = plan.candidates.map(
    (candidate): JevJson => compositeOf(plan, candidate, evaluation),
  )
  ranking.sort((left, right): number => compositeValue(right) - compositeValue(left))
  return ranking
}

/**
 * Read the id of the highest-ranked candidate.
 *
 * @param ranking - Ranking produced by {@link rankCandidates}.
 * @returns The winner's id, or an empty string when the ranking is empty.
 */
function winnerOf(ranking: readonly JevJson[]): string {
  const best = ranking.at(FIRST_INDEX)
  if (best === undefined || !isRecord(best)) {
    return ''
  }
  const { id } = best
  if (typeof id !== 'string') {
    return ''
  }
  return id
}

/**
 * Describe one comparison in a single line.
 *
 * @param plan - Parsed candidates, dimensions and weights.
 * @param ranking - Ranking produced by {@link rankCandidates}.
 * @returns The model-facing summary.
 */
function summaryOf(plan: ComparePlan, ranking: readonly JevJson[]): string {
  const best = ranking.at(FIRST_INDEX)
  let composite = NONE
  if (best !== undefined) {
    composite = compositeValue(best)
  }
  const decisions = plan.candidates.length * plan.dimensions.length
  return `${String(plan.candidates.length)} candidates x ${String(plan.dimensions.length)} `
    + `dimensions (${String(decisions)} questions); top ${winnerOf(ranking)} `
    + `composite=${composite.toFixed(SUMMARY_DIGITS)}`
}

export {
  KEY_SEPARATOR,
  buildCompareQuestions,
  parseWeights,
  rankCandidates,
  summaryOf,
  winnerOf,
  type CompareCandidate,
  type CompareDimension,
  type ComparePlan,
}
