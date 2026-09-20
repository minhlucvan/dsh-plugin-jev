/**
 * Core plugin tests.
 *
 * The Loader-facing namespace, the configuration schema, and activation. The
 * namespace test matters most: Cordis Loader unwraps `exports.default ?? exports`,
 * so a stray default export silently discards `inject`, `Config` and `apply`
 * together, and the plugin would load and do nothing.
 *
 * Each case is a standalone function rather than an inline arrow so the
 * conditionals it needs to narrow unknown values stay out of the test body.
 */
import LoaderPlugin from '@cordisjs/plugin-loader'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'

import { resolveConfig } from '#src/config'
import { DEFAULT_API_KEY_ENV, TEST_API_KEY, createPluginHarness } from './harness.ts'

const TEST_TIMEOUT = 5000
const SERVICE_NAME = 'jev'
const BELOW_FLOOR = 0.2
const ABOVE_FLOOR = 0.6
const TOO_SHORT_TIMEOUT_MS = 1

interface PluginExports {
  readonly name: unknown
  readonly inject: unknown
  readonly Config: unknown
  readonly apply: unknown
}

/**
 * Narrow a Loader result to the function-plugin namespace.
 *
 * @param value - Candidate exports.
 * @returns True when every required named export is present.
 */
function isPluginExports(value: unknown): value is PluginExports {
  return (
    typeof value === 'object'
    && value !== null
    && 'name' in value
    && 'inject' in value
    && 'Config' in value
    && 'apply' in value
  )
}

/**
 * Build a Loader instance without running its constructor side effects.
 *
 * @returns A Loader prototype carrier.
 */
function createLoader(): LoaderPlugin {
  const candidate: unknown = Object.create(LoaderPlugin.prototype)
  if (!(candidate instanceof LoaderPlugin)) {
    throw new TypeError('Loader prototype did not produce a Loader instance')
  }
  return candidate
}

/**
 * Run a body with the credential variable removed, restoring it afterwards.
 *
 * @param body - Body to run while the variable is absent.
 */
async function withoutApiKey(body: () => Promise<void>): Promise<void> {
  const previous = process.env[DEFAULT_API_KEY_ENV]
  Reflect.deleteProperty(process.env, DEFAULT_API_KEY_ENV)
  try {
    await body()
  } finally {
    process.env[DEFAULT_API_KEY_ENV] = previous ?? TEST_API_KEY
  }
}

async function testPreservesPluginNamespace(): Promise<void> {
  expect.hasAssertions()
  const plugin = await import('#src/index')
  expect(['default' in plugin]).toStrictEqual([false])

  const unwrapped: unknown = createLoader().unwrapExports(plugin)
  if (!isPluginExports(unwrapped)) {
    throw new TypeError('Loader did not return plugin exports')
  }
  expect(unwrapped.name).toBe('jev')
  expect(unwrapped.inject).toStrictEqual([])
  expect(unwrapped.Config).toBeDefined()
  expect(unwrapped.apply).toBeTypeOf('function')
}

function testResolvesDefaults(): void {
  expect.hasAssertions()
  const config = resolveConfig()
  expect(config.enabled).toBe(true)
  expect(config.apiKeyEnv).toBe(DEFAULT_API_KEY_ENV)
  expect(config.baseUrl).toBe('https://api.typesafe.ai')
  expect(config.model).toBe('jev-latest')
  expect(config.tools.ask).toBe(true)
}

function testStripsTrailingSlash(): void {
  expect.hasAssertions()
  expect(resolveConfig({ baseUrl: 'https://api.example.test/' }).baseUrl).toBe(
    'https://api.example.test',
  )
}

function testRejectsSelfContainedMisconfiguration(): void {
  expect.hasAssertions()
  expect(() =>
    resolveConfig({ confidenceFloor: ABOVE_FLOOR, confirmFloor: BELOW_FLOOR }),
  ).toThrow(/confidenceFloor/u)
  expect(() => resolveConfig({ baseUrl: 'ftp://example.test' })).toThrow(/baseUrl/u)
  expect(() => resolveConfig({ model: '  ' })).toThrow(/model/u)
  expect(() => resolveConfig({ timeoutMs: TOO_SHORT_TIMEOUT_MS })).toThrow(/timeoutMs/u)
}

async function testProvidesServiceAndReleasesIt(): Promise<void> {
  expect.hasAssertions()
  const harness = await createPluginHarness()
  expect(harness.ctx.get(SERVICE_NAME)).toBeDefined()
  expect(harness.info).toHaveBeenCalledWith(
    expect.stringContaining('dsh-plugin-system-one ready'),
  )
  await harness.dispose()
  expect(harness.ctx.get(SERVICE_NAME)).toBeUndefined()
}

async function testActivatesWithoutCredential(): Promise<void> {
  expect.hasAssertions()
  await withoutApiKey(async (): Promise<void> => {
    const ctx = new Context()
    const warn = vi.spyOn(ctx.logger, 'warn').mockReturnValue()
    const plugin = await import('#src/index')
    /*
     * A missing key warns; it never refuses activation, because activation is
     * what installs the settings section a user supplies the key through. The
     * host's credential provider may also mount after this row.
     */
    const fiber = await ctx.plugin(plugin, {})
    expect(ctx.get(SERVICE_NAME)).toBeDefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(DEFAULT_API_KEY_ENV))
    await fiber.dispose()
    warn.mockRestore()
  })
}

async function testLoadsDisabledWithoutCredential(): Promise<void> {
  expect.hasAssertions()
  await withoutApiKey(async (): Promise<void> => {
    const harness = await createPluginHarness({ enabled: false })
    expect(harness.ctx.get(SERVICE_NAME)).toBeDefined()
    expect(harness.warn).toHaveBeenCalledWith(expect.stringContaining('enabled: false'))
    await harness.dispose()
  })
}

describe('dsh-plugin-system-one', () => {

  it('preserves the function-plugin namespace through Loader unwrapping', { timeout: TEST_TIMEOUT }, testPreservesPluginNamespace)

  it('resolves schema defaults', { timeout: TEST_TIMEOUT }, testResolvesDefaults)

  it('strips a trailing slash from the base URL', { timeout: TEST_TIMEOUT }, testStripsTrailingSlash)

  it('rejects a self-contained misconfiguration at resolution', { timeout: TEST_TIMEOUT }, testRejectsSelfContainedMisconfiguration)

  it('provides the jev service and releases it with the fiber', { timeout: TEST_TIMEOUT }, testProvidesServiceAndReleasesIt)

  it('activates and warns when the credential is unset', { timeout: TEST_TIMEOUT }, testActivatesWithoutCredential)

  it('loads without a credential when it is disabled', { timeout: TEST_TIMEOUT }, testLoadsDisabledWithoutCredential)
})

