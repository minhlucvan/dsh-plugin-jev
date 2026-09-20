/**
 * Aggregation for the benchmark.
 *
 * The report answers three questions about the same work — what it cost in
 * dollars, how long it took, and how many tokens moved — because they do not
 * agree, and the disagreement is the finding.
 *
 * A bank covers only the scenarios a shipped bank matches, so its totals are
 * compared against the baseline over *the same items* rather than against the
 * whole corpus. Comparing a three-item total to a five-item one would flatter
 * the bank shape for the wrong reason.
 *
 * @module dsh-plugin-jev/benchmark/report
 */

import { DEFAULT_ASSUMPTIONS, costSaving, saving, timeSaving } from './cost.ts'
import type { ArmCost, CostAssumptions } from './cost.ts'
import { countDecisions } from './corpus.ts'

/** Which half of the comparison produced the Jev figures. */
type BenchmarkMode = 'modelled' | 'measured'

/** A difference between two arms, on one axis. */
interface Delta {
  /** Absolute difference in the axis's own unit. */
  magnitude: number
  /** Relative difference, as a percentage of the baseline. */
  percent: number
}

/** One item's result, side by side. */
interface BenchmarkRow {
  /** Corpus item id. */
  id: string
  /** Human-readable description. */
  title: string
  /** Atomic decisions answered for this item. */
  decisions: number
  /** Cost of answering them in the agent's own context. */
  baseline: ArmCost
  /** Cost of answering them through an ad-hoc Jev call. */
  jev: ArmCost
  /** Cost of answering them with a built-in bank, when one covers the item. */
  jevBank: ArmCost | undefined
  /** Tokens saved by the ad-hoc call. */
  saved: Delta
  /** Tokens saved by the bank call, when one covers the item. */
  savedBank: Delta | undefined
  /** Dollars saved by the ad-hoc call. */
  costSaved: Delta
  /** Seconds saved by the ad-hoc call. */
  timeSaved: Delta
}

/** One arm reduced to a comparable set of totals. */
interface ArmTotals {
  /** Dollars billed across both providers. */
  usd: number
  /** Wall-clock seconds. */
  seconds: number
  /** Total tokens the comparison counts. */
  tokens: number
}

/** A baseline and a Jev arm over the same items. */
interface Comparison {
  /** Items the two arms cover. */
  items: number
  /** Decisions across those items. */
  decisions: number
  /** The arm that reasons in the agent's own context. */
  baseline: ArmTotals
  /** The arm that delegates to Jev. */
  jev: ArmTotals
  /** Dollars saved. */
  cost: Delta
  /** Seconds saved. */
  time: Delta
  /** Tokens saved. */
  tokens: Delta
}

/** The complete comparison. */
interface BenchmarkReport {
  /** `modelled` until a live run replaced the Jev figures. */
  mode: BenchmarkMode
  /** Constants both arms were measured against. */
  assumptions: CostAssumptions
  /** Per-item results. */
  rows: BenchmarkRow[]
  /** Every scenario, ad-hoc Jev against the baseline. */
  all: Comparison
  /** Only the scenarios a shipped bank covers. */
  bank: Comparison
}

/** An arm cost that has been reduced to a scalar. */
const EMPTY_ARM: ArmCost = {
  promptTokens: 0,
  completionTokens: 0,
  billedInputTokens: 0,
  totalTokens: 0,
  costUsd: 0,
  seconds: 0,
}

/** Count of nothing, used where a total starts empty. */
const NONE = 0

/** Increment applied when one more row has a bank. */
const ONE = 1

/**
 * Add two arm costs.
 *
 * @param left - First cost.
 * @param right - Second cost.
 * @returns The sum.
 */
function addCost(left: ArmCost, right: ArmCost): ArmCost {
  return {
    promptTokens: left.promptTokens + right.promptTokens,
    completionTokens: left.completionTokens + right.completionTokens,
    billedInputTokens: left.billedInputTokens + right.billedInputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    costUsd: left.costUsd + right.costUsd,
    seconds: left.seconds + right.seconds,
  }
}

/**
 * Reduce one arm cost to the three comparable totals.
 *
 * @param cost - Arm cost to reduce.
 * @returns The totals.
 */
function totalsOf(cost: ArmCost): ArmTotals {
  return { usd: cost.costUsd, seconds: cost.seconds, tokens: cost.totalTokens }
}

/**
 * Build one comparison from matched baseline and Jev totals.
 *
 * @param items - Items the two arms cover.
 * @param decisions - Decisions across those items.
 * @param baseline - The baseline arm's cost.
 * @param jev - The Jev arm's cost.
 * @returns The comparison.
 */
function comparisonOf(
  scope: { items: number; decisions: number },
  arms: { baseline: ArmCost; jev: ArmCost },
): Comparison {
  const tokenDelta = saving(arms.baseline, arms.jev)
  const costDelta = costSaving(arms.baseline, arms.jev)
  const timeDelta = timeSaving(arms.baseline, arms.jev)
  return {
    items: scope.items,
    decisions: scope.decisions,
    baseline: totalsOf(arms.baseline),
    jev: totalsOf(arms.jev),
    cost: { magnitude: costDelta.usd, percent: costDelta.percent },
    time: { magnitude: timeDelta.seconds, percent: timeDelta.percent },
    tokens: { magnitude: tokenDelta.tokens, percent: tokenDelta.percent },
  }
}

/**
 * Build the complete report from per-item rows.
 *
 * @param rows - Per-item results.
 * @param assumptions - Constants both arms were measured against.
 * @param mode - Whether the Jev figures were measured.
 * @returns The report.
 */
function buildReport(
  rows: BenchmarkRow[],
  assumptions: CostAssumptions = DEFAULT_ASSUMPTIONS,
  mode: BenchmarkMode = 'modelled',
): BenchmarkReport {
  let baseline = { ...EMPTY_ARM }
  let jev = { ...EMPTY_ARM }
  let bankBaseline = { ...EMPTY_ARM }
  let bankJev = { ...EMPTY_ARM }
  let bankItems = NONE
  let bankDecisions = NONE

  for (const row of rows) {
    baseline = addCost(baseline, row.baseline)
    jev = addCost(jev, row.jev)
    if (row.jevBank !== undefined) {
      bankItems += ONE
      bankDecisions += row.decisions
      bankBaseline = addCost(bankBaseline, row.baseline)
      bankJev = addCost(bankJev, row.jevBank)
    }
  }

  return {
    mode,
    assumptions,
    rows,
    all: comparisonOf(
      { items: rows.length, decisions: countDecisions() },
      { baseline, jev },
    ),
    bank: comparisonOf(
      { items: bankItems, decisions: bankDecisions },
      { baseline: bankBaseline, jev: bankJev },
    ),
  }
}

export {
  EMPTY_ARM,
  NONE,
  addCost,
  buildReport,
  comparisonOf,
  totalsOf,
  type ArmTotals,
  type BenchmarkMode,
  type BenchmarkReport,
  type BenchmarkRow,
  type Comparison,
  type Delta,
}

