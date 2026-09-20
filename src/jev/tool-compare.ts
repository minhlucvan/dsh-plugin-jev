/**
 * `jev_compare`: score several candidates on several dimensions, then rank in code.
 *
 * This is TypeSafe's composite-scoring pattern made callable. A broad question —
 * "which of these files most likely holds the bug?" — is exactly the kind a
 * System One model answers badly, because it weighs several independent factors
 * at once. Decomposed, it becomes one Score question per candidate per
 * dimension, all evaluated in parallel against the same state and billed once,
 * and the ranking is then arithmetic the caller can see and re-weight.
 *
 * This module owns the boundary: the tool description, the argument schema, and
 * the local validation that keeps a malformed fan-out from being billed. The
 * fan-out and the arithmetic live in `composite.ts`.
 *
 * @module dsh-plugin-jev/jev/tool-compare
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

import {
  KEY_SEPARATOR,
  buildCompareQuestions,
  parseWeights,
  rankCandidates,
  summaryOf,
  winnerOf,
} from './composite.ts'
import type { CompareCandidate, CompareDimension, ComparePlan } from './composite.ts'
import { isRecord } from './contracts.ts'
import type { JevJson } from './contracts.ts'
import type { JevEvaluateInput, JevService } from './service.ts'
import { textBlock } from './tool-support.ts'

/** Most candidates one call may rank. */
const MAX_CANDIDATES = 12

/** Most dimensions one call may score. */
const MAX_DIMENSIONS = 8

/** Most questions one call may fan out to. */
const MAX_QUESTIONS = 72

/** Fewest levels a dimension may declare; a two-point scale is the minimum. */
const MIN_LEVELS = 2

/** Count that means "none", used for empty lists. */
const NONE = 0

/** The parsed arguments one comparison runs on. */
interface CompareRequest {
  /** The context every candidate is judged in. */
  state: JevJson
  /** Raw `candidates` argument. */
  candidates: unknown
  /** Raw `dimensions` argument. */
  dimensions: unknown
  /** Raw `weights` argument, when the caller supplied one. */
  weights?: unknown
}

/** What one comparison reports back to the model. */
interface CompareOutput {
  /** The versioned model id that answered. */
  model: string
  /** One entry per candidate, best first. */
  ranking: JevJson[]
  /** Id of the highest-ranked candidate. */
  winner: string
  /** One-line description of the fan-out and the winner. */
  summary: string
  /** Tokens TypeSafe billed. */
  inputTokens: number
  /** Tokens produced; reported, not billed. */
  outputTokens: number
}

/**
 * Whether a value is a non-empty string.
 *
 * @param value - Candidate value.
 * @returns True for a string with at least one character.
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

/**
 * Validate the candidate list.
 *
 * @param value - Raw `candidates` argument.
 * @returns The parsed candidates.
 * @throws {TypeError} When the list is empty, too long, or malformed.
 */
function parseCandidates(value: unknown): CompareCandidate[] {
  if (!Array.isArray(value) || value.length === NONE) {
    throw new TypeError('"candidates" must be a non-empty array of { id, text }')
  }
  if (value.length > MAX_CANDIDATES) {
    throw new TypeError(
      `"candidates" carries ${String(value.length)} entries; at most ${String(MAX_CANDIDATES)} can be ranked in one call`,
    )
  }
  return value.map((entry, index): CompareCandidate => {
    if (!isRecord(entry)) {
      throw new TypeError(`candidate ${String(index)} must be an object with "id" and "text"`)
    }
    const { id, text } = entry
    if (!isNonEmptyString(id)) {
      throw new TypeError(`candidate ${String(index)} needs a non-empty "id"`)
    }
    if (!isNonEmptyString(text)) {
      throw new TypeError(`candidate "${id}" needs non-empty "text"`)
    }
    if (id.includes(KEY_SEPARATOR)) {
      throw new TypeError(`candidate id "${id}" must not contain "${KEY_SEPARATOR}"`)
    }
    return { id, text }
  })
}

/**
 * Validate one dimension's ordered levels.
 *
 * @param id - Dimension id, used in the failure message.
 * @param raw - Raw `levels` value.
 * @returns The level descriptions, lowest first.
 * @throws {TypeError} When fewer than two levels are present or one is empty.
 */
function parseLevels(id: string, raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length < MIN_LEVELS) {
    throw new TypeError(
      `dimension "${id}" needs at least ${String(MIN_LEVELS)} ordered "levels"`,
    )
  }
  const levels: string[] = []
  for (const entry of raw) {
    if (!isNonEmptyString(entry)) {
      throw new TypeError(`dimension "${id}" has an empty level description`)
    }
    levels.push(entry)
  }
  return levels
}

/**
 * Validate the dimension list.
 *
 * @param value - Raw `dimensions` argument.
 * @returns The parsed dimensions.
 * @throws {TypeError} When the list is empty, too long, or malformed.
 */
function parseDimensions(value: unknown): CompareDimension[] {
  if (!Array.isArray(value) || value.length === NONE) {
    throw new TypeError('"dimensions" must be a non-empty array of { id, instructions, levels }')
  }
  if (value.length > MAX_DIMENSIONS) {
    throw new TypeError(
      `"dimensions" carries ${String(value.length)} entries; at most ${String(MAX_DIMENSIONS)} can be scored in one call`,
    )
  }
  return value.map((entry, index): CompareDimension => {
    if (!isRecord(entry)) {
      throw new TypeError(`dimension ${String(index)} must be an object`)
    }
    const { id, instructions, levels } = entry
    if (!isNonEmptyString(id)) {
      throw new TypeError(`dimension ${String(index)} needs a non-empty "id"`)
    }
    if (id.includes(KEY_SEPARATOR)) {
      throw new TypeError(`dimension id "${id}" must not contain "${KEY_SEPARATOR}"`)
    }
    if (!isNonEmptyString(instructions)) {
      throw new TypeError(`dimension "${id}" needs non-empty "instructions"`)
    }
    return { id, instructions, levels: parseLevels(id, levels) }
  })
}

/**
 * Reject a fan-out larger than one request may carry.
 *
 * @param plan - Parsed candidates, dimensions and weights.
 * @throws {TypeError} When the candidate-by-dimension grid is too large.
 */
function assertQuestionBudget(plan: ComparePlan): void {
  const decisions = plan.candidates.length * plan.dimensions.length
  if (decisions > MAX_QUESTIONS) {
    throw new TypeError(
      `${String(plan.candidates.length)} candidates on ${String(plan.dimensions.length)} `
      + `dimensions is ${String(decisions)} questions; at most ${String(MAX_QUESTIONS)} fit in one call`,
    )
  }
}

/**
 * Parse one request, fan it out, and rank the answers in code.
 *
 * @param service - The plugin service.
 * @param input - The caller's arguments.
 * @param signal - Caller cancellation.
 * @returns The ranking and its accounting.
 * @throws {TypeError} When the arguments cannot form a comparison.
 */
async function runComparison(
  service: JevService,
  input: CompareRequest,
  signal: AbortSignal | undefined,
): Promise<CompareOutput> {
  const candidates = parseCandidates(input.candidates)
  const dimensions = parseDimensions(input.dimensions)
  const plan: ComparePlan = {
    candidates,
    dimensions,
    weights: parseWeights(input.weights, dimensions),
  }
  assertQuestionBudget(plan)

  const request: JevEvaluateInput = {
    state: input.state,
    questions: buildCompareQuestions(plan),
    source: 'jev_compare',
  }
  if (signal !== undefined) {
    request.signal = signal
  }
  const evaluation = await service.evaluate(request)
  const ranking = rankCandidates(evaluation, plan)
  return {
    model: evaluation.model,
    ranking,
    winner: winnerOf(ranking),
    summary: summaryOf(plan, ranking),
    inputTokens: evaluation.usage.input_tokens,
    outputTokens: evaluation.usage.output_tokens,
  }
}

/**
 * Build the composite-scoring tool.
 *
 * @param service - The plugin service.
 * @returns A registry-ready tool definition.
 */
function createCompareTool(service: JevService): ToolDefinition {
  return defineTool({
    name: 'jev_compare',
    description:
      'Rank several candidates against several dimensions in one call, using TypeSafe '
      + 'System One. Use it whenever the question is which of these is best — which file '
      + 'holds the bug, which approach is cheapest, which of these tests matters most. '
      + 'Every candidate is scored on every dimension in parallel against the same state, '
      + 'so nine judgements cost about what one costs, and the plugin combines the scores '
      + 'with weights you supply rather than asking the model to weigh them itself. Give '
      + 'each dimension its own ordered levels; keep each one narrow enough that a '
      + 'knowledgeable reader could answer it in a second.',
    parameters: {
      state: {
        type: 'json',
        description:
          'The context every candidate is judged in: the task, the symptom, the constraint.',
        required: true,
      },
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', required: true, description: 'Stable id, echoed in the ranking.' },
            text: { type: 'string', required: true, description: 'What is being judged.' },
          },
        },
        description: 'The candidates to rank, at most twelve.',
        required: true,
      },
      dimensions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', required: true, description: 'Stable id, echoed in the ranking.' },
            instructions: {
              type: 'string',
              required: true,
              description: 'One narrow question, for example "How likely is this file to contain the cause?".',
            },
            levels: {
              type: 'array',
              items: { type: 'string' },
              required: true,
              description: 'Ordered level descriptions, lowest first, at least two.',
            },
          },
        },
        description: 'The dimensions every candidate is scored on, at most eight.',
        required: true,
      },
      weights: {
        type: 'json',
        description:
          'Optional dimension id to weight. Unlisted dimensions weigh 1, so a heavier '
          + 'dimension is expressed as a larger number rather than by repeating it.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          model: { type: 'string', required: true },
          ranking: { type: 'json', required: true },
          winner: { type: 'string', required: true },
          summary: { type: 'string', required: true },
          inputTokens: { type: 'integer', required: true },
          outputTokens: { type: 'integer', required: true },
        },
      },
      render: (_args, value) =>
        textBlock(`best=${value.winner} of ${value.summary}`),
    },
    presentCall: args => ({
      card: 'generic',
      kind: 'other',
      title: `System One compare: ${String(args.candidates.length)} candidates`,
    }),
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const result = await runComparison(service, args, exec.signal)
      return result
    },
  })
}

export { MAX_CANDIDATES, MAX_DIMENSIONS, MAX_QUESTIONS, createCompareTool }
