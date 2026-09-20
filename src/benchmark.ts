/**
 * The token benchmark.
 *
 * Two ways to answer the same atomic questions about the same state are costed
 * side by side, and the report says which half of the comparison was measured
 * and which was modelled. That distinction is the whole reason this module
 * exists rather than a paragraph of prose: a savings claim that cannot be
 * re-run is marketing, and this one is reproducible from the repository.
 *
 * The result is not uniformly flattering, and the report says so. When the
 * agent has to restate the evidence inside its tool call, an ad-hoc Jev call
 * can cost more raw tokens than reasoning in context, because the state is paid
 * for twice. The comparison is therefore reported three ways: raw tokens,
 * tokens weighted by what providers charge for generated text, and the
 * built-in-bank call shape, which moves the question definitions out of the
 * model's completion entirely.
 *
 * @module dsh-plugin-jev/benchmark
 */

import {
  DEFAULT_ASSUMPTIONS,
  baselineCost,
  jevBankCost,
  jevMeasuredCost,
  jevModelledCost,
  saving,
} from './benchmark-cost.ts'
import type { CostAssumptions } from './benchmark-cost.ts'
import { CORPUS } from './benchmark-corpus.ts'
import type { BenchmarkItem } from './benchmark-corpus.ts'
import { measureItems } from './benchmark-live.ts'
import type { LiveOptions } from './benchmark-live.ts'
import { buildReport } from './benchmark-report.ts'
import type { BenchmarkReport, BenchmarkRow } from './benchmark-report.ts'

/**
 * Cost every corpus item every way the package supports.
 *
 * @param assumptions - Deployment-shaped constants.
 * @param measured - Live billed input tokens keyed by item id, when available.
 * @returns One row per item.
 */
function buildRows(
  assumptions: CostAssumptions,
  measured: ReadonlyMap<string, number> = new Map<string, number>(),
): BenchmarkRow[] {
  return CORPUS.map((item: BenchmarkItem): BenchmarkRow => {
    const baseline = baselineCost(item, assumptions)
    const live = measured.get(item.id)
    let jev = jevModelledCost(item, assumptions)
    if (live !== undefined) {
      jev = jevMeasuredCost(item, live, assumptions)
    }
    const bank = jevBankCost(item, assumptions)
    let savedBank: { tokens: number; percent: number } | undefined = undefined
    if (bank !== undefined) {
      savedBank = saving(baseline, bank)
    }
    return {
      id: item.id,
      title: item.title,
      decisions: Object.keys(item.questions).length,
      baseline,
      jev,
      jevBank: bank,
      saved: saving(baseline, jev),
      savedBank,
    }
  })
}

/**
 * Where the corpus and its reference reasoning live, for a reader who wants to
 * audit the modelled half of the comparison.
 *
 * @returns Project-root-relative source paths.
 */
function benchmarkSource(): string[] {
  return [
    'src/benchmark-corpus.ts',
    'src/benchmark-items-routing.ts',
    'src/benchmark-items-judgement.ts',
  ]
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
  return buildReport(buildRows(assumptions), assumptions, 'modelled')
}

/**
 * Run the benchmark against the live API.
 *
 * @param options - Endpoint, credential and model.
 * @param assumptions - Deployment-shaped constants.
 * @returns The comparison, with measured Jev figures.
 */
async function runLiveBenchmark(
  options: LiveOptions,
  assumptions: CostAssumptions = DEFAULT_ASSUMPTIONS,
): Promise<BenchmarkReport> {
  const measurements = await measureItems(CORPUS, options)
  const byId = new Map<string, number>()
  for (const measurement of measurements) {
    byId.set(measurement.itemId, measurement.billedInputTokens)
  }
  return buildReport(buildRows(assumptions, byId), assumptions, 'measured')
}

export { DEFAULT_ASSUMPTIONS } from './benchmark-cost.ts'
export type { ArmCost, CostAssumptions } from './benchmark-cost.ts'
export { CORPUS, countDecisions, getItem } from './benchmark-corpus.ts'
export type { BenchmarkItem } from './benchmark-corpus.ts'
export { measureItems } from './benchmark-live.ts'
export type { LiveMeasurement, LiveOptions } from './benchmark-live.ts'
export {
  buildReport,
  renderReport,
  round,
} from './benchmark-report.ts'
export type { BenchmarkMode, BenchmarkReport, BenchmarkRow } from './benchmark-report.ts'
export { benchmarkSource, buildRows, runLiveBenchmark, runModelledBenchmark }

