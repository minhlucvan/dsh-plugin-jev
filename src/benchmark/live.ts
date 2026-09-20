/**
 * Live Jev measurement for the benchmark.
 *
 * The modelled arm exists because a reasoning model reports nothing about a
 * comparison it was never asked to run. Jev is different: it reports the tokens
 * it billed, so the Jev half of the comparison can be measured rather than
 * assumed. This module does exactly that and nothing else.
 *
 * Both Jev arms are measured. The ad-hoc arm sends the corpus item's own
 * questions; the bank arm sends the shipped bank's questions for the items a
 * bank covers. Measuring only the first would leave the claim the report rests
 * on — that banks are the cheap shape — as the one number nobody checked.
 *
 * @module dsh-plugin-jev/benchmark/live
 */

import type { BenchmarkItem } from './corpus.ts'
import { createJevClient } from '#src/jev/client'
import type { JevClientOptions } from '#src/jev/client'
import { getBank } from '#src/jev/catalog'

/** What one live evaluation cost. */
interface LiveMeasurement {
  /** Corpus item the measurement belongs to. */
  itemId: string
  /** Tokens TypeSafe billed for the ad-hoc request. */
  billedInputTokens: number
  /** Tokens TypeSafe produced for the ad-hoc request; not billed. */
  outputTokens: number
  /** Versioned model id that answered. */
  model: string
  /** Wall-clock duration in milliseconds. */
  durationMs: number
  /** Tokens billed for the bank request, when a bank covers the item. */
  bankInputTokens: number | undefined
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
    timeoutMs: 30_000,
    maxRetries: 2,
  }
  if (options.fetchImpl !== undefined) {
    clientOptions.fetchImpl = options.fetchImpl
  }
  return clientOptions
}

/**
 * Measure one item, both ways.
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
  const durationMs = now() - startedAt

  let bankInputTokens: number | undefined = undefined
  if (item.bank !== undefined) {
    const bank = getBank(item.bank)
    if (bank !== undefined) {
      const bankEvaluation = await client.evaluate({
        state: item.state,
        questions: bank.questions,
      })
      bankInputTokens = bankEvaluation.usage.input_tokens
    }
  }

  return {
    itemId: item.id,
    billedInputTokens: evaluation.usage.input_tokens,
    outputTokens: evaluation.usage.output_tokens,
    model: evaluation.model,
    durationMs,
    bankInputTokens,
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

