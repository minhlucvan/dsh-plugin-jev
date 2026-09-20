/**
 * Settings-section tests.
 *
 * The browser page is only real if the host serves the namespace it binds, so
 * these cover the host half: that the section is installed under the namespace
 * the client uses, that its composition entry is the profile configuration, and
 * that a committed change actually reaches the running service.
 *
 * Without this, the page renders controls that write into nothing — which is
 * exactly the failure this suite exists to prevent.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'

import { resolveConfig } from '#src/config'
import { createJevService } from '#src/jev/service'
import type { JevService } from '#src/jev/service'
import {
  SETTINGS_NAMESPACE,
  baseUserSettings,
  installUserSettings,
  resolveUserSettings,
} from '#src/settings'
import type { UserSettings } from '#src/settings'

const TEST_TIMEOUT = 5000
const FIRST_INDEX = 0
const EDITABLE_FIELD_COUNT = 7
const PROFILE_MODEL = 'jev-from-profile'
const USER_MODEL = 'jev-from-user'
const USER_FLOOR = 0.6
const USER_CONFIRM = 0.7
const PROFILE_FLOOR = 0.5
const PROFILE_CONFIRM = 0.85

/** Hooks the section hands the provider, as the fake receives them. */
interface RecordedHooks {
  setSource: (current: () => UserSettings) => void
  onChange: () => void
  validate?: (value: UserSettings) => void
}

/** What the fake provider recorded for one installation. */
interface RecordedSection {
  namespace: string
  entry: UserSettings
  hooks: RecordedHooks
}

/**
 * A settings provider fake whose signature is already the concrete shape the
 * plugin installs, so nothing has to be asserted into place.
 */
interface RecordingProvider {
  installSection: (...args: [
    owner: Context,
    namespace: string,
    sectionSchema: unknown,
    entry: UserSettings,
    hooks: RecordedHooks,
  ]) => void
}

/**
 * Build a settings-provider fake that records installations.
 *
 * @param record - Array the fake appends to.
 * @returns The provider to hand to the context.
 */
function recordingProvider(record: RecordedSection[]): RecordingProvider {
  return {
    installSection: (...args): void => {
      const [owner, namespace, sectionSchema, entry, hooks] = args
      void owner
      void sectionSchema
      record.push({ namespace, entry, hooks })
    },
  }
}

/**
 * Resolve a fixed credential with an honest asynchronous shape.
 *
 * @returns The test key.
 */
async function fixedKey(): Promise<string | undefined> {
  await Promise.resolve()
  return 'test-key'
}

/**
 * Build the service the section reconfigures.
 *
 * The real service is used rather than a fake so the assertions cover the
 * reconfigure path the plugin actually ships.
 *
 * @returns A service reading the profile configuration.
 */
function testService(): JevService {
  return createJevService(resolveConfig({ model: PROFILE_MODEL }), {
    resolveApiKey: fixedKey,
  })
}

/**
 * Install the section against a fake provider and return what it recorded.
 *
 * @param base - Composition configuration.
 * @param service - Service the section reconfigures.
 * @returns The recorded installation.
 */
async function installAgainstFake(
  base: ReturnType<typeof resolveConfig>,
  service: JevService,
): Promise<RecordedSection> {
  const ctx = new Context()
  const record: RecordedSection[] = []
  const remove = ctx.provide('settings', recordingProvider(record))
  installUserSettings({
    ctx,
    base,
    service,
    credentialFor: () => fixedKey,
  })
  await Promise.resolve()
  await Promise.resolve()
  remove()
  const recorded = record[FIRST_INDEX]
  if (recorded === undefined) {
    throw new TypeError('the section was not installed')
  }
  return recorded
}

function testNamespaceIsTheOneThePageBinds(): void {
  expect.hasAssertions()
  expect(SETTINGS_NAMESPACE).toBe('dsh-plugin-jev')
}

function testProjectionFollowsTheProfile(): void {
  expect.hasAssertions()
  const projected = baseUserSettings(resolveConfig({ model: PROFILE_MODEL }))
  expect(projected.model).toBe(PROFILE_MODEL)
  expect(projected).toHaveProperty('apiKeyEnv')
  expect(Object.keys(projected)).toHaveLength(EDITABLE_FIELD_COUNT)
}

function testUserSectionOverridesTheProfile(): void {
  expect.hasAssertions()
  const base = resolveConfig({ model: PROFILE_MODEL, confidenceFloor: PROFILE_FLOOR })
  const merged = resolveUserSettings(base, {
    ...baseUserSettings(base),
    model: USER_MODEL,
    confidenceFloor: USER_FLOOR,
  })
  expect(merged.model).toBe(USER_MODEL)
  expect(merged.confidenceFloor).toBe(USER_FLOOR)
  expect(merged.confirmFloor).toBe(PROFILE_CONFIRM)
}

function testAnUnusableMergeIsRefused(): void {
  expect.hasAssertions()
  const base = resolveConfig()
  expect(() =>
    resolveUserSettings(base, {
      ...baseUserSettings(base),
      confidenceFloor: USER_CONFIRM,
      confirmFloor: USER_FLOOR,
    }),
  ).toThrow(/confidenceFloor/u)
}

async function testInstallsUnderTheSharedNamespace(): Promise<void> {
  expect.hasAssertions()
  const base = resolveConfig({ model: PROFILE_MODEL })
  const recorded = await installAgainstFake(base, testService())
  expect(recorded.namespace).toBe(SETTINGS_NAMESPACE)
  expect(recorded.entry).toStrictEqual(baseUserSettings(base))
}

async function testACommittedChangeReachesTheService(): Promise<void> {
  expect.hasAssertions()
  const base = resolveConfig({ model: PROFILE_MODEL })
  const service = testService()
  const recorded = await installAgainstFake(base, service)
  expect(service.model).toBe(PROFILE_MODEL)

  recorded.hooks.setSource(() => ({
    ...baseUserSettings(base),
    model: USER_MODEL,
    confidenceFloor: USER_FLOOR,
    confirmFloor: USER_CONFIRM,
  }))
  recorded.hooks.onChange()
  expect(service.model).toBe(USER_MODEL)
  expect(service.policy.confidenceFloor).toBe(USER_FLOOR)
}

async function testTheSectionIsOptional(): Promise<void> {
  expect.hasAssertions()
  const ctx = new Context()
  const service = testService()
  installUserSettings({
    ctx,
    base: resolveConfig({ model: PROFILE_MODEL }),
    service,
    credentialFor: () => fixedKey,
  })
  await Promise.resolve()
  // With no provider the callback never runs, so the profile config stands.
  expect(service.model).toBe(PROFILE_MODEL)
}

describe('settings section', () => {
  it('serves the namespace the browser page binds', { timeout: TEST_TIMEOUT }, testNamespaceIsTheOneThePageBinds)

  it('projects the profile onto the editable fields', { timeout: TEST_TIMEOUT }, testProjectionFollowsTheProfile)

  it('lets a user section override the profile', { timeout: TEST_TIMEOUT }, testUserSectionOverridesTheProfile)

  it('refuses a merge the plugin could not run', { timeout: TEST_TIMEOUT }, testAnUnusableMergeIsRefused)

  it('installs under the namespace the browser page binds', { timeout: TEST_TIMEOUT }, testInstallsUnderTheSharedNamespace)

  it('reaches the running service when the user saves', { timeout: TEST_TIMEOUT }, testACommittedChangeReachesTheService)

  it('installs nothing when the host has no settings provider', { timeout: TEST_TIMEOUT }, testTheSectionIsOptional)
})

