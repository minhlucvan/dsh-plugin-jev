/**
 * Where the priced quantities come from, and how one arm's parts become money
 * and seconds.
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
 * wherever it appears in a report. Which *shape* a Jev call takes is priced in
 * `./approaches.ts`.
 *
 * @module dsh-plugin-system-one/benchmark/cost
 */

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
  /**
   * Confidence below which the gated arm reasons an answer out itself.
   *
   * This is the profile's confirm floor, restated here because the integration
   * question — bank alone, or bank plus a fallback — is decided by it.
   */
  escalationFloor: number
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
  escalationFloor: 0.85,
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
  costSaving,
  saving,
  timeSaving,
  type ArmCost,
  type ArmParts,
  type CostAssumptions,
  type MeasuredJev,
}
