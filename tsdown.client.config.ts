import { defineConfig } from 'tsdown'

/**
 * Build the browser face separately from the host entries.
 *
 * The client cannot share the host config for two reasons. It is the only entry
 * that must be CJS — the host's ModuleLoader hands the module a CommonJS-shaped
 * `require` — and it must bundle for a browser target with `react` and
 * `react/jsx-runtime` left external, because the host supplies those, not this
 * package.
 *
 * `lib/client.cjs` is an intermediate: `scripts/wrap-client.mjs` turns it into
 * the self-registering `lib/client.js` the host actually serves.
 */
export default defineConfig({
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: ['cjs'],
  platform: 'browser',
  target: 'es2022',
  fixedExtension: false,
  dts: true,
  // The host entries are built by the other config; this run must add to them.
  clean: false,
  deps: { neverBundle: ['react', 'react/jsx-runtime', '@deepseek-ai/cordis'] },
  tsconfig: 'tsconfig.json',
})
