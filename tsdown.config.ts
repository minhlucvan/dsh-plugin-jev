import { defineConfig } from 'tsdown'

/**
 * Build the published host entries directly from `src/`. TypeScript performs
 * the separate no-emit checks; tsdown owns runtime and declaration output.
 *
 * Every companion is its own entry so the core bundle stays free of the DSH
 * tool stack, the browser carrier, the command registry and the skill registry.
 */
export default defineConfig({
  entry: {
    benchmark: 'src/benchmark.ts',
    commands: 'src/commands.ts',
    index: 'src/index.ts',
    invariant: 'src/invariant.ts',
    routes: 'src/routes.ts',
    skills: 'src/skills.ts',
    tools: 'src/tools.ts',
  },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: true,
  clean: true,
  /*
   * `neverBundle` keeps a package as an import in the output instead of
   * inlining it. The host supplies these, so a private copy would be a second
   * instance rather than the same one the consumer already runs.
   */
  deps: {
    dts: { neverBundle: true },
    neverBundle: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-tools', '@deepseek-ai/schemastery'],
  },
  tsconfig: 'tsconfig.json',
})
