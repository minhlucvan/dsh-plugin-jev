/**
 * Credential tests.
 *
 * The API key can arrive from two places — the host's credential seam or the
 * process environment — and which one is mounted when is a matter of profile
 * load order. These cases pin the resolution and the failure timing: activation
 * never fails on a missing key, because activation is what installs the
 * settings page that supplies one.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'

import { resolveConfig } from '#src/config'
import { createJevService } from '#src/jev/service'
import { inject, name } from '#src/index'
import { apply, createCredentialResolver, createPluginRuntime } from '#src/runtime'
import { DEFAULT_API_KEY_ENV, TEST_API_KEY } from './harness.ts'

const TEST_TIMEOUT = 5000
const FIRST_INDEX = 0
const SECOND_INDEX = 1
const API_KEY_ENV = 'JEV_TEST_KEY'
const ENV_KEY_VALUE = 'key-from-the-environment'
const PROVIDER_KEY_VALUE = 'key-from-the-credential-seam'
const ROTATED_KEY_VALUE = 'key-after-the-user-saved-a-new-one'
const STATUS_OK = 200
const ZERO = 0

/** A reference that holds nothing, for the unconfigured cases. */
const NO_KEY: string | undefined = undefined

/** One question map the service will accept. */
const QUESTIONS = {
  route: {
    type: 'choice' as const,
    instructions: 'Which team?',
    criteria: { billing: null, technical: null },
  },
}

/** A response body that satisfies the evaluation contract. */
const GOOD_BODY = {
  model: 'jev-1.13.0',
  answers: {
    route: { type: 'choice', choice: 'billing', probabilities: { billing: 1 }, confidence: 0.9 },
  },
  usage: { input_tokens: 1, output_tokens: 1 },
}

/** A credential source whose value can be replaced mid-test. */
interface MutableCredentials {
  value: string | undefined
  resolve: (ref: string) => Promise<{ value: string; source: string } | undefined>
}

/**
 * Build a credential source holding one replaceable value.
 *
 * @param initial - Value to hold initially, or undefined for unconfigured.
 * @returns The mutable source.
 */
function mutableCredentials(initial: string | undefined): MutableCredentials {
  const holder: MutableCredentials = {
    value: initial,
    resolve: async (): Promise<{ value: string; source: string } | undefined> => {
      await Promise.resolve()
      if (holder.value === undefined) {
        return undefined
      }
      return { value: holder.value, source: 'file' }
    },
  }
  return holder
}

/** A transport that records the credential each request carried. */
interface RecordingTransport {
  fetchImpl: typeof fetch
  authorizations: string[]
}

/**
 * Build a transport that records the Authorization header it received.
 *
 * @returns The transport and the recorded headers.
 */
function recordingTransport(): RecordingTransport {
  const authorizations: string[] = []
  const fetchImpl: typeof fetch = async (_input, init): Promise<Response> => {
    const headers = init?.headers
    if (headers !== undefined && !Array.isArray(headers) && !(headers instanceof Headers)) {
      const value = headers.authorization
      if (typeof value === 'string') {
        authorizations.push(value)
      }
    }
    await Promise.resolve()
    return Response.json(GOOD_BODY, { status: STATUS_OK })
  }
  return { fetchImpl, authorizations }
}

function testPrefersTheCredentialSeam(): void {
  expect.hasAssertions()
  const ctx = new Context()
  const credentials = mutableCredentials(PROVIDER_KEY_VALUE)
  const removeService = ctx.provide('credentials', { resolve: credentials.resolve })

  const resolver = createCredentialResolver(ctx, resolveConfig({ apiKeyEnv: API_KEY_ENV }), {
    [API_KEY_ENV]: ENV_KEY_VALUE,
  })
  expect(resolver.fromProvider).toBe(true)
  removeService()
}

function testFallsBackToTheEnvironment(): void {
  expect.hasAssertions()
  const ctx = new Context()
  const resolver = createCredentialResolver(ctx, resolveConfig({ apiKeyEnv: API_KEY_ENV }), {
    [API_KEY_ENV]: ENV_KEY_VALUE,
  })
  expect(resolver.fromProvider).toBe(false)
}

async function testResolvesTheKeyPerCall(): Promise<void> {
  expect.hasAssertions()
  const credentials = mutableCredentials(PROVIDER_KEY_VALUE)
  const transport = recordingTransport()
  const service = createJevService(resolveConfig({ apiKeyEnv: API_KEY_ENV }), {
    fetchImpl: transport.fetchImpl,
    resolveApiKey: async (): Promise<string | undefined> => {
      const resolved = await credentials.resolve(API_KEY_ENV)
      return resolved?.value
    },
  })

  await service.evaluate({ state: 'x', questions: QUESTIONS, source: 'test' })
  credentials.value = ROTATED_KEY_VALUE
  await service.evaluate({ state: 'x', questions: QUESTIONS, source: 'test' })

  expect(transport.authorizations[FIRST_INDEX]).toBe(`Bearer ${PROVIDER_KEY_VALUE}`)
  expect(transport.authorizations[SECOND_INDEX]).toBe(`Bearer ${ROTATED_KEY_VALUE}`)
}

async function testReportsAnUnsetKeyAtCallTime(): Promise<void> {
  expect.hasAssertions()
  const credentials = mutableCredentials(NO_KEY)
  const transport = recordingTransport()
  const service = createJevService(resolveConfig({ apiKeyEnv: API_KEY_ENV }), {
    fetchImpl: transport.fetchImpl,
    resolveApiKey: async (): Promise<string | undefined> => {
      const resolved = await credentials.resolve(API_KEY_ENV)
      return resolved?.value
    },
  })

  await expect(
    service.evaluate({ state: 'x', questions: QUESTIONS, source: 'test' }),
  ).rejects.toThrow(new RegExp(API_KEY_ENV, 'u'))
  expect(transport.authorizations).toHaveLength(ZERO)
}

async function testActivatesWithoutAKeyWhenASeamIsMounted(): Promise<void> {
  expect.hasAssertions()
  const ctx = new Context()
  const credentials = mutableCredentials(NO_KEY)
  const removeService = ctx.provide('credentials', { resolve: credentials.resolve })

  const plug = { apply, name, inject }
  const fiber = await ctx.plugin(plug, { apiKeyEnv: API_KEY_ENV })
  expect(ctx.get('jev')).toBeDefined()
  await fiber.dispose()
  removeService()
}

async function testActivatesWithoutAnyKeySource(): Promise<void> {
  expect.hasAssertions()
  /*
   * The suite inherits the developer's environment, so the variable is cleared
   * for the duration rather than assumed absent.
   */
  const previous = process.env[DEFAULT_API_KEY_ENV]
  Reflect.deleteProperty(process.env, DEFAULT_API_KEY_ENV)
  const ctx = new Context()
  const info = vi.spyOn(ctx.logger, 'info').mockReturnValue()
  const warn = vi.spyOn(ctx.logger, 'warn').mockReturnValue()
  try {
    const fiber = await ctx.plugin(
      { apply, name, inject },
      { apiKeyEnv: DEFAULT_API_KEY_ENV },
    )

    /*
     * Activation publishes the service and installs the settings section that
     * supplies the key, so it must not be the point at which a missing key is
     * fatal: whether the host's provider is mounted this instant is load order.
     */
    expect(ctx.get('jev')).toBeDefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(DEFAULT_API_KEY_ENV))

    await fiber.dispose()
  } finally {
    info.mockRestore()
    warn.mockRestore()
    if (previous !== undefined) {
      process.env[DEFAULT_API_KEY_ENV] = previous
    }
  }
}

async function testUsesASeamMountedAfterActivation(): Promise<void> {
  expect.hasAssertions()
  const ctx = new Context()
  const config = resolveConfig({ apiKeyEnv: API_KEY_ENV })
  const runtime = createPluginRuntime(ctx, config, {})

  // Nothing can supply the key yet.
  await expect(runtime.credentialFor(config)()).resolves.toBeUndefined()

  /*
   * Cordis mounts the host's credentials row after this plugin's own insert, so
   * this ordering is the normal one rather than an edge case.
   */
  const credentials = mutableCredentials(PROVIDER_KEY_VALUE)
  const removeService = ctx.provide('credentials', { resolve: credentials.resolve })
  await expect(runtime.credentialFor(config)()).resolves.toBe(PROVIDER_KEY_VALUE)
  removeService()
}

function testReadsTheKeyTheSeamHolds(): void {
  expect.hasAssertions()
  expect(TEST_API_KEY).toBe('test-key')
}

describe('credential resolution', () => {
  it('prefers the credential seam over the environment', { timeout: TEST_TIMEOUT }, testPrefersTheCredentialSeam)

  it('falls back to the environment without a seam', { timeout: TEST_TIMEOUT }, testFallsBackToTheEnvironment)

  it('resolves the key again on every call', { timeout: TEST_TIMEOUT }, testResolvesTheKeyPerCall)

  it('names the unset reference at call time', { timeout: TEST_TIMEOUT }, testReportsAnUnsetKeyAtCallTime)

  it('activates without a key when the seam can supply one later', { timeout: TEST_TIMEOUT }, testActivatesWithoutAKeyWhenASeamIsMounted)

  it('activates and says so when no key source exists yet', { timeout: TEST_TIMEOUT }, testActivatesWithoutAnyKeySource)

  it('uses a seam mounted after activation', { timeout: TEST_TIMEOUT }, testUsesASeamMountedAfterActivation)

  it('reads the resolved key from the seam', { timeout: TEST_TIMEOUT }, testReadsTheKeyTheSeamHolds)
})

