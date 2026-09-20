/**
 * Optional skill companion for `dsh-plugin-system-one`.
 *
 * A skill is routing metadata plus a body the model loads only when the
 * description matches the task. That makes it the right seat for the part of
 * this package that is *judgement* rather than capability: when a Jev call is
 * cheaper than reasoning the answer out, and how to keep the state small.
 *
 * @module dsh-plugin-system-one/skills
 */

import type { Context } from '@deepseek-ai/cordis'

import { BANK_IDS } from './jev/catalog/index.ts'
import { isRecord } from './jev/contracts.ts'
import type { JevService } from './jev/service.ts'

/** Cordis companion plugin name. */
const name = 'jev-skills'

/** Services required before the companion can contribute a skill. */
const inject = ['skills', 'jev']

/** Kebab-case identifier this package's skill is addressed by. */
const SKILL_NAME = 'jev-narrow-judgements'

/** Service name the companions resolve the shared instance through. */
const SERVICE_NAME = 'jev'

/** Tool switches that are on, below which the skill routes to nothing. */
const NO_TOOLS = 0

/**
 * Routing description.
 *
 * Written as the answer to "when should the model load this", not as a summary
 * of the body: the description is the entire routing decision, and a summary
 * that restates the title routes nothing.
 */
const SKILL_DESCRIPTION =
  'How to hand a narrow judgement to TypeSafe Jev instead of reasoning it out in context. '
  + 'Use when classifying, routing, labelling, scoring, or checking a yes/no fact, when a '
  + 'task needs a decision before work starts, or when the token cost of a repeated '
  + 'judgement matters.'

/**
 * Lines whose text depends on how the profile configured this instance.
 *
 * @param service - The plugin service.
 * @returns Markdown lines describing the live thresholds and model.
 */
function configuredLines(service: JevService): string[] {
  return [
    `- Model: \`${service.model}\``,
    `- Confidence floor, below which the answer is not acted on: ${String(service.policy.confidenceFloor)}`,
    `- Confirm floor, at or above which a high-risk answer may act unreviewed: ${String(service.policy.confirmFloor)}`,
    `- Largest accepted state: ${String(service.maxStateChars)} characters`,
  ]
}

/**
 * Build the markdown body loaded when the skill is selected.
 *
 * @param service - The plugin service.
 * @returns The skill body.
 */
function buildSkillContent(service: JevService): string {
  const lines: string[] = [
    '# Handing a judgement to Jev',
    '',
    'Jev is a System One model: it does not write prose, it evaluates typed questions',
    'against a state and returns typed answers with calibrated probabilities. Use it for',
    'judgements, not for generation.',
    '',
    '## This instance',
    '',
    ...configuredLines(service),
    '',
    '## Reach for a Jev tool when',
    '',
    '- a shipped bank covers the decision, so its question definitions stay out of your own',
    '  output (`jev_reason`);',
    '- the decision is one option from a list, a position on an ordered scale, or a yes or no,',
    '  and you have to define the question yourself (`jev_ask`);',
    '- you need several judgements about the same evidence: send them all in one call',
    '  (`jev_ask`);',
    '- you are unsure how to approach a task and want its shape named (`jev_reason`);',
    '- you want to know what this session has already cost (`jev_usage`).',
    '',
    '## Do not reach for a Jev tool when',
    '',
    '- the answer needs code, arithmetic, or a file read: do that directly;',
    '- the judgement needs extended reasoning over many interacting factors: decompose it',
    '  into atomic questions first, or answer it yourself;',
    '- you already know the answer: a call you did not need is still billed.',
    '',
    '## Keep the state small',
    '',
    'Jev bills per input token and evaluates every question against one state. Two habits',
    'follow from that:',
    '',
    '1. Send the deciding evidence, not the transcript. Three relevant lines beat a whole',
    '   conversation, and a smaller state is also a more accurate one.',
    '2. Ask every question you need about that state in one call. Questions are evaluated in',
    '   parallel, so asking five costs barely more than asking one.',
    '',
    '## Read the confidence, not just the answer',
    '',
    'The answer says what; the confidence says whether to act. The reported route collapses',
    'the two into `act`, `verify` or `escalate` using this instance thresholds:',
    '',
    '- `act` — proceed.',
    '- `verify` — proceed, but confirm the specific point before doing anything hard to undo.',
    '- `escalate` — do not act on the answer. Ask the user, gather the missing evidence, or',
    '  answer it yourself.',
    '',
    'Pass risk "high" for destructive or hard-to-reverse actions; that raises the bar before',
    'a route becomes `act`.',
    '',
    '## Question banks',
    '',
    `\`jev_reason\` accepts one of these banks: ${BANK_IDS.join(', ')}.`,
    'Use `reasoning` before starting unfamiliar work, `answer` to audit a draft you wrote,',
    '`request` to classify an incoming request, and `content` before copying a passage',
    'somewhere it will persist.',
    '',
    '## Check what it cost',
    '',
    '`jev_usage` reports the session billed input tokens by tool. Call it before repeating',
    'an expensive judgement, and compare it against what the same judgement would have cost',
    'as reasoning tokens in your own context.',
  ]
  return lines.join('\n')
}

/** One runtime skill contribution, as the host's registry accepts it. */
interface SkillRegistration {
  /** Kebab-case identifier used to address the skill. */
  name: string
  /** Short routing description shown by discovery consumers. */
  description: string
  /** Markdown instruction body loaded when the skill is selected. */
  content: string
  /** Discovery source that produced this skill. */
  source: string
  /** Invocation controls; omission permits both surfaces. */
  invocation?: { modelInvocable: boolean; userInvocable: boolean }
}

/**
 * Minimal skill-registry contract used without a host source checkout.
 *
 * The host's registry also lists, gets and observes a merged catalog from
 * several providers. A companion contributing one runtime skill needs only
 * `register`, and modelling only that is what keeps the build independent of
 * the host package.
 */
interface SkillRegistry {
  register: (skill: SkillRegistration) => () => void
}

/**
 * Whether a value is a skill registry.
 *
 * @param value - Candidate service.
 * @returns True when the value implements the narrow registry contract.
 */
function isSkillRegistry(value: unknown): value is SkillRegistry {
  if (!isRecord(value)) {
    return false
  }
  return typeof value.register === 'function'
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
    typeof value.model === 'string'
    && typeof value.maxStateChars === 'number'
    && isRecord(value.policy)
    && isRecord(value.tools)
  )
}

/**
 * Resolve the host's skill registry through Cordis's named service lookup.
 *
 * @param ctx - Cordis context carrying the host service.
 * @returns The host skill registry.
 * @throws {Error} When the companion is loaded without its host service.
 */
function getSkillRegistry(ctx: Context): SkillRegistry {
  const registry: unknown = ctx.get('skills')
  if (!isSkillRegistry(registry)) {
    throw new Error('skill companion requires the "skills" service')
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
  const service: unknown = ctx.get(SERVICE_NAME)
  if (!isJevService(service)) {
    throw new Error(
      'skill companion requires the "jev" service; mount the dsh-plugin-system-one row first',
    )
  }
  return service
}

/**
 * Register this package's skill on its own Cordis fiber.
 *
 * @param ctx - Cordis context carrying the `skills` and `jev` services.
 */
function apply(ctx: Context): void {
  const registry = getSkillRegistry(ctx)
  const service = getJevService(ctx)
  const enabledTools = Object.values(service.tools).filter(Boolean).length

  if (enabledTools === NO_TOOLS) {
    ctx.logger.warn(
      'dsh-plugin-system-one skill is mounted but every tool switch is off; the skill routes to nothing',
    )
  }

  ctx.effect(
    () =>
      registry.register({
        name: SKILL_NAME,
        description: SKILL_DESCRIPTION,
        content: buildSkillContent(service),
        source: 'runtime',
        invocation: { modelInvocable: true, userInvocable: true },
      }),
    'skills: jev registration',
  )
}

export { SKILL_DESCRIPTION, SKILL_NAME, apply, buildSkillContent, inject, name, configuredLines }

