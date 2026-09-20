/**
 * Package-owned invariant companion for `dsh-plugin-jev`.
 *
 * The package owns one authoritative data relationship: the usage ledger's
 * cumulative counters must equal the totals of the entries it evicted plus the
 * entries it still retains. That identity is what makes the token accounting
 * trustworthy, and it is exactly what a double-recorded call, a half-completed
 * reset, or a counter that drifted would break. The installer asserts it
 * through the service rather than reaching into the ledger's internals.
 *
 * @module dsh-plugin-jev/invariant
 */

import type { Context } from '@deepseek-ai/cordis'

import { isRecord } from './jev/contracts.ts'

/** Full npm package name that owns this contribution. */
const PACKAGE_NAME = 'dsh-plugin-jev'

/** Cordis companion plugin name. */
const name = 'jev-invariant'

/** Service required before the companion can reserve package ownership. */
const inject = ['invariants']

/** A package-attributed invariant failure reported by the host registry. */
type InvariantFailure = (message: string) => never

/** Installer callback accepted by the host's invariant registry. */
interface InvariantInstaller {
  /**
   * @param ctx - Child context owned by this registration.
   * @param fail - Reporter bound to the registering package name.
   */
  (ctx: Context, fail: InvariantFailure): void | Promise<void>
  /** Services the child installer fiber may access. */
  readonly inject?: string[]
}

/**
 * Minimal runtime contract used by the companion without a host source
 * checkout.
 */
interface InvariantRegistry {
  register: (packageName: string, installer: InvariantInstaller) => () => void
}

/** The part of the Jev service this check reads. */
interface JevVerifier {
  /** Recheck the ledger's accounting identity. */
  verifyUsage: () => string | undefined
}

/**
 * Whether a value is the host's invariant registry.
 *
 * @param value - Candidate service.
 * @returns True when the value can register an installer.
 */
function isInvariantRegistry(value: unknown): value is InvariantRegistry {
  if (!isRecord(value)) {
    return false
  }
  return typeof value.register === 'function'
}

/**
 * Whether a value is the Jev service this package provides.
 *
 * @param value - Candidate service.
 * @returns True when the value can recheck its ledger.
 */
function isJevVerifier(value: unknown): value is JevVerifier {
  if (!isRecord(value)) {
    return false
  }
  return typeof value.verifyUsage === 'function'
}

/**
 * Resolve the host registry through Cordis's named service lookup.
 *
 * Keeping this narrow local contract lets the package build without host source
 * files; a composed DSH profile still supplies the real service.
 *
 * @param ctx - Cordis context carrying the host service.
 * @returns The host invariant registry.
 * @throws {Error} When the companion is loaded without its host service.
 */
function getInvariantRegistry(ctx: Context): InvariantRegistry {
  const registry: unknown = ctx.get('invariants')
  if (!isInvariantRegistry(registry)) {
    throw new Error(
      `invariant companion requires the "invariants" service for ${PACKAGE_NAME}`,
    )
  }
  return registry
}

/**
 * The check itself, carrying the services its child fiber needs.
 *
 * Declaring `inject` means this runs only once the core plugin row has provided
 * the service, so a profile that mounts the companion without the plugin leaves
 * the check pending instead of failing a mount order it cannot control.
 */
const install = Object.assign(
  (ctx: Context, fail: InvariantFailure): void => {
    const service: unknown = ctx.get('jev')
    if (!isJevVerifier(service)) {
      return
    }
    const problem = service.verifyUsage()
    if (problem !== undefined) {
      fail(problem)
    }
  },
  { inject: ['jev'] },
)

/**
 * Register this package's invariant companion.
 *
 * @param ctx - Cordis context carrying the invariant service.
 * @returns The installed registration's disposer after setup succeeds.
 */
async function apply(ctx: Context): Promise<() => void> {
  const disposer = getInvariantRegistry(ctx).register(PACKAGE_NAME, install)
  // Preserve the asynchronous plugin contract after synchronous registration.
  await Promise.resolve(disposer)
  return disposer
}

export { PACKAGE_NAME, apply, inject, install, name }

