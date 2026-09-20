/**
 * Failure classification for TypeSafe requests.
 *
 * Retry policy, tool reporting and the browser panel all need to distinguish
 * "the network blinked" from "your key is wrong" from "your state was too
 * large", so the classification lives in one place instead of being inferred
 * from a status code at each call site.
 *
 * @module dsh-plugin-system-one/jev/errors
 */

/** Failure codes this package reports. */
type JevErrorCode =
  | 'aborted'
  | 'timeout'
  | 'transport'
  | 'rate-limited'
  | 'overloaded'
  | 'unauthorized'
  | 'invalid-request'
  | 'server-error'
  | 'invalid-response'

/** How a failure is classified. */
interface JevErrorOptions {
  /** Stable machine-readable failure code. */
  code: JevErrorCode
  /** Whether retrying the identical request could succeed. */
  retryable: boolean
  /** HTTP status, when a response was received. */
  status?: number
  /** Backoff the server asked for, carried to the retry decision. */
  retryAfterMs?: number
}

/** A request that did not produce a usable evaluation. */
class JevRequestError extends Error {
  /** Stable machine-readable failure code. */
  public readonly code: JevErrorCode
  /** HTTP status, when a response was received. */
  public readonly status: number | undefined
  /** Whether retrying the identical request could succeed. */
  public readonly retryable: boolean
  /** Backoff the server asked for, when it sent a `Retry-After` header. */
  public readonly retryAfterMs: number | undefined

  /**
   * @param message - Human-readable cause.
   * @param options - Failure classification.
   */
  public constructor(message: string, options: JevErrorOptions) {
    super(message)
    this.name = 'JevRequestError'
    this.code = options.code
    this.retryable = options.retryable
    this.status = options.status
    this.retryAfterMs = options.retryAfterMs
  }
}

export { JevRequestError, type JevErrorCode, type JevErrorOptions }

