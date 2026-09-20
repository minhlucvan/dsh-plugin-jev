/**
 * Optional tool-registration companion for `dsh-plugin-jev`.
 *
 * The tools are the point of the package: they let the calling model hand a
 * narrow judgement to Jev and receive a typed answer instead of producing one
 * itself. Registration goes through `ctx.effect`, so every tool disappears with
 * the fiber.
 *
 * @module dsh-plugin-jev/tools
 */

import type { Context } from '@deepseek-ai/cordis'

import { isRecord } from './jev/contracts.ts'
import type { JevService } from './jev/service.ts'
import { createJevTools } from './jev/tools.ts'

/** Cordis companion plugin name. */
const name = 'jev-tools'

/** Services required before the companion can register anything. */
const inject = ['tools', 'jev']

/** Definition count at which the profile disabled the whole tool face. */
const NO_DEFINITIONS = 0

/**
 * Minimal registration handle used without a host source checkout.
 *
 * The host's registry also resolves, filters and describes tools per agent
 * scope. A companion that publishes a fixed catalog needs only `register`, and
 * modelling only that is what keeps this package buildable without the host's
 * own source tree.
 */
interface ToolRegistry {
  register: (tool: unknown) => () => void
}

/**
 * Whether a value implements the narrow registry contract.
 *
 * @param value - Candidate service.
 * @returns True when the value can register a tool.
 */
function isToolRegistry(value: unknown): value is ToolRegistry {
  if (!isRecord(value)) {
    return false
  }
  return typeof value.register === 'function'
}

/**
 * Whether a value is the Jev service this package provides.
 *
 * @param value - Candidate service.
 * @returns True when the value carries the members the tools call.
 */
function isJevService(value: unknown): value is JevService {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.enabled === 'boolean'
    && typeof value.evaluate === 'function'
    && typeof value.usage === 'function'
    && typeof value.resetUsage === 'function'
  )
}

/**
 * Resolve the host's tool registry through Cordis's named service lookup.
 *
 * @param ctx - Cordis context carrying the host service.
 * @returns The host tool registry.
 * @throws {Error} When the companion is loaded without its host service.
 */
function getToolRegistry(ctx: Context): ToolRegistry {
  const registry: unknown = ctx.get('tools')
  if (!isToolRegistry(registry)) {
    throw new Error('tools companion requires the "tools" service')
  }
  return registry
}

/**
 * Resolve the Jev service this package provided.
 *
 * @param ctx - Cordis context carrying the package service.
 * @returns The Jev service.
 * @throws {Error} When the companion is mounted without the core plugin row.
 */
function getJevService(ctx: Context): JevService {
  const service: unknown = ctx.get('jev')
  if (!isJevService(service)) {
    throw new Error(
      'tools companion requires the "jev" service; mount the dsh-plugin-jev row first',
    )
  }
  return service
}

/**
 * Register this plugin's tools on its own Cordis fiber.
 *
 * @param ctx - Cordis context carrying the `tools` and `jev` services.
 */
function apply(ctx: Context): void {
  const registry = getToolRegistry(ctx)
  const service = getJevService(ctx)
  const definitions = createJevTools(service)

  if (!service.enabled) {
    ctx.logger.warn(
      'dsh-plugin-jev tools are mounted but the plugin is disabled; no tool was registered',
    )
    return
  }
  if (definitions.length === NO_DEFINITIONS) {
    ctx.logger.warn('dsh-plugin-jev registered no tools: every tool switch is off')
    return
  }

  ctx.effect((): (() => void) => {
    const disposers = definitions.map((definition): (() => void) => registry.register(definition))
    return (): void => {
      for (const dispose of disposers) {
        dispose()
      }
    }
  }, 'tools: jev registration')
}

export { apply, inject, name }
