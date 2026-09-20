/**
 * Shared building blocks for the Jev tool face.
 *
 * Two jobs live here and nowhere else: keeping the model-facing projection
 * small, and parsing what the model sent. The second matters more than it
 * looks — `jev_ask` accepts free-form question JSON, and validating it locally
 * turns a wasted billed request into a precise error the model can correct on
 * the next turn.
 *
 * @module dsh-plugin-jev/jev/tools/shared
 */

import type { JevAnswer, JevJson, JevQuestion } from './contracts.ts'
import { isRecord } from './contracts.ts'
import { effectiveConfidence, routeFromConfidence } from './routing.ts'
import type { JevRisk, JevRoute } from './routing.ts'
import type { JevService } from './service.ts'

/** One model-facing text block, structurally a dsh-llm `TextBlock`. */
interface JevTextBlock {
  /** Block discriminant. */
  type: 'text'
  /** Visible text. */
  text: string
}

/** Characters of a one-line summary kept before it is elided. */
const LINE_LIMIT = 140

/** Nesting depth accepted from model-supplied JSON before it is refused. */
const JSON_DEPTH_LIMIT = 32

/** Depth a top-level JSON value is tested at. */
const ROOT_DEPTH = 0

/** Increment applied when descending one JSON level. */
const DEPTH_STEP = 1

/** Count a collection must exceed before it counts as populated. */
const EMPTY = 0

/** Index of the first character of a string. */
const FIRST_CHARACTER = 0

/** Risk tier assumed when a caller does not declare one. */
const DEFAULT_RISK: JevRisk = 'low'

/**
 * Wrap text as the single content block a tool result carries.
 *
 * @param text - Model-facing text.
 * @returns A one-element content block list.
 */
function textBlock(text: string): JevTextBlock[] {
  return [{ type: 'text', text }]
}

/**
 * Collapse arbitrary text into one bounded line.
 *
 * Card titles and summaries are read at a glance, so a title that grew to a
 * paragraph would make the call harder to scan rather than easier.
 *
 * @param value - Candidate text, however malformed at replay time.
 * @param fallback - Text used when the candidate is not a usable string.
 * @param limit - Maximum characters retained.
 * @returns A single trimmed, bounded line.
 */
function oneLine(value: unknown, fallback: string, limit: number = LINE_LIMIT): string {
  if (typeof value !== 'string') {
    return fallback
  }
  const collapsed = value.replaceAll(/\s+/gu, ' ').trim()
  if (collapsed === '') {
    return fallback
  }
  if (collapsed.length <= limit) {
    return collapsed
  }
  return `${collapsed.slice(FIRST_CHARACTER, limit)}…`
}

/**
 * Normalize a declared risk tier.
 *
 * @param value - Risk as the model supplied it.
 * @returns The recognized tier, defaulting to low.
 */
function riskOf(value: unknown): JevRisk {
  if (value === 'high') {
    return 'high'
  }
  return DEFAULT_RISK
}

/**
 * Apply the configured thresholds to one answer.
 *
 * @param service - The plugin service, for its policy.
 * @param answer - One answer from an evaluation.
 * @param risk - Declared cost of acting on a wrong answer.
 * @returns The route the caller should take.
 */
function routeForAnswer(service: JevService, answer: JevAnswer, risk: JevRisk): JevRoute {
  return routeFromConfidence(effectiveConfidence(answer), service.policy, risk)
}

/**
 * Depth-bounded JSON check.
 *
 * @param value - Candidate value.
 * @param depth - Current nesting depth.
 * @returns True when the value is lossless JSON within the depth limit.
 */
function isJevJsonAt(value: unknown, depth: number): value is JevJson {
  if (depth > JSON_DEPTH_LIMIT) {
    return false
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true
  }
  if (typeof value === 'number') {
    return Number.isFinite(value)
  }
  if (Array.isArray(value)) {
    return value.every(item => isJevJsonAt(item, depth + DEPTH_STEP))
  }
  if (typeof value === 'object') {
    return Object.values(value).every(item => isJevJsonAt(item, depth + DEPTH_STEP))
  }
  return false
}

/**
 * Whether a value is a bounded, lossless JSON value.
 *
 * @param value - Candidate value.
 * @returns True when the value is JSON Jev could accept.
 */
function isJevJson(value: unknown): value is JevJson {
  return isJevJsonAt(value, ROOT_DEPTH)
}

/**
 * Read the `criteria` of a Noul question.
 *
 * @param raw - Raw criteria, if the model supplied any.
 * @returns A validated criteria object, or `undefined`.
 * @throws {TypeError} When criteria is present but malformed.
 */
function parseNoulCriteria(raw: unknown): { true?: JevJson; false?: JevJson } | undefined {
  if (raw === undefined) {
    return undefined
  }
  if (!isRecord(raw)) {
    throw new TypeError('noul "criteria" must be an object with "true" and/or "false"')
  }
  const criteria: { true?: JevJson; false?: JevJson } = {}
  if (raw.true !== undefined) {
    if (!isJevJson(raw.true)) {
      throw new TypeError('noul criteria "true" must be text, an object, or an array')
    }
    criteria.true = raw.true
  }
  if (raw.false !== undefined) {
    if (!isJevJson(raw.false)) {
      throw new TypeError('noul criteria "false" must be text, an object, or an array')
    }
    criteria.false = raw.false
  }
  return criteria
}

/**
 * Validate one model-supplied question.
 *
 * @param id - Answer id the question was filed under.
 * @param raw - Raw question object.
 * @returns The validated question.
 * @throws {TypeError} When the question cannot be sent to Jev.
 */
function parseQuestion(id: string, raw: unknown): JevQuestion {
  if (!isRecord(raw)) {
    throw new TypeError(`question "${id}" must be an object`)
  }
  if (raw.instructions === undefined || !isJevJson(raw.instructions)) {
    throw new TypeError(`question "${id}" needs lossless-JSON "instructions"`)
  }
  if (raw.type === 'noul') {
    const criteria = parseNoulCriteria(raw.criteria)
    if (criteria === undefined) {
      return { type: 'noul', instructions: raw.instructions }
    }
    return { type: 'noul', instructions: raw.instructions, criteria }
  }
  if (raw.type === 'choice') {
    if (!isRecord(raw.criteria)) {
      throw new TypeError(`choice question "${id}" needs a "criteria" object of options`)
    }
    const criteria: Record<string, JevJson> = {}
    for (const [option, description] of Object.entries(raw.criteria)) {
      if (description !== null && !isJevJson(description)) {
        throw new TypeError(
          `choice option "${option}" of "${id}" has an unsupported description`,
        )
      }
      criteria[option] = description
    }
    return { type: 'choice', instructions: raw.instructions, criteria }
  }
  if (raw.type === 'score') {
    if (!Array.isArray(raw.criteria)) {
      throw new TypeError(`score question "${id}" needs a "criteria" array of levels`)
    }
    if (!raw.criteria.every(level => isJevJson(level))) {
      throw new TypeError(`score question "${id}" has an unsupported level`)
    }
    return { type: 'score', instructions: raw.instructions, criteria: raw.criteria }
  }
  throw new TypeError(
    `question "${id}" has type "${String(raw.type)}"; expected noul, choice, or score`,
  )
}

/**
 * Validate a whole model-supplied question map.
 *
 * @param value - Raw `questions` argument.
 * @returns The validated map.
 * @throws {TypeError} When the map is empty or a question is malformed.
 */
function parseQuestionMap(value: unknown): Record<string, JevQuestion> {
  if (!isRecord(value)) {
    throw new TypeError('"questions" must be an object mapping an id to a typed question')
  }
  const questions: Record<string, JevQuestion> = {}
  for (const [id, raw] of Object.entries(value)) {
    questions[id] = parseQuestion(id, raw)
  }
  if (Object.keys(questions).length === EMPTY) {
    throw new TypeError('"questions" must contain at least one question')
  }
  return questions
}

export {
  DEFAULT_RISK,
  LINE_LIMIT,
  isJevJson,
  oneLine,
  parseQuestionMap,
  riskOf,
  routeForAnswer,
  textBlock,
  type JevTextBlock,
}
