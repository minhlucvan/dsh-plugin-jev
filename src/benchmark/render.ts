/**
 * Markdown rendering for the benchmark: assembly only.
 *
 * The sections live in \`./sections.ts\`; this module decides the order they are
 * read in. The order is the argument: what to ship, what it costs, where it is
 * weaker per task, where it was wrong, where the fallback stops paying, and
 * finally the method and the caveats.
 *
 * @module dsh-plugin-system-one/benchmark/render
 */

import { renderLimitations, renderMethod } from './method.ts'
import type { BenchmarkReport } from './report.ts'
import {
  renderAbsolutes,
  renderApproachTable,
  renderBreakEven,
  renderItemTable,
  renderMismatches,
  renderRecommendation,
  renderTaskTable,
} from './sections.ts'

/**
 * Render the comparison as a markdown report.
 *
 * @param report - The comparison to render.
 * @returns Markdown text suitable for a README or a terminal.
 */
function renderReport(report: BenchmarkReport): string {
  return [
    '# Jev benchmark — which integration shape pays',
    '',
    ...renderRecommendation(report),
    ...renderApproachTable(report),
    ...renderAbsolutes(report),
    ...renderTaskTable(report),
    ...renderMismatches(report),
    ...renderBreakEven(report),
    ...renderItemTable(report),
    ...renderMethod(report),
    ...renderLimitations(),
  ].join('\n')
}

export { renderReport }
export { agreementCell, disagreements, recommended, renderMismatches } from './sections.ts'
