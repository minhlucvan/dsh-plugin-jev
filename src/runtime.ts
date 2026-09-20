/**
 * Runtime boundary and Cordis activation.
 *
 * This is the plugin's host seam. Everything the activation needs from the
 * outside world — the credential service, the process environment, and the
 * Cordis logger — enters here, so tests can substitute all three and the rest
 * of the package never reaches for a global.
 *
 * The credential is resolved *per evaluation*, never cached at activation, and
 * the credential seam itself is looked up per evaluation too. That is what lets
 * a key entered in the browser settings page reach the very next tool call
 * without restarting the host, and it is why a missing key is a warning rather
 * than a load failure: the settings section this plugin installs is itself the
 * interface that supplies the key, so refusing to activate would remove it.
 *
 * @module dsh-plugin-system-one/runtime
 */

import type { Context } from '@deepseek-ai/cordis'

import { resolveConfig } from './config.ts'
import type { Config, ResolvedConfig } from './config.ts'
import { isRecord } from './jev/contracts.ts'
import { createJevService } from './jev/service.ts'
import type { JevService } from './jev/service.ts'
import { installUserSettings } from './settings.ts'

/** Service name companions inject to reach the shared Jev instance. */
const SERVICE_NAME = 'jev'

/** Service name the host's credential seam is provided under. */
const CREDENTIALS_SERVICE = 'credentials'

/**
 * Grammar the credential seam accepts for a reference, restated here so a bad
 * configuration reads as "unset" instead of reaching the provider and throwing.
 */
const CREDENTIAL_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u

/** Builds the credential resolver for one configuration. */
type CredentialFactory = (config: ResolvedConfig) => () => Promise<string | undefined>

/** Host boundary the plugin uses. */
interface PluginRuntime {
  /** Publish one informational message through the host. */
  info: (message: string) => void
  /** Publish one warning through the host. */
  warn: (message: string) => void
  /** The service this plugin provides to its companions. */
  service: JevService
  /**
   * Build a credential resolver for a configuration.
   *
   * A settings change can rename the credential's variable, so the section
   * needs a fresh resolver rather than the one built at activation.
   */
  credentialFor: CredentialFactory
  /**
   * Whether a key can be resolved right now.
   *
   * Read at activation only to decide whether to warn; a provider that mounts
   * later still supplies the key, because resolution re-reads the seam.
   */
  credentialAvailable: () => boolean
}

/** The part of the process environment this plugin reads. */
type Environment = Record<string, string | undefined>

/** One resolved credential and the source layer that supplied it. */
interface ResolvedCredentialLike {
  /** The non-empty secret value. */
  value: string
  /** Provider-defined source layer id. */
  source: string
}

/**
 * Minimal credential-seam contract used without a host source checkout.
 *
 * The host's provider also describes, writes and enumerates credentials; this
 * plugin only reads one reference, and modelling only that is what keeps the
 * build independent of the host's credential packages.
 */
interface CredentialProviderLike {
  resolve: (ref: string) => Promise<ResolvedCredentialLike | undefined>
}

/** A per-call credential lookup and how it was sourced. */
interface CredentialResolver {
  /** Whether the host's credential seam is supplying the value. */
  fromProvider: boolean
  /**
   * Resolve the credential for one operation.
   *
   * @returns The secret, or `undefined` while it is unconfigured.
   */
  resolve: () => Promise<string | undefined>
}

/**
 * Whether a value implements the narrow credential contract.
 *
 * @param value - Candidate service.
 * @returns True when the value can resolve a reference.
 */
function isCredentialProviderLike(value: unknown): value is CredentialProviderLike {
  if (!isRecord(value)) {
    return false
  }
  return typeof value.resolve === 'function'
}

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
 * Build the per-call credential lookup.
 *
 * The host's credential seam is preferred whenever it is mounted, because it
 * layers the managed store over the environment and is what the settings page
 * writes to. Without it, the process environment is the only source available.
 *
 * The seam is looked up on **every call** rather than once here. Cordis mounts
 * the host's credential provider as its own row, and this plugin's row may be
 * applied first — an insert lands ahead of the rows it patches over — so a
 * resolver that sampled the seam at activation would remember "no provider" for
 * the life of the fiber even though the profile mounts one.
 *
 * @param ctx - Scoped plugin context.
 * @param config - Resolved plugin configuration.
 * @param env - Environment to read when no provider is mounted.
 * @returns The resolver and which source it uses.
 */
function createCredentialResolver(
  ctx: Context,
  config: ResolvedConfig,
  env: Environment,
): CredentialResolver {
  const reference = config.apiKeyEnv
  const named = CREDENTIAL_REF_PATTERN.test(reference)

  /**
   * Read the credential seam as it stands right now.
   *
   * @returns The provider, or undefined while none is mounted.
   */
  const providerNow = (): CredentialProviderLike | undefined => {
    if (!named) {
      return undefined
    }
    const value: unknown = ctx.get(CREDENTIALS_SERVICE)
    if (!isCredentialProviderLike(value)) {
      return undefined
    }
    return value
  }

  return {
    fromProvider: providerNow() !== undefined,
    resolve: async (): Promise<string | undefined> => {
      const provider = providerNow()
      if (provider !== undefined) {
        const resolved = await provider.resolve(reference)
        const value = resolved?.value.trim() ?? ''
        if (value === '') {
          return undefined
        }
        return value
      }
      await Promise.resolve()
      const value = readApiKey(env, reference)
      if (value === '') {
        return undefined
      }
      return value
    },
  }
}

/**
 * Create the production runtime adapter from a scoped Cordis context.
 *
 * A missing key never refuses activation. This plugin installs the settings
 * section that supplies the key, so refusing to load removes the only interface
 * that could fix the problem — and whether the host's credential provider is
 * mounted at this instant is a load-order accident, not a property of the
 * profile. An unset key is reported once at activation and again on the call
 * that needed it.
 *
 * @param ctx - Scoped plugin context.
 * @param config - Resolved plugin configuration.
 * @param env - Environment to read when no provider is mounted.
 * @returns Host behavior and the service the plugin provides.
 */
function createPluginRuntime(
  ctx: Context,
  config: ResolvedConfig,
  env: Environment = process.env,
): PluginRuntime {
  const credentials = createCredentialResolver(ctx, config, env)

  return {
    info: (message) => {
      ctx.logger.info(message)
    },
    warn: (message) => {
      ctx.logger.warn(message)
    },
    credentialAvailable: (): boolean =>
      credentials.fromProvider || readApiKey(env, config.apiKeyEnv) !== '',
    credentialFor: (next: ResolvedConfig): (() => Promise<string | undefined>) =>
      createCredentialResolver(ctx, next, env).resolve,
    service: createJevService(config, { resolveApiKey: credentials.resolve }),
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
  installUserSettings({
    ctx,
    base: resolved,
    service: runtime.service,
    credentialFor: runtime.credentialFor,
  })
  if (resolved.enabled) {
    runtime.info(`dsh-plugin-system-one ready: model ${resolved.model} at ${resolved.baseUrl}`)
    if (!runtime.credentialAvailable()) {
      runtime.warn(
        `dsh-plugin-system-one has no TypeSafe key yet: set one in System One settings, or `
        + `export "${resolved.apiKeyEnv}". Tool calls fail until it is configured.`,
      )
    }
    return
  }
  runtime.warn(
    'dsh-plugin-system-one is mounted with "enabled: false"; no evaluation will be sent',
  )
}

export {
  CREDENTIALS_SERVICE,
  SERVICE_NAME,
  apply,
  createCredentialResolver,
  createPluginRuntime,
  readApiKey,
  type CredentialFactory,
  type CredentialProviderLike,
  type CredentialResolver,
  type Environment,
  type PluginRuntime,
}

