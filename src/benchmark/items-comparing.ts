/**
 * Comparing: the decision an agent makes when several suspects fit a symptom.
 *
 * This item is TypeSafe's composite-scoring pattern in the corpus: three
 * candidates scored on three independent dimensions, nine Score questions in
 * one request, ranked in code afterwards. No shipped bank covers it, so the
 * report prices it on the ad-hoc arm alone.
 *
 * @module dsh-plugin-jev/benchmark/items-comparing
 */

import type { JevQuestion } from '#src/jev/contracts'
import type { BenchmarkItem } from './corpus.ts'

/** What the repository file does, as the questions describe it. */
const REPOSITORY_TEXT =
  'src/users/profile-repository.ts upserts a profile row inside a transaction: it reads the '
  + 'existing row and inserts when it finds none.'

/** What the cache file does, as the questions describe it. */
const CACHE_TEXT =
  'src/users/profile-cache.ts caches profile rows by user id for 30 seconds and serves reads '
  + 'from that cache.'

/** What the sync job does, as the questions describe it. */
const SYNC_TEXT =
  'src/jobs/profile-sync.ts copies profiles from the identity provider into the same table '
  + 'every five minutes.'

/** Lowest level of "how likely is this file to hold the cause?". */
const CAUSE_UNLIKELY = 'Unlikely: nothing in this file writes on the path the report describes'

/** Middle level of "how likely is this file to hold the cause?". */
const CAUSE_POSSIBLE =
  'Possible: this file can write what the report collides with, but not on the path the report describes'

/** Highest level of "how likely is this file to hold the cause?". */
const CAUSE_LIKELY = 'Likely: this file performs the write the report names, on the failing path'

/** Lowest level of "how well does this file explain the symptom?". */
const SYMPTOM_WEAK = 'Weak: the file can be wrong without producing the reported error'

/** Middle level of "how well does this file explain the symptom?". */
const SYMPTOM_PARTIAL =
  'Partial: the file can produce the reported error, but not on the path the report names'

/** Highest level of "how well does this file explain the symptom?". */
const SYMPTOM_DIRECT =
  'Direct: the file produces the reported error on the exact path the report names'

/** Lowest level of "how cheap is a safe change here?". */
const COST_HIGH =
  'High: the file is reached from several paths, and a safe change needs a migration or a contract change elsewhere'

/** Middle level of "how cheap is a safe change here?". */
const COST_MODERATE =
  'Moderate: more than one caller reaches the file, so a change needs tests around each of them'

/** Highest level of "how cheap is a safe change here?". */
const COST_LOW = 'Low: the file is narrowly scoped, so a change can be made and verified in isolation'

/** The cause-likelihood dimension, worded as the fan-out sends it. */
const CAUSE_PROMPT = 'Scored against the state, how likely is this file to hold the cause? Judge only the candidate named in `candidate`, using `others` for contrast.'

/** The symptom-match dimension, worded as the fan-out sends it. */
const SYMPTOM_PROMPT = 'Scored against the state, how well does this file explain the exact symptom reported? Judge only the candidate named in `candidate`, using `others` for contrast.'

/** The change-cost dimension, worded as the fan-out sends it. */
const COST_PROMPT = 'Scored against the state, how cheap is a safe change in this file? Judge only the candidate named in `candidate`, using `others` for contrast.'

/** The nine Score questions one comparison fans out to, keyed candidate by dimension. */
const COMPARING_QUESTIONS: Record<string, JevQuestion> = {
  'profile-repository::cause_likelihood': {
    type: 'score',
    instructions: { candidate: REPOSITORY_TEXT, others: [CACHE_TEXT, SYNC_TEXT], question: CAUSE_PROMPT },
    criteria: [CAUSE_UNLIKELY, CAUSE_POSSIBLE, CAUSE_LIKELY],
  },
  'profile-repository::symptom_match': {
    type: 'score',
    instructions: { candidate: REPOSITORY_TEXT, others: [CACHE_TEXT, SYNC_TEXT], question: SYMPTOM_PROMPT },
    criteria: [SYMPTOM_WEAK, SYMPTOM_PARTIAL, SYMPTOM_DIRECT],
  },
  'profile-repository::change_cost': {
    type: 'score',
    instructions: { candidate: REPOSITORY_TEXT, others: [CACHE_TEXT, SYNC_TEXT], question: COST_PROMPT },
    criteria: [COST_HIGH, COST_MODERATE, COST_LOW],
  },
  'profile-cache::cause_likelihood': {
    type: 'score',
    instructions: { candidate: CACHE_TEXT, others: [REPOSITORY_TEXT, SYNC_TEXT], question: CAUSE_PROMPT },
    criteria: [CAUSE_UNLIKELY, CAUSE_POSSIBLE, CAUSE_LIKELY],
  },
  'profile-cache::symptom_match': {
    type: 'score',
    instructions: { candidate: CACHE_TEXT, others: [REPOSITORY_TEXT, SYNC_TEXT], question: SYMPTOM_PROMPT },
    criteria: [SYMPTOM_WEAK, SYMPTOM_PARTIAL, SYMPTOM_DIRECT],
  },
  'profile-cache::change_cost': {
    type: 'score',
    instructions: { candidate: CACHE_TEXT, others: [REPOSITORY_TEXT, SYNC_TEXT], question: COST_PROMPT },
    criteria: [COST_HIGH, COST_MODERATE, COST_LOW],
  },
  'profile-sync::cause_likelihood': {
    type: 'score',
    instructions: { candidate: SYNC_TEXT, others: [REPOSITORY_TEXT, CACHE_TEXT], question: CAUSE_PROMPT },
    criteria: [CAUSE_UNLIKELY, CAUSE_POSSIBLE, CAUSE_LIKELY],
  },
  'profile-sync::symptom_match': {
    type: 'score',
    instructions: { candidate: SYNC_TEXT, others: [REPOSITORY_TEXT, CACHE_TEXT], question: SYMPTOM_PROMPT },
    criteria: [SYMPTOM_WEAK, SYMPTOM_PARTIAL, SYMPTOM_DIRECT],
  },
  'profile-sync::change_cost': {
    type: 'score',
    instructions: { candidate: SYNC_TEXT, others: [REPOSITORY_TEXT, CACHE_TEXT], question: COST_PROMPT },
    criteria: [COST_HIGH, COST_MODERATE, COST_LOW],
  },
}

/**
 * Rank three suspect files for one intermittent save failure.
 *
 * The report names a unique-constraint violation on save, not a cause. Three
 * files touch the same table, so the work is to score each of them on how
 * likely it holds the cause, how well it explains the exact symptom, and how
 * cheap a safe change there would be, then rank the three combinations.
 */
const COMPARING_SUSPECTS: BenchmarkItem = {
  id: 'comparing',
  title: 'Comparing — rank three suspects in one fan-out',
  state: {
    report: {
      symptom: 'Saving a profile returns 500 on staging roughly one time in five; retrying usually works.',
      error: 'duplicate key value violates unique constraint "profiles_user_id_key"',
      endpoint: 'PUT /api/users/:id/profile',
      observed: 'only saves for accounts created in the last few minutes have failed',
    },
    candidates: {
      'profile-repository': REPOSITORY_TEXT,
      'profile-cache': CACHE_TEXT,
      'profile-sync': SYNC_TEXT,
    },
  },
  questions: COMPARING_QUESTIONS,
  expected: {
    'profile-repository::cause_likelihood': CAUSE_LIKELY,
    'profile-repository::symptom_match': SYMPTOM_DIRECT,
    'profile-repository::change_cost': COST_MODERATE,
    'profile-cache::cause_likelihood': CAUSE_UNLIKELY,
    'profile-cache::symptom_match': SYMPTOM_WEAK,
    'profile-cache::change_cost': COST_LOW,
    'profile-sync::cause_likelihood': CAUSE_POSSIBLE,
    'profile-sync::symptom_match': SYMPTOM_PARTIAL,
    'profile-sync::change_cost': COST_MODERATE,
  },
  baselineNotes: {
    'profile-repository::cause_likelihood':
      'The error is a unique-constraint violation on profiles_user_id_key, and this is the file '
      + 'that writes a profile row: it reads for an existing row and inserts when it finds none. '
      + 'Two saves that interleave both find none and both insert, which is the reported failure, '
      + 'and "retrying usually works" is what a race looks like from the outside. Likely.',
    'profile-repository::symptom_match':
      'The error text, the table, and the endpoint all belong to this file\'s insert path, and the '
      + 'report adds that only accounts created in the last few minutes have failed — the window in '
      + 'which the row may not exist yet. That is the path the report describes, not merely a path '
      + 'it could describe. Direct.',
    'profile-repository::change_cost':
      'The save endpoint and the scheduled sync both write through this repository, so a change '
      + 'here has to keep working for callers that run outside the request. The edit is small — the '
      + 'read and the insert can become one statement — but its tests have to cover both callers. '
      + 'Moderate.',
    'profile-cache::cause_likelihood':
      'This file serves reads and never inserts, so it cannot raise a unique-constraint violation '
      + 'on its own. A stale entry would return an old profile, which is a different symptom from a '
      + '500 on save. Unlikely.',
    'profile-cache::symptom_match':
      'The reported failure names a database constraint, and a cache hit or miss has no way to '
      + 'produce one. The file can be wrong without producing anything like the reported error. '
      + 'Weak.',
    'profile-cache::change_cost':
      'The cache is keyed and bounded inside one file, and no other module reaches into it, so a '
      + 'change can be made and verified in isolation. Low.',
    'profile-sync::cause_likelihood':
      'This job copies profiles into the same table, so it can insert the row the save path then '
      + 'collides with, which would explain why only new accounts fail. It runs every five minutes '
      + 'rather than on the request, so it can hold the cause without being on the failing path. '
      + 'Possible.',
    'profile-sync::symptom_match':
      'A collision with a row this job inserted produces the same constraint violation, so it '
      + 'explains the error. It does not explain why the failure is reported on save, or why a '
      + 'retry succeeds, unless the five-minute schedule happens to line up about one time in '
      + 'five. Partial.',
    'profile-sync::change_cost':
      'One writer owns the job, so a change is contained, but a copy may be in flight when the '
      + 'change ships, so the edit needs a safe way to treat a row it is halfway through writing. '
      + 'Moderate.',
  },
}

export { COMPARING_SUSPECTS }
