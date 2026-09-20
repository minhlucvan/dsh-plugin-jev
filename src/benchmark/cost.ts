/**
 * The two arms of the comparison, priced and timed.
 *
 * Token counts answer the wrong question. Jev bills **input only**, at a price
 * an order of magnitude below a chat model, and it produces no deliberation at
 * all; a reasoning model bills both sides and spends most of its time
 * generating. Counting tokens makes Jev look like a marginal trade. Pricing and
 * timing it makes the actual trade visible.
 *
 * Both arms answer the same questions about the same state, and both are
 * counted the same way: tokens the agent model reads, tokens it writes, and —
 * on the Jev side — tokens TypeSafe bills. Counting the agent's own tool call is
 * deliberate. A tool call is generated output, so the state the agent pastes
 * into it costs tokens and time exactly like any other completion.
 *
 * The baseline's completion is computed from the reference reasoning the corpus
 * ships. That is the one modelled quantity, and it is labelled as modelled
 * wherever it appears in a report.
 *
 * @module dsh-plugin-jev/benchmark/cost
 */

import type { BenchmarkItem } from './corpus.ts'
import { estimateJsonTokens, estimateTokens } from './estimator.ts'
import { getBank } from '#src/jev/catalog'

/** Token cost, dollar cost, and wall-clock cost of one arm for one item. */
interface ArmCost {
  /** Tokens the agent model reads. */
  promptTokens: number
  /** Tokens the agent model writes. */
  completionTokens: number
  /** Tokens TypeSafe bills for this item; zero on the baseline arm. */
  billedInputTokens: number
  /** Total tokens the comparison counts. */
  totalTokens: number
  /** Dollars billed across both providers. */
  costUsd: number
  /** Wall-clock seconds, dominated by generated tokens. */
  seconds: number
}

/** Deployment-shaped constants both arms are measured against. */
interface CostAssumptions {
  /** Tokens the classification instruction block occupies. */
  systemPromptTokens: number
  /** Tokens the Jev tool catalog occupies in the agent's prompt. */
  toolSchemaTokens: number
  /** Agent-model input price, USD per million tokens. */
  llmInputPricePerMtok: number
  /** Agent-model output price, USD per million tokens. */
  llmOutputPricePerMtok: number
  /** Jev input price, USD per million tokens. Jev output is free. */
  jevInputPricePerMtok: number
  /** Agent-model generation rate, output tokens per second. */
  llmTokensPerSecond: number
  /** Round-trip seconds assumed for a Jev call that was not measured. */
  jevLatencySeconds: number
}

/** Tokens in one million, the unit every published price uses. */
const TOKENS_PER_MTOK = 1_000_000

/** Token count meaning "nothing to compare against". */
const NO_TOKENS = 0

/** Saving reported when the baseline spent nothing. */
const NO_PERCENT = 0

/** Scale factor converting a fraction to a percentage. */
const PERCENT_SCALE = 100

/**
 * Default assumptions.
 *
 * The Jev price is TypeSafe's published rate (`$42` per billion tokens, which
 * is `$0.042` per million), input only — output tokens are free and are
 * reported for completeness.
 *
 * The agent-model prices are DeepSeek's published **off-peak** rates for
 * `deepseek-flash` (`$0.15` per million input on a cache miss, `$0.60` per
 * million output). Peak hours are double that, which moves the comparison
 * further in Jev's favour, not less. Override both with the CLI flags if you run
 * a different model.
 *
 * `llmTokensPerSecond` converts generated tokens into wall-clock time. It is a
 * throughput figure, not a latency figure: the first token's wait is small next
 * to the seconds a thousand-token deliberation takes to write.
 */
const DEFAULT_ASSUMPTIONS: CostAssumptions = {
  systemPromptTokens: 180,
  toolSchemaTokens: 240,
  llmInputPricePerMtok: 0.15,
  llmOutputPricePerMtok: 0.6,
  jevInputPricePerMtok: 0.042,
  llmTokensPerSecond: 50,
  jevLatencySeconds: 1.5,
}

/**
 * Combine an arm's parts into its totals.
 *
 * Cost is the sum over both providers: the agent model bills the prompt and the
 * completion, TypeSafe bills the input it read. Time is dominated by the tokens
 * the agent has to write, plus the round trip when Jev was called.
 *
 * @param parts - The measured parts.
 * @param latencySeconds - Measured Jev round trip, when one was measured.
 * @returns The arm's cost.
 */
function armCost(parts: ArmParts, latencySeconds?: number): ArmCost {
  const { assumptions } = parts
  const costUsd =
    (parts.promptTokens / TOKENS_PER_MTOK) * assumptions.llmInputPricePerMtok
    + (parts.completionTokens / TOKENS_PER_MTOK) * assumptions.llmOutputPricePerMtok
    + (parts.billedInputTokens / TOKENS_PER_MTOK) * assumptions.jevInputPricePerMtok
  let roundTrip = 0
  if (parts.billedInputTokens > NO_TOKENS) {
    roundTrip = latencySeconds ?? assumptions.jevLatencySeconds
  }
  return {
    promptTokens: parts.promptTokens,
    completionTokens: parts.completionTokens,
    billedInputTokens: parts.billedInputTokens,
    totalTokens: parts.promptTokens + parts.completionTokens + parts.billedInputTokens,
    costUsd,
    seconds: parts.completionTokens / assumptions.llmTokensPerSecond + roundTrip,
  }
}

/** Figures a live run reported for one item. */
interface MeasuredJev {
  /** Tokens TypeSafe billed. */
  billedInputTokens: number
  /** Round trip in seconds, when it was timed. */
  latencySeconds: number | undefined
}

/** The measured parts of one arm's cost, before they are combined. */
interface ArmParts {
  /** Tokens the agent reads. */
  promptTokens: number
  /** Tokens the agent writes. */
  completionTokens: number
  /** Tokens TypeSafe bills. */
  billedInputTokens: number
  /** Deployment-shaped constants. */
  assumptions: CostAssumptions
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
  return armCost({ promptTokens, completionTokens, billedInputTokens: NO_TOKENS, assumptions })
}

/**
 * Cost of answering the item's questions through an ad-hoc Jev tool call.
 *
 * The agent still writes the tool call, which restates the state and the
 * question definitions, and it still reads the result. What it does not do is
 * deliberate: the baseline's reasoning tokens have no counterpart here.
 *
 * @param item - Corpus item being measured.
 * @param assumptions - Deployment-shaped constants.
 * @returns The ad-hoc Jev arm's modelled cost.
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
  return armCost({ promptTokens, completionTokens, billedInputTokens, assumptions })
}

/**
 * Cost of answering with a built-in question bank.
 *
 * This is the shape the cost claim rests on. The agent sends the state and a
 * bank id, so the question definitions — option maps, level ladders, criteria
 * prose — never enter its completion. They are authored once, in the package,
 * and paid for only as Jev input, which is the cheapest token in the
 * comparison.
 *
 * @param item - Corpus item being measured.
 * @param assumptions - Deployment-shaped constants.
 * @param measuredInputTokens - Tokens the API billed, when it was measured.
 * @param latencySeconds - Measured round trip, when it was measured.
 * @returns The bank-mode cost, or undefined when no shipped bank matches.
 */
function jevBankCost(
  item: BenchmarkItem,
  assumptions: CostAssumptions = DEFAULT_ASSUMPTIONS,
  measured?: MeasuredJev,
): ArmCost | undefined {
  if (item.bank === undefined) {
    return undefined
  }
  const bank = getBank(item.bank)
  if (bank === undefined) {
    return undefined
  }
  const billedInputTokens = measured?.billedInputTokens ?? estimateJsonTokens({
    model: 'jev-latest',
    state: item.state,
    questions: bank.questions,
  })
  const promptTokens =
    assumptions.toolSchemaTokens + estimateTokens(renderedSummary(item))
  const completionTokens = estimateJsonTokens({ state: item.state, bank: bank.id })
  return armCost(
    { promptTokens, completionTokens, billedInputTokens, assumptions },
    measured?.latencySeconds,
  )
}

/**
 * Cost of the ad-hoc Jev arm when TypeSafe reported real usage.
 *
 * @param item - Corpus item being measured.
 * @param billedInputTokens - `input_tokens` from the live response.
 * @param assumptions - Deployment-shaped constants.
 * @param latencySeconds - Measured round trip.
 * @returns The ad-hoc arm's measured cost.
 */
function jevMeasuredCost(
  item: BenchmarkItem,
  measured: MeasuredJev,
  assumptions: CostAssumptions = DEFAULT_ASSUMPTIONS,
): ArmCost {
  const modelled = jevModelledCost(item, assumptions)
  return armCost(
    {
      promptTokens: modelled.promptTokens,
      completionTokens: modelled.completionTokens,
      billedInputTokens: measured.billedInputTokens,
      assumptions,
    },
    measured.latencySeconds,
  )
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

/**
 * Difference between two arms in dollars.
 *
 * @param baseline - Baseline arm cost.
 * @param jev - Jev arm cost.
 * @returns Absolute and relative saving in dollars.
 */
function costSaving(
  baseline: ArmCost,
  jev: ArmCost,
): { usd: number; percent: number } {
  const usd = baseline.costUsd - jev.costUsd
  if (baseline.costUsd === NO_TOKENS) {
    return { usd, percent: NO_PERCENT }
  }
  return { usd, percent: (usd / baseline.costUsd) * PERCENT_SCALE }
}

/**
 * Difference between two arms in seconds.
 *
 * @param baseline - Baseline arm cost.
 * @param jev - Jev arm cost.
 * @returns Absolute and relative saving in seconds.
 */
function timeSaving(
  baseline: ArmCost,
  jev: ArmCost,
): { seconds: number; percent: number } {
  const seconds = baseline.seconds - jev.seconds
  if (baseline.seconds === NO_TOKENS) {
    return { seconds, percent: NO_PERCENT }
  }
  return { seconds, percent: (seconds / baseline.seconds) * PERCENT_SCALE }
}

export {
  DEFAULT_ASSUMPTIONS,
  TOKENS_PER_MTOK,
  armCost,
  baselineCost,
  costSaving,
  jevBankCost,
  jevMeasuredCost,
  jevModelledCost,
  renderedSummary,
  saving,
  timeSaving,
  type ArmCost,
  type ArmParts,
  type MeasuredJev,
  type CostAssumptions,
}

