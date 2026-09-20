/**
 * Boundary rules: how a stored or typed value becomes a usable one.
 *
 * Kept apart from the persisted shape because these are the rules that decide
 * whether a value is usable at all, and the shape is what a usable value looks
 * like. Normalization is the single place a stored value is judged; everything
 * above it may assume a complete, in-range snapshot.
 *
 * @module dsh-plugin-system-one/client/settings-bounds
 */

/** Inclusive bounds a numeric field must fall inside. */
interface NumberBounds {
  /** Inclusive lower bound. */ min: number
  /** Inclusive upper bound. */ max: number
}

/** The bank selection that means "every bank the build ships". */
const ALL_BANKS: string[] = []

/**
 * Read a finite number from a stored value or from typed text.
 *
 * @param value - Stored value, or text typed into the field.
 * @returns The number, or `undefined` when nothing usable was found.
 */
function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      return value
    }
    return undefined
  }
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  if (trimmed === '') {
    return undefined
  }
  const parsed = Number(trimmed)
  if (Number.isFinite(parsed)) {
    return parsed
  }
  return undefined
}

/**
 * Normalize one numeric field into its supported range.
 *
 * @param value - Stored value, or text typed into the field.
 * @param bounds - Inclusive lower and upper bound.
 * @param fallback - Value used when nothing usable was found.
 * @returns The clamped number, or the fallback.
 */
function normalizeNumber(
  value: unknown,
  bounds: NumberBounds,
  fallback: number,
): number {
  const parsed = readNumber(value)
  if (parsed === undefined) {
    return fallback
  }
  return Math.min(Math.max(parsed, bounds.min), bounds.max)
}

/**
 * Read a flag, falling back to its default when the stored value is unusable.
 *
 * @param value - Stored value.
 * @param fallback - Value used when the stored value is not a boolean.
 * @returns The stored flag, or the fallback.
 */
function normalizeFlag(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value
  }
  return fallback
}

/**
 * Read a required string, falling back to its default when it is blank.
 *
 * A blank required string is not a valid setting: an empty model id or an empty
 * variable name is a value the host would reject, so it resolves to the default
 * here rather than reaching the form as an unusable empty field.
 *
 * @param value - Stored value, or text typed into the field.
 * @param fallback - Value used when the stored value is blank or unusable.
 * @returns The trimmed string, or the fallback.
 */
function normalizeText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback
  }
  const trimmed = value.trim()
  if (trimmed === '') {
    return fallback
  }
  return trimmed
}

/**
 * Read a stored bank selection.
 *
 * Only strings survive, because an id is the only thing a bank can be addressed
 * by. Anything else in the array is a value this build cannot act on, and
 * keeping it would put a checkbox on the form that nothing corresponds to.
 *
 * @param value - Stored value, or the selection the form holds.
 * @returns The usable ids, in stored order.
 */
function normalizeBanks(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [...ALL_BANKS]
  }
  const ids: string[] = []
  for (const entry of value) {
    if (typeof entry === 'string' && entry !== '' && !ids.includes(entry)) {
      ids.push(entry)
    }
  }
  return ids
}

/**
 * Whether two bank selections name the same set.
 *
 * @param left - First selection.
 * @param right - Second selection.
 * @returns True when both name the same ids.
 */
function sameBanks(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false
  }
  return left.every((id) => right.includes(id))
}

export {
  readNumber,
  normalizeNumber,
  normalizeFlag,
  normalizeText,
  normalizeBanks,
  sameBanks,
  ALL_BANKS,
  type NumberBounds,
}
