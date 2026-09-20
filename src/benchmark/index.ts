/**
 * The Jev benchmark: cost, time, and tokens.
 *
 * Two ways to answer the same atomic questions about the same state are priced,
 * timed and counted side by side. The report says which half of the comparison
 * was measured and which was modelled, because a savings claim that cannot be
 * re-run is marketing.
 *
 * The three axes do not agree, and that is the point. Jev bills input only, at
 * a price an order of magnitude below a chat model, and produces no
 * deliberation; a reasoning model bills both sides and spends its time writing
 * the deliberation Jev does not write.
 *
 * @module dsh-plugin-jev/benchmark
 */

import {
  DEFAULT_ASSUMPTIONS,
  baselineCost,
  costSaving,
  jevBankCost,
  jevMeasuredCost,
  jevModelledCost,
  saving,
  timeSaving,
} from './cost.ts'
import type { CostAssumptions } from './cost.ts'
import { CORPUS } from './corpus.ts'
import type { BenchmarkItem } from './corpus.ts'
import { measureItems } from './live.ts'
import type { LiveOptions } from './live.ts'
import { buildReport } from './report.ts'
import type { BenchmarkReport, BenchmarkRow, Delta } from './report.ts'

/** What the API reported for one item, when a live run supplied it. */
interface MeasuredUsage {
  /** Tokens billed for the ad-hoc request. */
  inputTokens: number
  /** Ad-hoc round trip in seconds. */
  latencySeconds: number
  /** Tokens billed for the bank request, when a bank covers the item. */
  bankInputTokens: number | undefined
  /** Bank round trip in seconds, when a bank covers the item. */
  bankLatencySeconds: number | undefined
}

/**
 * Present one pair of magnitudes as a delta.
 *
 * @param magnitude - Absolute difference in the axis's own unit.
 * @param percent - Relative difference.
 * @returns The delta.
 */
function deltaOf(magnitude: number, percent: number): Delta {
  return { magnitude, percent }
}

/**
 * Cost every corpus item every way the package supports.
 *
 * @param assumptions - Deployment-shaped constants.
 * @param measured - Live usage keyed by item id, when available.
 * @returns One row per item.
 */
function buildRows(
  assumptions: CostAssumptions,
  measured: ReadonlyMap<string, MeasuredUsage> = new Map<string, MeasuredUsage>(),
): BenchmarkRow[] {
  return CORPUS.map((item: BenchmarkItem): BenchmarkRow => {
    const baseline = baselineCost(item, assumptions)
    const live = measured.get(item.id)

    let jev = jevModelledCost(item, assumptions)
    if (live !== undefined) {
      jev = jevMeasuredCost(
        item,
        { billedInputTokens: live.inputTokens, latencySeconds: live.latencySeconds },
        assumptions,
      )
    }

    let bank = jevBankCost(item, assumptions)
    if (live?.bankInputTokens !== undefined) {
      bank = jevBankCost(item, assumptions, {
        billedInputTokens: live.bankInputTokens,
        latencySeconds: live.bankLatencySeconds,
      })
    }

    const tokenDelta = saving(baseline, jev)
    const costDelta = costSaving(baseline, jev)
    const timeDelta = timeSaving(baseline, jev)
    let savedBank: Delta | undefined = undefined
    if (bank !== undefined) {
      const bankDelta = saving(baseline, bank)
      savedBank = deltaOf(bankDelta.tokens, bankDelta.percent)
    }

    return {
      id: item.id,
      title: item.title,
      decisions: Object.keys(item.questions).length,
      baseline,
      jev,
      jevBank: bank,
      saved: deltaOf(tokenDelta.tokens, tokenDelta.percent),
      savedBank,
      costSaved: deltaOf(costDelta.usd, costDelta.percent),
      timeSaved: deltaOf(timeDelta.seconds, timeDelta.percent),
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
    'src/benchmark/corpus.ts',
    'src/benchmark/items-routing.ts',
    'src/benchmark/items-judgement.ts',
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
  const byId = new Map<string, MeasuredUsage>()
  for (const measurement of measurements) {
    byId.set(measurement.itemId, {
      inputTokens: measurement.billedInputTokens,
      latencySeconds: measurement.latencySeconds,
      bankInputTokens: measurement.bankInputTokens,
      bankLatencySeconds: measurement.bankLatencySeconds,
    })
  }
  return buildReport(buildRows(assumptions, byId), assumptions, 'measured')
}

export { DEFAULT_ASSUMPTIONS } from './cost.ts'
export type { ArmCost, CostAssumptions, MeasuredJev } from './cost.ts'
export { CORPUS, countDecisions, getItem } from './corpus.ts'
export type { BenchmarkItem } from './corpus.ts'
export { measureItems } from './live.ts'
export type { LiveMeasurement, LiveOptions } from './live.ts'
export { buildReport } from './report.ts'
export type {
  ArmTotals,
  BenchmarkMode,
  BenchmarkReport,
  BenchmarkRow,
  Comparison,
  Delta,
} from './report.ts'
export { renderReport } from './render.ts'
export { benchmarkSource, buildRows, runLiveBenchmark, runModelledBenchmark }

