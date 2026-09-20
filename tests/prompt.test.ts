/**
 * Prompt-companion tests.
 *
 * The guidance exists to change what the agent reaches for, so the suite pins
 * the two things that decide whether it can: that it lands in the prompt at all
 * with a placement among the tool sections, and that it says the specific
 * things a model needs to act on — which tools, one call per state, and why a
 * bank beats an ad-hoc call.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'

import { SECTION_NAME, SECTION_ORDER, apply, buildGuidance } from '#src/prompt'
import { createTestService } from './harness.ts'

const TEST_TIMEOUT = 5000
const EXPECTED_SINGLE_CALL = 1
const FIRST_INDEX = 0
const LAST_TOOL_SECTION = 2900
const SDK_SECTION = 5000
const ZERO = 0

/** A system-prompt registry fake that records what it is handed. */
interface RecordingRegistry {
  section: ReturnType<typeof vi.fn>
  record: unknown[]
  unregister: ReturnType<typeof vi.fn>
}

/**
 * Build a fake registry that records sections and their disposers.
 *
 * @returns The fake registry.
 */
function recordingRegistry(): RecordingRegistry {
  const record: unknown[] = []
  const unregister = vi.fn<() => void>()
  const section = vi.fn<(value: unknown) => () => void>(
    (value: unknown): (() => void) => {
      record.push(value)
      return (): void => {
        unregister()
      }
    },
  )
  return { section, record, unregister }
}

/**
 * Read a recorded section's name and order.
 *
 * @param value - Recorded first argument.
 * @returns The name and order.
 */
function sectionOf(value: unknown): { name: string; order: number } {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('the prompt companion did not register a section')
  }
  const { name, order } = value as { name?: unknown; order?: unknown }
  if (typeof name !== 'string' || typeof order !== 'number') {
    throw new TypeError('the registered section has no name or order')
  }
  return { name, order }
}

async function testRegistersItsSection(): Promise<void> {
  expect.hasAssertions()
  const ctx = new Context()
  const registry = recordingRegistry()
  const removeHost = ctx.provide('systemPrompt', { section: registry.section })
  const removeJev = ctx.provide('jev', createTestService({}))
  const prompt = await import('#src/prompt')

  const fiber = await ctx.plugin({ apply, name: 'jev-prompt', inject: ['systemPrompt', 'jev'] })
  expect(registry.section).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL)

  const registered = sectionOf(registry.record[FIRST_INDEX])
  expect(registered.name).toBe(SECTION_NAME)

  await fiber.dispose()
  expect(registry.unregister).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL)
  removeJev()
  removeHost()
  void prompt
}

function testPlacesItselfAmongTheToolSections(): void {
  expect.hasAssertions()
  expect(SECTION_ORDER).toBeGreaterThan(LAST_TOOL_SECTION)
  expect(SECTION_ORDER).toBeLessThan(SDK_SECTION)
}

function testGuidanceSaysWhatTheModelNeeds(): void {
  expect.hasAssertions()
  const text = buildGuidance(createTestService({}))
  expect(text).toContain('jev_classify')
  expect(text).toContain('jev_reason')
  expect(text).toContain('parallel')
  expect(text).toContain('route')
}

function testGuidanceExplainsWhyABankIsCheaper(): void {
  expect.hasAssertions()
  const text = buildGuidance(createTestService({}))
  expect(text).toContain('bank')
  expect(text).toContain('generated tokens')
}

async function testSkipsWhenThePluginIsDisabled(): Promise<void> {
  expect.hasAssertions()
  const ctx = new Context()
  const registry = recordingRegistry()
  const warn = vi.spyOn(ctx.logger, 'warn').mockReturnValue()
  const removeHost = ctx.provide('systemPrompt', { section: registry.section })
  const removeJev = ctx.provide('jev', { ...createTestService({}), enabled: false })

  await ctx.plugin({ apply, name: 'jev-prompt', inject: ['systemPrompt', 'jev'] })
  expect(registry.section).toHaveBeenCalledTimes(ZERO)
  expect(warn).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL)
  warn.mockRestore()
  removeJev()
  removeHost()
}

async function testSkipsWhenTheGuidanceIsTurnedOff(): Promise<void> {
  expect.hasAssertions()
  const ctx = new Context()
  const registry = recordingRegistry()
  const warn = vi.spyOn(ctx.logger, 'warn').mockReturnValue()
  const removeHost = ctx.provide('systemPrompt', { section: registry.section })
  const removeJev = ctx.provide('jev', { ...createTestService({}), adoptionPrompt: false })

  await ctx.plugin({ apply, name: 'jev-prompt', inject: ['systemPrompt', 'jev'] })
  expect(registry.section).toHaveBeenCalledTimes(ZERO)
  expect(warn).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL)
  warn.mockRestore()
  removeJev()
  removeHost()
}

describe('prompt companion', () => {
  it('registers its section and disposes it', { timeout: TEST_TIMEOUT }, testRegistersItsSection)

  it('sits after the tool sections and before the SDK collapse', { timeout: TEST_TIMEOUT }, testPlacesItselfAmongTheToolSections)

  it('tells the model which tools to reach for', { timeout: TEST_TIMEOUT }, testGuidanceSaysWhatTheModelNeeds)

  it('explains why a bank beats an ad-hoc call', { timeout: TEST_TIMEOUT }, testGuidanceExplainsWhyABankIsCheaper)

  it('registers nothing while the plugin is disabled', { timeout: TEST_TIMEOUT }, testSkipsWhenThePluginIsDisabled)

  it('registers nothing when the guidance is turned off', { timeout: TEST_TIMEOUT }, testSkipsWhenTheGuidanceIsTurnedOff)
})

