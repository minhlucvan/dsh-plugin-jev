/**
 * Optional system-prompt companion for `dsh-plugin-system-one`.
 *
 * A tool description tells the model what a tool does. It does not tell the
 * model to *prefer* it, and a model that has reasoned its way through thousands
 * of classifications in its own context will keep doing that by default.
 *
 * TypeSafe's own guidance is that System One is for AI-powered software rather
 * than for agents: code owns the control flow, and the model is asked only for
 * narrow judgements over unstructured input. This section is that doctrine put
 * where the agent will read it — decompose before asking, ask everything about
 * one state at once, act on the route, and keep the work.
 *
 * It sits in every system prompt, so it is written to be worth its tokens and is
 * one switch away from being removed.
 *
 * @module dsh-plugin-system-one/prompt
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
      'prompt companion requires the "jev" service; mount the dsh-plugin-system-one row first',
    )
  }
  return service
}

/**
 * Build the guidance text.
 *
 * Written in the imperative and in the order the model needs it: the division of
 * labour, how to decompose, which call shape to prefer, how to read the answer,
 * and what stays with the agent.
 *
 * @param service - The plugin service, for the model the profile configured.
 * @returns The section text.
 */
function buildGuidance(service: JevService): string {
  const opener =
    `TypeSafe System One (${service.model}) answers typed questions about a state and`
  const lines: string[] = [
    '## Delegate the judgement, keep the work',
    '',
    opener,
    'returns a typed decision with a calibrated confidence. It writes no',
    'deliberation, so a narrow judgement costs a fraction of a reasoning pass and',
    'returns in about a tenth of a second. You decide what to do; it decides what',
    'is true.',
    '',
    '### Ask the narrow question, not the broad one',
    '',
    'A System One model is reliable on a judgement a knowledgeable reader could',
    'make in a second, and unreliable on "think about this". Decompose. Rather',
    'than asking whether a change is risky, ask how far its effects reach, whether',
    'it needs a migration, and how hard it must be checked — then combine those',
    'yourself. Each factor becomes something you can see, question, and re-weight.',
    '',
    '`jev_ask` carries any of the three question types — one option from a list,',
    'a position on an ordered scale, or a yes or no whose probability is itself',
    'the signal — so express the questions you need and send them together.',
    '',
    '### Prefer a shipped bank',
    '',
    '`jev_reason` runs a bank of atomic questions written for a recurring decision:',
    'the shape of a task, the triage of a failure, a change before review. A bank',
    'keeps the question definitions out of your own output, and generated tokens',
    'are the expensive ones. Reach for a bank when one covers the decision; when',
    'none does, express the questions with `jev_ask` and ask them all in one call.',
    '',
    '### Ask everything about one state at once',
    '',
    'Questions are evaluated in parallel against the same state and the state is',
    'billed once. One call carrying five questions costs barely more than one',
    'carrying one, and no answer becomes hidden context for another.',
    '',
    '### Act on the route, not only the answer',
    '',
    'Every answer carries a `route`. `act` means proceed. `verify` means the answer',
    'is probably right but the stakes are high — confirm that specific point',
    'before doing anything hard to undo. `escalate` means do not act on it: ask, or',
    'gather the evidence it says is missing. Pass risk "high" for destructive or',
    'irreversible actions; that raises the bar before a route becomes `act`.',
    '',
    '### Keep the work yourself',
    '',
    'Reading files, running tests, editing, arithmetic and anything with a side',
    'effect stay with you. So does the final call when a decision is genuinely',
    'multi-factor — System One supplies the factors, weighted how you choose, and',
    'it never picks your next action for you.',
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
      'dsh-plugin-system-one prompt guidance is mounted but disabled; the agent was not told to prefer Jev',
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
