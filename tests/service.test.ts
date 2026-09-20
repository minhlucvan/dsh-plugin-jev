/**
 * Service and transport tests.
 *
 * The service is the layer every face shares, so this suite covers the two
 * things a face depends on: that a malformed request is refused locally instead
 * of billed, and that the ledger records what the API actually reported. The
 * transport cases pin the retry policy, which is easy to get subtly wrong and
 * expensive to discover in production.
 */
import { describe, expect, it } from 'vitest'

import { resolveConfig } from '#src/config'
import type { JevConfig } from '#src/config'
import { createJevClient } from '#src/jev/client'
import type { JevClientOptions } from '#src/jev/client'
import { JevRequestError } from '#src/jev/errors'
import { createJevService } from '#src/jev/service'
import type { JevService } from '#src/jev/service'

const TEST_TIMEOUT = 5000
const FIRST_INDEX = 0
const ONE = 1
const API_KEY = 'test-key'
const BASE_URL = 'https://api.example.test'
const MODEL = 'jev-latest'
const TIMEOUT_MS = 5000
const ONE_RETRY = 1
const NO_RETRIES = 0
const EXPECTED_SINGLE_CALL = 1
const EXPECTED_TWO_CALLS = 2
const ZERO = 0
const FAKE_INPUT_TOKENS = 321
const FAKE_OUTPUT_TOKENS = 12
const SMALL_STATE_LIMIT = 1000
const OVERSIZE_PADDING = 20
const STATUS_TOO_MANY_REQUESTS = 429
const STATUS_UNAUTHORIZED = 401
const NO_WAIT_SECONDS = '0'
const STATUS_OK = 200

/**
 * Yield once, so an asynchronous double has an honest async shape.
 *
 * @returns A promise that settles on the next microtask.
 */
async function yieldOnce(): Promise<void> {
  await Promise.resolve()
}

/** A response body that satisfies the evaluation contract. */
const GOOD_BODY = {
  model: 'jev-1.13.0',
  answers: {
    route: { type: 'choice', choice: 'billing', probabilities: { billing: 1 }, confidence: 0.9 },
  },
  usage: { input_tokens: FAKE_INPUT_TOKENS, output_tokens: FAKE_OUTPUT_TOKENS },
}

/** One well-formed question map. */
const QUESTIONS = {
  route: {
    type: 'choice' as const,
    instructions: 'Which team?',
    criteria: { billing: null, technical: null },
  },
}

/** A transport that replays a fixed list of responses and counts calls. */
interface QueuedTransport {
  fetchImpl: typeof fetch
  calls: () => number
}

/**
 * Build a transport that answers with each queued response in turn.
 *
 * @param responses - Responses to replay; the last one repeats.
 * @returns The transport and its call counter.
 */
function queuedTransport(responses: readonly Response[]): QueuedTransport {
  let index = ZERO
  let calls = ZERO
  const fetchImpl: typeof fetch = async (): Promise<Response> => {
    calls += ONE
    const response = responses[Math.min(index, responses.length - ONE)]
    index += ONE
    await yieldOnce()
    if (response === undefined) {
      throw new Error('no queued response')
    }
    return response.clone()
  }
  return { fetchImpl, calls: () => calls }
}

/**
 * Build client options around one transport.
 *
 * @param transport - Transport to use.
 * @param maxRetries - Attempts after the first.
 * @param waits - Receives every backoff wait in milliseconds.
 * @returns Client construction options.
 */
function clientOptions(
  transport: QueuedTransport,
  maxRetries: number,
  waits: number[],
): JevClientOptions {
  return {
    apiKey: API_KEY,
    baseUrl: BASE_URL,
    model: MODEL,
    timeoutMs: TIMEOUT_MS,
    maxRetries,
    fetchImpl: transport.fetchImpl,
    sleep: async (ms: number): Promise<void> => {
      waits.push(ms)
      await yieldOnce()
    },
  }
}

/**
 * Build a service whose transport replays the queued responses.
 *
 * @param responses - Responses to replay.
 * @param config - Configuration overrides.
 * @returns The service and its call counter.
 */
function serviceWith(
  responses: readonly Response[],
  config: JevConfig = {},
): { service: JevService; calls: () => number } {
  const transport = queuedTransport(responses)
  const service = createJevService(resolveConfig(config), {
    apiKey: API_KEY,
    fetchImpl: transport.fetchImpl,
    sleep: yieldOnce,
    now: () => ZERO,
  })
  return { service, calls: transport.calls }
}

async function testRecordsReportedUsage(): Promise<void> {
  expect.hasAssertions()
  const { service } = serviceWith([Response.json(GOOD_BODY)])
  const evaluation = await service.evaluate({ state: 'card charged twice', questions: QUESTIONS, source: 'test' })
  expect(evaluation.model).toBe('jev-1.13.0')
  const report = service.usage()
  expect(report.totals.inputTokens).toBe(FAKE_INPUT_TOKENS)
  expect(report.byTool.test?.inputTokens).toBe(FAKE_INPUT_TOKENS)
  expect(service.verifyUsage()).toBeUndefined()
}

async function testRefusesAnOversizeStateLocally(): Promise<void> {
  expect.hasAssertions()
  const { service, calls } = serviceWith([Response.json(GOOD_BODY)], {
    maxStateChars: SMALL_STATE_LIMIT,
  })
  const state = 'x'.repeat(SMALL_STATE_LIMIT + OVERSIZE_PADDING)
  await expect(
    service.evaluate({ state, questions: QUESTIONS, source: 'test' }),
  ).rejects.toBeInstanceOf(JevRequestError)
  expect(calls()).toBe(ZERO)
}

async function testRefusesAnUnusableScoreQuestionLocally(): Promise<void> {
  expect.hasAssertions()
  const { service, calls } = serviceWith([Response.json(GOOD_BODY)])
  const questions = {
    bad: { type: 'score' as const, instructions: 'How bad?', criteria: ['only one level'] },
  }
  await expect(
    service.evaluate({ state: 'x', questions, source: 'test' }),
  ).rejects.toThrow(/levels/u)
  expect(calls()).toBe(ZERO)
}

async function testRefusesWhenDisabled(): Promise<void> {
  expect.hasAssertions()
  const { service, calls } = serviceWith([Response.json(GOOD_BODY)], { enabled: false })
  await expect(
    service.evaluate({ state: 'x', questions: QUESTIONS, source: 'test' }),
  ).rejects.toThrow(/enabled: false/u)
  expect(calls()).toBe(ZERO)
}

async function testRetriesARateLimit(): Promise<void> {
  expect.hasAssertions()
  const transport = queuedTransport([
    Response.json({ error: 'slow down' }, {
      status: STATUS_TOO_MANY_REQUESTS,
      headers: { 'retry-after': NO_WAIT_SECONDS },
    }),
    Response.json(GOOD_BODY),
  ])
  const waits: number[] = []
  const client = createJevClient(clientOptions(transport, ONE_RETRY, waits))
  const evaluation = await client.evaluate({ state: 'x', questions: QUESTIONS })
  expect(evaluation.model).toBe('jev-1.13.0')
  expect(transport.calls()).toBe(EXPECTED_TWO_CALLS)
  expect(waits[FIRST_INDEX]).toBe(ZERO)
}

async function testDoesNotRetryAnAuthFailure(): Promise<void> {
  expect.hasAssertions()
  const transport = queuedTransport([
    Response.json({ error: 'bad key' }, { status: STATUS_UNAUTHORIZED }),
    Response.json(GOOD_BODY),
  ])
  const waits: number[] = []
  const client = createJevClient(clientOptions(transport, ONE_RETRY, waits))
  await expect(
    client.evaluate({ state: 'x', questions: QUESTIONS }),
  ).rejects.toThrow(/401/u)
  expect(transport.calls()).toBe(EXPECTED_SINGLE_CALL)
  expect(waits).toHaveLength(ZERO)
}

async function testRejectsANonJsonBody(): Promise<void> {
  expect.hasAssertions()
  const transport = queuedTransport([new Response('<html>nope</html>', { status: STATUS_OK })])
  const waits: number[] = []
  const client = createJevClient(clientOptions(transport, NO_RETRIES, waits))
  await expect(
    client.evaluate({ state: 'x', questions: QUESTIONS }),
  ).rejects.toThrow(/not JSON/u)
}

async function testRejectsABodyThatBreaksTheContract(): Promise<void> {
  expect.hasAssertions()
  const transport = queuedTransport([Response.json({ model: 'x', answers: {}, usage: {} })])
  const waits: number[] = []
  const client = createJevClient(clientOptions(transport, NO_RETRIES, waits))
  await expect(
    client.evaluate({ state: 'x', questions: QUESTIONS }),
  ).rejects.toThrow(/contract/u)
}

describe('jev service', () => {
  it('records the usage the API reported', { timeout: TEST_TIMEOUT }, testRecordsReportedUsage)

  it('refuses an oversize state before sending it', { timeout: TEST_TIMEOUT }, testRefusesAnOversizeStateLocally)

  it('refuses an unusable score question before sending it', { timeout: TEST_TIMEOUT }, testRefusesAnUnusableScoreQuestionLocally)

  it('refuses to evaluate while disabled', { timeout: TEST_TIMEOUT }, testRefusesWhenDisabled)
})

describe('jev transport', () => {
  it('retries a rate limit and honours Retry-After', { timeout: TEST_TIMEOUT }, testRetriesARateLimit)

  it('does not retry an authentication failure', { timeout: TEST_TIMEOUT }, testDoesNotRetryAnAuthFailure)

  it('rejects a body that is not JSON', { timeout: TEST_TIMEOUT }, testRejectsANonJsonBody)

  it('rejects a body that breaks the contract', { timeout: TEST_TIMEOUT }, testRejectsABodyThatBreaksTheContract)
})

