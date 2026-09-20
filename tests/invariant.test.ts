/**
 * Invariant companion tests.
 *
 * The package's one authoritative relationship is the usage ledger's accounting
 * identity, and this suite proves both directions: a consistent ledger passes,
 * and a violated one reaches the host's failure reporter with the reason.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'

import { PACKAGE_NAME, apply, install } from '#src/invariant'

const TEST_TIMEOUT = 5000
const EXPECTED_SINGLE_CALL = 1
const FIRST_INDEX = 0
const VIOLATION = 'ledger drifted'

/** What a verifier reports when no relationship is violated. */
const NO_VIOLATION: string | undefined = undefined

async function testRegistersRegistration(): Promise<void> {
  expect.hasAssertions()
  const ctx = new Context()
  const unregister = vi.fn<() => void>()
  const register = vi.fn<(name: string, installer: unknown) => () => void>(
    () => (): void => {
      unregister()
    },
  )
  const removeHost = ctx.provide('invariants', { register })

  const fiber = await ctx.plugin({ apply, name: 'jev-invariant', inject: ['invariants'] })
  expect(register).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL)
  expect(register.mock.calls[FIRST_INDEX]?.[FIRST_INDEX]).toBe(PACKAGE_NAME)

  await fiber.dispose()
  expect(unregister).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL)
  removeHost()
}

function testPassesAConsistentLedger(): void {
  expect.hasAssertions()
  const fail = vi.fn<(message: string) => never>()
  const ctx = new Context()
  const removeJev = ctx.provide('jev', { verifyUsage: () => NO_VIOLATION })

  install(ctx, fail)
  expect(fail).not.toHaveBeenCalled()
  removeJev()
}

function testReportsAViolatedLedger(): void {
  expect.hasAssertions()
  const fail = vi.fn<(message: string) => never>()
  const ctx = new Context()
  const removeJev = ctx.provide('jev', { verifyUsage: () => VIOLATION })

  install(ctx, fail)
  expect(fail).toHaveBeenCalledWith(VIOLATION)
  removeJev()
}

describe('invariant companion', () => {

  it('registers package ownership and disposes it', { timeout: TEST_TIMEOUT }, testRegistersRegistration)

  it('passes a consistent ledger', { timeout: TEST_TIMEOUT }, testPassesAConsistentLedger)

  it('reports a violated ledger', { timeout: TEST_TIMEOUT }, testReportsAViolatedLedger)
})

