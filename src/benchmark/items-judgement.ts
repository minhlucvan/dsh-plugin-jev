/**
 * Benchmark corpus items: work that is a judgement rather than a lookup.
 *
 * The reasoning recorded in each item baselineNotes field is the cost the
 * baseline arm is computed from, so it lives in the repository as data rather
 * than as a constant buried in a script. Replace it with a captured trace and
 * re-run to check the claim.
 *
 * @module dsh-plugin-jev/benchmark/items-judgement
 */

import type { BenchmarkItem } from './corpus.ts'

/**
 * Content guardrail.
 *
 * A passage that has to be classified before it is copied anywhere.
 */
const GUARDRAIL: BenchmarkItem = {
  id: 'guardrail',
  title: 'Content guardrail before copying',
  state: {
    passage:
      'Sure — to reproduce it locally, set DATABASE_URL to postgres://admin:hunter2@db.internal:5432/prod '
      + 'and ping me at ada.lovelace@example.com if it still fails. My direct line is +1 415 555 0134.',
    destination: 'a public issue on the company tracker',
  },
  questions: {
    contains_personal_data: {
      type: 'noul',
      instructions:
        'Does the passage contain personally identifying information such as a full name, '
        + 'address, email address, phone number, or government identifier?',
      criteria: {
        true: 'At least one identifying detail is present',
        false: 'No identifying detail is present',
      },
    },
    contains_secret: {
      type: 'noul',
      instructions: 'Does the passage contain a credential, private key, access token, or password?',
      criteria: {
        true: 'A credential-like value is present',
        false: 'No credential-like value is present',
      },
    },
    safe_to_publish: {
      type: 'noul',
      instructions: 'Is the passage safe to publish verbatim to the stated destination?',
      criteria: {
        true: 'Nothing in it would cause harm if published',
        false: 'It contains something that must not be published',
      },
    },
    redaction_effort: {
      type: 'score',
      instructions: 'How much redaction would this passage need before it could be shared?',
      criteria: [
        'None; it is already shareable',
        'A targeted edit to one or two spans',
        'Substantial rewriting, because sensitive material is woven through it',
      ],
    },
  },
  bank: 'content',
  expected: {
    contains_personal_data: 'yes',
    contains_secret: 'yes',
    safe_to_publish: 'no',
    redaction_effort: 'A targeted edit to one or two spans',
  },
  baselineNotes: {
    contains_personal_data:
      'Scan for identifiers. There is an email address that looks like a personal name, and an '
      + 'international phone number. Both are personally identifying, so the answer is yes.',
    contains_secret:
      'The DATABASE_URL embeds a username and password pair in the authority section. That is a '
      + 'live credential for what looks like a production host, so yes.',
    safe_to_publish:
      'The destination is a public tracker. The passage carries a production credential and two '
      + 'personal identifiers, so publishing it verbatim would leak a secret and personal data. '
      + 'No.',
    redaction_effort:
      'The sensitive spans are discrete: the connection string and the two contact details. The '
      + 'surrounding explanation stays useful, so a targeted edit to those spans is enough rather '
      + 'than a rewrite.',
  },
}

/**
 * Agent task shaping.
 *
 * The decision an agent makes before it starts work: how much context it has,
 * whether it needs tools, and how costly a mistake would be.
 */
const TASK_SHAPE: BenchmarkItem = {
  id: 'task-shape',
  title: 'Task shape before starting work',
  state: {
    request:
      'Update the pricing page to mention the new enterprise tier, then tell me whether our '
      + 'current margins still hold.',
    available_context: {
      pricing_page_path: 'not identified',
      margin_data: 'not provided',
      enterprise_tier_details: 'not provided',
      conversation: 'this message only',
    },
  },
  questions: {
    task_shape: {
      type: 'choice',
      instructions: 'What kind of work does this request primarily require?',
      criteria: {
        lookup: 'Retrieve a fact already present',
        comparison: 'Weigh items already present',
        procedure: 'Produce ordered steps or a command sequence',
        analysis: 'Interpret evidence and reach a conclusion',
        generation: 'Produce new content that did not exist',
        other: 'None of the above fits',
      },
    },
    context_sufficiency: {
      type: 'score',
      instructions: 'How far can the task be completed using only what the state contains?',
      criteria: [
        'Nothing further is needed',
        'One small gap a reader could safely fill',
        'Materially underdetermined; a correct answer needs absent information',
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
    decomposable: {
      type: 'noul',
      instructions:
        'Does the request contain two or more independent sub-judgements that should be answered '
        + 'separately and combined?',
      criteria: {
        true: 'It breaks into independent parts',
        false: 'It is a single judgement',
      },
    },
  },
  bank: 'reasoning',
  expected: {
    task_shape: 'generation',
    context_sufficiency: 'Materially underdetermined; a correct answer needs absent information',
    needs_external_data: 'yes',
    decomposable: 'yes',
  },
  baselineNotes: {
    task_shape:
      'The request has two halves and they are different in kind. The first asks for a page edit, '
      + 'which is generation. The second asks whether margins hold, which is analysis. Generation '
      + 'is the dominant demand because the analysis depends on it, so I classify the request as '
      + 'generation rather than other.',
    context_sufficiency:
      'Neither half can be done from the message. I do not know the page path, the tier details, '
      + 'or any margin data. That is not one small gap, it is most of what the task needs, so this '
      + 'sits at the lowest level of sufficiency.',
    needs_external_data:
      'Both halves need material that is absent: the page file and the pricing figures. The state '
      + 'explicitly records those fields as not provided, so the answer is yes.',
    decomposable:
      'The page edit and the margin question do not depend on each other operationally — either '
      + 'could be done first — and each deserves its own judgement. That makes the request '
      + 'decomposable.',
  },
}

export { GUARDRAIL, TASK_SHAPE }
