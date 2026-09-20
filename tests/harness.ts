import { Context } from '@deepseek-ai/cordis'
import { vi } from 'vitest'

import type { JevConfig } from '#src/config'
import { Config, apply, inject, name } from '#src/index'
import { createJevService } from '#src/jev/service'
import type { JevService, JevServiceDeps } from '#src/jev/service'
import { resolveConfig } from '#src/config'

const plugin = { Config, apply, inject, name }

/** Credential the harness installs so activation does not fail loudly. */
const TEST_API_KEY = 'test-key'

/** Environment variable the default configuration reads. */
const DEFAULT_API_KEY_ENV = 'TYPESAFE_API_KEY'

interface PluginHarness {
  ctx: Context
  fiber: Awaited<ReturnType<Context['plugin']>>
  info: ReturnType<typeof vi.spyOn>
  warn: ReturnType<typeof vi.spyOn>
  dispose: () => Promise<void>
}

/**
 * Mount the production plugin with an observable host logger and a credential.
 *
 * The plugin reads the process environment at activation, so the harness
 * installs a fake key and puts the previous value back afterwards rather than
 * leaving a global behind for the next suite.
 *
 * @param config - Partial plugin configuration.
 * @returns The mounted context, its logger spies, and a disposer.
 */
async function createPluginHarness(config: JevConfig = {}): Promise<PluginHarness> {
  const previous = process.env[DEFAULT_API_KEY_ENV]
  process.env[DEFAULT_API_KEY_ENV] = TEST_API_KEY
  const ctx = new Context()
  const info = vi.spyOn(ctx.logger, 'info').mockReturnValue()
  const warn = vi.spyOn(ctx.logger, 'warn').mockReturnValue()
  const fiber = await ctx.plugin(plugin, config)

  return {
    ctx,
    fiber,
    info,
    warn,
    async dispose(): Promise<void> {
      try {
        await fiber.dispose()
      } finally {
        info.mockRestore()
        warn.mockRestore()
        if (previous === undefined) {
          Reflect.deleteProperty(process.env, DEFAULT_API_KEY_ENV)
        } else {
          process.env[DEFAULT_API_KEY_ENV] = previous
        }
      }
    },
  }
}

/**
 * Build a real service whose transport is a fake, so tests exercise the
 * production ledger and validation without a network.
 *
 * @param deps - Transport, clock and backoff overrides; the credential is supplied here.
 * @returns A service wired to the supplied fakes.
 */
function createTestService(deps: Omit<JevServiceDeps, 'apiKey'>): JevService {
  return createJevService(resolveConfig(), {
    ...deps,
    apiKey: TEST_API_KEY,
  })
}

export { DEFAULT_API_KEY_ENV, TEST_API_KEY, createPluginHarness, createTestService, plugin }

