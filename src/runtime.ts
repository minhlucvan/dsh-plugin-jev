/**
 * Runtime boundary and Cordis activation.
 *
 * This is the plugin's host seam. Everything the activation needs from the
 * outside world — the process environment and the Cordis logger — enters here,
 * so tests can substitute both and the rest of the package never reaches for a
 * global.
 *
 * @module dsh-plugin-jev/runtime
 */

import type { Context } from '@deepseek-ai/cordis'

import { resolveConfig } from './config.ts'
import type { Config, ResolvedConfig } from './config.ts'
import { createJevService } from './jev/service.ts'
import type { JevService } from './jev/service.ts'

/** Service name companions inject to reach the shared Jev instance. */
const SERVICE_NAME = 'jev'

/** Host boundary the plugin uses. */
interface PluginRuntime {
  /** Publish one informational message through the host. */
  info: (message: string) => void
  /** Publish one warning through the host. */
  warn: (message: string) => void
  /** The service this plugin provides to its companions. */
  service: JevService
}

/** The part of the process environment this plugin reads. */
type Environment = Record<string, string | undefined>

/**
 * Read the credential the configuration points at.
 *
 * The secret itself never appears in configuration or in a log line: the
 * profile names an environment variable, and only its value is read here.
 *
 * @param env - Process environment.
 * @param apiKeyEnv - Name of the variable holding the key.
 * @returns The key, or the empty string when it is unset or blank.
 */
function readApiKey(env: Environment, apiKeyEnv: string): string {
  return (env[apiKeyEnv] ?? '').trim()
}

/**
 * Create the production runtime adapter from a scoped Cordis context.
 *
 * The credential is judged here rather than at the first tool call because
 * activation is the earliest point at which the environment can be inspected,
 * and a plugin that is mounted but cannot work should say so at startup. A
 * profile that deliberately wants the plugin present without a credential sets
 * `enabled: false`, which skips the requirement and publishes no live tool.
 *
 * @param ctx - Scoped plugin context.
 * @param config - Resolved plugin configuration.
 * @param env - Environment to read; defaults to the process environment.
 * @returns Host behavior and the service the plugin provides.
 * @throws {Error} When the plugin is enabled and its credential is unset.
 */
function createPluginRuntime(
  ctx: Context,
  config: ResolvedConfig,
  env: Environment = process.env,
): PluginRuntime {
  const apiKey = readApiKey(env, config.apiKeyEnv)
  if (config.enabled && apiKey === '') {
    throw new Error(
      `dsh-plugin-jev: "${config.apiKeyEnv}" is not set. Export the TypeSafe API key, `
      + 'or mount the plugin with "enabled: false" to load it without one.',
    )
  }

  return {
    info: (message) => {
      ctx.logger.info(message)
    },
    warn: (message) => {
      ctx.logger.warn(message)
    },
    service: createJevService(config, { apiKey }),
  }
}

/**
 * Apply the plugin to its Cordis context.
 *
 * The service registration is owned by an effect, so the shared instance
 * disappears with the fiber instead of surviving a reload.
 *
 * @param ctx - Scoped plugin context.
 * @param config - Configuration resolved by Cordis from the exported schema.
 */
function apply(ctx: Context, config: Config): void {
  const resolved = resolveConfig(config)
  const runtime = createPluginRuntime(ctx, resolved)
  ctx.effect(
    (): (() => void) => ctx.provide(SERVICE_NAME, runtime.service),
    'jev: service',
  )
  if (resolved.enabled) {
    runtime.info(`dsh-plugin-jev ready: model ${resolved.model} at ${resolved.baseUrl}`)
    return
  }
  runtime.warn(
    'dsh-plugin-jev is mounted with "enabled: false"; no evaluation will be sent',
  )
}

export {
  SERVICE_NAME,
  apply,
  createPluginRuntime,
  readApiKey,
  type Environment,
  type PluginRuntime,
}

