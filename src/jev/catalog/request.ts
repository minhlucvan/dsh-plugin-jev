/**
 * Incoming request routing: classify what arrived and how risky it is.
 *
 * @module dsh-plugin-jev/jev/catalog/request
 */

import type { JevQuestionBank } from './index.ts'

/**
 * Incoming request routing.
 *
 * The front door: classify what arrived and how risky it is, so the caller can
 * route it to deterministic code, a focused answer, a planning pass, or a human
 * instead of treating every input the same way.
 */
const REQUEST_BANK: JevQuestionBank = {
  id: 'request',
  title: 'Incoming request routing',
  description:
    'Classify an incoming user request: its intent, how much planning it needs, and whether '
    + 'it should be answered directly or clarified first.',
  questions: {
    intent: {
      type: 'choice',
      instructions: 'What is the user asking for?',
      criteria: {
        answer_question: 'An explanation or fact',
        perform_task: 'An action carried out on their behalf',
        review_output: 'Critique of work they or someone else produced',
        plan_work: 'A plan, breakdown, or estimate for future work',
        clarify: 'They are asking what is possible or what something means',
        other: 'None of the above fits',
      },
    },
    planning_depth: {
      type: 'score',
      instructions: 'How much planning does this request need before work starts?',
      criteria: [
        'None; the answer is immediate',
        'A few ordered steps whose sequence is obvious',
        'A long-horizon plan where ordering and dependencies matter',
      ],
    },
    needs_clarification: {
      type: 'noul',
      instructions:
        'Would a competent assistant need to ask a follow-up question before it could '
        + 'act on this request?',
      criteria: {
        true: 'Acting now would mean guessing at a material detail',
        false: 'The request is actionable as written',
      },
    },
  },
}

export { REQUEST_BANK }
