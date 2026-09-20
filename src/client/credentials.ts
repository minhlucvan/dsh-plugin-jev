/**
 * The credential remote: the reference half of the host's credential seam as a
 * browser settings surface reads and writes it.
 *
 * A credential is a reference to a secret, never the secret itself. Every read
 * answers whether a reference is configured, which provider layer supplies it,
 * and whether it accepts a write; a value crosses this module in one direction
 * only, on the `set` call a user's Save produces. Nothing here records one.
 *
 * The generated Remote namespace is modeled locally rather than imported,
 * because its declaration belongs to a host package this repository does not
 * depend on — the same reason `src/routes.ts` describes the web server it
 * reaches without importing the host's own types.
 *
 * @module dsh-plugin-jev/client/credentials
 */

import type { DraftSettings } from './settings.ts'
import { defaultSettings } from './settings.ts'

/** One credential reference's state, as the remote provider reports it. */
interface CredentialInfo {
  /** Whether the provider holds a value for the reference. */
  configured: boolean
  /** Provider layer id supplying the value, when one does. */
  source: string | undefined
  /** Whether the provider accepts a write for the reference. */
  writable: boolean
}

/** The credential reads and writes this feature performs. */
interface CredentialApi {
  /** Describe one reference. */
  describe: (ref: string) => Promise<CredentialInfo>
  /** Store a value under one reference. */
  set: (ref: string, value: string) => Promise<void>
  /** Remove one reference's value. */
  unset: (ref: string) => Promise<void>
}

/** The generated Remote namespace, narrowed to the methods this feature calls. */
interface CredentialNamespace {
  /** Describe references, keyed by reference name. */
  describe: (refs: string[]) => Promise<unknown>
  /** Store one value. */
  set: (ref: string, value: string) => Promise<unknown>
  /** Remove one value. */
  unset: (ref: string) => Promise<unknown>
}

/** Reason reported when a remote response carries none of its own. */
const GENERIC_FAILURE = 'request failed'

/**
 * Whether a value is an indexable object.
 *
 * @param value - Candidate value.
 * @returns True for a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Whether a value is the credential namespace this feature calls.
 *
 * @param value - Candidate service.
 * @returns True when the value carries every method the feature calls.
 */
function isCredentialNamespace(value: unknown): value is CredentialNamespace {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.describe === 'function'
    && typeof value.set === 'function'
    && typeof value.unset === 'function'
  )
}

/**
 * Read the reason an unsuccessful response carries.
 *
 * @param error - The failure member of that response.
 * @returns The provider's own message, or a generic one when it has none.
 */
function failureMessage(error: unknown): string {
  if (
    isRecord(error)
    && typeof error.message === 'string'
    && error.message !== ''
  ) {
    return error.message
  }
  return GENERIC_FAILURE
}

/**
 * Prove one remote response succeeded and hand back its value.
 *
 * @param response - Whatever the namespace answered.
 * @returns The response's value, still unproven.
 * @throws {Error} When the response is not a recognized success; the failure
 *   carries the provider's own message so the UI can show why it failed.
 */
function remoteValue(response: unknown): unknown {
  if (!isRecord(response) || typeof response.ok !== 'boolean') {
    throw new Error(GENERIC_FAILURE)
  }
  if (!response.ok) {
    throw new Error(failureMessage(response.error))
  }
  return response.value
}

/**
 * Read a provider layer id out of one described reference.
 *
 * @param value - The described reference's `source` member.
 * @returns The layer id, or `undefined` when the provider named none.
 */
function readSource(value: unknown): string | undefined {
  if (typeof value === 'string' && value !== '') {
    return value
  }
  return undefined
}

/**
 * Read one reference's view out of a describe response.
 *
 * A reference the provider does not know is reported as unconfigured and
 * writable rather than as a failure: an unset variable is the ordinary state of
 * a reference nobody has stored a value under yet, not an error.
 *
 * @param response - The describe response.
 * @param ref - The reference that was described.
 * @returns The reference's view.
 * @throws {Error} When the response itself reports a failure.
 */
function describedInfo(response: unknown, ref: string): CredentialInfo {
  const value = remoteValue(response)
  if (!isRecord(value)) {
    return { configured: false, source: undefined, writable: true }
  }
  const entry = value[ref]
  if (!isRecord(entry)) {
    return { configured: false, source: undefined, writable: true }
  }
  return {
    configured: entry.configured === true,
    source: readSource(entry.source),
    /*
     * A provider that omits writability leaves the reference open: refusing a
     * write is a deliberate report, and treating silence as a refusal would
     * strand every user whose provider does not project the field.
     */
    writable: entry.writable !== false,
  }
}

/**
 * Bind the credential reads and writes to the generated Remote namespace.
 *
 * @param namespace - The namespace the host's Remote assembly installed.
 * @returns The reads and writes the credential field performs.
 */
function createCredentialApi(namespace: CredentialNamespace): CredentialApi {
  return {
    describe: async (ref: string): Promise<CredentialInfo> => {
      const response = await namespace.describe([ref])
      return describedInfo(response, ref)
    },
    set: async (ref: string, value: string): Promise<void> => {
      const response = await namespace.set(ref, value)
      remoteValue(response)
    },
    unset: async (ref: string): Promise<void> => {
      const response = await namespace.unset(ref)
      remoteValue(response)
    },
  }
}

/**
 * Resolve the reference the settings form currently names.
 *
 * A blank field resolves to the default, exactly as normalization treats it, so
 * the field never describes an empty reference.
 *
 * @param draft - The settings form's effective draft.
 * @returns The reference to describe and write.
 */
function credentialReference(draft: DraftSettings): string {
  const trimmed = draft.apiKeyEnv.trim()
  if (trimmed === '') {
    return defaultSettings.apiKeyEnv
  }
  return trimmed
}

export {
  createCredentialApi,
  credentialReference,
  isCredentialNamespace,
  type CredentialApi,
  type CredentialInfo,
  type CredentialNamespace,
}
