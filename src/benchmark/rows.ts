/**
 * Per-item pricing: every integration shape, side by side.
 *
 * One row is one decision an agent actually has to make — classify this change,
 * triage this failure, scope this task — priced under each shape it could be
 * answered with. An approach is absent rather than zero when it cannot cover the
 * item, so a missing bank shows up as "not applicable" instead of as a fake
 * saving.
 *
 * @module dsh-plugin-jev/benchmark/rows
 */

import type { ArmCost, CostAssumptions } from './cost.ts'
import { DEFAULT_ASSUMPTIONS } from './cost.ts'
import {
  adhocCost,
  bankCost,
  gatedCost,
  reasonCost,
  splitCost,
} from './approaches.ts'
import { escalatedIds } from './escalation.ts'
import type { ApproachId } from './approaches.ts'
import type { BenchmarkItem, BenchmarkTask } from './corpus.ts'
import type { JevAnswer } from '#src/jev/contracts'
import type { LiveMeasurement } from './live.ts'
import { NOTHING_GRADED, addAgreement, mismatchesOf } from './quality.ts'
import type { Agreement, Mismatch } from './quality.ts'

/** One item's result, every approach side by side. */
interface BenchmarkRow {
  /** Corpus item id. */
  id: string
  /** Human-readable description. */
  title: string
  /** Task class the decision belongs to. */
  task: BenchmarkTask
  /** Atomic decisions answered for this item. */
  decisions: number
  /** Cost per approach; absent when the approach cannot cover this item. */
  arms: Record<ApproachId, ArmCost | undefined>
  /** Graded agreement per approach; absent until a live run graded it. */
  agreement: Record<ApproachId, Agreement | undefined>
  /** Decisions each measured shape got wrong, keyed by approach. */
  mismatches: Record<ApproachId, Mismatch[]>
  /** Decisions the gated arm handed back to the model. */
  escalated: number
}

/** Count of nothing, used where a total starts empty. */
const NONE = 0

/** One call's reported figures, in the shape the cost builders want. */
interface MeasuredCall {
  /** Tokens TypeSafe billed. */
  billedInputTokens: number
  /** Round trip in seconds. */
  latencySeconds: number
}

/**
 * Reduce a measured call to the figures the cost builders want.
 *
 * @param measured - The call's measurement, when it was measured.
 * @returns The tokens and round trip, or undefined.
 */
function measuredOf(measured: MeasuredCall | undefined): MeasuredCall | undefined {
  if (measured === undefined) {
    return undefined
  }
  return {
    billedInputTokens: measured.billedInputTokens,
    latencySeconds: measured.latencySeconds,
  }
}

/** What pricing the fallback shape needs. */
interface GatedPricing {
  /** Corpus item to price. */
  item: BenchmarkItem
  /** Question ids the model would reason out itself. */
  escalated: readonly string[]
  /** Deployment-shaped constants. */
  assumptions: CostAssumptions
  /** The bank call's figures. */
  measured: MeasuredCall | undefined
  /** The full measurement, whose absence means "this run measured nothing". */
  measurement: LiveMeasurement | undefined
}

/**
 * List the decisions a measured shape got wrong.
 *
 * @param answers - Answers the shape returned, when it was measured.
 * @param expected - Expected answer per question id.
 * @returns The disagreements, or an empty list when nothing was measured.
 */
function misses(
  answers: Record<string, JevAnswer> | undefined,
  expected: Record<string, string>,
): Mismatch[] {
  if (answers === undefined) {
    return []
  }
  return mismatchesOf(answers, expected)
}

/**
 * Price the fallback shape, when there is a measured confidence to tune on.
 *
 * @param pricing - The item, the escalated ids, and what was measured.
 * @returns The gated arm's cost, or undefined when nothing was measured.
 */
function gatedFor(pricing: GatedPricing): ArmCost | undefined {
  if (pricing.measurement === undefined) {
    return undefined
  }
  return gatedCost(pricing.item, {
    escalated: pricing.escalated,
    assumptions: pricing.assumptions,
    measured: pricing.measured,
  })
}

/**
 * Price every approach for one item.
 *
 * @param item - Corpus item to price.
 * @param assumptions - Deployment-shaped constants.
 * @param measured - The live measurement, when the item was measured.
 * @returns The row.
 */
function buildRow(
  item: BenchmarkItem,
  assumptions: CostAssumptions = DEFAULT_ASSUMPTIONS,
  measured?: LiveMeasurement,
): BenchmarkRow {
  const bankMeasured = measuredOf(measured?.bank)
  let escalated: string[] = []
  if (measured?.bankAnswers !== undefined) {
    escalated = escalatedIds(item, measured.bankAnswers, assumptions.escalationFloor)
  }
  return {
    id: item.id,
    title: item.title,
    task: item.task,
    decisions: Object.keys(item.questions).length,
    arms: {
      reason: reasonCost(item, assumptions),
      bank: bankCost(item, assumptions, bankMeasured),
      /*
       * The fallback is priced only where the confidence it escalates on was
       * measured. Reporting it as equal to the bank shape in a modelled run
       * would claim a tuning result the run never produced.
       */
      gated: gatedFor({ item, escalated, assumptions, measured: bankMeasured, measurement: measured }),
      adhoc: adhocCost(item, assumptions, measuredOf(measured?.adhoc)),
      split: splitCost(item, assumptions, measuredOf(measured?.split)),
    },
    agreement: {
      reason: undefined,
      bank: measured?.agreement.bank,
      gated: measured?.agreement.bank,
      adhoc: measured?.agreement.adhoc,
      split: measured?.agreement.split,
    },
    mismatches: {
      reason: [],
      bank: misses(measured?.bankAnswers, item.expected),
      gated: misses(measured?.bankAnswers, item.expected),
      adhoc: misses(measured?.adhocAnswers, item.expected),
      split: misses(measured?.splitAnswers, item.expected),
    },
    escalated: escalated.length,
  }
}

/**
 * Price every item.
 *
 * @param items - Corpus items to price.
 * @param assumptions - Deployment-shaped constants.
 * @param measurements - Live measurements, keyed by item id.
 * @returns One row per item, in the order given.
 */
function buildRowsFrom(
  items: readonly BenchmarkItem[],
  assumptions: CostAssumptions = DEFAULT_ASSUMPTIONS,
  measurements: Map<string, LiveMeasurement> = new Map<string, LiveMeasurement>(),
): BenchmarkRow[] {
  return items.map(item => buildRow(item, assumptions, measurements.get(item.id)))
}

/**
 * Collect the rows one approach can cover.
 *
 * @param rows - Every row.
 * @param id - Approach id.
 * @returns The rows where that approach is priced.
 */
function rowsFor(rows: readonly BenchmarkRow[], id: ApproachId): BenchmarkRow[] {
  return rows.filter(row => row.arms[id] !== undefined)
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

/**
 * Sum one arm over a set of rows.
 *
 * @param rows - Rows to sum.
 * @param id - Approach id.
 * @returns The summed cost.
 */
function armTotal(rows: readonly BenchmarkRow[], id: ApproachId): ArmCost {
  let total = { ...EMPTY_ARM }
  for (const row of rows) {
    const arm = row.arms[id]
    if (arm !== undefined) {
      total = {
        promptTokens: total.promptTokens + arm.promptTokens,
        completionTokens: total.completionTokens + arm.completionTokens,
        billedInputTokens: total.billedInputTokens + arm.billedInputTokens,
        totalTokens: total.totalTokens + arm.totalTokens,
        costUsd: total.costUsd + arm.costUsd,
        seconds: total.seconds + arm.seconds,
      }
    }
  }
  return total
}

/**
 * Sum the measured agreement for one approach.
 *
 * @param rows - Rows to sum.
 * @param id - Approach id.
 * @returns The summed agreement.
 */
function agreementFor(rows: readonly BenchmarkRow[], id: ApproachId): Agreement {
  let total = { ...NOTHING_GRADED }
  for (const row of rows) {
    const agreement = row.agreement[id]
    if (agreement !== undefined) {
      total = addAgreement(total, agreement)
    }
  }
  return total
}

export {
  EMPTY_ARM,
  NONE,
  agreementFor,
  armTotal,
  buildRow,
  buildRowsFrom,
  rowsFor,
  type BenchmarkRow,
}
