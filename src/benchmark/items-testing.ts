/**
 * Testing: the decision an agent makes when a test run comes back red.
 *
 * @module dsh-plugin-system-one/benchmark/items-testing
 */

import { TEST_BANK } from '#src/jev/catalog/test'
import type { BenchmarkItem } from './corpus.ts'

/**
 * Triage a failing test.
 *
 * One failure in a run where everything else is green, on a branch whose change
 * is exactly what the failing test covers. The agent has to decide whether this
 * is its own doing before it starts changing code.
 */
const TESTING_FAILURE: BenchmarkItem = {
  id: 'testing',
  task: 'testing',
  title: 'Testing — triage a failing test',
  state: {
    run: {
      command: 'pnpm vitest run src/auth',
      passed: 41,
      failed: 1,
      duration_ms: 3840,
    },
    failure: {
      test: 'permissions > returns the role without a second lookup',
      location: 'src/auth/__tests__/permissions.test.ts:44',
      assertion: 'expected 2 to be 1',
      message: 'AssertionError: expected 2 to be 1',
      body: 'expect(lookupCalls).toBe(1)',
    },
    history: {
      passed_on_main: true,
      passed_on_previous_ci: true,
      retried: false,
      same_test_ever_flaky: false,
    },
    change_under_test: 'added a 5 second TTL cache in front of the permission lookup',
  },
  questions: TEST_BANK.questions,
  bank: TEST_BANK.id,
  expected: {
    failure_cause: 'caused_by_change',
    coverage_depth: 'It asserts the expected behaviour on the ordinary path',
    is_regression_test: 'yes',
    needs_integration: 'no',
  },
  baselineNotes: {
    failure_cause:
      'The test counts how many times the lookup runs and expects one call; it now sees two. '
      + 'The change under test inserts a cache in front of exactly that lookup, the test '
      + 'passed on main, and it has never been flaky. The change caused it.',
    coverage_depth:
      'The test asserts a specific observable outcome — the number of lookups — rather than '
      + 'merely executing the code, so it is not the weakest tier. It covers the ordinary '
      + 'path only: there is no case for an expired entry or for two users in sequence, so it '
      + 'is not the deepest tier either.',
    is_regression_test:
      'The test fails with the cache and passed without it, which is the definition of '
      + 'catching the regression it covers. The expectation itself needs updating rather than '
      + 'the cache being wrong, but the test does discriminate between the two versions.',
    needs_integration:
      'The behaviour is a call count inside one module, fully determined by the unit under '
      + 'test. No database, network, or second component is involved, so a unit test is '
      + 'enough.',
  },
}

export { TESTING_FAILURE }

