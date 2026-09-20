/**
 * Rendering and aggregation for the token benchmark. The reading guide is
 * generated from the same assumptions the arithmetic used, so prose and numbers
 * cannot drift apart.
 *
 * @module dsh-plugin-jev/benchmark/report
 */

import {
  DEFAULT_ASSUMPTIONS,
  saving,
} from './cost.ts'
import type { ArmCost, CostAssumptions } from './cost.ts'
import { countDecisions } from './corpus.ts'

/** Base of the decimal system, used to build a rounding factor. */
const DECIMAL_BASE = 10

/** Decimal places kept on a percentage, and on a token count. */
const PERCENT_DIGITS = 1
const TOKEN_DIGITS = 0

/** Increment applied when one more row has a bank. */
const ONE_ITEM = 1

/** A percentage of nothing. */
const NO_PERCENT = 0

/** Scale factor converting a fraction to a percentage. */
const PERCENT_SCALE = 100

/** Which half of the comparison produced the Jev figures. */
type BenchmarkMode = 'modelled' | 'measured'

/** An arm cost that has been reduced to a scalar. */
const EMPTY_ARM: ArmCost = {
  promptTokens: 0,
  completionTokens: 0,
  billedInputTokens: 0,
  totalTokens: 0,
  weightedTokens: 0,
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
  /** Tokens saved by the ad-hoc call, absolute and relative. */
  saved: { tokens: number; percent: number }
  /** Tokens saved by the bank call, when one covers the item. */
  savedBank: { tokens: number; percent: number } | undefined
}

/** The complete comparison. */
interface BenchmarkReport {
  /** `modelled` until a live run replaced the Jev figures. */
  mode: BenchmarkMode
  /** Constants both arms were measured against. */
  assumptions: CostAssumptions
  /** Per-item results. */
  rows: BenchmarkRow[]
  /** Corpus-wide totals. */
  totals: {
    items: number
    decisions: number
    baseline: ArmCost
    jev: ArmCost
    saved: { tokens: number; percent: number }
    /** Comparison in provider-weighted tokens at the configured output weight. */
    weighted: { baseline: number; jev: number; saved: { tokens: number; percent: number } }
    /** Comparison over only the items a shipped bank covers. */
    bank: {
      items: number
      baseline: ArmCost
      jev: ArmCost
      saved: { tokens: number; percent: number }
      /** The same comparison in provider-weighted tokens. */
      weighted: { tokens: number; percent: number }
    }
  }
}

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
    weightedTokens: left.weightedTokens + right.weightedTokens,
  }
}

/**
 * Compare two arms in provider-weighted tokens, which is the figure that
 * matters commercially: generated tokens are billed above input tokens.
 *
 * @param baseline - Baseline arm cost.
 * @param jev - Jev arm cost.
 * @returns Weighted tokens saved, absolute and relative.
 */
function weightedSaving(
  baseline: ArmCost,
  jev: ArmCost,
): { tokens: number; percent: number } {
  const savedTokens = baseline.weightedTokens - jev.weightedTokens
  let savedPercent = NO_PERCENT
  if (baseline.weightedTokens !== NO_PERCENT) {
    savedPercent = (savedTokens / baseline.weightedTokens) * PERCENT_SCALE
  }
  return { tokens: savedTokens, percent: savedPercent }
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
  let bankItems = 0

  for (const row of rows) {
    baseline = addCost(baseline, row.baseline)
    jev = addCost(jev, row.jev)
    if (row.jevBank !== undefined) {
      bankItems += ONE_ITEM
      bankBaseline = addCost(bankBaseline, row.baseline)
      bankJev = addCost(bankJev, row.jevBank)
    }
  }

  return {
    mode,
    assumptions,
    rows,
    totals: {
      items: rows.length,
      decisions: countDecisions(),
      baseline,
      jev,
      saved: saving(baseline, jev),
      weighted: {
        baseline: baseline.weightedTokens,
        jev: jev.weightedTokens,
        saved: weightedSaving(baseline, jev),
      },
      bank: {
        items: bankItems,
        baseline: bankBaseline,
        jev: bankJev,
        saved: saving(bankBaseline, bankJev),
        weighted: weightedSaving(bankBaseline, bankJev),
      },
    },
  }
}

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
 * Format a token count for a table cell.
 *
 * @param value - Token count.
 * @returns The formatted count.
 */
function tokens(value: number): string {
  return String(round(value, TOKEN_DIGITS))
}

/**
 * Format a percentage for a table cell.
 *
 * @param value - Percentage.
 * @returns The formatted percentage.
 */
function percent(value: number): string {
  return `${round(value, PERCENT_DIGITS).toFixed(PERCENT_DIGITS)}%`
}

/**
 * Render one row's bank-mode cells.
 *
 * @param row - Row to render.
 * @returns The two bank columns.
 */
function bankCells(row: BenchmarkRow): { tokens: string; saved: string } {
  if (row.jevBank === undefined || row.savedBank === undefined) {
    return { tokens: '—', saved: '—' }
  }
  return { tokens: tokens(row.jevBank.totalTokens), saved: percent(row.savedBank.percent) }
}

/**
 * Render the main per-item table.
 *
 * @param report - The comparison to render.
 * @returns Markdown table lines.
 */
function renderMainTable(report: BenchmarkReport): string[] {
  const lines = [
    '| Item | Decisions | Baseline | Jev (ask) | Saved | Bank mode | Saved |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const row of report.rows) {
    const bank = bankCells(row)
    lines.push(
      `| ${row.title} | ${String(row.decisions)} `
      + `| ${tokens(row.baseline.totalTokens)} `
      + `| ${tokens(row.jev.totalTokens)} `
      + `| ${percent(row.saved.percent)} `
      + `| ${bank.tokens} | ${bank.saved} |`,
    )
  }
  lines.push(
    `| **All ${String(report.totals.items)} items** | **${String(report.totals.decisions)}** `
    + `| **${tokens(report.totals.baseline.totalTokens)}** `
    + `| **${tokens(report.totals.jev.totalTokens)}** `
    + `| **${percent(report.totals.saved.percent)}** `
    + `| **${tokens(report.totals.bank.jev.totalTokens)}** `
    + `| **${percent(report.totals.bank.saved.percent)}** |`,
  )
  return lines
}

/**
 * Render the reading guide and the method note.
 *
 * @param report - The comparison to render.
 * @returns Markdown lines.
 */
function renderNotes(report: BenchmarkReport): string[] {
  const { assumptions, totals } = report
  let modeNote = 'Jev input tokens are estimated with the same estimator as the baseline.'
  if (report.mode === 'measured') {
    modeNote = 'Jev input tokens are the ones the API reported in usage.input_tokens.'
  }
  return [
    '## Reading this',
    '',
    `- Mode: **${report.mode}**. ${modeNote}`,
    `- Bank mode covers the ${String(totals.bank.items)} items a shipped question bank matches; `
    + 'a dash means no bank covers that item.',
    `- Raw tokens: baseline ${tokens(totals.baseline.totalTokens)}, `
    + `Jev ${tokens(totals.jev.totalTokens)} (${percent(totals.saved.percent)}).`,
    `- Weighted at an output multiplier of ${String(assumptions.completionWeight)}: `
    + `baseline ${tokens(totals.weighted.baseline)}, Jev ${tokens(totals.weighted.jev)} `
    + `(${percent(totals.weighted.saved.percent)}). Raise --output-weight to model a provider `
    + 'that bills generated tokens above its input rate, which is what a reasoning model does.',
    `- Bank mode, weighted the same way: baseline ${tokens(totals.bank.baseline.weightedTokens)}, `
    + `Jev ${tokens(totals.bank.jev.weightedTokens)} `
    + `(${percent(totals.bank.weighted.percent)}). This is the call shape to prefer when the `
    + 'token bill is what is being optimised.',
    '',
    '## How the arms are counted',
    '',
    `- **Baseline** — the agent reads the instruction block (${String(assumptions.systemPromptTokens)} `
    + 'tokens), the question definitions and the state, then writes its reasoning and the '
    + 'answer block.',
    '- **Jev (ask)** — the agent writes a tool call carrying the state and the full question '
    + 'definitions, Jev bills the state once and evaluates every question in parallel, and the '
    + 'agent reads one short line per decision. TypeSafe bills input tokens only.',
    '- **Jev (bank)** — the same, except the agent sends a bank id instead of the question '
    + 'definitions, so the rubrics never enter its completion.',
    `- The Jev tool catalog costs the agent ${String(assumptions.toolSchemaTokens)} prompt tokens, `
    + 'counted against Jev in every row.',
    '',
    '## What is measured and what is modelled',
    '',
    'The baseline half is **modelled** from the reference reasoning shipped in the corpus; read',
    'it and judge it for yourself. The Jev half is **measured** in --live mode and modelled',
    'otherwise. The estimator is four characters per token, applied identically to both arms, so',
    'the ratio is more meaningful than the absolute figures.',
    '',
    'The honest headline: when the agent must restate the evidence inside its tool call, an',
    'ad-hoc Jev call is not automatically a raw-token win, because the state is paid for twice.',
    'The savings that do hold up are the built-in bank shape, the provider-weighted comparison,',
    'and the round trips Jev removes.',
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
    '# Jev token benchmark',
    '',
    ...renderMainTable(report),
    '',
    ...renderNotes(report),
  ].join('\n')
}

export {
  EMPTY_ARM,
  addCost,
  buildReport,
  percent,
  renderMainTable,
  renderNotes,
  renderReport,
  round,
  tokens,
  type BenchmarkMode,
  type BenchmarkReport,
  type BenchmarkRow,
}

