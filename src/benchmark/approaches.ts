/**
 * The integration shapes, priced.
 *
 * The benchmark's product question is not "is Jev cheaper" — that answer is
 * fixed by the price list — but "in what shape should an agent call it". Five
 * shapes cover the realistic answers:
 *
 * 1. `reason` — no call at all. The model deliberates in its own context. This
 *    is the baseline every other shape is compared against, and the only
 *    modelled one.
 * 2. `bank` — one `jev_reason` call naming a shipped bank. The question
 *    definitions stay in the package, so the model never writes them.
 * 3. `gated` — the bank call, then the model reasons out only the answers whose
 *    confidence fell below the profile's confirm floor. It prices what a
 *    deployment actually does with a calibrated answer: act on it when the model
 *    is sure, keep the judgement when it is not.
 * 4. `adhoc` — one `jev_ask` call whose questions the model writes into its
 *    own completion. Same one round trip, more generated tokens.
 * 5. `split` — one call per question. The state is re-sent every time and the
 *    round trips stop overlapping; it is the shape the doctrine warns about,
 *    priced so the warning has a number.
 *
 * @module dsh-plugin-system-one/benchmark/approaches
 */

import { getBank } from '#src/jev/catalog'
import { DEFAULT_ASSUMPTIONS, armCost } from './cost.ts'
import type { ArmCost, ArmParts, CostAssumptions, MeasuredJev } from './cost.ts'
import type { BenchmarkItem } from './corpus.ts'
import { estimateJsonTokens, estimateTokens } from './estimator.ts'
import { questionsFor, reasoningSlice, renderedSummary } from './questioning.ts'

/** One way of getting the decisions answered. */
type ApproachId = 'reason' | 'bank' | 'gated' | 'adhoc' | 'split'

/** An approach and the shape it stands for. */
interface Approach {
  /** Stable id used in reports and on the command line. */
  id: ApproachId
  /** Short label for a table row. */
  label: string
  /** One sentence describing the call shape. */
  shape: string
}

/** Every approach, in report order. */
const APPROACHES: readonly Approach[] = [
  {
    id: 'reason',
    label: 'Reason it out',
    shape: 'No Jev call: the model deliberates in its own context.',
  },
  {
    id: 'bank',
    label: 'Bank call',
    shape: 'One call naming a shipped bank; the questions stay in the package.',
  },
  {
    id: 'gated',
    label: 'Bank + fallback',
    shape: 'The bank call, then the model reasons out answers below the confirm floor.',
  },
  {
    id: 'adhoc',
    label: 'Ad-hoc call',
    shape: 'One call whose questions the model writes into its own completion.',
  },
  {
    id: 'split',
    label: 'Call per question',
    shape: 'One call per question, re-sending the state and the round trip each time.',
  },
]

/** Identity of the baseline arm. */
const BASELINE_ARM: ApproachId = 'reason'

/** What the gated arm needs beyond the item itself. */
interface GatedRequest {
  /** Question ids the model reasons out itself. */
  escalated: readonly string[]
  /** Deployment-shaped constants. */
  assumptions?: CostAssumptions | undefined
  /** Tokens and round trip the API reported for the bank call. */
  measured?: MeasuredJev | undefined
}

/** Model id the modelled Jev arms price against. */
const PRICED_MODEL = 'jev-latest'

/** Round trips assumed for a call that was not measured. */
const UNMEASURED_CALLS = 1

/**
 * Cost of answering the item's questions in the agent's own context.
 *
 * @param item - Corpus item being measured.
 * @param assumptions - Deployment-shaped constants.
 * @returns The baseline arm's cost.
 */
function reasonCost(
  item: BenchmarkItem,
  assumptions: CostAssumptions = DEFAULT_ASSUMPTIONS,
): ArmCost {
  /*
   * The whole item, not a subset: this arm is the baseline, so every question,
   * every piece of reference reasoning and every expected answer is paid for.
   */
  return armCost({
    promptTokens:
      assumptions.systemPromptTokens
      + estimateJsonTokens(item.questions)
      + estimateJsonTokens(item.state),
    completionTokens:
      estimateTokens(Object.values(item.baselineNotes).join('\n'))
      + estimateJsonTokens(item.expected),
    billedInputTokens: 0,
    assumptions,
  })
}

/**
 * The parts a Jev call contributes, before they are combined.
 *
 * @param item - Corpus item being measured.
 * @param completion - What the model writes to issue the call.
 * @param billedInputTokens - Tokens TypeSafe billed.
 * @param assumptions - Deployment-shaped constants.
 * @returns The arm's parts.
 */
function callParts(request: {
  item: BenchmarkItem
  completion: unknown
  billedInputTokens: number
  assumptions: CostAssumptions
}): ArmParts {
  return {
    promptTokens:
      request.assumptions.toolSchemaTokens
      + estimateTokens(renderedSummary(request.item)),
    completionTokens: estimateJsonTokens(request.completion),
    billedInputTokens: request.billedInputTokens,
    assumptions: request.assumptions,
  }
}

/**
 * Cost of answering the item's questions through one ad-hoc Jev tool call.
 *
 * The agent still writes the tool call, which restates the state and the
 * question definitions, and it still reads the result. What it does not do is
 * deliberate: the baseline's reasoning tokens have no counterpart here.
 *
 * @param item - Corpus item being measured.
 * @param assumptions - Deployment-shaped constants.
 * @param measured - Tokens and round trip the API reported, when it was called.
 * @returns The ad-hoc arm's cost.
 */
function adhocCost(
  item: BenchmarkItem,
  assumptions: CostAssumptions = DEFAULT_ASSUMPTIONS,
  measured?: MeasuredJev,
): ArmCost {
  const toolCall = { state: item.state, questions: item.questions }
  const billed =
    measured?.billedInputTokens
    ?? estimateJsonTokens({ model: PRICED_MODEL, ...toolCall })
  return armCost(
    callParts({ item, completion: toolCall, billedInputTokens: billed, assumptions }),
    measured?.latencySeconds,
  )
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
 * @param measured - Tokens and round trip the API reported, when it was called.
 * @returns The bank-mode cost, or undefined when no shipped bank matches.
 */
function bankCost(
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
  const billed = measured?.billedInputTokens ?? estimateJsonTokens({
    model: PRICED_MODEL,
    state: item.state,
    questions: bank.questions,
  })
  return armCost(
    callParts({
      item,
      completion: { state: item.state, bank: bank.id },
      billedInputTokens: billed,
      assumptions,
    }),
    measured?.latencySeconds,
  )
}

/**
 * Cost of one call per question.
 *
 * The state is re-sent with every call, the model writes N tool calls instead
 * of one, and the round trips no longer overlap. Wall-clock is the sum of the
 * measured calls — the sequential reading, which is what a caller that issues
 * them one at a time pays.
 *
 * @param item - Corpus item being measured.
 * @param assumptions - Deployment-shaped constants.
 * @param measured - Tokens and round trip the API reported, when it was called.
 * @returns The split arm's cost.
 */
function splitCost(
  item: BenchmarkItem,
  assumptions: CostAssumptions = DEFAULT_ASSUMPTIONS,
  measured?: MeasuredJev,
): ArmCost {
  const ids = Object.keys(item.questions)
  let completionTokens = 0
  let modelledInput = 0
  for (const id of ids) {
    const call = { state: item.state, questions: questionsFor(item, [id]) }
    completionTokens += estimateJsonTokens(call)
    modelledInput += estimateJsonTokens({ model: PRICED_MODEL, ...call })
  }
  const latencySeconds =
    measured?.latencySeconds ?? ids.length * assumptions.jevLatencySeconds
  return armCost(
    {
      promptTokens: assumptions.toolSchemaTokens + estimateTokens(renderedSummary(item)),
      completionTokens,
      billedInputTokens: measured?.billedInputTokens ?? modelledInput,
      assumptions,
    },
    latencySeconds,
  )
}

/**
 * Cost of the bank call plus a fallback for the answers it is unsure about.
 *
 * The escalation set is measured rather than assumed: the caller knows which
 * answers fell below its confirm floor only because the bank call reported their
 * confidence, so the bank call is always paid in full.
 *
 * @param item - Corpus item being measured.
 * @param request - Escalated ids, assumptions, and the bank call's measurement.
 * @returns The gated arm's cost, or undefined when no shipped bank matches.
 */
function gatedCost(item: BenchmarkItem, request: GatedRequest): ArmCost | undefined {
  const { escalated } = request
  const assumptions = request.assumptions ?? DEFAULT_ASSUMPTIONS
  const bank = bankCost(item, assumptions, request.measured)
  if (bank === undefined) {
    return undefined
  }
  const slice = reasoningSlice(item, escalated, assumptions)
  return armCost(
    {
      promptTokens: bank.promptTokens + slice.promptTokens,
      completionTokens: bank.completionTokens + slice.completionTokens,
      billedInputTokens: bank.billedInputTokens,
      assumptions,
    },
    request.measured?.latencySeconds
      ?? UNMEASURED_CALLS * assumptions.jevLatencySeconds,
  )
}

/**
 * Look up one approach's metadata.
 *
 * @param id - Approach id.
 * @returns The approach, or undefined for an unknown id.
 */
function getApproach(id: string): Approach | undefined {
  return APPROACHES.find(approach => approach.id === id)
}

export {
  APPROACHES,
  BASELINE_ARM,
  PRICED_MODEL,
  adhocCost,
  bankCost,
  gatedCost,
  getApproach,
  reasonCost,
  splitCost,
  type Approach,
  type ApproachId,
  type GatedRequest,
}
