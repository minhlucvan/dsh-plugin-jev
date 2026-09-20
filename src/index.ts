/**
 * Standalone function plugin for DeepSeek Harness.
 *
 * Mounting this row provides the `jev` service that the `./tools`,
 * `./skills`, `./commands` and `./routes` companions inject.
 *
 * @module dsh-plugin-jev
 */

/** Cordis plugin name; keep this stable after publishing. */
const name = 'jev'

/** Services that must exist before the plugin is applied. */
const inject: string[] = []

export { Config } from './config.ts'
export type { JevConfig, ResolvedConfig, ResolvedToolSwitches } from './config.ts'
export { apply } from './runtime.ts'
export type { Environment, PluginRuntime } from './runtime.ts'
export type { JevEvaluation, JevQuestion, JevState } from './jev/contracts.ts'
export type { JevService } from './jev/service.ts'
export { inject, name }
