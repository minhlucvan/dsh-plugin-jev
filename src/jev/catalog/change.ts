/**
 * Code change: classify a diff before review, so the right reviewer and the
 * right amount of checking are chosen up front.
 *
 * @module dsh-plugin-system-one/jev/catalog/change
 */

import type { JevQuestionBank } from './index.ts'

/**
 * Code change.
 *
 * The decision an agent makes after editing and before reporting: what kind of
 * change is this, how far can it reach, and how carefully must it be checked.
 */
const CHANGE_BANK: JevQuestionBank = {
  id: 'change',
  title: 'Code change',
  description:
    'Classify a code change before it is reviewed or reported: what kind of change it is, '
    + 'how far its effects can reach, whether it needs a migration, how deeply it must be '
    + 'checked, and whether it is doing one thing or several.',
  questions: {
    change_kind: {
      type: 'choice',
      instructions: 'What kind of change is this?',
      criteria: {
        bug_fix: 'Corrects behaviour that was wrong',
        feature: 'Adds behaviour that did not exist',
        refactor: 'Changes structure without changing behaviour',
        performance: 'Makes existing behaviour faster or lighter',
        test: 'Adds or changes tests only',
        docs: 'Documentation or comments only',
        chore: 'Build, dependency, or tooling work',
        revert: 'Undoes an earlier change',
      },
    },
    blast_radius: {
      type: 'score',
      instructions: 'How far can the effects of this change reach?',
      criteria: [
        'One function or file; nothing outside it can observe the difference',
        'A module or interface that other code in this repository depends on',
        'A public contract, a stored schema, or data that already exists',
      ],
    },
    needs_migration: {
      type: 'noul',
      instructions:
        'Does this change require existing stored data or a published contract to be migrated?',
      criteria: {
        true: 'Existing data or consumers must be changed to keep working',
        false: 'Nothing already stored or published has to change',
      },
    },
    review_depth: {
      type: 'score',
      instructions: 'How much checking does this change need before it can be trusted?',
      criteria: [
        'Reading the diff is enough',
        'The diff and the surrounding code must both be read',
        'It must be run, and the result reasoned about against the whole system',
      ],
    },
    is_single_purpose: {
      type: 'noul',
      instructions: 'Is the change limited to one purpose?',
      criteria: {
        true: 'Everything in the change serves one goal',
        false: 'The change mixes unrelated goals',
      },
    },
  },
}

export { CHANGE_BANK }

