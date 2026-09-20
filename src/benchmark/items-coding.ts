/**
 * Coding: the decision an agent makes after editing and before reporting.
 *
 * The reasoning recorded in baselineNotes is the cost the baseline arm is
 * computed from, so it lives in the repository as data rather than as a
 * constant buried in a script. Replace it with a captured trace and re-run to
 * check the claim.
 *
 * @module dsh-plugin-jev/benchmark/items-coding
 */

import { CHANGE_BANK } from '#src/jev/catalog/change'
import type { BenchmarkItem } from './corpus.ts'

/**
 * Classify a code change.
 *
 * A performance change to an authentication path, touching a module the API and
 * the CLI both depend on. The agent has to say what kind of change it is, how
 * far it can reach, and how hard it must be checked.
 */
const CODING_CHANGE: BenchmarkItem = {
  id: 'coding',
  title: 'Coding — classify a change before reporting it',
  state: {
    change: {
      summary: 'Cache the permission lookup behind a 5 second TTL',
      files_changed: 4,
      additions: 61,
      deletions: 12,
      touches: [
        'src/auth/permissions.ts',
        'src/auth/cache.ts',
        'src/auth/__tests__/permissions.test.ts',
      ],
      notes: 'Per-process cache keyed by user id. No schema change. No new dependency.',
    },
    repository: {
      language: 'TypeScript',
      consumers: ['the HTTP API', 'the CLI', 'three internal services'],
    },
  },
  questions: CHANGE_BANK.questions,
  bank: CHANGE_BANK.id,
  expected: {
    change_kind: 'performance',
    blast_radius: 'A module or interface that other code in this repository depends on',
    needs_migration: 'no',
    review_depth: 'The diff and the surrounding code must both be read',
    is_single_purpose: 'yes',
  },
  baselineNotes: {
    change_kind:
      'The behaviour is unchanged; what changes is how often the lookup runs. That is a '
      + 'performance change rather than a refactor, which would also leave behaviour alone '
      + 'but would be motivated by structure, and rather than a feature, which would add '
      + 'behaviour that did not exist.',
    blast_radius:
      'Nothing published changes and nothing stored changes, so it is not the top tier. But '
      + 'permissions.ts is imported by the API, the CLI, and other services, and a cache '
      + 'introduces staleness they can all observe. That places it in the middle tier rather '
      + 'than the bottom one.',
    needs_migration:
      'The cache lives in process memory and is keyed by user id, so nothing already stored '
      + 'has to change and no consumer has to be updated to keep working. No.',
    review_depth:
      'Cache correctness cannot be judged from the diff alone: it depends on how often the '
      + 'lookup is called and how long a stale answer is acceptable. The reviewer needs to '
      + 'read the surrounding call sites, but the change is small and self-contained enough '
      + 'that running the whole system is more than it needs.',
    is_single_purpose:
      'Every file in the change serves the cache: the lookup, the cache itself, and the test '
      + 'for the lookup. There is no unrelated bump or typo riding along, so yes.',
  },
}

export { CODING_CHANGE }

