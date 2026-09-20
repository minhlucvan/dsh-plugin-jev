/**
 * The benchmark, assembled.
 *
 * A modelled run prices every integration shape from the corpus alone: no
 * network, no credential, and the published default prices. A live run sends the
 * same corpus to TypeSafe and replaces the modelled Jev figures with the tokens
 * and round trips the API actually reported, and grades the answers it got back
 * against the answer a careful reader reaches.
 *
 * @module dsh-plugin-system-one/benchmark
 */

import { breakEvenOf } from './breakeven.ts'
import { CORPUS } from './corpus.ts'
import { DEFAULT_ASSUMPTIONS } from './cost.ts'
import type { CostAssumptions } from './cost.ts'
import { measureItems } from './live.ts'
import type { LiveMeasurement, LiveOptions } from './live.ts'
import { buildReport } from './report.ts'
import type { BenchmarkReport } from './report.ts'
import { buildRowsFrom } from './rows.ts'

/**
 * Where the corpus and its reference reasoning live, for a reader who wants to
 * audit the modelled half of the comparison.
 *
 * The list is derived from the corpus rather than written out, so adding an
 * item cannot leave this pointing at a file the package no longer ships: an
 * item's id names its module, as in `comparing` and `items-comparing.ts`.
 *
 * @returns Project-root-relative source paths.
 */
function benchmarkSource(): string[] {
  const sources = new Set<string>(['src/benchmark/corpus.ts'])
  for (const item of CORPUS) {
    sources.add(`src/benchmark/items-${item.id}.ts`)
  }
  return [...sources].toSorted()
}

/**
 * Index measurements by item id.
 *
 * @param measurements - Measurements in corpus order.
 * @returns The measurements, keyed by item id.
 */
function measurementIndex(
  measurements: readonly LiveMeasurement[],
): Map<string, LiveMeasurement> {
  const index = new Map<string, LiveMeasurement>()
  for (const measurement of measurements) {
    index.set(measurement.itemId, measurement)
  }
  return index
}

/**
 * Run the benchmark from the shipped corpus, without contacting TypeSafe.
 *
 * @param assumptions - Deployment-shaped constants.
 * @returns The modelled comparison.
 */
function runModelledBenchmark(
  assumptions: CostAssumptions = DEFAULT_ASSUMPTIONS,
): BenchmarkReport {
  const rows = buildRowsFrom(CORPUS, assumptions)
  const breakEven = breakEvenOf(CORPUS, new Map<string, LiveMeasurement>(), assumptions)
  return buildReport(rows, { breakEven, assumptions, mode: 'modelled' })
}

/**
 * Run the benchmark against the live API.
 *
 * @param options - Endpoint, credential and model.
 * @param assumptions - Deployment-shaped constants.
 * @returns The comparison, with measured tokens, round trips and agreement.
 */
async function runLiveBenchmark(
  options: LiveOptions,
  assumptions: CostAssumptions = DEFAULT_ASSUMPTIONS,
): Promise<BenchmarkReport> {
  const measurements = await measureItems(CORPUS, options)
  const index = measurementIndex(measurements)
  const rows = buildRowsFrom(CORPUS, assumptions, index)
  const breakEven = breakEvenOf(CORPUS, index, assumptions)
  return buildReport(rows, { breakEven, assumptions, mode: 'measured' })
}

export { DEFAULT_ASSUMPTIONS } from './cost.ts'
export type { ArmCost, CostAssumptions, MeasuredJev } from './cost.ts'
export { APPROACHES, BASELINE_ARM } from './approaches.ts'
export type { Approach, ApproachId } from './approaches.ts'
export { CORPUS, TASKS, countDecisions, getItem, itemsForTask } from './corpus.ts'
export type { BenchmarkItem, BenchmarkTask } from './corpus.ts'
export { measureItems } from './live.ts'
export type { CallMeasurement, LiveMeasurement, LiveOptions } from './live.ts'
export { agreementOf, decisionOf, matches } from './quality.ts'
export type { Agreement } from './quality.ts'
export { buildReport } from './report.ts'
export type {
  ApproachComparison,
  ArmTotals,
  BenchmarkMode,
  BenchmarkReport,
  Comparison,
  Delta,
  TaskComparison,
} from './report.ts'
export { breakEvenOf } from './breakeven.ts'
export type { BreakEven, BreakEvenPoint } from './breakeven.ts'
export { armTotal, buildRow, buildRowsFrom, rowsFor } from './rows.ts'
export type { BenchmarkRow } from './rows.ts'
export { renderReport } from './render.ts'
export { benchmarkSource, measurementIndex, runLiveBenchmark, runModelledBenchmark }
