/**
 * Optional command companion for `dsh-plugin-jev`.
 *
 * A slash command runs against the receiving agent without being sent to the
 * model, which makes it the right shape for the one thing an operator wants to
 * check directly: what this session's judgements have cost. The accounting is
 * read synchronously from the ledger, so reporting it costs no tokens at all.
 *
 * @module dsh-plugin-jev/commands
 */

import type { Context } from '@deepseek-ai/cordis'

import { isRecord } from './jev/contracts.ts'
import type { JevService } from './jev/service.ts'
import type { JevUsageTotals } from './jev/ledger.ts'

/** Cordis companion plugin name. */
const name = 'jev-commands'

/** Services required before the companion can register anything. */
const inject = ['commands', 'jev']

/** The command this package claims, without its leading slash. */
const COMMAND_NAME = 'jev'

/** Subcommand that zeroes the counters. */
const RESET_ARGUMENT = 'reset'

/** Subcommand that reports the token accounting. */
const USAGE_ARGUMENT = 'usage'

/** Fixed-point digits used when rendering a token total in millions. */
const MTOK_DIGITS = 4

/** Tokens in one million, matching TypeSafe's per-Mtok price unit. */
const TOKENS_PER_MTOK = 1_000_000

/** A command that completed and wants its text shown to the operator. */
interface CommandSuccess {
  /** Discriminant the dispatching UI switches on. */
  kind: 'success'
  /** Text rendered directly by that UI. */
  text: string
}

/** A command that refused, with the reason the operator needs to see. */
interface CommandFailure {
  /** Discriminant the dispatching UI switches on. */
  kind: 'error'
  /** Why the command could not run. */
  text: string
}

/** What a command handler returns. */
type CommandResult = CommandSuccess | CommandFailure

/** The slice of the invocation this command reads. */
interface CommandInvocation {
  /** Exact text following the command name, including separator whitespace. */
  rawInput: string
}

/** One command registration, as the host's registry accepts it. */
interface CommandDefinition {
  /** Lowercase command name without the leading slash. */
  name: string
  /** Human-readable summary used in discovery UI. */
  description: string
  /** Optional input hint. */
  input?: { hint: string }
  /** Runs the command against the receiving agent. */
  handler: (invocation: CommandInvocation) => CommandResult
}

/**
 * Minimal command-registry contract used without a host source checkout.
 *
 * The host's registry also lists, resolves and scopes commands per agent; a
 * companion that registers one global command needs none of that.
 */
interface CommandRegistry {
  register: (definition: CommandDefinition) => () => void
}

/**
 * Whether a value is a command registry.
 *
 * @param value - Candidate service.
 * @returns True when the value implements the narrow registry contract.
 */
function isCommandRegistry(value: unknown): value is CommandRegistry {
  if (!isRecord(value)) {
    return false
  }
  return typeof value.register === 'function'
}

/**
 * Whether a value is the Jev service this package provides.
 *
 * @param value - Candidate service.
 * @returns True when the value can report and reset usage.
 */
function isJevService(value: unknown): value is JevService {
  if (!isRecord(value)) {
    return false
  }
  return typeof value.usage === 'function' && typeof value.resetUsage === 'function'
}

/**
 * Resolve the host's command registry through Cordis's named service lookup.
 *
 * @param ctx - Cordis context carrying the host service.
 * @returns The host command registry.
 * @throws {Error} When the companion is loaded without its host service.
 */
function getCommandRegistry(ctx: Context): CommandRegistry {
  const registry: unknown = ctx.get('commands')
  if (!isCommandRegistry(registry)) {
    throw new Error('command companion requires the "commands" service')
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
      'command companion requires the "jev" service; mount the dsh-plugin-jev row first',
    )
  }
  return service
}

/**
 * Render the cumulative totals as one operator-facing line.
 *
 * @param totals - Cumulative accounting.
 * @returns A single line naming calls, billed tokens, and the equivalent Mtok.
 */
function formatTotals(totals: JevUsageTotals): string {
  const mtok = totals.inputTokens / TOKENS_PER_MTOK
  return (
    `${String(totals.calls)} calls, ${String(totals.inputTokens)} input tokens billed `
    + `(${mtok.toFixed(MTOK_DIGITS)} Mtok), ${String(totals.outputTokens)} output tokens returned free`
  )
}

/**
 * Run the `/jev` command.
 *
 * @param service - The Jev service.
 * @param invocation - The settled invocation.
 * @returns A success carrying the report, or an error explaining the refusal.
 */
function runJevCommand(service: JevService, invocation: CommandInvocation): CommandResult {
  const argument = invocation.rawInput.trim().toLowerCase()

  if (argument === RESET_ARGUMENT) {
    service.resetUsage()
    return { kind: 'success', text: `${COMMAND_NAME}: token accounting reset` }
  }

  if (argument === USAGE_ARGUMENT) {
    return {
      kind: 'success',
      text: `${COMMAND_NAME}: ${formatTotals(service.usage().totals)}`,
    }
  }

  return {
    kind: 'error',
    text:
      `/${COMMAND_NAME} accepts "${USAGE_ARGUMENT}" or "${RESET_ARGUMENT}"; `
      + `received "${argument}"`,
  }
}

/**
 * Register this package's slash command on its own Cordis fiber.
 *
 * @param ctx - Cordis context carrying the `commands` and `jev` services.
 */
function apply(ctx: Context): void {
  const registry = getCommandRegistry(ctx)
  const service = getJevService(ctx)
  ctx.effect(
    () =>
      registry.register({
        name: COMMAND_NAME,
        description:
          'Report the TypeSafe Jev token accounting for this session without sending '
          + 'anything to the model. Use "/jev reset" to start a fresh measurement.',
        input: { hint: `${USAGE_ARGUMENT} | ${RESET_ARGUMENT}` },
        handler: invocation => runJevCommand(service, invocation),
      }),
    'commands: jev registration',
  )
}

export { COMMAND_NAME, apply, formatTotals, inject, name, runJevCommand }

