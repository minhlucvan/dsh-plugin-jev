/**
 * Live Jev measurement for the benchmark.
 *
 * The modelled arm exists because a reasoning model reports nothing about a
 * comparison it was never asked to run. Jev is different: it reports the tokens
 * it billed *and* it can be timed, so both halves of Jev's cost — dollars and
 * seconds — are measured rather than assumed.
 *
 * Both Jev arms are measured. The ad-hoc arm sends the corpus item's own
 * questions; the bank arm sends the shipped bank's questions for the items a
 * bank covers. Measuring only the first would leave the claim the report rests
 * on as the one number nobody checked.
 *
 * @module dsh-plugin-jev/benchmark/live
 */

import type { BenchmarkItem } from './corpus.ts'
import { createJevClient } from '#src/jev/client'
import type { JevClientOptions } from '#src/jev/client'
import { getBank } from '#src/jev/catalog'

/** What one live evaluation cost, in tokens and in time. */
interface LiveMeasurement {
  /** Corpus item the measurement belongs to. */
  itemId: string
  /** Tokens TypeSafe billed for the ad-hoc request. */
  billedInputTokens: number
  /** Tokens TypeSafe produced for the ad-hoc request; not billed. */
  outputTokens: number
  /** Versioned model id that answered. */
  model: string
  /** Ad-hoc round trip in seconds. */
  latencySeconds: number
  /** Tokens billed for the bank request, when a bank covers the item. */
  bankInputTokens: number | undefined
  /** Bank round trip in seconds, when a bank covers the item. */
  bankLatencySeconds: number | undefined
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

/**
 * Measure one item, both ways.
 *
 * Each arm is timed around its own request, so the two latencies are not
 * confused with each other.
 *
 * @param client - Configured evaluation client.
 * @param item - Corpus item to measure.
 * @param now - Clock.
 * @returns The measurement.
 */
async function measureItem(
  client: ReturnType<typeof createJevClient>,
  item: BenchmarkItem,
  now: () => number,
): Promise<LiveMeasurement> {
  const startedAt = now()
  const evaluation = await client.evaluate({
    state: item.state,
    questions: item.questions,
  })
  const latencySeconds = (now() - startedAt) / MS_PER_SECOND

  let bankInputTokens: number | undefined = undefined
  let bankLatencySeconds: number | undefined = undefined
  if (item.bank !== undefined) {
    const bank = getBank(item.bank)
    if (bank !== undefined) {
      const bankStartedAt = now()
      const bankEvaluation = await client.evaluate({
        state: item.state,
        questions: bank.questions,
      })
      bankLatencySeconds = (now() - bankStartedAt) / MS_PER_SECOND
      bankInputTokens = bankEvaluation.usage.input_tokens
    }
  }

  return {
    itemId: item.id,
    billedInputTokens: evaluation.usage.input_tokens,
    outputTokens: evaluation.usage.output_tokens,
    model: evaluation.model,
    latencySeconds,
    bankInputTokens,
    bankLatencySeconds,
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

export { clientOptionsOf, measureItem, measureItems, type LiveMeasurement, type LiveOptions }

