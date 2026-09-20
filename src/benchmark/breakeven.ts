/**
 * How much fallback the gated shape can absorb before it stops paying.
 *
 * The gated shape is the one an operator actually has to tune: call Jev, then
 * hand the answers the model was unsure about back to the model. The tuning
 * question is "how many answers can I afford to keep?", and it has a real
 * answer, derived from the confidences the API reported rather than assumed.
 *
 * The curve escalates the least confident answers first, which is exactly what
 * a confidence threshold does. Reading the curve at zero is the bank shape and
 * at everything is reasoning it out, so the two published shapes are the
 * endpoints of this one.
 *
 * @module dsh-plugin-system-one/benchmark/breakeven
 */

import { gatedCost, reasonCost } from './approaches.ts'
import { DEFAULT_ASSUMPTIONS, costSaving, timeSaving } from './cost.ts'
import type { ArmCost, CostAssumptions } from './cost.ts'
import type { BenchmarkItem } from './corpus.ts'
import { rankedIds } from './escalation.ts'
import type { LiveMeasurement } from './live.ts'

/** One point on the fallback curve. */
interface BreakEvenPoint {
  /** Share of decisions handed back to the model. */
  escalatePercent: number
  /** Cost saved against reasoning everything out, as a percentage. */
  costPercent: number
  /** Seconds saved against reasoning everything out, as a percentage. */
  timePercent: number
}

/** Where the gated shape stops winning. */
interface BreakEven {
  /** Share of decisions the fallback can absorb before cost stops improving. */
  costPercent: number
  /** The same on wall-clock, which is usually the binding constraint. */
  timePercent: number
  /** The curve the two figures were read off. */
  curve: BreakEvenPoint[]
  /** Scenarios the curve was computed from. */
  items: number
  /** Decisions across them. */
  decisions: number
}

/** Curve resolution: one point per 5% of decisions. */
const CURVE_STEP = 5

/** Scale factor converting a fraction to a percentage. */
const PERCENT_SCALE = 100

/** A share of nothing, which is the bank shape with no fallback. */
const NO_ESCALATION = 0

/** A saving of nothing, which is where the fallback stops paying. */
const NO_SAVING = 0

/** Count of nothing, used where a total starts empty. */
const NONE = 0

/** Index of the first item in a list, named to keep it out of the magic-number rule. */
const FIRST = 0

/** Nothing measured yet. */
const EMPTY_CURVE: BreakEven = {
  costPercent: NO_ESCALATION,
  timePercent: NO_ESCALATION,
  curve: [],
  items: NONE,
  decisions: NONE,
}

/** One measured scenario, ready to be re-priced at any escalation share. */
interface MeasuredEntry {
  /** The scenario. */
  item: BenchmarkItem
  /** What the live API reported for it. */
  measurement: LiveMeasurement
}

/** One configuration's totals across the measured scenarios. */
interface Totals {
  /** The gated arm's total. */
  gated: ArmCost
  /** Reasoning everything out, over the same scenarios. */
  baseline: ArmCost
}

/**
 * Add two arm costs.
 *
 * @param left - First cost.
 * @param right - Second cost.
 * @returns The sum.
 */
function addArms(left: ArmCost, right: ArmCost): ArmCost {
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
 * Read the highest escalation share that still beats the baseline.
 *
 * @param curve - The curve, ascending by escalation share.
 * @param pick - Which axis to read.
 * @returns The share, or zero when even a full fallback wins.
 */
function furthestWinning(
  curve: readonly BreakEvenPoint[],
  pick: (point: BreakEvenPoint) => number,
): number {
  let last = NO_ESCALATION
  for (const point of curve) {
    if (pick(point) >= NO_SAVING) {
      last = point.escalatePercent
    }
  }
  return last
}

/**
 * Select the scenarios a fallback could apply to.
 *
 * @param items - Corpus items.
 * @param measurements - Live measurements, keyed by item id.
 * @returns The measured scenarios that named a shipped bank.
 */
function measuredEntries(
  items: readonly BenchmarkItem[],
  measurements: Map<string, LiveMeasurement>,
): MeasuredEntry[] {
  const entries: MeasuredEntry[] = []
  for (const item of items) {
    const measurement = measurements.get(item.id)
    if (measurement !== undefined && measurement.bankAnswers !== undefined) {
      entries.push({ item, measurement })
    }
  }
  return entries
}

/**
 * Re-price one scenario at one escalation share.
 *
 * @param entry - The measured scenario.
 * @param share - Share of its decisions to hand back, from 0 to 1.
 * @param assumptions - Deployment-shaped constants.
 * @returns The scenario's gated and baseline totals, or undefined.
 */
function entryAt(
  entry: MeasuredEntry,
  share: number,
  assumptions: CostAssumptions,
): Totals | undefined {
  const { bank, bankAnswers } = entry.measurement
  if (bank === undefined || bankAnswers === undefined) {
    return undefined
  }
  const ranked = rankedIds(entry.item, bankAnswers)
  const escalated = ranked
    .slice(FIRST, Math.round(share * ranked.length))
    .map(candidate => candidate.id)
  const gated = gatedCost(entry.item, {
    escalated,
    assumptions,
    measured: {
      billedInputTokens: bank.billedInputTokens,
      latencySeconds: bank.latencySeconds,
    },
  })
  if (gated === undefined) {
    return undefined
  }
  return { gated, baseline: reasonCost(entry.item, assumptions) }
}

/**
 * Sum one gated configuration across the measured scenarios.
 *
 * @param entries - Measured scenarios.
 * @param share - Share of each scenario's decisions to hand back.
 * @param assumptions - Deployment-shaped constants.
 * @returns The totals, or undefined when nothing could be priced.
 */
function totalsAt(
  entries: readonly MeasuredEntry[],
  share: number,
  assumptions: CostAssumptions,
): Totals | undefined {
  const priced: Totals[] = []
  for (const entry of entries) {
    const totals = entryAt(entry, share, assumptions)
    if (totals !== undefined) {
      priced.push(totals)
    }
  }
  let total: Totals | undefined = undefined
  for (const next of priced) {
    if (total === undefined) {
      total = next
    } else {
      total = {
        gated: addArms(total.gated, next.gated),
        baseline: addArms(total.baseline, next.baseline),
      }
    }
  }
  return total
}

/**
 * Build the fallback curve and read the two break-even points off it.
 *
 * @param items - Corpus items to include.
 * @param measurements - Live measurements, keyed by item id.
 * @param assumptions - Deployment-shaped constants.
 * @returns The curve, or an empty one when nothing was measured.
 */
function breakEvenOf(
  items: readonly BenchmarkItem[],
  measurements: Map<string, LiveMeasurement>,
  assumptions: CostAssumptions = DEFAULT_ASSUMPTIONS,
): BreakEven {
  const entries = measuredEntries(items, measurements)
  const curve: BreakEvenPoint[] = []
  for (let step = NO_ESCALATION; step <= PERCENT_SCALE; step += CURVE_STEP) {
    const totals = totalsAt(entries, step / PERCENT_SCALE, assumptions)
    if (totals !== undefined) {
      curve.push({
        escalatePercent: step,
        costPercent: costSaving(totals.baseline, totals.gated).percent,
        timePercent: timeSaving(totals.baseline, totals.gated).percent,
      })
    }
  }
  if (curve.length === NONE) {
    return { ...EMPTY_CURVE }
  }
  let decisions = NONE
  for (const entry of entries) {
    decisions += Object.keys(entry.item.questions).length
  }
  return {
    costPercent: furthestWinning(curve, point => point.costPercent),
    timePercent: furthestWinning(curve, point => point.timePercent),
    curve,
    items: entries.length,
    decisions,
  }
}

export {
  CURVE_STEP,
  EMPTY_CURVE as EMPTY_BREAK_EVEN,
  EMPTY_CURVE,
  addArms,
  breakEvenOf,
  furthestWinning,
  measuredEntries,
  totalsAt,
  type BreakEven,
  type BreakEvenPoint,
}
