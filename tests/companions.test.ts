/**
 * Companion tests.
 *
 * Each optional companion is a separate entry with its own injected services, so
 * each is mounted here against fakes of those services. Two things are asserted
 * every time: that the companion registers exactly once, and that disposing the
 * fiber releases it. The second is not ceremony — a registration that survives
 * disposal leaks across reloads, and the failure is invisible until the profile
 * reloads.
 *
 * Every case is a standalone function so the narrowing throws stay out of the
 * test bodies.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'

import { COMMAND_NAME, runJevCommand } from '#src/commands'
import { bodyFor } from '#src/routes'
import { SKILL_NAME, apply as applySkills, buildSkillContent } from '#src/skills'
import { apply as applyTools } from '#src/tools'
import type { JevService } from '#src/jev/service'
import { createTestService } from './harness.ts'

const TEST_TIMEOUT = 5000
const EXPECTED_SINGLE_CALL = 1
const FIRST_INDEX = 0
const TOOL_COUNT = 3
const ROUTE_PATH = '/api/dsh-plugin-system-one'
const HEALTH_PATH = '/api/dsh-plugin-system-one/health'
const CATALOG_PATH = '/api/dsh-plugin-system-one/catalog'
const UNKNOWN_PATH = '/api/dsh-plugin-system-one/nope'
const DESCRIPTION_MIN_LENGTH = 80
const FAKE_INPUT_TOKENS = 111
const FAKE_OUTPUT_TOKENS = 7
const ZERO = 0

/** A canned response that satisfies the evaluation contract. */
const CANNED_BODY = {
  model: 'jev-1.13.0',
  answers: {
    answer: {
      type: 'choice',
      choice: 'billing',
      probabilities: { billing: 1 },
      confidence: 0.9,
    },
  },
  usage: { input_tokens: FAKE_INPUT_TOKENS, output_tokens: FAKE_OUTPUT_TOKENS },
}

/**
 * Yield once, so an asynchronous double has an honest async shape.
 *
 * @returns A promise that settles on the next microtask.
 */
async function yieldOnce(): Promise<void> {
  await Promise.resolve()
}

/**
 * The transport double the companion tests run against.
 *
 * @returns The canned evaluation response.
 */
async function cannedFetch(): Promise<Response> {
  await yieldOnce()
  return Response.json(CANNED_BODY)
}

/**
 * Build a service whose transport always answers with the canned body.
 *
 * @returns A service wired to fakes.
 */
function testService(): JevService {
  return createTestService({
    fetchImpl: cannedFetch,
    sleep: yieldOnce,
    now: () => ZERO,
  })
}

/**
 * Read a recorded definition's name.
 *
 * @param value - Recorded first argument.
 * @param kind - Label used in the failure message.
 * @returns The registered name.
 */
function nameOf(value: unknown, kind: string): string {
  if (typeof value !== 'object' || value === null || !('name' in value)) {
    throw new TypeError(`the ${kind} companion did not register a definition`)
  }
  const { name } = value
  if (typeof name !== 'string') {
    throw new TypeError(`the registered ${kind} has a non-string name`)
  }
  return name
}

/**
 * Read a recorded route's path.
 *
 * @param value - Recorded first argument.
 * @returns The registered path.
 */
function pathOf(value: unknown): string {
  if (typeof value !== 'object' || value === null || !('path' in value)) {
    throw new TypeError('the route companion did not register a route')
  }
  const { path } = value
  if (typeof path !== 'string') {
    throw new TypeError('the registered route has a non-string path')
  }
  return path
}

/** A host registry fake that records what it is handed. */
interface RecordingRegistry {
  register: ReturnType<typeof vi.fn>
  record: unknown[]
  unregister: ReturnType<typeof vi.fn>
}

/**
 * Build a fake registry that records registrations and their disposers.
 *
 * @returns The fake registry.
 */
function recordingRegistry(): RecordingRegistry {
  const record: unknown[] = []
  const unregister = vi.fn<() => void>()
  const register = vi.fn<(value: unknown) => () => void>(
    (value: unknown): (() => void) => {
      record.push(value)
      return (): void => {
        unregister()
      }
    },
  )
  return { register, record, unregister }
}

async function testRegistersTools(): Promise<void> {
  expect.hasAssertions()
  const ctx = new Context()
  const registry = recordingRegistry()
  const removeHost = ctx.provide('tools', { register: registry.register })
  const removeJev = ctx.provide('jev', testService())

  const fiber = await ctx.plugin({ apply: applyTools, name: 'jev-tools', inject: ['tools', 'jev'] })
  expect(registry.register).toHaveBeenCalledTimes(TOOL_COUNT)
  expect(nameOf(registry.record[FIRST_INDEX], 'tool')).toBe('jev_ask')

  await fiber.dispose()
  expect(registry.unregister).toHaveBeenCalledTimes(TOOL_COUNT)
  removeJev()
  removeHost()
}

async function testRegistersOnlyEnabledTools(): Promise<void> {
  expect.hasAssertions()
  const ctx = new Context()
  const registry = recordingRegistry()
  const removeHost = ctx.provide('tools', { register: registry.register })
  const service = testService()
  const narrowed: JevService = {
    ...service,
    tools: {
      ask: true,
      reason: false,
      usage: false,
    },
  }
  const removeJev = ctx.provide('jev', narrowed)

  await ctx.plugin({ apply: applyTools, name: 'jev-tools', inject: ['tools', 'jev'] })
  expect(registry.register).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL)
  expect(nameOf(registry.record[FIRST_INDEX], 'tool')).toBe('jev_ask')
  removeJev()
  removeHost()
}

async function testSkipsToolsWhenDisabled(): Promise<void> {
  expect.hasAssertions()
  const ctx = new Context()
  const registry = recordingRegistry()
  const warn = vi.spyOn(ctx.logger, 'warn').mockReturnValue()
  const removeHost = ctx.provide('tools', { register: registry.register })
  const removeJev = ctx.provide('jev', { ...testService(), enabled: false })

  await ctx.plugin({ apply: applyTools, name: 'jev-tools', inject: ['tools', 'jev'] })
  expect(registry.register).not.toHaveBeenCalled()
  expect(warn).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL)
  warn.mockRestore()
  removeJev()
  removeHost()
}

async function testRegistersSkill(): Promise<void> {
  expect.hasAssertions()
  const ctx = new Context()
  const registry = recordingRegistry()
  const removeHost = ctx.provide('skills', { register: registry.register })
  const removeJev = ctx.provide('jev', testService())

  const fiber = await ctx.plugin({
    apply: applySkills,
    name: 'jev-skills',
    inject: ['skills', 'jev'],
  })
  expect(registry.register).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL)
  expect(nameOf(registry.record[FIRST_INDEX], 'skill')).toBe(SKILL_NAME)

  await fiber.dispose()
  expect(registry.unregister).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL)
  removeJev()
  removeHost()
}

function testSkillBodyNamesItsTools(): void {
  expect.hasAssertions()
  const content = buildSkillContent(testService())
  expect(content).toContain('jev_ask')
  expect(content).toContain('jev_reason')
  expect(content).toContain('route')
}

function testSkillDescriptionRoutes(): void {
  expect.hasAssertions()
  expect(buildSkillContent(testService()).length).toBeGreaterThan(DESCRIPTION_MIN_LENGTH)
}

function testCommandHandlesEveryBranch(): void {
  expect.hasAssertions()
  const service = testService()
  expect(COMMAND_NAME).toBe('jev')
  expect(runJevCommand(service, { rawInput: ' usage ' }).kind).toBe('success')
  expect(runJevCommand(service, { rawInput: 'reset' }).text).toContain('reset')
  expect(runJevCommand(service, { rawInput: 'nonsense' }).kind).toBe('error')
}

function testRouteBodies(): void {
  expect.hasAssertions()
  const service = testService()
  expect(bodyFor(HEALTH_PATH, service)).toMatchObject({ ok: true })
  expect(bodyFor(CATALOG_PATH, service)).toHaveProperty('banks')
  expect(bodyFor(UNKNOWN_PATH, service)).toBeUndefined()
}

describe('companions', () => {

  it('registers every enabled tool and disposes them', { timeout: TEST_TIMEOUT }, testRegistersTools)

  it('registers only the tools the profile enabled', { timeout: TEST_TIMEOUT }, testRegistersOnlyEnabledTools)

  it('registers no tool when the plugin is disabled', { timeout: TEST_TIMEOUT }, testSkipsToolsWhenDisabled)

  it('registers the skill companion and disposes it', { timeout: TEST_TIMEOUT }, testRegistersSkill)

  it('publishes a skill body naming its tools', { timeout: TEST_TIMEOUT }, testSkillBodyNamesItsTools)

  it('publishes routing copy long enough to route', { timeout: TEST_TIMEOUT }, testSkillDescriptionRoutes)

  it('handles every command branch', { timeout: TEST_TIMEOUT }, testCommandHandlesEveryBranch)

  it('serves the documented route bodies', { timeout: TEST_TIMEOUT }, testRouteBodies)
})

export { ROUTE_PATH, pathOf, recordingRegistry }

