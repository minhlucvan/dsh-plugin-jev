/**
 * Browser client entry: registration only.
 *
 * The entry names the plugin, declares the host services it needs, and seats
 * one component in one slot. It holds no rendering logic and no state: the page
 * receives the settings scope, the translator and the plugin's own routes as
 * props, and every registration is owned by this fiber so disposal is
 * observable.
 *
 * @module dsh-plugin-jev/client
 */

import type { Context } from '@deepseek-ai/cordis'

import { createUsageApi } from './api.ts'
import type { SettingsScope } from './contracts.ts'
import {
  isLocaleService,
  isSettingsScopeBinder,
  isSlotsService,
} from './contracts.ts'
import { LOCALE_NAMESPACE, locales } from './locale.ts'
import { SettingsPage } from './settings-page.tsx'
import type { ClientSettings } from './settings.ts'
import { normalizeSettings } from './settings.ts'

/** Client plugin name; keep this stable after publishing. */
const name = 'jev-client'

/** Host services required before the client can seat anything. */
const inject = ['locale', 'settingsScope', 'slots']

/** The slot this feature seats a component in. */
const SLOT_NAME = 'settings.section'

/** This feature's seat within that slot. */
const SLOT_ID = 'dsh-plugin-jev'

/** Seat order among the slot's other seats. */
const SLOT_ORDER = 20

/** Settings namespace this feature owns. */
const SETTINGS_NAMESPACE = 'dsh-plugin-jev'

/**
 * Resolve a host service through its narrow local contract.
 *
 * @param value - Whatever the named lookup returned.
 * @param guard - Type guard for the narrow contract.
 * @param service - Service name, for a failure that names the cause.
 * @returns The narrowed service.
 * @throws {Error} When the service is absent or does not match its contract.
 */
function requireService<TService>(
  value: unknown,
  guard: (candidate: unknown) => candidate is TService,
  service: string,
): TService {
  if (!guard(value)) {
    throw new Error(`client requires the "${service}" service`)
  }
  return value
}

/**
 * Wrap a raw scope so callers always see a complete settings value.
 *
 * Normalizing at this boundary is what lets the page assume a valid snapshot:
 * missing, legacy and wrongly-typed stored values are resolved once here rather
 * than defended against in every render.
 *
 * @param raw - The scope bound by the host.
 * @returns A scope whose snapshots are normalized.
 */
function normalizedScope(
  raw: SettingsScope<unknown>,
): SettingsScope<ClientSettings> {
  return {
    getSnapshot: () => normalizeSettings(raw.getSnapshot()),
    subscribe: (listener: () => void) => raw.subscribe(listener),
    mutate: async (value: ClientSettings): Promise<void> => {
      await raw.mutate(value)
    },
  }
}

/**
 * Register this package's browser face.
 *
 * Every registration goes through `ctx.effect`, which is what ties it to the
 * fiber: a synchronous `apply` that merely _returns_ a disposer is not treated
 * as one, so the registrations would survive disposal and leak across reloads.
 *
 * @param ctx - Client Cordis context carrying the host services.
 */
function apply(ctx: Context): void {
  const locale = requireService(ctx.get('locale'), isLocaleService, 'locale')
  const slots = requireService(ctx.get('slots'), isSlotsService, 'slots')
  const binder = requireService(
    ctx.get('settingsScope'),
    isSettingsScopeBinder,
    'settingsScope',
  )

  ctx.effect(
    () => locale.register(LOCALE_NAMESPACE, locales),
    'client: dictionaries',
  )

  const translate = locale.bind(LOCALE_NAMESPACE)
  const scope = normalizedScope(binder.bind({ namespace: SETTINGS_NAMESPACE }))
  /*
   * The route reads are stateless, so one set per fiber is enough: every mount
   * of the page shares the same read-only endpoints, and nothing here holds
   * state that would leak across a reload.
   */
  const api = createUsageApi()

  /*
   * The callback runs once the slot exists, which may be after this function has
   * returned. Registering inside an effect keeps the seat tied to the fiber
   * either way, so a later disposal still releases it.
   */
  slots.inject(SLOT_NAME, () => {
    ctx.effect(
      () =>
        slots.register(
          {
            name: SLOT_NAME,
            id: SLOT_ID,
            order: SLOT_ORDER,
            label: () => translate('nav'),
            inject: () => ({ scope, translate, api }),
          },
          SettingsPage,
        ),
      'client: settings section',
    )
  })
}

export { apply, inject, name }
