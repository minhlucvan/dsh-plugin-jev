/**
 * Assembly of the Jev tool face: `jev_ask`, `jev_reason` and `jev_usage`.
 *
 * The face ships three tools rather than seven because a tool schema is paid
 * for in the system prompt on every turn, and every extra tool is one more
 * routing decision the model can get wrong. Two measurements justify the cut:
 *
 * 1. The `jev_compare` fan-out tool lost its benchmark — 75% more cost and
 *    177% more time than reasoning the same ranking out — because the calling
 *    model had to write every candidate and every question into its own tool
 *    call. It was also redundant: `jev_ask` expresses the same nine Score
 *    questions, so the composite pattern now belongs to the caller rather than
 *    to a dedicated schema.
 * 2. `jev_classify`, `jev_score` and `jev_check` were convenience wrappers
 *    that each sent exactly one question to `jev_ask`. They bought three
 *    schemas and three routing choices to save the model from writing a small
 *    question object, which is the opposite of the doctrine this package
 *    teaches: decompose, then batch every question about one state into a
 *    single call.
 *
 * What survives is the shape the same benchmark shows winning: `jev_reason`
 * keeps a whole question bank inside the package (+56% cost, +44% time against
 * reasoning in context), `jev_ask` carries any typed question the caller has
 * to define, and `jev_usage` reports what the session has cost.
 *
 * The profile still decides which of the three exist through the `tools`
 * switches, so a deployment that only wants accounting never pays prompt
 * budget for the rest.
 *
 * @module dsh-plugin-system-one/jev/tools
 */

import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

import type { JevService } from './service.ts'
import { createAskTool, createReasonTool } from './tool-reasoning.ts'
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
  if (switches.ask) {
    definitions.push(createAskTool(service))
  }
  if (switches.reason) {
    definitions.push(createReasonTool(service))
  }
  if (switches.usage) {
    definitions.push(createUsageTool(service))
  }
  return definitions
}

export { createJevTools }
