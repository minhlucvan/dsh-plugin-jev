/**
 * Number formatting for the benchmark report.
 *
 * Single judgements cost fractions of a cent and take seconds, so the formats
 * here are chosen to keep small numbers readable rather than to be uniform: a
 * fixed two-decimal dollar format would print every row as \`$0.00\` and hide the
 * entire comparison.
 *
 * @module dsh-plugin-jev/benchmark/format
 */

/** Decimal places kept on a percentage. */
const PERCENT_DIGITS = 1

/** Decimal places kept on a sub-cent dollar figure. */
const MICRO_DIGITS = 6

/** Decimal places kept on a dollar figure at or above one cent. */
const CENT_DIGITS = 4

/** Dollars below which the micro-precision format is used. */
const CENT_THRESHOLD = 0.01

/** Decimal places kept on a duration. */
const SECOND_DIGITS = 1

/** Decimal places kept on a token count. */
const TOKEN_DIGITS = 0

/** Base of the decimal system, used to build a rounding factor. */
const DECIMAL_BASE = 10

/** Signed marker for a saving that costs more. */
const NEGATIVE = '−'

/** A percentage of nothing. */
const NO_PERCENT = 0

/** Scale factor converting a fraction to a percentage. */
const PERCENT_SCALE = 100

/** Locale-stable thousands separator for the report tables. */
const THOUSANDS_FORMAT = new Intl.NumberFormat('en-US')

/**
 * Round a number for display.
 *
 * @param value - Number to round.
 * @param digits - Decimal places to keep.
 * @returns The rounded number.
 */
function round(value: number, digits: number): number {
  const factor = DECIMAL_BASE ** digits
  return Math.round(value * factor) / factor
}

/**
 * Format a dollar amount with enough precision to be readable.
 *
 * @param usd - Dollars.
 * @returns The formatted amount.
 */
function money(usd: number): string {
  let digits = CENT_DIGITS
  if (usd < CENT_THRESHOLD) {
    digits = MICRO_DIGITS
  }
  return `$${round(usd, digits).toFixed(digits)}`
}

/**
 * Format a duration.
 *
 * @param seconds - Seconds.
 * @returns The formatted duration.
 */
function duration(seconds: number): string {
  return `${round(seconds, SECOND_DIGITS).toFixed(SECOND_DIGITS)}s`
}

/**
 * Format a token count with thousands separators.
 *
 * @param count - Token count.
 * @returns The formatted count.
 */
function tokenCount(count: number): string {
  return THOUSANDS_FORMAT.format(round(count, TOKEN_DIGITS))
}

/**
 * Format a saving as a signed percentage.
 *
 * @param value - Percentage.
 * @returns The formatted percentage.
 */
function signedPercent(value: number): string {
  const rounded = round(value, PERCENT_DIGITS)
  const magnitude = Math.abs(rounded).toFixed(PERCENT_DIGITS)
  if (rounded < NO_PERCENT) {
    return `${NEGATIVE}${magnitude}%`
  }
  return `+${magnitude}%`
}

/**
 * Format a share.
 *
 * @param value - Percentage.
 * @returns The formatted share.
 */
function share(value: number): string {
  return `${round(value, PERCENT_DIGITS).toFixed(PERCENT_DIGITS)}%`
}

export {
  PERCENT_SCALE,
  duration,
  money,
  round,
  share,
  signedPercent,
  tokenCount,
}
