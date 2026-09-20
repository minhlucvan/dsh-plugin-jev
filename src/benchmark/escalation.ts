/**
 * Which answers a caller hands back to the model.
 *
 * A calibrated answer is only useful if the caller can act on the calibration:
 * the point of asking Jev is to learn *what* to do and *how sure* it is, and a
 * deployment that cannot afford to trust every answer needs to know which ones
 * to keep. Ranking by confidence is that policy, and both a threshold
 * (`escalatedIds`) and a count (`rankedIds`) describe it from opposite ends.
 *
 * @module dsh-plugin-jev/benchmark/escalation
 */

import type { JevAnswer } from '#src/jev/contracts'
import { effectiveConfidence } from '#src/jev/routing'
import type { BenchmarkItem } from './corpus.ts'

/**
 * Rank an item's answers by how little the model trusted them.
 *
 * A Noul answer reports no confidence of its own, so the package's derived
 * statistic is used — the distance of its probability from an even split —
 * which is the same rule the tool face routes on.
 *
 * @param item - Corpus item the answers belong to.
 * @param answers - Answers returned for the item.
 * @returns Answer ids with their effective confidence, least confident first.
 */
function rankedIds(
  item: BenchmarkItem,
  answers: Record<string, JevAnswer>,
): { id: string; confidence: number }[] {
  const scored: { id: string; confidence: number }[] = []
  for (const id of Object.keys(item.questions)) {
    const answer = answers[id]
    if (answer !== undefined) {
      scored.push({ id, confidence: effectiveConfidence(answer) })
    }
  }
  scored.sort((left, right) => left.confidence - right.confidence)
  return scored
}

/**
 * Read which answers fell below a confidence floor.
 *
 * @param item - Corpus item the answers belong to.
 * @param answers - Answers returned for the item.
 * @param floor - Confidence below which an answer is reasoned out instead.
 * @returns The question ids to escalate, least confident first.
 */
function escalatedIds(
  item: BenchmarkItem,
  answers: Record<string, JevAnswer>,
  floor: number,
): string[] {
  return rankedIds(item, answers)
    .filter(entry => entry.confidence < floor)
    .map(entry => entry.id)
}

export { escalatedIds, rankedIds }
