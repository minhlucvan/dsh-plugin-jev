/**
 * Benchmark corpus items: work that has to be routed before it is handled.
 *
 * The reasoning recorded in each item baselineNotes field is the cost the
 * baseline arm is computed from, so it lives in the repository as data rather
 * than as a constant buried in a script. Replace it with a captured trace and
 * re-run to check the claim.
 *
 * @module dsh-plugin-jev/benchmark/items-routing
 */

import type { BenchmarkItem } from './corpus.ts'

/**
 * Support triage.
 *
 * One ticket that mentions four separate things, so the caller needs its
 * category, its bug severity, whether the report is reproducible, whether a
 * refund is involved, and how upset the writer is.
 */
const SUPPORT_TICKET: BenchmarkItem = {
  id: 'support-ticket',
  title: 'Support ticket triage',
  state: {
    ticket: {
      subject: 'Charged twice and cannot log in since the update',
      body:
        'Hi, I placed order #98423 last Thursday and was charged twice. I also cannot log in '
        + 'after the site update, the reset link says my account does not exist. Adding Apple '
        + 'Pay would be really helpful too. This is getting frustrating, it has been three days.',
      opened_days_ago: 3,
    },
    account: { plan: 'pro', status: 'active', mfa_enabled: false },
    charges: [
      { amount_usd: 49, status: 'captured', order: '#98423' },
      { amount_usd: 49, status: 'captured', order: '#98423' },
    ],
  },
  questions: {
    category: {
      type: 'choice',
      instructions: 'What is the broad category of this support ticket?',
      criteria: {
        bug_report: 'Something is broken or producing errors',
        billing: 'Charges, invoices, refunds, subscriptions',
        feature_request: 'A request for new functionality',
        account: 'Login, permissions, profile, security',
      },
    },
    bug_severity: {
      type: 'score',
      instructions: 'How severe is the reported product problem?',
      criteria: [
        'Cosmetic; no impact on functionality',
        'A feature is broken or degraded but a workaround exists',
        'Blocking; the user cannot proceed at all',
      ],
    },
    has_reproducible_steps: {
      type: 'noul',
      instructions: 'Does the user describe specific steps that reproduce the problem?',
      criteria: {
        true: 'Steps or an unambiguous trigger are given',
        false: 'Only a symptom is described',
      },
    },
    refund_requested: {
      type: 'noul',
      instructions: 'Is the user explicitly asking for a refund or a credit?',
      criteria: {
        true: 'A refund or credit is asked for',
        false: 'No refund or credit is asked for',
      },
    },
    frustration: {
      type: 'score',
      instructions: 'How frustrated does the writer appear?',
      criteria: ['Calm and matter-of-fact', 'Frustrated but civil', 'Angry or accusatory'],
    },
  },
  expected: {
    category: 'billing',
    bug_severity: 'A feature is broken or degraded but a workaround exists',
    has_reproducible_steps: 'no',
    refund_requested: 'no',
    frustration: 'Frustrated but civil',
  },
  baselineNotes: {
    category:
      'The ticket names several problems, so I have to decide which one dominates. The double '
      + 'charge is a billing matter and is the first thing mentioned; the login failure is an '
      + 'account or bug matter; Apple Pay is a feature request. The billing category is the '
      + 'best single fit because a duplicate charge is unambiguous and actionable.',
    bug_severity:
      'Consider the two product problems. The double charge is not a product defect. The login '
      + 'failure is a broken feature with a workaround, since the user could reset the password '
      + 'by another route or contact support. It is not cosmetic, and it is not fully blocking '
      + 'because the account itself is active and the charges succeeded.',
    has_reproducible_steps:
      'I check whether the user gave steps. They describe a symptom and a rough time frame, and '
      + 'they mention a reset link that fails, but they do not give an ordered sequence anyone '
      + 'could follow. So the answer is no.',
    refund_requested:
      'The user reports being charged twice and asks for it to be fixed. They never use the words '
      + 'refund or credit and never ask for money back, so no refund has been requested yet.',
    frustration:
      'The message contains "This is getting frustrating" and a three-day delay, which signals '
      + 'real annoyance. It stays civil and factual, with no insults or threats, so it reads as '
      + 'frustrated but not angry.',
  },
}

/**
 * Pull-request routing.
 *
 * A change description that has to be classified before a reviewer is chosen.
 */
const PULL_REQUEST: BenchmarkItem = {
  id: 'pull-request',
  title: 'Pull request routing',
  state: {
    pull_request: {
      title: 'Cache the settings lookup behind a TTL',
      body:
        'The settings lookup hits the database on every keystroke in the settings form. This '
        + 'adds a 5 second TTL cache in front of it. Also bumps the pinned Node version and '
        + 'fixes a typo in the contributing guide.',
      files_changed: 14,
      additions: 312,
      deletions: 88,
      touches_migrations: false,
      touches_public_api: true,
    },
    repository: { language: 'TypeScript', test_coverage_percent: 71 },
  },
  questions: {
    risk: {
      type: 'score',
      instructions: 'How risky is this change to merge?',
      criteria: [
        'Low risk; a mistake is contained and easily reverted',
        'Moderate risk; a mistake is visible but recoverable',
        'High risk; a mistake could corrupt data or break consumers',
      ],
    },
    needs_senior_review: {
      type: 'noul',
      instructions: 'Does this change warrant a reviewer senior to the author?',
      criteria: {
        true: 'The change needs judgement beyond routine review',
        false: 'Routine review is sufficient',
      },
    },
    is_single_purpose: {
      type: 'noul',
      instructions: 'Is the change limited to one purpose?',
      criteria: {
        true: 'Everything in the change serves one goal',
        false: 'The change mixes unrelated goals',
      },
    },
    review_effort: {
      type: 'score',
      instructions: 'How much reviewer effort does this change need?',
      criteria: [
        'A quick read is enough',
        'A careful read of the changed logic is needed',
        'The reviewer needs to run it and reason about the whole system',
      ],
    },
  },
  expected: {
    risk: 'Moderate risk; a mistake is visible but recoverable',
    needs_senior_review: 'yes',
    is_single_purpose: 'no',
    review_effort: 'A careful read of the changed logic is needed',
  },
  baselineNotes: {
    risk:
      'The substantive part is a cache in front of a settings lookup, which introduces staleness '
      + 'and invalidation questions but no data mutation. A bug there shows wrong settings for up '
      + 'to five seconds, which is recoverable. There is no migration and no schema change, so it '
      + 'does not reach the high tier.',
    needs_senior_review:
      'Caching is one of those changes where the failure mode is subtle and shows up under load, '
      + 'and it touches a public API. That combination usually wants a reviewer who has owned a '
      + 'cache before, so yes.',
    is_single_purpose:
      'The body describes a cache, a Node version bump, and a documentation typo. Those are three '
      + 'unrelated changes, so the change is not single purpose and should probably be split.',
    review_effort:
      'Fourteen files and three hundred added lines is more than a skim, and cache correctness '
      + 'cannot be judged from a diff alone because it depends on the call pattern. The reviewer '
      + 'needs to read the changed logic carefully rather than run the whole system.',
  },
}

export { PULL_REQUEST, SUPPORT_TICKET }
