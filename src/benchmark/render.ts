/**
 * Markdown rendering for the benchmark.
 *
 * Cost leads, because it is the axis a decision is actually made on, and
 * because the three axes disagree: Jev can move *more* tokens at a *lower*
 * price. Time sits beside it. Tokens are kept last as the supporting figure.
 *
 * @module dsh-plugin-jev/benchmark/render
 */

import type { BenchmarkReport, Comparison } from './report.ts'

/** Decimal places kept on a percentage. */
const PERCENT_DIGITS = 1

/** Decimal places kept on a sub-cent dollar figure. */
const MICRO_DIGITS = 6

/** Decimal places kept on a dollar figure at or above one cent. */
const CENT_DIGITS = 4

/** Dollars below which the micro-precision format is used. */
const CENT_THRESHOLD = 0.01

/** Decimal places kept on a duration. */
const SECOND_DIGITS = 1

/** Decimal places kept on a token count. */
const TOKEN_DIGITS = 0

/** Base of the decimal system, used to build a rounding factor. */
const DECIMAL_BASE = 10

/** Signed marker for a saving that costs more. */
const NEGATIVE = '−'

/** A percentage of nothing. */
const NO_PERCENT = 0

/**
 * Round a number for display.
 *
 * @param value - Number to round.
 * @param digits - Decimal places to keep.
 * @returns The rounded number.
 */
function round(value: number, digits: number): number {
  const factor = DECIMAL_BASE ** digits
  return Math.round(value * factor) / factor
}

/**
 * Format a dollar amount with enough precision to be readable.
 *
 * Single judgements cost fractions of a cent, so a fixed two-decimal format
 * would print every row as `$0.00` and hide the entire comparison.
 *
 * @param usd - Dollars.
 * @returns The formatted amount.
 */
function money(usd: number): string {
  let digits = CENT_DIGITS
  if (usd < CENT_THRESHOLD) {
    digits = MICRO_DIGITS
  }
  return `$${round(usd, digits).toFixed(digits)}`
}

/**
 * Format a duration.
 *
 * @param seconds - Seconds.
 * @returns The formatted duration.
 */
function duration(seconds: number): string {
  return `${round(seconds, SECOND_DIGITS).toFixed(SECOND_DIGITS)}s`
}

/** Locale-stable thousands separator for the report tables. */
const THOUSANDS_FORMAT = new Intl.NumberFormat('en-US')

/**
 * Format a token count with thousands separators.
 *
 * @param count - Token count.
 * @returns The formatted count.
 */
function tokenCount(count: number): string {
  return THOUSANDS_FORMAT.format(round(count, TOKEN_DIGITS))
}

/**
 * Format a saving as a signed percentage.
 *
 * A positive figure means Jev came out ahead on that axis.
 *
 * @param value - Percentage.
 * @returns The formatted percentage.
 */
function signedPercent(value: number): string {
  const rounded = round(value, PERCENT_DIGITS)
  const magnitude = Math.abs(rounded).toFixed(PERCENT_DIGITS)
  if (rounded < NO_PERCENT) {
    return `${NEGATIVE}${magnitude}%`
  }
  return `+${magnitude}%`
}

/**
 * Render one comparison as a three-axis table.
 *
 * @param title - Heading for the table.
 * @param note - One-line description of what the two arms cover.
 * @param comparison - The comparison to render.
 * @returns Markdown lines.
 */
function renderComparison(
  title: string,
  note: string,
  comparison: Comparison,
): string[] {
  return [
    `## ${title}`,
    '',
    note,
    '',
    '| | Cost | Time | Tokens |',
    '| --- | ---: | ---: | ---: |',
    `| Without Jev | ${money(comparison.baseline.usd)} | ${duration(comparison.baseline.seconds)} | ${tokenCount(comparison.baseline.tokens)} |`,
    `| With Jev | ${money(comparison.jev.usd)} | ${duration(comparison.jev.seconds)} | ${tokenCount(comparison.jev.tokens)} |`,
    `| **Jev vs without** | **${signedPercent(comparison.cost.percent)}** | **${signedPercent(comparison.time.percent)}** | **${signedPercent(comparison.tokens.percent)}** |`,
    '',
  ]
}

/**
 * Render the reading guide.
 *
 * @param report - The comparison to describe.
 * @returns Markdown lines.
 */
function renderNotes(report: BenchmarkReport): string[] {
  const { assumptions, all, bank } = report
  let modeNote = 'Jev tokens and seconds are estimated, not measured.'
  if (report.mode === 'measured') {
    modeNote = 'Jev tokens and round trips are the ones the API reported.'
  }
  return [
    '## Reading this',
    '',
    `- Mode: **${report.mode}**. ${modeNote}`,
    `- Prices: agent model ${money(assumptions.llmInputPricePerMtok)}/Mtok in and `
    + `${money(assumptions.llmOutputPricePerMtok)}/Mtok out at ${String(assumptions.llmTokensPerSecond)} tok/s; `
    + `Jev ${money(assumptions.jevInputPricePerMtok)}/Mtok in with output free.`,
    `- The ad-hoc table covers all ${String(all.items)} scenarios; the bank table covers the `
    + `${String(bank.items)} a shipped bank matches, and its baseline is the same `
    + `${String(bank.items)} scenarios rather than the whole corpus.`,
    '- Positive is better for Jev on every axis.',
    '',
    '## Method',
    '',
    'Both arms answer the same questions about the same state. The agent model',
    'bills the prompt it reads and the completion it writes; TypeSafe bills the',
    'input Jev reads, and gives its output away.',
    '',
    `- **Cost** is the sum over both providers at the prices above.`,
    `- **Time** is generated tokens divided by ${String(assumptions.llmTokensPerSecond)} tok/s, `
    + `plus the Jev round trip (${duration(assumptions.jevLatencySeconds)} modelled, or the measured `
    + 'value in live mode). Generating a deliberation is what takes the time.',
    '- **Tokens** is the raw count, kept because it is the figure most often quoted.',
    '',
    'The baseline completion is **modelled** from the reference reasoning shipped in',
    '`src/benchmark/items-routing.ts` and `src/benchmark/items-judgement.ts`. Read it,',
    'disagree with it, replace it with --trace <file>, and re-run.',
    '',
  ]
}

/**
 * Render the comparison as a markdown report.
 *
 * @param report - The comparison to render.
 * @returns Markdown text suitable for a README or a terminal.
 */
function renderReport(report: BenchmarkReport): string {
  return [
    '# Jev benchmark — cost, time, and tokens',
    '',
    ...renderComparison(
      'Every scenario, ad-hoc questions',
      `All ${String(report.all.items)} scenarios, ${String(report.all.decisions)} atomic decisions, `
      + 'each answered by an ad-hoc call carrying its own questions.',
      report.all,
    ),
    ...renderComparison(
      'Only what a shipped bank covers',
      `The ${String(report.bank.items)} scenarios a shipped question bank matches, `
      + `${String(report.bank.decisions)} decisions, sent as a bank id instead of question text.`,
      report.bank,
    ),
    ...renderNotes(report),
  ].join('\n')
}

export {
  duration,
  money,
  renderComparison,
  renderNotes,
  renderReport,
  round,
  signedPercent,
  tokenCount,
}

