/**
 * Aggregation for the benchmark.
 *
 * The report answers four questions about the same work — what it cost in
 * dollars, how long it took, how many tokens moved, and whether the answers
 * came out right — because they do not agree, and the disagreement is the
 * finding. A shape only counts as better if it wins on the axes that matter and
 * still answers correctly.
 *
 * Every comparison is drawn over the items *that shape can cover*, never over
 * the whole corpus: a bank covers three scenarios, the ad-hoc shape covers
 * four, and comparing a three-item total with a four-item one would flatter a
 * shape for the wrong reason.
 *
 * @module dsh-plugin-jev/benchmark/report
 */

import { APPROACHES, BASELINE_ARM } from './approaches.ts'
import type { ApproachId } from './approaches.ts'
import { EMPTY_BREAK_EVEN } from './breakeven.ts'
import type { BreakEven } from './breakeven.ts'
import { DEFAULT_ASSUMPTIONS, costSaving, saving, timeSaving } from './cost.ts'
import type { ArmCost, CostAssumptions } from './cost.ts'
import { TASKS } from './corpus.ts'
import type { BenchmarkTask } from './corpus.ts'
import { agreementFor, armTotal, rowsFor } from './rows.ts'
import type { BenchmarkRow } from './rows.ts'
import type { Agreement } from './quality.ts'

/** Which half of the comparison produced the Jev figures. */
type BenchmarkMode = 'modelled' | 'measured'

/** What a report is built from beyond the priced rows. */
interface ReportOptions {
  /** The fallback curve, when a live run produced one. */
  breakEven?: BreakEven | undefined
  /** Constants both arms were measured against. */
  assumptions?: CostAssumptions | undefined
  /** Whether the Jev figures were measured. */
  mode?: BenchmarkMode | undefined
}

/** A difference between two arms, on one axis. */
interface Delta {
  /** Absolute difference in the axis's own unit. */
  magnitude: number
  /** Relative difference, as a percentage of the baseline. */
  percent: number
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

/** A baseline and one alternative over the same items. */
interface Comparison {
  /** Items the two arms cover. */
  items: number
  /** Decisions across those items. */
  decisions: number
  /** The arm that reasons in the agent's own context. */
  baseline: ArmTotals
  /** The arm being compared against it. */
  jev: ArmTotals
  /** Dollars saved. */
  cost: Delta
  /** Seconds saved. */
  time: Delta
  /** Tokens saved. */
  tokens: Delta
}

/** One approach's standing against reasoning it out. */
interface ApproachComparison extends Comparison {
  /** Approach id. */
  id: ApproachId
  /** Short label. */
  label: string
  /** One sentence describing the call shape. */
  shape: string
  /** How the approach's answers scored, when a live run graded them. */
  agreement: Agreement
  /** Decisions the approach handed back to the model. */
  escalated: number
}

/** One task class's result under every approach that covers it. */
interface TaskComparison {
  /** Task class. */
  task: BenchmarkTask
  /** Items in this class. */
  items: number
  /** Decisions across them. */
  decisions: number
  /** Each approach's saving in this class, or how many items it covered there. */
  cells: {
    id: ApproachId
    items: number
    cost: number
    time: number
    tokens: number
  }[]
}

/** The complete comparison. */
interface BenchmarkReport {
  /** `modelled` until a live run replaced the Jev figures. */
  mode: BenchmarkMode
  /** Constants both arms were measured against. */
  assumptions: CostAssumptions
  /** Per-item results. */
  rows: BenchmarkRow[]
  /** Every approach against the baseline, over the items it covers. */
  approaches: ApproachComparison[]
  /** The same comparison per task class. */
  byTask: TaskComparison[]
  /** How far the fallback can be pushed before the gated shape stops winning. */
  breakEven: BreakEven
  /** Every decision a measured shape got wrong, so a reader can check them. */
  mismatches: ShapeMismatch[]
}

/** Count of nothing, used where a total starts empty. */
const NONE = 0

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
 * Build one comparison from matched baseline and alternative totals.
 *
 * @param scope - Items and decisions the two arms cover.
 * @param arms - The baseline and the alternative.
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
 * Sum the decisions across a set of rows.
 *
 * @param rows - Rows to sum.
 * @returns The decision count.
 */
function decisionsOf(rows: readonly BenchmarkRow[]): number {
  return rows.reduce((total, row) => total + row.decisions, NONE)
}

/**
 * Count the decisions one approach handed back to the model.
 *
 * @param id - Approach id.
 * @param rows - The rows it covers.
 * @returns The count; only the fallback shape hands anything back.
 */
function keptFor(id: ApproachId, rows: readonly BenchmarkRow[]): number {
  if (id !== 'gated') {
    return NONE
  }
  return rows.reduce((total, row) => total + row.escalated, NONE)
}

/**
 * Compare every approach against reasoning it out.
 *
 * @param rows - Every row.
 * @returns One comparison per approach, in report order.
 */
function approachComparisons(rows: readonly BenchmarkRow[]): ApproachComparison[] {
  return APPROACHES.map((approach) => {
    const covered = rowsFor(rows, approach.id)
    const comparison = comparisonOf(
      { items: covered.length, decisions: decisionsOf(covered) },
      {
        baseline: armTotal(covered, BASELINE_ARM),
        jev: armTotal(covered, approach.id),
      },
    )
    return {
      ...comparison,
      id: approach.id,
      label: approach.label,
      shape: approach.shape,
      agreement: agreementFor(covered, approach.id),
      /*
       * Only the fallback shape hands answers back; the others answer every
       * question themselves, so a row-level count would be the same number
       * repeated under four headings.
       */
      escalated: keptFor(approach.id, covered),
    }
  })
}

/**
 * Build the per-task matrix.
 *
 * @param rows - Every row.
 * @returns One entry per task class, in corpus order.
 */
function taskComparisons(rows: readonly BenchmarkRow[]): TaskComparison[] {
  return TASKS.map((task) => {
    const inTask = rows.filter(row => row.task === task)
    return {
      task,
      items: inTask.length,
      decisions: decisionsOf(inTask),
      cells: APPROACHES.map((approach) => {
        const covered = rowsFor(inTask, approach.id)
        const comparison = comparisonOf(
          { items: covered.length, decisions: decisionsOf(covered) },
          {
            baseline: armTotal(covered, BASELINE_ARM),
            jev: armTotal(covered, approach.id),
          },
        )
        return {
          id: approach.id,
          items: covered.length,
          cost: comparison.cost.percent,
          time: comparison.time.percent,
          tokens: comparison.tokens.percent,
        }
      }),
    }
  })
}

/** Every disagreement a measured shape produced, with the shape that made it. */
interface ShapeMismatch {
  /** Approach the disagreement came from. */
  shape: ApproachId
  /** Corpus item the decision belongs to. */
  itemId: string
  /** Question id. */
  question: string
  /** Answer the corpus says a careful reader reaches. */
  expected: string
  /** Answer the shape produced. */
  answered: string
}

/**
 * Collect every disagreement a measured shape produced.
 *
 * @param rows - Every row.
 * @returns One entry per disagreement, grouped by item and shape.
 */
function mismatchesIn(rows: readonly BenchmarkRow[]): ShapeMismatch[] {
  const found: ShapeMismatch[] = []
  for (const row of rows) {
    for (const approach of APPROACHES) {
      for (const miss of row.mismatches[approach.id]) {
        found.push({ shape: approach.id, itemId: row.id, ...miss })
      }
    }
  }
  return found
}

/**
 * Build the complete report.
 *
 * @param rows - Per-item results, every approach priced.
 * @param options - The fallback curve, the constants, and whether it was measured.
 * @returns The report.
 */
function buildReport(rows: BenchmarkRow[], options: ReportOptions = {}): BenchmarkReport {
  const assumptions = options.assumptions ?? DEFAULT_ASSUMPTIONS
  const mode = options.mode ?? 'modelled'
  return {
    mode,
    assumptions,
    rows,
    breakEven: options.breakEven ?? EMPTY_BREAK_EVEN,
    approaches: approachComparisons(rows),
    byTask: taskComparisons(rows),
    mismatches: mismatchesIn(rows),
  }
}


export {
  NONE,
  approachComparisons,
  buildReport,
  comparisonOf,
  decisionsOf,
  taskComparisons,
  totalsOf,
  type ApproachComparison,
  type ArmTotals,
  type BenchmarkMode,
  type BenchmarkReport,
  type Comparison,
  type Delta,
  type ReportOptions,
  type ShapeMismatch,
  type TaskComparison,
}
