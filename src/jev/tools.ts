/**
 * Assembly of the Jev tool face.
 *
 * The profile decides which tools exist through the `tools` switches, so a
 * deployment that only wants classification never pays prompt budget for the
 * rest of the catalog.
 *
 * @module dsh-plugin-jev/jev/tools
 */

import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

import type { JevService } from './service.ts'
import { createCheckTool, createClassifyTool, createScoreTool } from './tool-primitives.ts'
import { createAskTool, createReasonTool } from './tool-reasoning.ts'
import { createCompareTool } from './tool-compare.ts'
import { createUsageTool } from './tool-usage.ts'

/**
 * Build every tool the profile enabled.
 *
 * @param service - The plugin service.
 * @returns Registry-ready definitions, in catalog order.
 */
function createJevTools(service: JevService): ToolDefinition[] {
  const definitions: ToolDefinition[] = []
  const switches = service.tools
  if (switches.classify) {
    definitions.push(createClassifyTool(service))
  }
  if (switches.score) {
    definitions.push(createScoreTool(service))
  }
  if (switches.check) {
    definitions.push(createCheckTool(service))
  }
  if (switches.ask) {
    definitions.push(createAskTool(service))
  }
  if (switches.reason) {
    definitions.push(createReasonTool(service))
  }
  if (switches.compare) {
    definitions.push(createCompareTool(service))
  }
  if (switches.usage) {
    definitions.push(createUsageTool(service))
  }
  return definitions
}

export { createJevTools }

