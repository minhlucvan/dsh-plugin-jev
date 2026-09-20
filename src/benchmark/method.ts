/**
 * The report's prose: how the numbers were produced, and what they do not say.
 *
 * These sections exist so a reader can disagree with the comparison rather than
 * merely disbelieve it: the price list, the fallback threshold, the provenance
 * of the modelled arm, and the caveats that keep the claim honest.
 *
 * @module dsh-plugin-jev/benchmark/method
 */

import { PERCENT_SCALE, share, tokenCount } from './format.ts'
import type { BenchmarkReport } from './report.ts'

/**
 * Render the method, so a reader can disagree with the numbers.
 *
 * @param report - The comparison.
 * @returns Markdown lines.
 */
function renderMethod(report: BenchmarkReport): string[] {
  const { assumptions } = report
  let measured = 'Jev tokens and round trips are estimated; run with --live to measure them.'
  if (report.mode === 'measured') {
    measured = 'Jev tokens, round trips and answers came back from the API.'
  }
  const inputPrice = `$${assumptions.llmInputPricePerMtok}/Mtok`
  const outputPrice = `$${assumptions.llmOutputPricePerMtok}/Mtok`
  const jevPrice = `$${assumptions.jevInputPricePerMtok}/Mtok`
  return [
    '## Method',
    '',
    'Every shape answers the same questions about the same state, and every call is',
    'counted the same way: the tokens the agent model reads, the tokens it writes',
    '(including the tool call it has to generate), and the tokens TypeSafe bills.',
    '',
    `- **Mode**: ${report.mode}. ${measured}`,
    `- **Prices**: agent model ${inputPrice} in and ${outputPrice} out at `
    + `${tokenCount(assumptions.llmTokensPerSecond)} tok/s; Jev ${jevPrice} in, output free.`,
    `- **Fallback threshold**: ${share(assumptions.escalationFloor * PERCENT_SCALE)} — answers `
    + 'below it are reasoned out by the model instead.',
    '- **Baseline**: modelled from the reference reasoning the corpus ships',
    '  (`src/benchmark/items-*.ts`). Read it, disagree with it, replace it with',
    '  `--trace <file>`, and re-run.',
    '- **Time** is generated tokens divided by the agent model rate, plus the Jev',
    '  round trip. Generating a deliberation is what takes the time.',
    '',
  ]
}

/**
 * Render the caveats that keep the claim honest.
 *
 * @returns Markdown lines.
 */
function renderLimitations(): string[] {
  return [
    '## Limitations',
    '',
    '- The baseline is modelled, not captured. It is the one number in the report',
    '  nobody measured, and the one the comparison is most sensitive to.',
    '- A live run measures one sample per shape. Billing figures repeat closely;',
    '  round trips depend on the network to TypeSafe.',
    '- The corpus is four scenarios a coding agent meets daily, not a random sample',
    '  of everything an agent does. It is sized to be read and argued with.',
    '- Prices move. Every figure is a function of the price list above, and the CLI',
    '  overrides exist so another pair can be priced without touching the corpus.',
    '',
  ]
}

export { renderLimitations, renderMethod }
