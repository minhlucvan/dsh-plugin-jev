/**
 * What the model has to write, per shape.
 *
 * Every arm of the benchmark pays for the same underlying quantities — the
 * state, the question definitions, the reasoning, and the answers — but each
 * shape pays for a different subset of them. These helpers compute those subsets
 * once, so the arm builders differ only in which ones they add up.
 *
 * A tool call is generated output. The state an agent pastes into one costs
 * tokens and time exactly like any other completion, which is why the state
 * appears on both sides of this accounting.
 *
 * @module dsh-plugin-jev/benchmark/questioning
 */

import { DEFAULT_ASSUMPTIONS } from './cost.ts'
import type { CostAssumptions } from './cost.ts'
import type { BenchmarkItem } from './corpus.ts'
import { estimateJsonTokens, estimateTokens } from './estimator.ts'

/** No questions selected, which means nothing to reason about. */
const NO_QUESTIONS = 0

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
 * Select a subset of an item's questions.
 *
 * @param item - Corpus item.
 * @param ids - Question ids to keep.
 * @returns The questions, keyed by id.
 */
function questionsFor(
  item: BenchmarkItem,
  ids: readonly string[],
): Record<string, unknown> {
  const selected: Record<string, unknown> = {}
  for (const id of ids) {
    selected[id] = item.questions[id]
  }
  return selected
}

/**
 * Tokens the model reads and writes to answer some of the questions itself.
 *
 * The gated arm pays this after a bank call, so the state and the instruction
 * block are paid twice — once inside the Jev request, once in the model's own
 * context. That double payment is the honest price of the fallback.
 *
 * @param item - Corpus item being measured.
 * @param ids - Question ids the model reasons out itself.
 * @param assumptions - Deployment-shaped constants.
 * @returns The prompt and completion tokens that subset costs.
 */
function reasoningSlice(
  item: BenchmarkItem,
  ids: readonly string[],
  assumptions: CostAssumptions = DEFAULT_ASSUMPTIONS,
): { promptTokens: number; completionTokens: number } {
  if (ids.length === NO_QUESTIONS) {
    return { promptTokens: 0, completionTokens: 0 }
  }
  const notes: Record<string, string> = {}
  const expected: Record<string, string> = {}
  for (const id of ids) {
    notes[id] = item.baselineNotes[id] ?? ''
    expected[id] = item.expected[id] ?? ''
  }
  return {
    promptTokens:
      assumptions.systemPromptTokens
      + estimateJsonTokens(questionsFor(item, ids))
      + estimateJsonTokens(item.state),
    completionTokens:
      estimateTokens(Object.values(notes).join('\n')) + estimateJsonTokens(expected),
  }
}

export { questionsFor, reasoningSlice, renderedSummary }
