/**
 * Draft self-check: audit a candidate answer before it is returned.
 *
 * @module dsh-plugin-jev/jev/catalog/answer
 */

import type { JevQuestionBank } from './index.ts'

/**
 * Draft self-check.
 *
 * Applied to a candidate answer before it is returned, so an ungrounded claim
 * is caught while it is still cheap to fix.
 */
const ANSWER_BANK: JevQuestionBank = {
  id: 'answer',
  title: 'Draft self-check',
  description:
    'Audit a candidate answer against the source material before returning it: whether its '
    + 'claims are supported, whether it answers what was asked, and whether it overstates '
    + 'certainty the evidence does not carry.',
  questions: {
    grounded: {
      type: 'noul',
      instructions:
        'Is every factual claim in the candidate answer supported by the source material, '
        + 'rather than supplied from outside it?',
      criteria: {
        true: 'Every claim traces back to the source material',
        false: 'At least one claim is unsupported or invented',
      },
    },
    addresses_request: {
      type: 'score',
      instructions: 'How directly does the candidate answer address what was actually asked?',
      criteria: [
        'Off topic, or answers a different question',
        'Partially on topic but leaves the core question open',
        'Answers the question that was asked',
      ],
    },
    overstates_certainty: {
      type: 'noul',
      instructions:
        'Does the candidate answer assert more certainty than the source material supports?',
      criteria: {
        true: 'It claims certainty the evidence does not carry',
        false: 'Its certainty matches the evidence',
      },
    },
  },
}

export { ANSWER_BANK }
