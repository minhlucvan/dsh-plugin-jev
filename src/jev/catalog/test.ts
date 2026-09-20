/**
 * Test triage: classify a failure or a test before spending time on it.
 *
 * @module dsh-plugin-system-one/jev/catalog/test
 */

import type { JevQuestionBank } from './index.ts'

/**
 * Test triage.
 *
 * The decision an agent makes when a test run comes back red: is this mine, is
 * it real, and how much test does the behaviour actually need.
 */
const TEST_BANK: JevQuestionBank = {
  id: 'test',
  title: 'Test triage',
  description:
    'Classify a failing test or a proposed test: whether the failure was caused by the '
    + 'change or predates it, whether it is flaky or environmental, how much the test '
    + 'actually asserts, and whether verifying the behaviour needs more than a unit test.',
  questions: {
    failure_cause: {
      type: 'choice',
      instructions: 'What most likely caused this test failure?',
      criteria: {
        caused_by_change: 'The change under test altered the behaviour it asserts',
        pre_existing: 'The test was already failing before the change',
        flaky: 'The test passes and fails without any code change',
        environment: 'A missing dependency, service, or configuration caused it',
        assertion_wrong: 'The behaviour is correct and the test expectation is outdated',
        unknown: 'The evidence does not distinguish between these',
      },
    },
    coverage_depth: {
      type: 'score',
      instructions: 'How much does this test actually verify?',
      criteria: [
        'It exercises the code but asserts nothing meaningful',
        'It asserts the expected behaviour on the ordinary path',
        'It asserts the behaviour and the boundary or failure cases around it',
      ],
    },
    is_regression_test: {
      type: 'noul',
      instructions:
        'Does this test fail without the change under test and pass with it?',
      criteria: {
        true: 'It would catch the regression it claims to cover',
        false: 'It would pass either way',
      },
    },
    needs_integration: {
      type: 'noul',
      instructions:
        'Does verifying this behaviour require more than a unit test, such as a real '
        + 'database, a network call, or another component?',
      criteria: {
        true: 'The behaviour only exists once components are combined',
        false: 'The behaviour is fully determined inside one unit',
      },
    },
  },
}

export { TEST_BANK }

