import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

/** Resolve the `#src` prefix the suites import through. */
const srcAlias = {
  '#src': fileURLToPath(new URL('./src', import.meta.url)),
}

/**
 * Two projects, because the two halves of this package need different worlds.
 *
 * The host, client-state and benchmark suites are pure Node: they touch no DOM,
 * and running them in a browser emulator would only slow them down and hide
 * accidental DOM coupling. The component suites render a real React tree, so
 * they need a DOM plus the automatic `cleanup` that keeps one test's rendered
 * output from leaking into the next.
 */
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: srcAlias },
        test: {
          name: 'node',
          include: ['tests/**/*.test.ts'],
          environment: 'node',
          pool: 'forks',
        },
      },
      {
        resolve: { alias: srcAlias },
        test: {
          name: 'dom',
          include: ['tests/**/*.test.tsx'],
          environment: 'jsdom',
          pool: 'forks',
          setupFiles: ['tests/setup-dom.ts'],
        },
      },
    ],
  },
})
