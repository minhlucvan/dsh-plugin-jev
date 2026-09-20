/**
 * The usage tool: what Jev has cost so far in this session.
 *
 * A token-optimization claim is only as good as the number behind it, and the
 * number a caller needs is usually "what has this cost me so far" rather than a
 * published per-token price. The ledger behind this tool is the same one the
 * browser panel and the HTTP route read, so the three cannot disagree.
 *
 * @module dsh-plugin-system-one/jev/tools/usage
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

import { isRecord } from './contracts.ts'
import type { JevService } from './service.ts'
import { textBlock } from './tool-support.ts'

/** Recent entries returned when the caller does not say how many. */
const DEFAULT_RECENT_LIMIT = 10

/** Value returned when a counter is absent or not a number. */
const ZERO = 0

/** Field the renderer reads for the number of recorded calls. */
const CALLS_KEY = 'calls'

/** Field the renderer reads for billed input tokens. */
const INPUT_KEY = 'inputTokens'

/** Field the renderer reads for free output tokens. */
const OUTPUT_KEY = 'outputTokens'

/**
 * Read one numeric counter out of an already-schema-validated totals value.
 *
 * @param totals - The totals value the output schema validated.
 * @param key - Field to read.
 * @returns The number, or zero when the field is absent or not a number.
 */
function readNumber(totals: unknown, key: string): number {
  if (!isRecord(totals)) {
    return ZERO
  }
  const candidate = totals[key]
  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return candidate
  }
  return ZERO
}

/**
 * Build the usage tool.
 *
 * @param service - The plugin service.
 * @returns A registry-ready tool definition.
 */
function createUsageTool(service: JevService): ToolDefinition {
  return defineTool({
    name: 'jev_usage',
    description:
      'Report how many TypeSafe Jev tokens this session has billed so far, broken down by '
      + 'tool, plus the most recent evaluations. Use it to check the cost of a decision '
      + 'before repeating it, or to compare what a batch of judgements cost against doing '
      + 'the same work in your own context. TypeSafe bills input tokens only; output tokens '
      + 'are reported for completeness.',
    parameters: {
      limit: {
        type: 'integer',
        description: `How many recent evaluations to return. Defaults to ${String(DEFAULT_RECENT_LIMIT)}.`,
      },
      reset: {
        type: 'boolean',
        description:
          'Discard the retained entries and zero the cumulative counters. Only pass this '
          + 'when the caller explicitly asked for a fresh measurement.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          totals: { type: 'json', required: true },
          byTool: { type: 'json', required: true },
          recent: { type: 'json', required: true },
        },
      },
      render: (_args, value) =>
        textBlock(
          `calls=${String(readNumber(value.totals, CALLS_KEY))} `
          + `inputTokens=${String(readNumber(value.totals, INPUT_KEY))} `
          + `outputTokens=${String(readNumber(value.totals, OUTPUT_KEY))}`,
        ),
    },
    presentCall: () => ({
      card: 'generic',
      kind: 'read',
      title: 'Jev usage',
    }),
    async execute(args) {
      if (args.reset === true) {
        service.resetUsage()
      }
      const report = service.usage(args.limit ?? DEFAULT_RECENT_LIMIT)
      // The tool API is asynchronous by contract, but this body has no I/O.
      await Promise.resolve()
      return {
        totals: report.totals,
        byTool: report.byTool,
        recent: report.recent,
      }
    },
  })
}

export { createUsageTool }

