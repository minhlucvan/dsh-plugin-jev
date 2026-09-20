/**
 * Cumulative token accounting for one plugin instance.
 *
 * The ledger answers the question a token-optimization claim has to survive:
 * how many tokens did Jev actually bill, and what did those tokens buy. Totals
 * are cumulative for the lifetime of the instance; a bounded ring of recent
 * entries supplies the per-call detail a UI shows without letting a long
 * session grow without limit.
 *
 * Because eviction makes cumulative totals and the retained ring diverge, the
 * ledger also keeps a running total of what it dropped. That gives it one
 * exact identity to recheck — `totals === evicted + Σ(retained)` — which is
 * what the package's invariant companion asserts.
 *
 * @module dsh-plugin-system-one/jev/ledger
 */

/** One recorded evaluation. */
type JevUsageEntry = {
  /** Epoch milliseconds when the request settled. */
  at: number
  /** Tool or surface that issued the request. */
  tool: string
  /** Versioned model id that answered. */
  model: string
  /** Questions asked in the request. */
  questions: number
  /** Characters of state submitted. */
  stateChars: number
  /** Billed input tokens. */
  inputTokens: number
  /** Output tokens, reported but not billed. */
  outputTokens: number
  /** Wall-clock duration in milliseconds. */
  durationMs: number
}

/** Aggregate figures over a set of entries. */
type JevUsageTotals = {
  /** Evaluations counted. */
  calls: number
  /** Billed input tokens. */
  inputTokens: number
  /** Output tokens produced. */
  outputTokens: number
  /** Questions asked. */
  questions: number
  /** Characters of state submitted. */
  stateChars: number
}

/** Cumulative accounting for one plugin instance. */
interface JevUsageLedger {
  /**
   * Record one settled evaluation.
   *
   * @param entry - The completed call.
   */
  record: (entry: JevUsageEntry) => void
  /**
   * Most recent entries, newest first.
   *
   * @param count - Maximum entries to return; omitted returns the whole ring.
   * @returns Retained entries in reverse chronological order.
   */
  recent: (count?: number) => JevUsageEntry[]
  /**
   * Cumulative totals since construction or the last reset.
   *
   * @returns Aggregate figures.
   */
  totals: () => JevUsageTotals
  /**
   * Cumulative totals per tool.
   *
   * @returns One aggregate per tool id that has recorded a call.
   */
  byTool: () => Record<string, JevUsageTotals>
  /**
   * Recheck the ledger's accounting identity.
   *
   * @returns A description of the violated relationship, or `undefined` when
   *   the ledger is consistent.
   */
  verify: () => string | undefined
  /** Discard every retained entry and reset the cumulative counters. */
  reset: () => void
}

/** A ledger with no recorded calls. */
const EMPTY_TOTALS: JevUsageTotals = {
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  questions: 0,
  stateChars: 0,
}

/** Increment applied when counting one recorded call. */
const ONE = 1

/** Lowest entry count accepted, so the ring always holds something. */
const MIN_LIMIT = 1

/**
 * Add one entry into an aggregate, returning a new object.
 *
 * @param totals - Aggregate to extend.
 * @param entry - Entry to fold in.
 * @returns The extended aggregate.
 */
function addEntry(totals: JevUsageTotals, entry: JevUsageEntry): JevUsageTotals {
  return {
    calls: totals.calls + ONE,
    inputTokens: totals.inputTokens + entry.inputTokens,
    outputTokens: totals.outputTokens + entry.outputTokens,
    questions: totals.questions + entry.questions,
    stateChars: totals.stateChars + entry.stateChars,
  }
}

/**
 * Whether two aggregates are identical field by field.
 *
 * @param left - First aggregate.
 * @param right - Second aggregate.
 * @returns True when every field matches.
 */
function sameTotals(left: JevUsageTotals, right: JevUsageTotals): boolean {
  return (
    left.calls === right.calls
    && left.inputTokens === right.inputTokens
    && left.outputTokens === right.outputTokens
    && left.questions === right.questions
    && left.stateChars === right.stateChars
  )
}

/**
 * Whether one entry carries only counts a real evaluation could produce.
 *
 * @param entry - Entry to inspect.
 * @returns True when every counter is a non-negative finite number.
 */
function isSoundEntry(entry: JevUsageEntry): boolean {
  const counters = [
    entry.questions,
    entry.stateChars,
    entry.inputTokens,
    entry.outputTokens,
    entry.durationMs,
  ]
  return counters.every(value => Number.isFinite(value) && value >= EMPTY_TOTALS.calls)
}

/**
 * Create a usage ledger.
 *
 * @param limit - Maximum recent entries retained; totals are unaffected.
 * @returns A ledger owned by the caller.
 */
function createUsageLedger(limit: number): JevUsageLedger {
  const capacity = Math.max(limit, MIN_LIMIT)
  const entries: JevUsageEntry[] = []
  const perTool = new Map<string, JevUsageTotals>()
  let totals: JevUsageTotals = { ...EMPTY_TOTALS }
  let evicted: JevUsageTotals = { ...EMPTY_TOTALS }

  return {
    record(entry: JevUsageEntry): void {
      entries.push(entry)
      while (entries.length > capacity) {
        const dropped = entries.shift()
        if (dropped !== undefined) {
          evicted = addEntry(evicted, dropped)
        }
      }
      totals = addEntry(totals, entry)
      const toolTotals = perTool.get(entry.tool) ?? { ...EMPTY_TOTALS }
      perTool.set(entry.tool, addEntry(toolTotals, entry))
    },
    recent(count?: number): JevUsageEntry[] {
      const newestFirst = entries.toReversed()
      if (count === undefined) {
        return newestFirst
      }
      return newestFirst.slice(EMPTY_TOTALS.calls, Math.max(count, EMPTY_TOTALS.calls))
    },
    totals(): JevUsageTotals {
      return { ...totals }
    },
    byTool(): Record<string, JevUsageTotals> {
      const result: Record<string, JevUsageTotals> = {}
      for (const [tool, toolTotals] of perTool) {
        result[tool] = { ...toolTotals }
      }
      return result
    },
    verify(): string | undefined {
      const unsound = entries.find(entry => !isSoundEntry(entry))
      if (unsound !== undefined) {
        return `retained usage entry for "${unsound.tool}" carries a negative or non-finite counter`
      }
      let recomputed = { ...evicted }
      for (const entry of entries) {
        recomputed = addEntry(recomputed, entry)
      }
      if (!sameTotals(recomputed, totals)) {
        return (
          'cumulative usage totals no longer equal the evicted total plus the retained '
          + `entries: cumulative ${String(totals.calls)} calls / ${String(totals.inputTokens)} input tokens, `
          + `recomputed ${String(recomputed.calls)} calls / ${String(recomputed.inputTokens)} input tokens`
        )
      }
      return undefined
    },
    reset(): void {
      entries.length = EMPTY_TOTALS.calls
      perTool.clear()
      totals = { ...EMPTY_TOTALS }
      evicted = { ...EMPTY_TOTALS }
    },
  }
}

export {
  EMPTY_TOTALS,
  createUsageLedger,
  type JevUsageEntry,
  type JevUsageLedger,
  type JevUsageTotals,
}

