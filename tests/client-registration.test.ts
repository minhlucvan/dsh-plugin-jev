/**
 * Client registration tests.
 *
 * The client entry's whole job is registration, so its tests are about what it
 * registered and what it released. The host services are provided as fakes here
 * because the entry resolves them through narrow local contracts — which is
 * what lets this run without the host's client packages, and what makes the
 * registration observable at all.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'

import { defaultSettings } from '#src/client/settings'

const TEST_TIMEOUT = 5000
const EXPECTED_SINGLE_CALL = 1
const FIRST_INDEX = 0
const SLOT_NAME = 'settings.section'
const SLOT_ID = 'dsh-plugin-jev'

/** A settings scope as the client's narrow contract sees it. */
interface FakeScope {
  /** Read the snapshot the fake host reports. */
  getSnapshot: () => unknown
  /** Register a listener; the fake never notifies. */
  subscribe: () => () => void
  /** Accept a write; the fake records nothing. */
  mutate: () => void
}

/** A recorded slot descriptor, once it is known to be one. */
interface RecordedDescriptor {
  /** Slot name the seat belongs to. */
  name?: unknown
  /** Seat identifier. */
  id?: unknown
  /** Labelling function, resolved at render time. */
  label?: () => string
  /** Props handed to the component. */
  inject?: () => Record<string, unknown>
}

/** A settings scope, once a value is known to be one. */
interface NarrowScope {
  /** Read the snapshot the scope reports. */
  getSnapshot: () => unknown
}

/**
 * Whether a recorded slot registration is a descriptor rather than a component.
 *
 * @param value - The recorded first argument.
 * @returns True when the value carries the descriptor's members.
 */
function isRecordedDescriptor(value: unknown): value is RecordedDescriptor {
  return typeof value === 'object' && value !== null
}

/**
 * Whether a value exposes a snapshot read.
 *
 * @param value - Candidate props member.
 * @returns True when the value can be read as a scope.
 */
function isNarrowScope(value: unknown): value is NarrowScope {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  if (!('getSnapshot' in value)) {
    return false
  }
  return typeof value.getSnapshot === 'function'
}

/** The fake services the client entry requires, plus their call recorders. */
interface Fakes {
  /** Records one dictionary registration. */ registerLocale: ReturnType<typeof vi.fn>
  /** Records the dictionary registration's disposal. */ unregisterLocale: ReturnType<typeof vi.fn>
  /** Records one slot injection. */ slotInject: ReturnType<typeof vi.fn>
  /** Records one slot registration. */ slotRegister: ReturnType<typeof vi.fn>
  /** Records the slot registration's disposal. */ unregisterSlot: ReturnType<typeof vi.fn>
  /** Records one settings-scope binding. */ scopeBind: ReturnType<typeof vi.fn>
}

/**
 * Provide the host services the client injects.
 *
 * The credential namespace answers successful remote responses so the entry's
 * contract check passes; nothing here reads a value, and no case asserts on one.
 *
 * @param ctx - Cordis context to provide into.
 * @returns The recorders, for assertions.
 */
function provideFakes(ctx: Context): Fakes {
  const unregisterLocale = vi.fn<() => void>()
  const unregisterSlot = vi.fn<() => void>()
  const registerLocale = vi.fn<
    (namespace: string, dictionaries: unknown) => () => void
  >((): (() => void) => (): void => {
    unregisterLocale()
  })
  const bind = vi.fn<(namespace: string) => (key: string) => string>(
    (): ((key: string) => string) =>
      (key: string): string =>
        key,
  )
  const slotRegister = vi.fn<(slot: unknown, component: unknown) => () => void>(
    (): (() => void) => (): void => {
      unregisterSlot()
    },
  )
  /*
   * The slot's `inject` calls its callback immediately, as the host does once
   * the slot exists, so registration happens during the mount rather than later.
   */
  const slotInject = vi.fn<(name: string, callback: () => void) => void>(
    (_name: string, callback: () => void): void => {
      callback()
    },
  )
  const scopeBind = vi.fn<(options: { namespace: string }) => FakeScope>(
    (): FakeScope => ({
      /* A malformed stored value, which the client must normalize on the way out. */
      getSnapshot: (): unknown => ({ model: '   ', confidenceFloor: 'nonsense' }),
      subscribe: (): (() => void) => (): void => {
        // No notifications are delivered by this fake.
      },
      mutate: (): void => {
        // The fake records nothing; the real scope persists.
      },
    }),
  )

  ctx.provide('locale', { bind, register: registerLocale })
  ctx.provide('slots', { inject: slotInject, register: slotRegister })
  ctx.provide('settingsScope', { bind: scopeBind })
  ctx.provide('remote.credentials', {
    describe: async (): Promise<unknown> => {
      const answer = await Promise.resolve({ ok: true, value: {} })
      return answer
    },
    set: async (): Promise<unknown> => {
      const answer = await Promise.resolve({ ok: true, value: undefined })
      return answer
    },
    unset: async (): Promise<unknown> => {
      const answer = await Promise.resolve({ ok: true, value: undefined })
      return answer
    },
  })

  return {
    registerLocale,
    scopeBind,
    slotInject,
    slotRegister,
    unregisterLocale,
    unregisterSlot,
  }
}

/**
 * Read the descriptor the client registered into the slot.
 *
 * @param fakes - The recorders to read from.
 * @returns The recorded descriptor.
 */
function recordedDescriptor(fakes: Fakes): RecordedDescriptor {
  const recorded: unknown = fakes.slotRegister.mock.calls[FIRST_INDEX]?.[FIRST_INDEX]
  if (!isRecordedDescriptor(recorded)) {
    throw new TypeError('the client did not register a slot descriptor')
  }
  return recorded
}

/**
 * Read the props the client hands its page.
 *
 * @param fakes - The recorders to read from.
 * @returns The injected props.
 */
function injectedProps(fakes: Fakes): Record<string, unknown> {
  const { inject } = recordedDescriptor(fakes)
  if (inject === undefined) {
    throw new TypeError('the client registered a descriptor with no injected props')
  }
  return inject()
}

async function testRegistersLocaleScopeAndSlot(): Promise<void> {
  expect.hasAssertions()
  const ctx = new Context()
  const fakes = provideFakes(ctx)
  const client = await import('#src/client/index')

  const fiber = await ctx.plugin(client)

  expect(fakes.registerLocale).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL)
  expect(fakes.scopeBind).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL)
  expect(fakes.scopeBind.mock.calls[FIRST_INDEX]?.[FIRST_INDEX])
    .toStrictEqual({ namespace: SLOT_ID })
  expect(fakes.slotRegister).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL)
  await fiber.dispose()
}

async function testSeatsThePageInTheSettingsSection(): Promise<void> {
  expect.hasAssertions()
  const ctx = new Context()
  const fakes = provideFakes(ctx)
  const client = await import('#src/client/index')

  const fiber = await ctx.plugin(client)

  expect(fakes.slotInject.mock.calls[FIRST_INDEX]?.[FIRST_INDEX]).toBe(SLOT_NAME)

  const descriptor = recordedDescriptor(fakes)
  expect(descriptor.name).toBe(SLOT_NAME)
  expect(descriptor.id).toBe(SLOT_ID)
  expect(descriptor.label?.()).toBe('nav')
  expect(Object.keys(injectedProps(fakes)).toSorted())
    .toStrictEqual(['api', 'credentials', 'scope', 'translate'])
  await fiber.dispose()
}

async function testNormalizesTheBoundScope(): Promise<void> {
  expect.hasAssertions()
  const ctx = new Context()
  const fakes = provideFakes(ctx)
  const client = await import('#src/client/index')

  const fiber = await ctx.plugin(client)

  /*
   * The page must never see the malformed value the host stored: resolving it
   * once here is what keeps every field free of defensive checks.
   */
  const { scope } = injectedProps(fakes)
  if (!isNarrowScope(scope)) {
    throw new TypeError('the client injected no settings scope')
  }
  expect(scope.getSnapshot()).toStrictEqual(defaultSettings)
  await fiber.dispose()
}

async function testDisposesEveryRegistration(): Promise<void> {
  expect.hasAssertions()
  const ctx = new Context()
  const fakes = provideFakes(ctx)
  const client = await import('#src/client/index')

  const fiber = await ctx.plugin(client)
  await fiber.dispose()

  expect(fakes.unregisterLocale).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL)
  expect(fakes.unregisterSlot).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL)
}

async function testClientNamespaceThroughLoader(): Promise<void> {
  expect.hasAssertions()
  const client = await import('#src/client/index')
  expect(['default' in client]).toStrictEqual([false])
  expect(client.name).toBe('jev-client')
  expect(client.inject)
    .toStrictEqual(['locale', 'remote.credentials', 'settingsScope', 'slots'])
}

describe('client registration', () => {
  it('registers locale, settings scope and one slot', { timeout: TEST_TIMEOUT }, testRegistersLocaleScopeAndSlot)

  it('seats the page in the settings section', { timeout: TEST_TIMEOUT }, testSeatsThePageInTheSettingsSection)

  it('normalizes the scope the host binds', { timeout: TEST_TIMEOUT }, testNormalizesTheBoundScope)

  it('releases every registration when the fiber is disposed', { timeout: TEST_TIMEOUT }, testDisposesEveryRegistration)

  it('exposes the client plugin namespace with no default export', { timeout: TEST_TIMEOUT }, testClientNamespaceThroughLoader)
})
