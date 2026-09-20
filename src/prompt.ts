/**
 * Optional system-prompt companion for `dsh-plugin-jev`.
 *
 * A tool description tells the model what a tool does. It does not tell the
 * model to *prefer* it, and a model that has reasoned its way through thousands
 * of classifications in its own context will keep doing that by default. This
 * section is the nudge: it states the economics — a typed decision costs a
 * fraction of a reasoning pass and returns in one round trip — and names the
 * shapes that should be delegated rather than reasoned about.
 *
 * It sits in every system prompt, so it is written to be worth its tokens and
 * is one switch away from being removed.
 *
 * @module dsh-plugin-jev/prompt
 */

import type { Context } from '@deepseek-ai/cordis'

import { isRecord } from './jev/contracts.ts'
import type { JevService } from './jev/service.ts'

/** Cordis companion plugin name. */
const name = 'jev-prompt'

/** Services required before the companion can contribute guidance. */
const inject = ['systemPrompt', 'jev']

/** Unique section name; a duplicate registration throws. */
const SECTION_NAME = 'jev-decision-delegation'

/**
 * Placement among the ordered sections.
 *
 * After the per-tool guidance (which ends at 2900) and before the generated-SDK
 * collapse at 5000, so the model reads what the tools are for before it reads
 * how they are reached.
 */
const SECTION_ORDER = 3000

/** One contributed section of the system prompt. */
interface PromptSection {
  /** Unique name. */
  name: string
  /** Ascending sort order. */
  order: number
  /** Section text. */
  text: string
}

/**
 * Minimal system-prompt registry contract used without a host source checkout.
 *
 * The host's service also assembles contexts, tool schemas and variables; a
 * companion contributing one section needs only `section`, and modelling only
 * that is what keeps the build independent of the host package.
 */
interface SystemPromptLike {
  section: (section: PromptSection) => () => void
}

/**
 * Whether a value is the host's system-prompt registry.
 *
 * @param value - Candidate service.
 * @returns True when the value can register a section.
 */
function isSystemPromptLike(value: unknown): value is SystemPromptLike {
  if (!isRecord(value)) {
    return false
  }
  return typeof value.section === 'function'
}

/**
 * Whether a value is the Jev service this package provides.
 *
 * @param value - Candidate service.
 * @returns True when the value carries the members this companion reads.
 */
function isJevService(value: unknown): value is JevService {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.enabled === 'boolean'
    && typeof value.model === 'string'
    && isRecord(value.tools)
  )
}

/**
 * Resolve the host's system-prompt registry.
 *
 * @param ctx - Cordis context carrying the host service.
 * @returns The host registry.
 * @throws {Error} When the companion is loaded without its host service.
 */
function getSystemPrompt(ctx: Context): SystemPromptLike {
  const registry: unknown = ctx.get('systemPrompt')
  if (!isSystemPromptLike(registry)) {
    throw new Error('prompt companion requires the "systemPrompt" service')
  }
  return registry
}

/**
 * Resolve the Jev service this package provided.
 *
 * @param ctx - Cordis context carrying the package service.
 * @returns The Jev service.
 * @throws {Error} When the companion is mounted without the core plugin row.
 */
function getJevService(ctx: Context): JevService {
  const service: unknown = ctx.get('jev')
  if (!isJevService(service)) {
    throw new Error(
      'prompt companion requires the "jev" service; mount the dsh-plugin-jev row first',
    )
  }
  return service
}

/**
 * Build the guidance text.
 *
 * Written in the imperative and in the order the model needs it: the principle,
 * the shapes worth delegating, the batching rule, how to read the answer, and
 * the cases where delegating is the wrong call.
 *
 * @param service - The plugin service, for the model the profile configured.
 * @returns The section text.
 */
function buildGuidance(service: JevService): string {
  const lines: string[] = [
    '## Delegate a decision instead of reasoning it out',
    '',
    `TypeSafe Jev (${service.model}) answers typed questions about a state and returns a`,
    'typed decision with a calibrated confidence. It writes no deliberation, so a',
    'narrow judgement costs a fraction of a reasoning pass and comes back in one',
    'round trip. When a decision resolves to one of a known set of answers, prefer',
    'delegating it over working it out in your own context.',
    '',
    'Reach for a Jev tool first when:',
    '',
    '- the answer is one option from a list you can name — `jev_classify`;',
    '- the answer is a position on a scale you can describe — `jev_score`;',
    '- the answer is yes or no and the probability itself is the signal — `jev_check`;',
    '- the shape of the task is unclear and you want it named before starting — `jev_reason`.',
    '',
    'Prefer a shipped `jev_reason` bank over `jev_ask`. A bank keeps the question',
    'definitions out of your own output, and generated tokens are the expensive',
    'ones — that is the difference between delegating being cheaper and being',
    'dearer than reasoning it out.',
    '',
    'Ask every question you need about one state in a single call: they are',
    'evaluated in parallel and the state is billed once.',
    '',
    'Read the `route` that comes back, not only the answer. `act` means proceed;',
    '`verify` means confirm before anything hard to undo; `escalate` means do not act',
    'on it — ask, or gather the evidence it is missing.',
    '',
    'Do the work yourself when the answer needs a tool, a file, arithmetic, or',
    'extended reasoning over several interacting factors. Decompose those into',
    'atomic questions rather than asking one broad one.',
  ]
  return lines.join('\n')
}

/**
 * Register this package's prompt section on its own Cordis fiber.
 *
 * Nothing is registered when the plugin is disabled or the guidance is turned
 * off, because an empty section would still occupy a slot in every prompt.
 *
 * @param ctx - Cordis context carrying the `systemPrompt` and `jev` services.
 */
function apply(ctx: Context): void {
  const registry = getSystemPrompt(ctx)
  const service = getJevService(ctx)
  if (!service.enabled || !service.adoptionPrompt) {
    ctx.logger.warn(
      'dsh-plugin-jev prompt guidance is mounted but disabled; the agent was not told to prefer Jev',
    )
    return
  }
  const text = buildGuidance(service)
  ctx.effect(
    () => registry.section({ name: SECTION_NAME, order: SECTION_ORDER, text }),
    'prompt: jev guidance',
  )
}

export { SECTION_NAME, SECTION_ORDER, apply, buildGuidance, inject, name }

