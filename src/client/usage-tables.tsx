/**
 * The usage panel's figures: cumulative totals, per-tool aggregates, recent
 * evaluations and the question banks this build ships.
 *
 * Each table reads the store itself rather than receiving a report as a prop,
 * so a table can be reordered or rendered twice without rewiring the panel, and
 * an update to one slice does not re-render the others.
 *
 * @module dsh-plugin-jev/client/usage-tables
 */

import type { ReactElement } from 'react'

import { useUsageReport } from './usage-hooks.ts'
import type { Translate } from './translate.ts'

/** Tokens in one million, for the billed-volume figure. */
const TOKENS_PER_MEGA = 1_000_000

/** Decimal places the billed-volume figure keeps. */
const MEGA_DIGITS = 4

/** Offsets of the time-of-day substring inside an ISO timestamp. */
const TIME_START = 11
const TIME_END = 19

/** Length of an empty list, named to keep it out of the magic-number rule. */
const NONE = 0

/** Decimal places a count keeps; every counter the ledger records is whole. */
const COUNT_DIGITS = 0

/** Props accepted by every panel part. */
interface UsageTablesProps {
  /** Translator bound to this feature's namespace. */
  translate: Translate
}

/**
 * Format a count for display.
 *
 * @param value - The number to render.
 * @returns The number in full decimal notation.
 */
function formatCount(value: number): string {
  return value.toFixed(COUNT_DIGITS)
}

/**
 * Format a token count as millions.
 *
 * @param tokens - Billed input tokens.
 * @returns The token count in Mtok, to four decimal places.
 */
function formatMegaTokens(tokens: number): string {
  return (tokens / TOKENS_PER_MEGA).toFixed(MEGA_DIGITS)
}

/**
 * Format a wall-clock duration.
 *
 * @param durationMs - Duration in milliseconds.
 * @param unit - Translated unit suffix.
 * @returns The duration and its unit.
 */
function formatDuration(durationMs: number, unit: string): string {
  return `${formatCount(durationMs)} ${unit}`
}

/**
 * Format an epoch timestamp as a time of day.
 *
 * The ISO string is sliced rather than localised so the panel renders the same
 * text in every environment, including the test runner.
 *
 * @param at - Epoch milliseconds.
 * @returns The time of day, as `HH:MM:SS`.
 */
function formatTimestamp(at: number): string {
  return new Date(at).toISOString().slice(TIME_START, TIME_END)
}

/**
 * Render the notice shown when a list has no rows.
 *
 * @param props - The bound translator.
 * @returns The empty-state paragraph.
 */
function UsageEmpty({ translate }: UsageTablesProps): ReactElement {
  return (
    <p className='jev-empty' role='status'>
      {translate('usageEmpty')}
    </p>
  )
}

/**
 * Render the cumulative totals.
 *
 * @param props - The bound translator.
 * @returns The totals list, or nothing before the first read settles.
 */
function UsageTotalsList({ translate }: UsageTablesProps): ReactElement | undefined {
  const { report } = useUsageReport()
  if (report === undefined) {
    return undefined
  }
  const { totals } = report
  return (
    <>
      <h4 className='jev-group__title'>{translate('usageTotalsHeading')}</h4>
      <dl className='jev-stats'>
        <dt>{translate('usageCalls')}</dt>
        <dd>{formatCount(totals.calls)}</dd>
        <dt>{translate('usageInputTokens')}</dt>
        <dd>{formatCount(totals.inputTokens)}</dd>
        <dt>{translate('usageOutputTokens')}</dt>
        <dd>{formatCount(totals.outputTokens)}</dd>
        <dt>{translate('usageMegaTokens')}</dt>
        <dd>{formatMegaTokens(totals.inputTokens)}</dd>
        <dt>{translate('usageQuestions')}</dt>
        <dd>{formatCount(totals.questions)}</dd>
        <dt>{translate('usageStateChars')}</dt>
        <dd>{formatCount(totals.stateChars)}</dd>
      </dl>
    </>
  )
}

/**
 * Render the per-tool aggregates.
 *
 * @param props - The bound translator.
 * @returns The per-tool table, or the empty notice.
 */
function UsageByTool({ translate }: UsageTablesProps): ReactElement {
  const { report } = useUsageReport()
  const rows = Object.entries(report?.byTool ?? {})
  if (rows.length === NONE) {
    return (
      <>
        <h4 className='jev-group__title'>{translate('usageByToolHeading')}</h4>
        <UsageEmpty translate={translate} />
      </>
    )
  }
  return (
    <>
      <h4 className='jev-group__title'>{translate('usageByToolHeading')}</h4>
      <table className='jev-table'>
        <thead>
          <tr>
            <th scope='col'>{translate('usageColumnTool')}</th>
            <th scope='col'>{translate('usageCalls')}</th>
            <th scope='col'>{translate('usageColumnInputTokens')}</th>
            <th scope='col'>{translate('usageColumnOutputTokens')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([tool, totals]) => (
            <tr key={tool}>
              <th scope='row'>{tool}</th>
              <td>{formatCount(totals.calls)}</td>
              <td>{formatCount(totals.inputTokens)}</td>
              <td>{formatCount(totals.outputTokens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

/**
 * Render the recent evaluations.
 *
 * @param props - The bound translator.
 * @returns The recent table, or the empty notice.
 */
function UsageRecent({ translate }: UsageTablesProps): ReactElement {
  const { report } = useUsageReport()
  const entries = report?.recent ?? []
  if (entries.length === NONE) {
    return (
      <>
        <h4 className='jev-group__title'>{translate('usageRecentHeading')}</h4>
        <UsageEmpty translate={translate} />
      </>
    )
  }
  const unit = translate('usageMillis')
  return (
    <>
      <h4 className='jev-group__title'>{translate('usageRecentHeading')}</h4>
      <table className='jev-table'>
        <thead>
          <tr>
            <th scope='col'>{translate('usageColumnWhen')}</th>
            <th scope='col'>{translate('usageColumnTool')}</th>
            <th scope='col'>{translate('usageColumnModel')}</th>
            <th scope='col'>{translate('usageColumnQuestions')}</th>
            <th scope='col'>{translate('usageColumnStateChars')}</th>
            <th scope='col'>{translate('usageColumnInputTokens')}</th>
            <th scope='col'>{translate('usageColumnOutputTokens')}</th>
            <th scope='col'>{translate('usageColumnDuration')}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={`${entry.tool}-${String(entry.at)}`}>
              <td>{formatTimestamp(entry.at)}</td>
              <td>{entry.tool}</td>
              <td>{entry.model}</td>
              <td>{formatCount(entry.questions)}</td>
              <td>{formatCount(entry.stateChars)}</td>
              <td>{formatCount(entry.inputTokens)}</td>
              <td>{formatCount(entry.outputTokens)}</td>
              <td>{formatDuration(entry.durationMs, unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

/**
 * Render the question banks this build ships.
 *
 * @param props - The bound translator.
 * @returns The bank list, or the empty notice.
 */
function UsageCatalog({ translate }: UsageTablesProps): ReactElement {
  const { banks } = useUsageReport()
  if (banks.length === NONE) {
    return (
      <>
        <h4 className='jev-group__title'>{translate('usageCatalogHeading')}</h4>
        <p role='status'>{translate('usageCatalogEmpty')}</p>
      </>
    )
  }
  return (
    <>
      <h4 className='jev-group__title'>{translate('usageCatalogHeading')}</h4>
      <ul>
        {banks.map((bank) => (
          <li key={bank.id}>{bank.title}</li>
        ))}
      </ul>
    </>
  )
}

export {
  UsageByTool,
  UsageCatalog,
  UsageRecent,
  UsageTotalsList,
  formatCount,
  formatDuration,
  formatMegaTokens,
  formatTimestamp,
  type UsageTablesProps,
}
