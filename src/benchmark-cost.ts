/**
 * The two arms of the token comparison.
 *
 * Both arms answer the same questions about the same state, and both are
 * counted the same way: tokens the agent model must read, tokens it must write,
 * and — on the Jev side — tokens TypeSafe bills. Counting the agent's own tool
 * call is deliberate. A tool call is generated output, so the state the agent
 * pastes into it costs tokens exactly like any other completion; a comparison
 * that quietly dropped it would be flattering and wrong.
 *
 * The baseline arm's completion is computed from the reference reasoning the
 * corpus ships. That is the one modelled quantity in the comparison, and it is
 * labelled as modelled everywhere it appears in a report.
 *
 * @module dsh-plugin-jev/benchmark-cost
 */

import type { BenchmarkItem } from './benchmark-corpus.ts'
import { estimateJsonTokens, estimateTokens } from './benchmark-estimator.ts'
import { getBank } from './jev/catalog.ts'

/** Token cost of one arm for one corpus item. */
interface ArmCost {
  /** Tokens the agent model reads. */
  promptTokens: number
  /** Tokens the agent model writes. */
  completionTokens: number
  /** Tokens TypeSafe bills for this item; zero on the baseline arm. */
  billedInputTokens: number
  /** Total tokens the comparison counts. */
  totalTokens: number
  /**
   * Total tokens with completion tokens multiplied by completionWeight.
   *
   * This is the figure that tracks what a provider actually charges, because
   * reasoning models bill generated tokens at several times their input rate.
   */
  weightedTokens: number
}

/** Deployment-shaped constants both arms are measured against. */
interface CostAssumptions {
  /** Tokens the classification instruction block occupies. */
  systemPromptTokens: number
  /** Tokens the Jev tool catalog occupies in the agent's prompt. */
  toolSchemaTokens: number
  /** Multiplier applied to completion tokens when weighing cost, not usage. */
  completionWeight: number
}

/**
 * Default assumptions.
 *
 * `systemPromptTokens` and `toolSchemaTokens` are prompt overheads the
 * deployment controls, and `completionWeight` is 1 because the headline claim
 * is about token *usage*. Set it to the price ratio of your provider to turn
 * the same table into a cost comparison.
 */
const DEFAULT_ASSUMPTIONS: CostAssumptions = {
  systemPromptTokens: 180,
  toolSchemaTokens: 240,
  completionWeight: 1,
}

/** Token count meaning "nothing to compare against". */
const NO_TOKENS = 0

/** Saving reported when the baseline spent nothing. */
const NO_PERCENT = 0

/** Scale factor converting a fraction to a percentage. */
const PERCENT_SCALE = 100

/** The measured parts of one arm's cost, before they are combined. */
interface ArmParts {
  /** Tokens the agent reads. */
  promptTokens: number
  /** Tokens the agent writes. */
  completionTokens: number
  /** Tokens TypeSafe bills. */
  billedInputTokens: number
  /** Multiplier applied to generated tokens. */
  completionWeight: number
}

/**
 * Combine an arm's parts into its totals.
 *
 * @param parts - The measured parts.
 * @returns The arm's cost.
 */
function armCost(parts: ArmParts): ArmCost {
  return {
    promptTokens: parts.promptTokens,
    completionTokens: parts.completionTokens,
    billedInputTokens: parts.billedInputTokens,
    totalTokens: parts.promptTokens + parts.completionTokens + parts.billedInputTokens,
    weightedTokens:
      parts.promptTokens
      + Math.round(parts.completionTokens * parts.completionWeight)
      + parts.billedInputTokens,
  }
}

/**
 * Render the compact answer block a Jev tool returns to the model.
 *
 * Mirrors what the tool face actually renders: one short line per decision
 * rather than a JSON document, which is the whole point of the projection.
 *
 * @param item - Corpus item being measured.
 * @returns The model-facing summary text.
 */
function renderedSummary(item: BenchmarkItem): string {
  return Object.entries(item.expected)
    .map(([id, value]) => `${id}: ${value}`)
    .join('\n')
}

/**
 * Cost of answering the item's questions in the agent's own context.
 *
 * @param item - Corpus item being measured.
 * @param assumptions - Deployment-shaped constants.
 * @returns The baseline arm's cost.
 */
function baselineCost(
  item: BenchmarkItem,
  assumptions: CostAssumptions = DEFAULT_ASSUMPTIONS,
): ArmCost {
  const promptTokens =
    assumptions.systemPromptTokens
    + estimateJsonTokens(item.questions)
    + estimateJsonTokens(item.state)
  const reasoning = Object.values(item.baselineNotes).join('\n')
  const completionTokens =
    estimateTokens(reasoning) + estimateJsonTokens(item.expected)
  return armCost({
    promptTokens,
    completionTokens,
    billedInputTokens: NO_TOKENS,
    completionWeight: assumptions.completionWeight,
  })
}

/**
 * Cost of answering the item's questions through a Jev tool call.
 *
 * The agent still writes the tool call, which restates the state, and it still
 * reads the result. What it does not do is deliberate: the baseline's reasoning
 * tokens have no counterpart here.
 *
 * @param item - Corpus item being measured.
 * @param assumptions - Deployment-shaped constants.
 * @returns The Jev arm's modelled cost.
 */
function jevModelledCost(
  item: BenchmarkItem,
  assumptions: CostAssumptions = DEFAULT_ASSUMPTIONS,
): ArmCost {
  const toolCall = { state: item.state, questions: item.questions }
  const billedInputTokens = estimateJsonTokens({ model: 'jev-latest', ...toolCall })
  const promptTokens =
    assumptions.toolSchemaTokens + estimateTokens(renderedSummary(item))
  const completionTokens = estimateJsonTokens(toolCall)
  return armCost({
    promptTokens,
    completionTokens,
    billedInputTokens,
    completionWeight: assumptions.completionWeight,
  })
}

/**
 * Cost of answering with a built-in question bank.
 *
 * This is the shape the token claim actually rests on. The agent sends the
 * state and a bank id, so the question definitions -- option maps, level
 * ladders, criteria prose -- never enter its completion at all. They are
 * authored once, in the package, and paid for only as Jev input.
 *
 * @param item - Corpus item being measured.
 * @param assumptions - Deployment-shaped constants.
 * @returns The bank-mode cost, or undefined when no shipped bank matches.
 */
function jevBankCost(
  item: BenchmarkItem,
  assumptions: CostAssumptions = DEFAULT_ASSUMPTIONS,
): ArmCost | undefined {
  if (item.bank === undefined) {
    return undefined
  }
  const bank = getBank(item.bank)
  if (bank === undefined) {
    return undefined
  }
  const billedInputTokens = estimateJsonTokens({
    model: 'jev-latest',
    state: item.state,
    questions: bank.questions,
  })
  const promptTokens =
    assumptions.toolSchemaTokens + estimateTokens(renderedSummary(item))
  const completionTokens = estimateJsonTokens({ state: item.state, bank: bank.id })
  return armCost({
    promptTokens,
    completionTokens,
    billedInputTokens,
    completionWeight: assumptions.completionWeight,
  })
}

/**
 * Cost of the Jev arm when TypeSafe reported real usage.
 *
 * @param item - Corpus item being measured.
 * @param billedInputTokens - `input_tokens` from the live response.
 * @param assumptions - Deployment-shaped constants.
 * @returns The Jev arm's measured cost.
 */
function jevMeasuredCost(
  item: BenchmarkItem,
  billedInputTokens: number,
  assumptions: CostAssumptions = DEFAULT_ASSUMPTIONS,
): ArmCost {
  const modelled = jevModelledCost(item, assumptions)
  return { ...modelled, billedInputTokens }
}

/**
 * Difference between two arms.
 *
 * @param baseline - Baseline arm cost.
 * @param jev - Jev arm cost.
 * @returns Absolute and relative saving in total tokens.
 */
function saving(
  baseline: ArmCost,
  jev: ArmCost,
): { tokens: number; percent: number } {
  const tokens = baseline.totalTokens - jev.totalTokens
  if (baseline.totalTokens === NO_TOKENS) {
    return { tokens, percent: NO_PERCENT }
  }
  return { tokens, percent: (tokens / baseline.totalTokens) * PERCENT_SCALE }
}

export {
  DEFAULT_ASSUMPTIONS,
  baselineCost,
  jevBankCost,
  jevMeasuredCost,
  jevModelledCost,
  renderedSummary,
  saving,
  type ArmCost,
  type CostAssumptions,
}

