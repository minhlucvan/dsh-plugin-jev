/**
 * Built-in question banks: the classification options an agent can reuse.
 *
 * A System One model is good at one narrow, well-scoped judgment and poor at an
 * open-ended request to "think about this". The banks below therefore encode
 * the reasoning process itself as a handful of atomic Choice, Score and Noul
 * questions, each of which a knowledgeable reader could answer in a second.
 * The caller reads the answers and combines them in code, so changing how a
 * dimension is weighted is a coefficient change rather than a prompt rewrite.
 *
 * Question ids are for the caller. They are never sent to the model, so every
 * `instructions` string restates the question in full.
 *
 * @module dsh-plugin-jev/jev/catalog
 */

import type { JevQuestion } from './contracts.ts'

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

/**
 * Content handling.
 *
 * Used before material is copied into logs, prompts, or third-party calls, where
 * a wrong guess is a policy problem rather than a quality one.
 */
const CONTENT_BANK: JevQuestionBank = {
  id: 'content',
  title: 'Content handling',
  description:
    'Classify a passage before it is copied, logged, or sent onward: whether it carries '
    + 'personal or secret material, whether it is durable preference rather than a passing '
    + 'detail, and whether it is time sensitive.',
  questions: {
    contains_personal_data: {
      type: 'noul',
      instructions:
        'Does this text contain personally identifying information such as a full name, '
        + 'address, email, phone number, or government identifier?',
      criteria: {
        true: 'At least one identifying detail is present',
        false: 'No identifying detail is present',
      },
    },
    contains_secret: {
      type: 'noul',
      instructions:
        'Does this text contain a credential, private key, access token, or password?',
      criteria: {
        true: 'A credential-like value is present',
        false: 'No credential-like value is present',
      },
    },
    durability: {
      type: 'score',
      instructions: 'How durable is the information, if it were to be remembered?',
      criteria: [
        'A passing detail that will be stale within the session',
        'Useful for this project but not beyond it',
        'A stable preference or constraint worth carrying forward',
      ],
    },
    time_sensitive: {
      type: 'noul',
      instructions: 'Does this text become wrong or misleading as time passes?',
      criteria: {
        true: 'It describes a transient state',
        false: 'It remains true regardless of when it is read',
      },
    },
  },
}

/** Every bank this package ships, in discovery order. */
const BANKS: readonly JevQuestionBank[] = [
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

export {
  ANSWER_BANK,
  BANKS,
  BANK_IDS,
  CONTENT_BANK,
  REASONING_BANK,
  REQUEST_BANK,
  getBank,
  type JevQuestionBank,
}
