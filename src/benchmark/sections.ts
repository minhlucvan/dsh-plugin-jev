/**
 * The report's sections, one function each.
 *
 * Cost leads, because it is the axis a decision is actually made on, and because
 * the axes disagree: Jev can move *more* tokens at a *lower* price. Time sits
 * beside it, tokens follow as the supporting figure, and correctness sits last,
 * so a cheap shape cannot win by answering the wrong question.
 *
 * @module dsh-plugin-system-one/benchmark/sections
 */

import type { ApproachId } from './approaches.ts'
import { PERCENT_SCALE, duration, money, share, signedPercent, tokenCount } from './format.ts'
import type { ApproachComparison, BenchmarkReport } from './report.ts'

/** Nothing present, which is what an unmeasured figure reports. */
const NOTHING = 0

/**
 * Format an approach's graded agreement.
 *
 * @param comparison - The approach's comparison.
 * @returns The agreement cell.
 */
function agreementCell(comparison: ApproachComparison): string {
  if (comparison.agreement.checked === NOTHING) {
    return '—'
  }
  const matched = tokenCount(comparison.agreement.matched)
  const checked = tokenCount(comparison.agreement.checked)
  return `${share(comparison.agreement.percent)} (${matched}/${checked})`
}

/**
 * Read the approach a deployment should ship.
 *
 * A shape is only eligible if it answered everything it was graded on: a cheap
 * shape that gets the decision wrong is not a cheaper integration, it is a
 * different product.
 *
 * @param report - The comparison.
 * @returns The best approach, or undefined when nothing is priced.
 */
function recommended(report: BenchmarkReport): ApproachComparison | undefined {
  const priced = report.approaches.filter(
    comparison => comparison.id !== 'reason' && comparison.items > NOTHING,
  )
  const graded = priced.filter(comparison => comparison.agreement.checked > NOTHING)
  let eligible = priced
  if (graded.length > NOTHING) {
    eligible = graded
  }
  let best: ApproachComparison | undefined = undefined
  for (const comparison of eligible) {
    if (best === undefined) {
      best = comparison
    } else if (comparison.agreement.percent > best.agreement.percent) {
      /*
       * Accuracy is not traded for money. A shape that answers the decision
       * wrongly is not a cheaper integration, so the more accurate shape wins
       * even when it costs more.
       */
      best = comparison
    } else if (
      comparison.agreement.percent === best.agreement.percent
      && comparison.cost.percent > best.cost.percent
    ) {
      best = comparison
    }
  }
  return best
}

/** Render the headline the report exists to deliver. */
function renderRecommendation(report: BenchmarkReport): string[] {
  const best = recommended(report)
  if (best === undefined) {
    return ['## Recommendation', '', 'Nothing was priced.', '']
  }
  let kept = ''
  if (best.escalated > NOTHING) {
    kept = `, keeping ${tokenCount(best.escalated)} answers for the model`
  }
  const scenarios = tokenCount(best.items)
  const decisions = tokenCount(best.decisions)
  return [
    '## Recommendation',
    '',
    `**${best.label}** — ${best.shape}`,
    '',
    `Over the ${scenarios} scenarios this shape covers (${decisions} decisions): `
    + `**${signedPercent(best.cost.percent)} cost**, **${signedPercent(best.time.percent)} time**, `
    + `${signedPercent(best.tokens.percent)} tokens against reasoning it out${kept}.`,
    '',
  ]
}

/** Render every approach over the scenarios it can cover. */
function renderApproachTable(report: BenchmarkReport): string[] {
  const lines = [
    '## Every shape, over what it covers',
    '',
    '| Shape | Scenarios | Decisions | Cost | Time | Tokens | Kept | Answers matched |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const comparison of report.approaches) {
    let axis = '| — | — | — | — '
    if (comparison.id !== 'reason' && comparison.items > NOTHING) {
      let kept = '—'
      if (comparison.id === 'gated') {
        kept = `${tokenCount(comparison.escalated)}/${tokenCount(comparison.decisions)}`
      }
      axis = `| ${signedPercent(comparison.cost.percent)} | ${signedPercent(comparison.time.percent)} | ${signedPercent(comparison.tokens.percent)} | ${kept} `
    }
    lines.push(
      `| ${comparison.label} | ${tokenCount(comparison.items)} | ${tokenCount(comparison.decisions)} ${axis}| ${agreementCell(comparison)} |`,
    )
  }
  lines.push(
    '',
    'Positive is better. Each row is compared against reasoning *its own* scenarios',
    'out, so a shape that covers fewer scenarios is not flattered by the ones it skips.',
    '',
  )
  return lines
}

/**
 * Render the absolute figures behind every approach.
 *
 * @param report - The comparison.
 * @returns Markdown lines.
 */
function renderAbsolutes(report: BenchmarkReport): string[] {
  const lines = [
    '## What that is in absolute terms',
    '',
    'The figure in brackets is what reasoning the same scenarios out costs.',
    '',
    '| Shape | Cost | Time | Tokens |',
    '| --- | ---: | ---: | ---: |',
  ]
  for (const comparison of report.approaches) {
    const { baseline, jev } = comparison
    lines.push(
      `| ${comparison.label} | ${money(jev.usd)} (${money(baseline.usd)}) | `
      + `${duration(jev.seconds)} (${duration(baseline.seconds)}) | `
      + `${tokenCount(jev.tokens)} (${tokenCount(baseline.tokens)}) |`,
    )
  }
  lines.push('')
  return lines
}

/**
 * Render the per-task matrix.
 *
 * @param report - The comparison.
 * @returns Markdown lines.
 */
function renderTaskTable(report: BenchmarkReport): string[] {
  const arms = report.approaches.filter(comparison => comparison.id !== 'reason')
  const lines = [
    '## Per task class',
    '',
    'Cells are cost / time saved against reasoning that class out.',
    '',
    `| Task | Decisions | ${arms.map(arm => arm.label).join(' | ')} |`,
    `| --- | ---: | ${arms.map(() => '---:').join(' | ')} |`,
  ]
  for (const entry of report.byTask.filter(candidate => candidate.items > NOTHING)) {
    const cells = arms.map((arm) => {
      const cell = entry.cells.find(candidate => candidate.id === arm.id)
      if (cell === undefined || cell.items === NOTHING) {
        return '—'
      }
      return `${signedPercent(cell.cost)} / ${signedPercent(cell.time)}`
    })
    lines.push(`| ${entry.task} | ${tokenCount(entry.decisions)} | ${cells.join(' | ')} |`)
  }
  lines.push('')
  return lines
}

/** One disagreement, with every shape that produced it. */
interface Disagreement {
  /** Corpus item the decision belongs to. */
  itemId: string
  /** Question id. */
  question: string
  /** Answer a careful reader reaches. */
  expected: string
  /** Answer the shapes produced. */
  answered: string
  /** Shapes that answered this way. */
  shapes: string[]
}

/**
 * Group the disagreements by the answer that was given.
 *
 * @param report - The comparison.
 * @returns One entry per distinct wrong answer.
 */
function disagreements(report: BenchmarkReport): Disagreement[] {
  const grouped = new Map<string, Disagreement>()
  for (const miss of report.mismatches) {
    const key = `${miss.itemId}|${miss.question}|${miss.answered}`
    const existing = grouped.get(key)
    if (existing === undefined) {
      grouped.set(key, {
        itemId: miss.itemId,
        question: miss.question,
        expected: miss.expected,
        answered: miss.answered,
        shapes: [miss.shape],
      })
    } else {
      existing.shapes.push(miss.shape)
    }
  }
  return [...grouped.values()]
}

/**
 * Render every decision the shapes got wrong.
 *
 * Cost alone cannot rank integration shapes, so the report has to publish what
 * the cheap shape answered — including where it disagreed with the answer a
 * careful reader reaches.
 *
 * @param report - The comparison.
 * @returns Markdown lines.
 */
function renderMismatches(report: BenchmarkReport): string[] {
  const found = disagreements(report)
  if (found.length === NOTHING) {
    return []
  }
  const lines = [
    '## Where the answers disagreed',
    '',
    'Every measured shape is graded against the answer a careful reader reaches.',
    'These are the decisions that came back different:',
    '',
    '| Scenario | Question | Expected | Answered | Shapes |',
    '| --- | --- | --- | --- | --- |',
  ]
  for (const miss of found) {
    const shapes = [...new Set(miss.shapes)].join(', ')
    lines.push(
      `| ${miss.itemId} | ${miss.question} | ${miss.expected} | ${miss.answered} | ${shapes} |`,
    )
  }
  lines.push('')
  return lines
}

/**
 * Render the fallback curve.
 *
 * @param report - The comparison.
 * @returns Markdown lines.
 */
function renderBreakEven(report: BenchmarkReport): string[] {
  const { breakEven } = report
  if (breakEven.curve.length === NOTHING) {
    return []
  }
  const lines = [
    '## Where the fallback stops paying',
    '',
    'Escalating the least confident answers first, over the scenarios a shipped bank covers:',
    '',
    '| Answers kept | Cost | Time |',
    '| ---: | ---: | ---: |',
  ]
  for (const point of breakEven.curve) {
    lines.push(
      `| ${share(point.escalatePercent)} | ${signedPercent(point.costPercent)} | ${signedPercent(point.timePercent)} |`,
    )
  }
  lines.push(
    '',
    `The bank shape stays cheaper on cost until **${share(breakEven.costPercent)}** of `
    + `decisions are handed back, and faster until **${share(breakEven.timePercent)}**.`,
    '',
  )
  return lines
}

/**
 * Render one row per scenario, per approach.
 *
 * @param report - The comparison.
 * @returns Markdown lines.
 */
function renderItemTable(report: BenchmarkReport): string[] {
  const lines = [
    '## Per scenario',
    '',
    'Cost saved against reasoning the same scenario out.',
    '',
    '| Scenario | Task | Decisions | Bank | Ad-hoc | Per question |',
    '| --- | --- | ---: | ---: | ---: | ---: |',
  ]
  for (const row of report.rows) {
    const baseline = row.arms.reason
    let cells = '| — | — | —'
    if (baseline !== undefined) {
      const saved = (id: ApproachId): string => {
        const arm = row.arms[id]
        if (arm === undefined) {
          return '—'
        }
        return signedPercent(
          ((baseline.costUsd - arm.costUsd) / baseline.costUsd) * PERCENT_SCALE,
        )
      }
      cells = `| ${saved('bank')} | ${saved('adhoc')} | ${saved('split')}`
    }
    lines.push(
      `| ${row.title} | ${row.task} | ${tokenCount(row.decisions)} ${cells} |`,
    )
  }
  lines.push('')
  return lines
}

export {
  agreementCell,
  disagreements,
  recommended,
  renderAbsolutes,
  renderApproachTable,
  renderBreakEven,
  renderItemTable,
  renderMismatches,
  renderRecommendation,
  renderTaskTable,
}
