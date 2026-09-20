/**
 * Live Jev measurement for the benchmark.
 *
 * The modelled arm exists because a reasoning model reports nothing about a
 * comparison it was never asked to run. Jev is different: it reports the tokens
 * it billed, so the Jev half of the comparison can be measured rather than
 * assumed. This module does exactly that and nothing else.
 *
 * @module dsh-plugin-jev/benchmark-live
 */

import type { BenchmarkItem } from './benchmark-corpus.ts'
import { createJevClient } from './jev/client.ts'
import type { JevClientOptions } from './jev/client.ts'

/** What one live evaluation cost. */
interface LiveMeasurement {
  /** Corpus item the measurement belongs to. */
  itemId: string
  /** Tokens TypeSafe billed for the request. */
  billedInputTokens: number
  /** Tokens TypeSafe produced; reported but not billed. */
  outputTokens: number
  /** Versioned model id that answered. */
  model: string
  /** Wall-clock duration in milliseconds. */
  durationMs: number
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
      const startedAt = now()
      const evaluation = await client.evaluate({
        state: item.state,
        questions: item.questions,
      })
      return {
        itemId: item.id,
        billedInputTokens: evaluation.usage.input_tokens,
        outputTokens: evaluation.usage.output_tokens,
        model: evaluation.model,
        durationMs: now() - startedAt,
      }
    }),
  )
  return measurements
}

export { clientOptionsOf, measureItems, type LiveMeasurement, type LiveOptions }

