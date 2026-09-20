/**
 * The user-editable settings namespace this plugin owns.
 *
 * The Cordis `Config` is the deployment channel: an operator sets it in the
 * profile patch and it applies to everyone. This module opens the second,
 * per-user channel that every configurable DSH plugin has, by installing a
 * settings section whose composition layer is that same profile config. The
 * resolved value is therefore schema defaults, then the profile, then whatever
 * the user saved — and the browser page writes into the top of that stack.
 *
 * The section is installed through `installSection` rather than `register`
 * because this plugin works without a settings provider: the composition entry
 * is the fallback, so a profile that has no settings service behaves exactly as
 * before.
 *
 * The schema here is deliberately the same fields the browser face edits, in the
 * same order, with the same bounds. A field the UI can set but the host ignores
 * would be a lie, and a host field the UI cannot reach would be a dead setting.
 *
 * @module dsh-plugin-system-one/settings
 */

import type { Context } from '@deepseek-ai/cordis'
import schema from '@deepseek-ai/schemastery'

import { resolveConfig } from './config.ts'
import { USER_SETTING_DEFAULTS } from './config-defaults.ts'
import type { ResolvedConfig } from './config.ts'
import { isRecord } from './jev/contracts.ts'
import type { JevService } from './jev/service.ts'

/** Builds the credential resolver for one configuration. */
type CredentialFactory = (config: ResolvedConfig) => () => Promise<string | undefined>

/** Settings namespace this plugin owns and the browser page binds. */
const SETTINGS_NAMESPACE = 'dsh-plugin-system-one'

/** The fields a user may override, mirroring the browser settings page. */
interface UserSettings {
  /** Master switch; a disabled plugin never contacts TypeSafe. */
  enabled: boolean
  /** Whether the agent is told to prefer Jev for a narrow decision. */
  adoptionPrompt: boolean
  /** Ids of the question banks the user allows. */
  banks: string[]
  /** Name of the environment variable holding the API key. */
  apiKeyEnv: string
  /** Model id or alias sent in the `model` field. */
  model: string
  /** Evaluation endpoint base URL. */
  baseUrl: string
  /** Confidence below which an answer needs review before it is acted on. */
  confidenceFloor: number
  /** Confidence at or above which a high-stakes answer may act unreviewed. */
  confirmFloor: number
  /** Usage entries retained for reporting. */
  ledgerLimit: number
}

/** Loader-visible schema for the settings section. */
const UserSettingsSchema: schema<UserSettings> = schema.object({
  enabled: schema.boolean().default(USER_SETTING_DEFAULTS.enabled),
  adoptionPrompt: schema.boolean().default(USER_SETTING_DEFAULTS.adoptionPrompt),
  banks: schema.array(schema.string()).default([...USER_SETTING_DEFAULTS.banks]),
  apiKeyEnv: schema.string().default(USER_SETTING_DEFAULTS.apiKeyEnv),
  model: schema.string().default(USER_SETTING_DEFAULTS.model),
  baseUrl: schema.string().default(USER_SETTING_DEFAULTS.baseUrl),
  confidenceFloor: schema.number().default(USER_SETTING_DEFAULTS.confidenceFloor),
  confirmFloor: schema.number().default(USER_SETTING_DEFAULTS.confirmFloor),
  ledgerLimit: schema.number().default(USER_SETTING_DEFAULTS.ledgerLimit),
})

/** Hooks the settings provider accepts from an optional consumer. */
interface SettingsSectionHooks<TValue> {
  /** Receive a thunk returning the currently authoritative value. */
  setSource: (current: () => TValue) => void
  /** Re-judge everything derived from the source after a change. */
  onChange: () => void
  /** Refuse a resolved section the owner could not act on. */
  validate?: (value: TValue) => void
}

/**
 * Minimal settings-provider contract used without a host source checkout.
 *
 * The host's provider also describes, reads and writes namespaces for
 * configuration surfaces. A consumer that installs one section needs only this,
 * which is what keeps the build independent of the host package.
 */
/** Positional arguments the provider's installer accepts. */
type InstallSectionArgs<TValue> = [
  owner: Context,
  namespace: string,
  sectionSchema: unknown,
  entry: TValue,
  hooks: SettingsSectionHooks<TValue>,
]

interface SettingsProviderLike {
  installSection: <TValue>(...args: InstallSectionArgs<TValue>) => void
}

/**
 * Whether a value is the host's settings provider.
 *
 * @param value - Candidate service.
 * @returns True when the value can install a section.
 */
function isSettingsProvider(value: unknown): value is SettingsProviderLike {
  if (!isRecord(value)) {
    return false
  }
  return typeof value.installSection === 'function'
}

/**
 * Project a resolved configuration onto the user-editable fields.
 *
 * This is the composition layer: what the profile declared, and therefore what
 * the resolved value falls back to when the user has saved nothing.
 *
 * @param config - Resolved plugin configuration.
 * @returns The section's base entry.
 */
function baseUserSettings(config: ResolvedConfig): UserSettings {
  return {
    enabled: config.enabled,
    adoptionPrompt: config.adoptionPrompt,
    banks: [...config.banks],
    apiKeyEnv: config.apiKeyEnv,
    model: config.model,
    baseUrl: config.baseUrl,
    confidenceFloor: config.confidenceFloor,
    confirmFloor: config.confirmFloor,
    ledgerLimit: config.ledgerLimit,
  }
}

/**
 * Layer one user section over the profile configuration.
 *
 * The merge runs back through {@link resolveConfig}, so a user value is judged
 * by exactly the same rules as a profile value — including the cross-field
 * requirement that the confidence floor never exceeds the confirm floor.
 *
 * @param base - Resolved configuration from the profile.
 * @param user - The user's section, schema-valid by construction.
 * @returns The effective configuration.
 * @throws {Error} When the merged configuration is not usable.
 */
function resolveUserSettings(base: ResolvedConfig, user: UserSettings): ResolvedConfig {
  return resolveConfig({ ...base, ...user })
}

/** Everything one section installation needs. */
interface InstallSectionOptions {
  /** Scoped plugin context. */
  ctx: Context
  /** Configuration resolved from the profile. */
  base: ResolvedConfig
  /** The running service to reconfigure when the user saves. */
  service: JevService
  /** Builds the resolver for the merged configuration. */
  credentialFor: CredentialFactory
}

/**
 * Install the settings section that makes this plugin configurable per user.
 *
 * The section is optional on purpose. `ctx.inject` runs the callback once a
 * settings provider exists and leaves it pending otherwise, so a profile
 * without one loads the plugin from its composition config alone rather than
 * blocking startup on a service it does not need.
 *
 * @param options - Context, composition config, service, and credential factory.
 */
function installUserSettings(options: InstallSectionOptions): void {
  const { ctx, base, service, credentialFor } = options
  ctx.inject(['settings'], (settingsCtx: Context): void => {
    const settings: unknown = settingsCtx.get('settings')
    if (!isSettingsProvider(settings)) {
      return
    }

    /*
     * The provider hands over a thunk rather than a value, so the section holds
     * the thunk and reads through it after every attach, detach and commit.
     */
    let source: () => UserSettings = () => baseUserSettings(base)

    settings.installSection(
      ctx,
      SETTINGS_NAMESPACE,
      UserSettingsSchema,
      baseUserSettings(base),
      {
        setSource: (current: () => UserSettings): void => {
          source = current
        },
        onChange: (): void => {
          const next = resolveUserSettings(base, source())
          service.reconfigure(next, credentialFor(next))
        },
        validate: (value: UserSettings): void => {
          resolveUserSettings(base, value)
        },
      },
    )
  })
}

export {
  SETTINGS_NAMESPACE,
  UserSettingsSchema,
  baseUserSettings,
  installUserSettings,
  isSettingsProvider,
  resolveUserSettings,
  type CredentialFactory,
  type InstallSectionOptions,
  type SettingsProviderLike,
  type SettingsSectionHooks,
  type UserSettings,
}

