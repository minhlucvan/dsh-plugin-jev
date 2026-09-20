/**
 * Credential field tests.
 *
 * The credential seam is the one place a secret crosses this package, so its
 * rules are worth pinning without a DOM: a read never returns a value, an
 * unwritable reference is never written to, a successful write drops the draft,
 * and a rejected one keeps it and says why. The store is built on
 * `zustand/vanilla` for exactly this reason — its transitions are testable in
 * plain Node.
 */
import { describe, expect, it } from 'vitest'

import { createCredentialStore } from '#src/client/credential-store'
import type {
  CredentialApi,
  CredentialInfo,
  CredentialNamespace,
} from '#src/client/credentials'
import {
  createCredentialApi,
  credentialReference,
  isCredentialNamespace,
} from '#src/client/credentials'
import { defaultSettings, toDraft } from '#src/client/settings'

const TEST_TIMEOUT = 5000
const NO_CALLS = 0
const REFERENCE = 'JEV_TEST_KEY'
const OTHER_REFERENCE = 'JEV_OTHER_KEY'
const TYPED_VALUE = 'typed-secret'
const PROVIDER_MESSAGE = 'the provider refused the write'
const FILE_SOURCE = 'file'
const ENV_SOURCE = 'env'

/** A reference the provider holds a writable value for. */
const CONFIGURED: CredentialInfo = {
  configured: true,
  source: FILE_SOURCE,
  writable: true,
}

/** A reference nobody has stored a value under. */
const MISSING: CredentialInfo = {
  configured: false,
  source: undefined,
  writable: true,
}

/** A reference an inherited variable shadows, so it cannot be written. */
const READ_ONLY: CredentialInfo = {
  configured: true,
  source: ENV_SOURCE,
  writable: false,
}

/** A credential api whose answers and failures a test can steer. */
interface FakeCredentials {
  /** The reads and writes handed to the store. */
  api: CredentialApi
  /** Values written, as `ref=value` pairs. */
  writes: string[]
  /** References passed to `unset`. */
  clearances: string[]
}

/**
 * Build a credential api answering one fixed view.
 *
 * Every call awaits a real promise because this repository enforces both
 * `promise-function-async` and `require-await`.
 *
 * @param info - The view every describe answers with.
 * @param failures - Optional rejections, keyed by the call they fail.
 * @returns The api plus its recorders.
 */
function fakeCredentials(
  info: CredentialInfo,
  failures: { save?: Error; clear?: Error } = {},
): FakeCredentials {
  const writes: string[] = []
  const clearances: string[] = []
  const api: CredentialApi = {
    describe: async (): Promise<CredentialInfo> => {
      const answer = await Promise.resolve(info)
      return answer
    },
    set: async (ref: string, value: string): Promise<void> => {
      writes.push(`${ref}=${value}`)
      if (failures.save !== undefined) {
        throw new Error(failures.save.message)
      }
      await Promise.resolve()
    },
    unset: async (ref: string): Promise<void> => {
      clearances.push(ref)
      if (failures.clear !== undefined) {
        throw new Error(failures.clear.message)
      }
      await Promise.resolve()
    },
  }
  return { api, writes, clearances }
}

/** A credential namespace answering one fixed remote response. */
interface FakeNamespace {
  /** The namespace handed to the adapter. */
  namespace: CredentialNamespace
  /** References `describe` was asked about, in order. */
  described: string[]
}

/**
 * Build a namespace answering every call with one response.
 *
 * @param response - The response every method answers with.
 * @returns The namespace plus its describe recorder.
 */
function fakeNamespace(response: unknown): FakeNamespace {
  const described: string[] = []
  const namespace: CredentialNamespace = {
    describe: async (refs: string[]): Promise<unknown> => {
      described.push(...refs)
      const answer = await Promise.resolve(response)
      return answer
    },
    set: async (): Promise<unknown> => {
      const answer = await Promise.resolve(response)
      return answer
    },
    unset: async (): Promise<unknown> => {
      const answer = await Promise.resolve(response)
      return answer
    },
  }
  return { namespace, described }
}

async function testUnwrapsADescribeResponse(): Promise<void> {
  expect.hasAssertions()
  const fake = fakeNamespace({ ok: true, value: { [REFERENCE]: CONFIGURED } })
  const info = await createCredentialApi(fake.namespace).describe(REFERENCE)

  expect(fake.described).toStrictEqual([REFERENCE])
  expect(info.configured).toBe(true)
  expect(info.source).toBe(FILE_SOURCE)
}

async function testReportsAnUnknownReferenceAsUnconfigured(): Promise<void> {
  expect.hasAssertions()
  const { namespace } = fakeNamespace({ ok: true, value: {} })
  const info = await createCredentialApi(namespace).describe(REFERENCE)

  expect(info.configured).toBe(false)
  expect(info.source).toBeUndefined()
  expect(info.writable).toBe(true)
}

async function testRaisesTheProviderMessage(): Promise<void> {
  expect.hasAssertions()
  const failure = { ok: false, error: { message: PROVIDER_MESSAGE } }
  const api = createCredentialApi(fakeNamespace(failure).namespace)

  await expect(api.describe(REFERENCE)).rejects.toThrow(PROVIDER_MESSAGE)
  await expect(api.set(REFERENCE, TYPED_VALUE)).rejects.toThrow(PROVIDER_MESSAGE)
  await expect(api.unset(REFERENCE)).rejects.toThrow(PROVIDER_MESSAGE)
}

async function testRaisesAGenericReasonForAnUnknownResponse(): Promise<void> {
  expect.hasAssertions()
  const api = createCredentialApi(fakeNamespace({ ok: false }).namespace)
  await expect(api.describe(REFERENCE)).rejects.toThrow(/request failed/u)
}

function testRecognizesOnlyTheCredentialNamespace(): void {
  expect.hasAssertions()
  expect(isCredentialNamespace(fakeNamespace({ ok: true }).namespace)).toBe(true)
  expect(isCredentialNamespace({ describe: (): void => undefined })).toBe(false)
  expect(isCredentialNamespace('not a namespace')).toBe(false)
}

function testResolvesABlankReferenceToTheDefault(): void {
  expect.hasAssertions()
  const draft = toDraft(defaultSettings)

  expect(credentialReference(draft)).toBe(defaultSettings.apiKeyEnv)
  expect(credentialReference({ ...draft, apiKeyEnv: '   ' }))
    .toBe(defaultSettings.apiKeyEnv)
  expect(credentialReference({ ...draft, apiKeyEnv: ` ${OTHER_REFERENCE} ` }))
    .toBe(OTHER_REFERENCE)
}

async function testDescribesAConfiguredReference(): Promise<void> {
  expect.hasAssertions()
  const store = createCredentialStore(fakeCredentials(CONFIGURED).api)
  await store.getState().describe(REFERENCE)

  expect(store.getState().status).toBe('ready')
  expect(store.getState().configured).toBe(true)
  expect(store.getState().source).toBe(FILE_SOURCE)
  expect(store.getState().writable).toBe(true)
}

async function testDescribesAnUnconfiguredReference(): Promise<void> {
  expect.hasAssertions()
  const store = createCredentialStore(fakeCredentials(MISSING).api)
  await store.getState().describe(REFERENCE)

  expect(store.getState().status).toBe('ready')
  expect(store.getState().configured).toBe(false)
  expect(store.getState().source).toBeUndefined()
}

async function testClearsTheDraftAfterASuccessfulSave(): Promise<void> {
  expect.hasAssertions()
  const fake = fakeCredentials(CONFIGURED)
  const store = createCredentialStore(fake.api)
  await store.getState().describe(REFERENCE)
  store.getState().setDraft(TYPED_VALUE)
  await store.getState().save()

  expect(fake.writes).toStrictEqual([`${REFERENCE}=${TYPED_VALUE}`])
  expect(store.getState().draft).toBe('')
  expect(store.getState().busy).toBe(false)
  expect(store.getState().error).toBeUndefined()
}

async function testKeepsTheDraftWhenASaveFails(): Promise<void> {
  expect.hasAssertions()
  const failure = new Error(PROVIDER_MESSAGE)
  const store = createCredentialStore(
    fakeCredentials(CONFIGURED, { save: failure }).api,
  )
  await store.getState().describe(REFERENCE)
  store.getState().setDraft(TYPED_VALUE)
  await store.getState().save()

  expect(store.getState().draft).toBe(TYPED_VALUE)
  expect(store.getState().busy).toBe(false)
  expect(store.getState().error).toBe(PROVIDER_MESSAGE)
}

async function testNeverWritesToAnUnwritableReference(): Promise<void> {
  expect.hasAssertions()
  const fake = fakeCredentials(READ_ONLY)
  const store = createCredentialStore(fake.api)
  await store.getState().describe(REFERENCE)
  store.getState().setDraft(TYPED_VALUE)
  await store.getState().save()
  await store.getState().clear()

  expect(store.getState().writable).toBe(false)
  expect(fake.writes).toHaveLength(NO_CALLS)
  expect(fake.clearances).toHaveLength(NO_CALLS)
}

async function testDropsTheDraftWhenTheReferenceChanges(): Promise<void> {
  expect.hasAssertions()
  const store = createCredentialStore(fakeCredentials(CONFIGURED).api)
  await store.getState().describe(REFERENCE)
  store.getState().setDraft(TYPED_VALUE)
  await store.getState().describe(OTHER_REFERENCE)

  expect(store.getState().ref).toBe(OTHER_REFERENCE)
  expect(store.getState().draft).toBe('')
}

async function testRemovesTheStoredValueWhenCleared(): Promise<void> {
  expect.hasAssertions()
  const fake = fakeCredentials(CONFIGURED)
  const store = createCredentialStore(fake.api)
  await store.getState().describe(REFERENCE)
  await store.getState().clear()

  expect(fake.clearances).toStrictEqual([REFERENCE])
  expect(store.getState().error).toBeUndefined()
}

describe('credential remote', () => {
  it('unwraps a describe response for the reference', { timeout: TEST_TIMEOUT }, testUnwrapsADescribeResponse)

  it('reports an unknown reference as unconfigured', { timeout: TEST_TIMEOUT }, testReportsAnUnknownReferenceAsUnconfigured)

  it('raises the provider message for a refused call', { timeout: TEST_TIMEOUT }, testRaisesTheProviderMessage)

  it('raises a generic reason for an unrecognized response', { timeout: TEST_TIMEOUT }, testRaisesAGenericReasonForAnUnknownResponse)

  it('recognizes only the credential namespace', { timeout: TEST_TIMEOUT }, testRecognizesOnlyTheCredentialNamespace)

  it('resolves a blank reference to the default', { timeout: TEST_TIMEOUT }, testResolvesABlankReferenceToTheDefault)
})

describe('credential store', () => {
  it('describes a configured reference', { timeout: TEST_TIMEOUT }, testDescribesAConfiguredReference)

  it('describes an unconfigured reference', { timeout: TEST_TIMEOUT }, testDescribesAnUnconfiguredReference)

  it('clears the draft after a successful save', { timeout: TEST_TIMEOUT }, testClearsTheDraftAfterASuccessfulSave)

  it('keeps the draft and records the reason when a save fails', { timeout: TEST_TIMEOUT }, testKeepsTheDraftWhenASaveFails)

  it('never writes to an unwritable reference', { timeout: TEST_TIMEOUT }, testNeverWritesToAnUnwritableReference)

  it('drops the draft when the reference changes', { timeout: TEST_TIMEOUT }, testDropsTheDraftWhenTheReferenceChanges)

  it('removes the stored value when cleared', { timeout: TEST_TIMEOUT }, testRemovesTheStoredValueWhenCleared)
})
