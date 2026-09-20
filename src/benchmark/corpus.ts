/**
 * The benchmark corpus: real classification work, with the reasoning it costs.
 *
 * Each item is one state and the set of atomic questions a caller would ask
 * about it, together with the answer a careful reader would reach. The
 * baselineNotes on each item are the crux of the comparison: they are the
 * reasoning the calling model has to emit when it answers these questions
 * itself, and they are what the baseline completion cost is computed from.
 *
 * The items live in two themed modules so neither file grows past the point
 * where a reader can hold it at once.
 *
 * @module dsh-plugin-jev/benchmark/corpus
 */

import type { JevJson, JevQuestion } from '#src/jev/contracts'
import { GUARDRAIL, TASK_SHAPE } from './items-judgement.ts'
import { FRONT_DOOR, PULL_REQUEST, SUPPORT_TICKET } from './items-routing.ts'

/** One piece of classification work, with the reasoning it costs. */
interface BenchmarkItem {
  /** Stable id used in reports. */
  id: string
  /** Short human-readable description. */
  title: string
  /** The evidence every question is judged against. */
  state: JevJson
  /** Atomic questions a caller would ask about the state. */
  questions: Record<string, JevQuestion>
  /** The answer a careful reader reaches, per question id. */
  expected: Record<string, string>
  /** The reasoning the calling model must emit, per question id. */
  baselineNotes: Record<string, string>
  /**
   * Id of a shipped bank whose questions cover this item, when one exists.
   *
   * Naming it lets the report cost the cheaper call shape as well: the agent
   * sends the state and the bank id, so the question definitions stay in the
   * package instead of in the model completion.
   */
  bank?: string
}

/** Every item the benchmark ships, in report order. */
const CORPUS: readonly BenchmarkItem[] = [
  SUPPORT_TICKET,
  PULL_REQUEST,
  GUARDRAIL,
  TASK_SHAPE,
  FRONT_DOOR,
]

/**
 * Look up one corpus item.
 *
 * @param id - Item id.
 * @returns The item, or `undefined` when no item has that id.
 */
function getItem(id: string): BenchmarkItem | undefined {
  return CORPUS.find(item => item.id === id)
}

/**
 * Count the atomic decisions across the corpus.
 *
 * @param items - Items to count.
 * @returns Total question count.
 */
function countDecisions(items: readonly BenchmarkItem[] = CORPUS): number {
  let total = 0
  for (const item of items) {
    total += Object.keys(item.questions).length
  }
  return total
}

export { CORPUS, countDecisions, getItem, type BenchmarkItem }

