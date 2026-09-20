/**
 * Live Jev measurement for the benchmark.
 *
 * The modelled arm exists because a reasoning model reports nothing about a
 * comparison it was never asked to run. Jev is different: it reports the tokens
 * it billed *and* it can be timed, so both halves of Jev's cost — dollars and
 * seconds — are measured rather than assumed.
 *
 * Every Jev shape is measured, not just the flattering one. The bank call is
 * the shape the cost claim rests on; the ad-hoc call is what a caller with no
 * bank gets; the per-question call is the shape the doctrine warns against, and
 * it is measured sequentially because that is what issuing them one at a time
 * costs. Each shape's answers are graded against the corpus's expected answer,
 * so a cheaper shape cannot win by answering the wrong question.
 *
 * @module dsh-plugin-system-one/benchmark/live
 */

import type { BenchmarkItem } from './corpus.ts'
import type { Agreement } from './quality.ts'
import { agreementOf } from './quality.ts'
import { createJevClient } from '#src/jev/client'
import type { JevClientOptions } from '#src/jev/client'
import { getBank } from '#src/jev/catalog'
import type { JevAnswer, JevJson, JevQuestion } from '#src/jev/contracts'

/** What one call shape cost, in tokens and in time. */
interface CallMeasurement {
  /** Tokens TypeSafe billed across every call the shape made. */
  billedInputTokens: number
  /** Tokens TypeSafe produced; reported but not billed. */
  outputTokens: number
  /** Round trips, summed. */
  latencySeconds: number
  /** Requests the shape issued. */
  calls: number
}

/** What one live item measurement produced. */
interface LiveMeasurement {
  /** Corpus item the measurement belongs to. */
  itemId: string
  /** Versioned model id that answered. */
  model: string
  /** One call carrying every question. */
  adhoc: CallMeasurement
  /** One call per question. */
  split: CallMeasurement
  /** One call naming a shipped bank, when one covers the item. */
  bank: CallMeasurement | undefined
  /** Answers the ad-hoc call returned. */
  adhocAnswers: Record<string, JevAnswer>
  /** Answers the per-question calls returned. */
  splitAnswers: Record<string, JevAnswer>
  /** Answers the bank call returned, when there was one. */
  bankAnswers: Record<string, JevAnswer> | undefined
  /** How each measured shape scored against the expected answers. */
  agreement: Record<'adhoc' | 'split' | 'bank', Agreement>
}

/** Where and how to reach TypeSafe. */
interface LiveOptions {
  /** Bearer credential. */
  apiKey: string
  /** Endpoint base URL without a trailing slash. */
  baseUrl: string
  /** Model id or alias. */
  model: string
  /** Transport override, so the measurement is testable without a network. */
  fetchImpl?: typeof fetch
  /** Clock override. */
  now?: () => number
}

/** Milliseconds in one second. */
const MS_PER_SECOND = 1000

/** Per-attempt deadline for a measured call. */
const LIVE_TIMEOUT_MS = 30_000

/** Attempts after the first, for a measured call. */
const LIVE_MAX_RETRIES = 2

/** One request, used as the increment for every call counter. */
const ONE_CALL = 1

/** No calls yet, which is how every accumulator starts. */
const NO_CALLS = 0

/**
 * Build the client options one live run needs.
 *
 * @param options - Endpoint, credential and model.
 * @returns Client construction options.
 */
function clientOptionsOf(options: LiveOptions): JevClientOptions {
  const clientOptions: JevClientOptions = {
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    model: options.model,
    timeoutMs: LIVE_TIMEOUT_MS,
    maxRetries: LIVE_MAX_RETRIES,
  }
  if (options.fetchImpl !== undefined) {
    clientOptions.fetchImpl = options.fetchImpl
  }
  return clientOptions
}

/** An empty accumulator. */
const NO_MEASUREMENT: CallMeasurement = {
  billedInputTokens: 0,
  outputTokens: 0,
  latencySeconds: 0,
  calls: NO_CALLS,
}

/**
 * Add one call's figures to an accumulator.
 *
 * @param total - Accumulator so far.
 * @param call - The call that just settled.
 * @returns The new accumulator.
 */
function addCall(total: CallMeasurement, call: CallMeasurement): CallMeasurement {
  return {
    billedInputTokens: total.billedInputTokens + call.billedInputTokens,
    outputTokens: total.outputTokens + call.outputTokens,
    latencySeconds: total.latencySeconds + call.latencySeconds,
    calls: total.calls + call.calls,
  }
}

/** An evaluation client, as the measurement uses it. */
type JevClient = ReturnType<typeof createJevClient>

/** One request the measurement issues. */
interface EvaluationRequest {
  /** State to evaluate. */
  state: JevJson
  /** Questions to ask. */
  questions: Record<string, JevQuestion>
}

/**
 * Run one timed evaluation.
 *
 * @param client - Configured evaluation client.
 * @param state - State to evaluate.
 * @param questions - Questions to ask.
 * @param now - Clock.
 * @returns The call's figures and the answers it returned.
 */
async function timedCall(
  client: JevClient,
  request: EvaluationRequest,
  now: () => number,
): Promise<{
  call: CallMeasurement
  answers: Record<string, JevAnswer>
  model: string
}> {
  const startedAt = now()
  const evaluation = await client.evaluate({
    state: request.state,
    questions: request.questions,
  })
  const latencySeconds = (now() - startedAt) / MS_PER_SECOND
  return {
    call: {
      billedInputTokens: evaluation.usage.input_tokens,
      outputTokens: evaluation.usage.output_tokens,
      latencySeconds,
      calls: ONE_CALL,
    },
    answers: evaluation.answers,
    model: evaluation.model,
  }
}

/**
 * Measure one item, every shape.
 *
 * The per-question shape is issued sequentially on purpose: the benchmark
 * prices the sequential reading, and issuing them together would hide the
 * round trips the shape is being blamed for.
 *
 * @param client - Configured evaluation client.
 * @param item - Corpus item to measure.
 * @param now - Clock.
 * @returns The measurement.
 */
async function measureItem(
  client: JevClient,
  item: BenchmarkItem,
  now: () => number,
): Promise<LiveMeasurement> {
  const adhoc = await timedCall(
    client,
    { state: item.state, questions: item.questions },
    now,
  )

  let split = { ...NO_MEASUREMENT }
  const splitAnswers: Record<string, JevAnswer> = {}
  for (const [id, question] of Object.entries(item.questions)) {
    /*
     * Sequential on purpose: the shape being priced is the one that issues a
     * request per question and waits for each, so parallelising here would
     * measure a shape nobody is being warned about.
     */
    // oxlint-disable-next-line no-await-in-loop -- the sequential reading is the measurement.
    const one = await timedCall(client, { state: item.state, questions: { [id]: question } }, now)
    split = addCall(split, one.call)
    const answer = one.answers[id]
    if (answer !== undefined) {
      splitAnswers[id] = answer
    }
  }

  let bank: CallMeasurement | undefined = undefined
  let bankAnswers: Record<string, JevAnswer> | undefined = undefined
  if (item.bank !== undefined) {
    const shipped = getBank(item.bank)
    if (shipped !== undefined) {
      const bankCall = await timedCall(
        client,
        { state: item.state, questions: shipped.questions },
        now,
      )
      bank = bankCall.call
      bankAnswers = bankCall.answers
    }
  }

  return {
    itemId: item.id,
    model: adhoc.model,
    adhoc: adhoc.call,
    split,
    bank,
    adhocAnswers: adhoc.answers,
    splitAnswers,
    bankAnswers,
    agreement: {
      adhoc: agreementOf(adhoc.answers, item.expected),
      split: agreementOf(splitAnswers, item.expected),
      bank: agreementOf(bankAnswers ?? {}, item.expected),
    },
  }
}

/**
 * Measure every corpus item against the live API.
 *
 * Items are measured in parallel, matching how Jev itself evaluates the
 * questions inside one request. Promise.all preserves corpus order, so the
 * report lines up with the modelled run.
 *
 * @param items - Corpus items to measure.
 * @param options - Endpoint, credential and model.
 * @returns One measurement per item, in order.
 */
async function measureItems(
  items: readonly BenchmarkItem[],
  options: LiveOptions,
): Promise<LiveMeasurement[]> {
  const client = createJevClient(clientOptionsOf(options))
  const now = options.now ?? Date.now

  const measurements = await Promise.all(
    items.map(async (item): Promise<LiveMeasurement> => {
      const measurement = await measureItem(client, item, now)
      return measurement
    }),
  )
  return measurements
}

export {
  NO_MEASUREMENT,
  addCall,
  clientOptionsOf,
  measureItem,
  measureItems,
  timedCall,
  type CallMeasurement,
  type LiveMeasurement,
  type LiveOptions,
}
