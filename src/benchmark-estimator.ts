/**
 * Token estimation for the benchmark's modelled arm.
 *
 * The benchmark has to compare two ways of spending tokens, and only one of
 * them can be measured directly. Jev reports its own `usage`; the baseline —
 * a reasoning model classifying in its own context — reports nothing unless you
 * run it. So the baseline is modelled from text that ships in the corpus, and
 * the estimate has to be stated plainly rather than hidden.
 *
 * The estimator is the standard four-characters-per-token approximation for
 * English prose. It is not a tokenizer and it is not claimed to be exact; it is
 * applied identically to both arms, which is what makes the *ratio* meaningful
 * even though the absolute figures are approximate. Every number the report
 * prints is labelled with the method that produced it.
 *
 * @module dsh-plugin-jev/benchmark-estimator
 */

/** Characters per token assumed for English prose. */
const CHARS_PER_TOKEN = 4

/** Constants are not magic numbers only when they are named; this names one. */
const EMPTY_LENGTH = 0

/**
 * Estimate the tokens a string occupies.
 *
 * @param text - Text to measure.
 * @returns Estimated tokens, never negative.
 */
function estimateTokens(text: string): number {
  if (text.length <= EMPTY_LENGTH) {
    return EMPTY_LENGTH
  }
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * Estimate the tokens a JSON value occupies on the wire.
 *
 * @param value - Any lossless JSON value.
 * @returns Estimated tokens.
 */
function estimateJsonTokens(value: unknown): number {
  return estimateTokens(JSON.stringify(value))
}

export { CHARS_PER_TOKEN, estimateJsonTokens, estimateTokens }

