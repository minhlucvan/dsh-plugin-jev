/**
 * Exploring: the decision an agent makes before it starts an unfamiliar task.
 *
 * @module dsh-plugin-jev/benchmark/items-exploring
 */

import { REASONING_BANK } from '#src/jev/catalog/reasoning'
import type { BenchmarkItem } from './corpus.ts'

/**
 * Scope an unfamiliar task.
 *
 * A one-paragraph bug report against a large repository, with no logs, no access
 * to the failing environment, and no named entry point. The decision is whether
 * to start working or to go and find out more first.
 */
const EXPLORING_TASK: BenchmarkItem = {
  id: 'exploring',
  task: 'exploring',
  title: 'Exploring — scope an unfamiliar task',
  state: {
    request: 'The export button does nothing on staging. Work out why and fix it.',
    known: {
      repository: '~140k lines across three packages',
      failing_environment: 'staging, which this session cannot reach',
      logs: 'not provided',
      entry_point: 'not named',
      reproduces_locally: 'unknown',
      conversation: 'this message only',
    },
  },
  questions: REASONING_BANK.questions,
  bank: REASONING_BANK.id,
  expected: {
    task_shape: 'analysis',
    context_sufficiency: 'Materially underdetermined; a correct answer needs information that is absent',
    needs_external_data: 'yes',
    cost_of_error: 'Moderate; it costs a retry, some time, or a confusing intermediate result',
    ambiguity: 'yes',
    decomposable: 'yes',
  },
  baselineNotes: {
    task_shape:
      'The request asks for a cause before it asks for a fix, and the cause is not in the '
      + 'message. The work is interpreting evidence to reach a conclusion, so it is analysis; '
      + 'the edit that follows is small once the cause is known.',
    context_sufficiency:
      'Nothing needed to start is present: no entry point, no logs, no access to the failing '
      + 'environment, and no statement of whether it reproduces locally. That is not a small '
      + 'gap a reader could fill safely, so it sits at the lowest level.',
    needs_external_data:
      'Finding the cause requires the source tree, and probably the browser console or the '
      + 'staging logs. None of that is in the state, so yes.',
    cost_of_error:
      'A wrong guess here costs a wrong file opened, or a speculative edit that has to be '
      + 'reverted. It is unlikely to break anything irreversible, since the failing '
      + 'environment cannot be reached, so the middle tier fits rather than the top one.',
    ambiguity:
      'Does nothing mean no response, an error, or a request that never returns? The '
      + 'symptom, the browser, and the intended audience are all unspecified, so two '
      + 'competent readers would investigate differently. Yes.',
    decomposable:
      'It splits cleanly: locate the handler, establish whether the event fires, establish '
      + 'whether the request is sent, and establish what the server does with it. Each is a '
      + 'separate judgement, so yes.',
  },
}

export { EXPLORING_TASK }

