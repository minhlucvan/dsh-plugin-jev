/**
 * The general tools: `jev_ask` and `jev_reason`.
 *
 * These are where the token argument actually lands. `jev_ask` sends many
 * questions about one state in a single request, and `jev_reason` sends a whole
 * pre-written question bank, so the state is billed once and the calling model
 * receives a handful of short lines instead of producing a reasoning trace of
 * its own.
 *
 * @module dsh-plugin-jev/jev/tools/reasoning
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

import { BANK_IDS, getBank } from './catalog/index.ts'
import type { JevAnswer, JevJson } from './contracts.ts'
import { describeAnswer, effectiveConfidence, strictestRoute } from './routing.ts'
import type { JevRoute } from './routing.ts'
import type { JevService } from './service.ts'
import {
  oneLine,
  parseQuestionMap,
  riskOf,
  routeForAnswer,
  textBlock,
} from './tool-support.ts'

/** Bank used when the caller does not name one. */
const DEFAULT_BANK_ID = 'reasoning'

/** Answer summaries are joined one per line. */
const SUMMARY_SEPARATOR = '\n'

/**
 * Read the scalar an answer carries.
 *
 * @param answer - One answer from an evaluation.
 * @returns The Choice option, the Score value, or the Noul probability.
 */
function answerValue(answer: JevAnswer): JevJson {
  if (answer.type === 'choice') {
    return answer.choice
  }
  if (answer.type === 'score') {
    return answer.score
  }
  return answer.noul
}

/**
 * Build the mixed-question tool.
 *
 * @param service - The plugin service.
 * @returns A registry-ready tool definition.
 */
function createAskTool(service: JevService): ToolDefinition {
  return defineTool({
    name: 'jev_ask',
    description:
      'Ask TypeSafe Jev one or more typed questions about one state in a single request, '
      + 'instead of reasoning the answers out yourself. Use it for any narrow judgement you '
      + 'can phrase: which option applies, where something sits on a scale, or whether a '
      + 'statement holds. Send every question you need about that state in this one call — '
      + 'the questions are evaluated in parallel and the state is billed once, so five '
      + 'questions cost barely more than one. Each entry of "questions" is an object with '
      + '"type", "instructions" and "criteria". Type "choice" takes an option map, for '
      + 'example { "billing": "the charge is wrong", "access": "the user cannot sign in" }; '
      + 'type "score" takes ordered levels, lowest first, for example ["none", "partial", '
      + '"total"]; type "noul" is a yes/no statement whose optional criteria { "true": ..., '
      + '"false": ... } pin the boundary cases. Every answer comes back as one short line '
      + 'with its own route, and the strictest route is reported separately.',
    parameters: {
      state: {
        type: 'json',
        description:
          'The evidence every question is judged against: a string, or an object of named '
          + 'fields. Jev bills per input token, so send the deciding evidence and not the '
          + 'whole transcript.',
        required: true,
      },
      questions: {
        type: 'json',
        description:
          'A map of answer id to question. Each question is an object with "type" of '
          + '"choice", "score", or "noul"; "instructions" as text, an object, or an array; '
          + 'and "criteria" — an option map for choice, an ordered level array for score, '
          + 'and an optional { "true", "false" } description for noul.',
        required: true,
      },
      risk: {
        type: 'string',
        enum: ['low', 'high'],
        description: 'How costly a wrong answer is. Defaults to "low".',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          model: { type: 'string', required: true },
          summary: { type: 'string', required: true },
          answers: { type: 'json', required: true },
          routes: { type: 'json', required: true },
          route: { type: 'string', required: true },
          inputTokens: { type: 'integer', required: true },
          outputTokens: { type: 'integer', required: true },
        },
      },
      render: (_args, value) =>
        textBlock(`${value.summary}\nroute=${value.route} model=${value.model}`),
    },
    presentCall: () => ({
      card: 'generic',
      kind: 'other',
      title: 'Jev ask: typed questions',
    }),
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const questions = parseQuestionMap(args.questions)
      const risk = riskOf(args.risk)
      const evaluation = await service.evaluate({
        state: args.state,
        questions,
        source: 'jev_ask',
        signal: exec.signal,
      })

      const lines: string[] = []
      const routes: Record<string, JevJson> = {}
      const collected: JevRoute[] = []
      for (const [id, answer] of Object.entries(evaluation.answers)) {
        const route = routeForAnswer(service, answer, risk)
        routes[id] = route
        collected.push(route)
        lines.push(describeAnswer(id, answer))
      }

      return {
        model: evaluation.model,
        summary: lines.join(SUMMARY_SEPARATOR),
        answers: evaluation.answers,
        routes,
        route: strictestRoute(collected),
        inputTokens: evaluation.usage.input_tokens,
        outputTokens: evaluation.usage.output_tokens,
      }
    },
  })
}

/**
 * Build the reasoning-bank tool.
 *
 * @param service - The plugin service.
 * @returns A registry-ready tool definition.
 */
function createReasonTool(service: JevService): ToolDefinition {
  return defineTool({
    name: 'jev_reason',
    description:
      'Classify a task using a built-in bank of atomic questions, and get back a decision, '
      + 'a confidence, and a recommended route. Use it before starting work whose shape you '
      + 'are unsure of: whether the context is sufficient, whether the answer needs data you '
      + 'do not have, how costly a mistake would be, and whether the task should be '
      + 'decomposed. Much cheaper than reasoning it out yourself, because the questions are '
      + 'sent once and the answers come back as short lines.',
    parameters: {
      state: {
        type: 'json',
        description:
          'The task and its available context: the request text plus whatever evidence '
          + 'you would judge it against.',
        required: true,
      },
      bank: {
        type: 'string',
        enum: [...service.banks],
        description:
          'Which question bank to run. "reasoning" classifies the shape of a task, "answer" '
          + 'audits a draft you wrote, "request" classifies an incoming user request, and '
          + '"content" classifies a passage before it is copied or logged. Defaults to '
          + '"reasoning".',
      },
      risk: {
        type: 'string',
        enum: ['low', 'high'],
        description: 'How costly a wrong answer is. Defaults to "low".',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          bank: { type: 'string', required: true },
          summary: { type: 'string', required: true },
          decisions: { type: 'json', required: true },
          route: { type: 'string', required: true },
          inputTokens: { type: 'integer', required: true },
          outputTokens: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => textBlock(`${value.summary}\nroute=${value.route}`),
    },
    presentCall: args => ({
      card: 'generic',
      kind: 'other',
      title: `Jev reason: ${oneLine(args.bank, DEFAULT_BANK_ID)} bank`,
    }),
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const bankId = args.bank ?? DEFAULT_BANK_ID
      if (!service.banks.includes(bankId)) {
        throw new Error(
          `bank "${bankId}" is not enabled; this deployment runs ${service.banks.join(', ')}`,
        )
      }
      const bank = getBank(bankId)
      if (bank === undefined) {
        throw new Error(
          `unknown bank "${bankId}"; available banks are ${BANK_IDS.join(', ')}`,
        )
      }
      const risk = riskOf(args.risk)
      const evaluation = await service.evaluate({
        state: args.state,
        questions: bank.questions,
        source: 'jev_reason',
        signal: exec.signal,
      })

      const lines: string[] = []
      const decisions: Record<string, JevJson> = {}
      const collected: JevRoute[] = []
      for (const [id, answer] of Object.entries(evaluation.answers)) {
        const route = routeForAnswer(service, answer, risk)
        collected.push(route)
        lines.push(describeAnswer(id, answer))
        const decision: Record<string, JevJson> = {
          value: answerValue(answer),
          confidence: effectiveConfidence(answer),
          route,
        }
        decisions[id] = decision
      }

      return {
        bank: bank.id,
        summary: lines.join(SUMMARY_SEPARATOR),
        decisions,
        route: strictestRoute(collected),
        inputTokens: evaluation.usage.input_tokens,
        outputTokens: evaluation.usage.output_tokens,
      }
    },
  })
}

export { createAskTool, createReasonTool }

