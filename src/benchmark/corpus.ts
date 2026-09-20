/**
 * The benchmark corpus: four decisions a coding agent makes every day.
 *
 * Each item is one state and the atomic questions a caller would ask about it,
 * together with the answer a careful reader would reach. The baselineNotes on
 * each item are the crux of the comparison: they are the reasoning the calling
 * model has to emit when it decides these things itself, and they are what the
 * baseline cost is computed from.
 *
 * Three are covered by a shipped bank, so the report can price every Jev call
 * shape on the same work. The fourth is a nine-question composite fan-out,
 * expressed through `jev_ask`, that no bank covers, so only the ad-hoc shape
 * answers it — and it is the case that shows what a bank is worth.
 *
 * Each item also names the task class it belongs to, because the report's
 * product question — which integration shape should this profile use — is
 * answered per class rather than in aggregate.
 *
 * @module dsh-plugin-jev/benchmark/corpus
 */

import type { JevJson, JevQuestion } from '#src/jev/contracts'
import { COMPARING_SUSPECTS } from './items-comparing.ts'
import { CODING_CHANGE } from './items-coding.ts'
import { EXPLORING_TASK } from './items-exploring.ts'
import { TESTING_FAILURE } from './items-testing.ts'

/**
 * The kind of work an agent is doing when it makes the decision.
 *
 * The integration question is per-class — a bank can cover a code-change
 * taxonomy and be useless for a one-off ranking — so every priced decision is
 * tagged with the class of task it belongs to, and the report groups by it.
 */
type BenchmarkTask = 'coding' | 'testing' | 'exploring' | 'investigating'

/** Every task class the corpus covers, in report order. */
const TASKS: readonly BenchmarkTask[] = [
  'coding',
  'testing',
  'exploring',
  'investigating',
]

/** One piece of classification work, with the reasoning it costs. */
interface BenchmarkItem {
  /** Stable id used in reports. */
  id: string
  /** Task class this decision belongs to. */
  task: BenchmarkTask
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
  CODING_CHANGE,
  TESTING_FAILURE,
  EXPLORING_TASK,
  COMPARING_SUSPECTS,
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

/**
 * Select the corpus items in one task class.
 *
 * @param task - Task class to select.
 * @param items - Items to filter; the whole corpus by default.
 * @returns The items in that class, in corpus order.
 */
function itemsForTask(
  task: BenchmarkTask,
  items: readonly BenchmarkItem[] = CORPUS,
): BenchmarkItem[] {
  return items.filter(item => item.task === task)
}

export {
  CORPUS,
  TASKS,
  countDecisions,
  getItem,
  itemsForTask,
  type BenchmarkItem,
  type BenchmarkTask,
}

