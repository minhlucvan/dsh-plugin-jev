/**
 * Reasoning shape: what kind of work a task is and how much it can be trusted from the state alone.
 *
 * @module dsh-plugin-jev/jev/catalog/reasoning
 */

import type { JevQuestionBank } from './index.ts'

/**
 * Reasoning shape.
 *
 * Answers "what kind of work is this, and how much can I trust myself to do it
 * from what I already have", which is the decision an agent makes before it
 * spends any tokens on the task itself.
 */
const REASONING_BANK: JevQuestionBank = {
  id: 'reasoning',
  title: 'Reasoning shape',
  description:
    'Classify the shape of a task before working on it: what kind of judgement it needs, '
    + 'whether the available context is enough, how costly a wrong answer is, and whether '
    + 'it must be decomposed or fetched rather than answered directly.',
  questions: {
    task_shape: {
      type: 'choice',
      instructions: 'What kind of work does this request primarily require?',
      criteria: {
        lookup: 'Retrieve a specific fact that is already present in the state',
        comparison: 'Weigh two or more items that are both present in the state',
        procedure: 'Produce ordered steps or a command sequence',
        analysis: 'Interpret evidence and reach a conclusion',
        generation: 'Produce new prose, code, or design that did not exist before',
        conversation: 'Social or meta exchange that needs no substantive answer',
        other: 'None of the above fits',
      },
    },
    context_sufficiency: {
      type: 'score',
      instructions: 'How far can the task be completed using only what the state already contains?',
      criteria: [
        'Nothing further is needed; the state is sufficient',
        'One small gap that the state strongly implies and a reader could fill safely',
        'Materially underdetermined; a correct answer needs information that is absent',
      ],
    },
    needs_external_data: {
      type: 'noul',
      instructions:
        'Does answering correctly require information that is not in the state, such as live '
        + 'data, files, a tool result, or the current date?',
      criteria: {
        true: 'The answer depends on something outside the state',
        false: 'The state alone determines the answer',
      },
    },
    cost_of_error: {
      type: 'score',
      instructions: 'If the answer is wrong, how bad is the consequence?',
      criteria: [
        'Trivial; the mistake is obvious and cheap to correct',
        'Moderate; it costs a retry, some time, or a confusing intermediate result',
        'Severe; it would cause an irreversible action or mislead the user on a material fact',
      ],
    },
    ambiguity: {
      type: 'noul',
      instructions:
        'Is the request underspecified enough that two competent readers would produce '
        + 'substantively different answers?',
      criteria: {
        true: 'Reasonable readers would diverge on what was being asked',
        false: 'Reasonable readers would agree on what was being asked',
      },
    },
    decomposable: {
      type: 'noul',
      instructions:
        'Does the request contain two or more independent sub-judgements that should be '
        + 'answered separately and combined?',
      criteria: {
        true: 'It breaks into independent parts',
        false: 'It is a single judgement',
      },
    },
  },
}

export { REASONING_BANK }
