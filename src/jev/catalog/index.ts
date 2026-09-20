/**
 * The question banks this package ships.
 *
 * A System One model is good at one narrow, well-scoped judgment and poor at an
 * open-ended request to "think about this". Each bank therefore encodes a
 * recurring decision as a handful of atomic Choice, Score and Noul questions
 * that a knowledgeable reader could answer in a second. The caller reads the
 * answers and combines them in code, so changing how a dimension is weighted is
 * a coefficient change rather than a prompt rewrite.
 *
 * Question ids are for the caller. They are never sent to the model, so every
 * instructions string restates the question in full.
 *
 * @module dsh-plugin-system-one/jev/catalog
 */

import type { JevQuestion } from '#src/jev/contracts'
import { ANSWER_BANK } from './answer.ts'
import { CHANGE_BANK } from './change.ts'
import { CONTENT_BANK } from './content.ts'
import { REASONING_BANK } from './reasoning.ts'
import { REQUEST_BANK } from './request.ts'
import { TEST_BANK } from './test.ts'

/** One reusable set of questions. */
interface JevQuestionBank {
  /** Stable id used to select the bank. */
  id: string
  /** Short human-readable title. */
  title: string
  /** Routing copy: when a caller should reach for this bank. */
  description: string
  /** Atomic questions keyed by answer id. */
  questions: Record<string, JevQuestion>
}

/** Every bank this package ships, in discovery order. */
const BANKS: readonly JevQuestionBank[] = [
  CHANGE_BANK,
  TEST_BANK,
  REASONING_BANK,
  ANSWER_BANK,
  REQUEST_BANK,
  CONTENT_BANK,
]

/** Ids accepted by the `bank` parameter of the reasoning tool. */
const BANK_IDS: readonly string[] = BANKS.map(bank => bank.id)

/**
 * Look up one bank by id.
 *
 * @param id - Bank id, as accepted by the tool surface.
 * @returns The bank, or `undefined` when no bank has that id.
 */
function getBank(id: string): JevQuestionBank | undefined {
  return BANKS.find(bank => bank.id === id)
}

export { BANKS, BANK_IDS, getBank, type JevQuestionBank }

