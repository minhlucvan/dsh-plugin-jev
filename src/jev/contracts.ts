/**
 * Wire contracts for TypeSafe's System One evaluation endpoint.
 *
 * These describe exactly what crosses the network boundary, so the rest of the
 * package depends on one definition instead of re-deriving shapes from prose.
 * Nothing here imports a host package: the contracts are plain data and stay
 * testable without Cordis.
 *
 * Payload shapes are type aliases rather than interfaces on purpose. A JSON
 * payload has to be assignable to this package's `JevJson`, and TypeScript
 * grants an implicit index signature to an object *type* but not to an
 * interface, so an interface here would make every response unusable without a
 * cast.
 *
 * @module dsh-plugin-system-one/jev/contracts
 */

/** Any lossless JSON value Jev accepts or returns. */
type JevJson =
  | string
  | number
  | boolean
  | null
  | JevJson[]
  | { [key: string]: JevJson }

/** A yes/no question; the answer is the probability that the answer is yes. */
type JevNoulQuestion = {
  /** Question discriminant. */
  type: 'noul'
  /** The yes/no question, or structured text carrying it. */
  instructions: JevJson
  /** Optional descriptions of what a yes and a no mean. */
  criteria?: { true?: JevJson; false?: JevJson }
}

/** A question whose answer is one option from a defined set. */
type JevChoiceQuestion = {
  /** Question discriminant. */
  type: 'choice'
  /** What the model should decide. */
  instructions: JevJson
  /** Option to rubric description; at most 255 options are accepted. */
  criteria: Record<string, JevJson>
}

/** A question whose answer is a position along ordered levels. */
type JevScoreQuestion = {
  /** Question discriminant. */
  type: 'score'
  /** What the model should rate. */
  instructions: JevJson
  /** Ordered level descriptions; between two and ten are accepted. */
  criteria: JevJson[]
}

/** One typed question in a request. */
type JevQuestion = JevNoulQuestion | JevChoiceQuestion | JevScoreQuestion

/** The content evaluated. Jev accepts text only. */
type JevState = JevJson

/** Answer to a {@link JevNoulQuestion}. */
type JevNoulAnswer = {
  /** Answer discriminant. */
  type: 'noul'
  /** Probability that the answer is yes, from 0 to 1. */
  noul: number
}

/** Answer to a {@link JevChoiceQuestion}. */
type JevChoiceAnswer = {
  /** Answer discriminant. */
  type: 'choice'
  /** The highest-probability option. */
  choice: string
  /** Every option mapped to its probability. */
  probabilities: Record<string, number>
  /** How certain the model is, from 0 to 1. */
  confidence: number
}

/** Answer to a {@link JevScoreQuestion}. */
type JevScoreAnswer = {
  /** Answer discriminant. */
  type: 'score'
  /** Probability-weighted position across the levels. */
  score: number
  /** Each level index mapped back to its description. */
  legend: Record<string, string>
  /** Each level index mapped to its probability. */
  probabilities: Record<string, number>
  /** How certain the model is, from 0 to 1. */
  confidence: number
}

/** One typed answer. */
type JevAnswer = JevNoulAnswer | JevChoiceAnswer | JevScoreAnswer

/** Token usage reported for one request. Output tokens are not billed. */
type JevUsage = {
  /** Tokens billed for this request. */
  input_tokens: number
  /** Tokens produced; reported for completeness, not billed. */
  output_tokens: number
}

/** One complete evaluation response. */
type JevEvaluation = {
  /** The versioned model id that answered. */
  model: string
  /** One answer per question, under the ids supplied in the request. */
  answers: Record<string, JevAnswer>
  /** Token usage for the request. */
  usage: JevUsage
}

/**
 * Whether a value is a plain object.
 *
 * @param value - Candidate value.
 * @returns True for a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Whether a value is a finite number.
 *
 * @param value - Candidate value.
 * @returns True for a finite number.
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Whether a value maps every key to a finite number.
 *
 * @param value - Candidate value.
 * @returns True when every entry is a finite number.
 */
function isNumberMap(value: unknown): value is Record<string, number> {
  if (!isRecord(value)) {
    return false
  }
  return Object.values(value).every(entry => isFiniteNumber(entry))
}

/**
 * Whether a value is one of the three answer shapes.
 *
 * A malformed answer is rejected at the boundary rather than surfacing later as
 * an undefined field in a routing decision, where the failure would look like a
 * model problem instead of a transport one.
 *
 * @param value - Candidate value.
 * @returns True for a recognized answer.
 */
function isJevAnswer(value: unknown): value is JevAnswer {
  if (!isRecord(value)) {
    return false
  }
  if (value.type === 'noul') {
    return isFiniteNumber(value.noul)
  }
  if (value.type === 'choice') {
    return (
      typeof value.choice === 'string'
      && isNumberMap(value.probabilities)
      && isFiniteNumber(value.confidence)
    )
  }
  if (value.type === 'score') {
    if (!isFiniteNumber(value.score) || !isNumberMap(value.probabilities)) {
      return false
    }
    if (!isFiniteNumber(value.confidence) || !isRecord(value.legend)) {
      return false
    }
    return Object.values(value.legend).every(entry => typeof entry === 'string')
  }
  return false
}

/**
 * Whether a value is a complete evaluation response.
 *
 * @param value - Decoded response body.
 * @returns True when the body carries a model, answers and usage.
 */
function isJevEvaluation(value: unknown): value is JevEvaluation {
  if (!isRecord(value) || typeof value.model !== 'string') {
    return false
  }
  if (!isRecord(value.answers) || !isRecord(value.usage)) {
    return false
  }
  if (!isFiniteNumber(value.usage.input_tokens) || !isFiniteNumber(value.usage.output_tokens)) {
    return false
  }
  return Object.values(value.answers).every(answer => isJevAnswer(answer))
}

export {
  isJevAnswer,
  isJevEvaluation,
  isRecord,
  type JevAnswer,
  type JevChoiceAnswer,
  type JevChoiceQuestion,
  type JevEvaluation,
  type JevJson,
  type JevNoulAnswer,
  type JevNoulQuestion,
  type JevQuestion,
  type JevScoreAnswer,
  type JevScoreQuestion,
  type JevState,
  type JevUsage,
}

