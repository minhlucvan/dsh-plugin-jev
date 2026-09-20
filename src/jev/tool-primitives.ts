/**
 * The three primitive tools: Choice, Score and Noul.
 *
 * Each tool wraps one primitive so the model does not have to author a question
 * schema to ask a common question. They are deliberately thin — the value they
 * add is a correct request shape and a compact, decision-ready answer.
 *
 * @module dsh-plugin-jev/jev/tools/primitives
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

import type { JevJson, JevNoulQuestion } from './contracts.ts'
import { NOUL_YES_THRESHOLD, SUMMARY_DIGITS, noulVerdict } from './routing.ts'
import type { JevService } from './service.ts'
import {
  choiceCriteria,
  oneLine,
  requireChoiceAnswer,
  requireNoulAnswer,
  requireScoreAnswer,
  riskOf,
  routeForAnswer,
  textBlock,
} from './tool-support.ts'

/** Answer id used for a single-question request. */
const PRIMARY_ANSWER_ID = 'answer'

/**
 * Build the Choice tool.
 *
 * @param service - The plugin service.
 * @returns A registry-ready tool definition.
 */
function createClassifyTool(service: JevService): ToolDefinition {
  return defineTool({
    name: 'jev_classify',
    description:
      'Pick one option from a list you supply, using TypeSafe Jev (a System One decision '
      + 'model) instead of your own reasoning. Use it for routing, labelling, and any '
      + 'judgement that resolves to one of a known set of answers. Send the smallest state '
      + 'that contains the evidence: Jev bills per input token, so pasting a whole '
      + 'conversation costs more than pasting the three lines that decide it. Returns the '
      + 'chosen option, its confidence, and a route telling you whether to act on it.',
    parameters: {
      state: {
        type: 'json',
        description:
          'The evidence to judge: a string, or an object/array of named fields. Text only.',
        required: true,
      },
      instructions: {
        type: 'string',
        description:
          'The question to answer about the state. Ask one narrow question, for example '
          + '"Which team should handle this ticket?".',
        required: true,
      },
      options: {
        type: 'array',
        items: { type: 'string' },
        description:
          'The candidate answers, at least two. Add an "other" or "none of the above" '
          + 'option when the list may not cover every input.',
        required: true,
      },
      risk: {
        type: 'string',
        enum: ['low', 'high'],
        description:
          'How costly a wrong answer is. "high" requires the stricter confirm threshold '
          + 'before the route becomes "act". Defaults to "low".',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          choice: { type: 'string', required: true },
          confidence: { type: 'number', required: true },
          route: { type: 'string', required: true },
          probabilities: { type: 'json', required: true },
          inputTokens: { type: 'integer', required: true },
          outputTokens: { type: 'integer', required: true },
        },
      },
      render: (_args, value) =>
        textBlock(
          `choice=${value.choice} `
          + `confidence=${value.confidence.toFixed(SUMMARY_DIGITS)} route=${value.route}`,
        ),
    },
    presentCall: args => ({
      card: 'generic',
      kind: 'other',
      title: `Jev classify: ${oneLine(args.instructions, 'choose an option')}`,
      rawInput: { options: args.options },
    }),
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const evaluation = await service.evaluate({
        state: args.state,
        questions: {
          [PRIMARY_ANSWER_ID]: {
            type: 'choice',
            instructions: args.instructions,
            criteria: choiceCriteria(args.options),
          },
        },
        source: 'jev_classify',
        signal: exec.signal,
      })
      const answer = requireChoiceAnswer(evaluation, PRIMARY_ANSWER_ID)
      return {
        choice: answer.choice,
        confidence: answer.confidence,
        route: routeForAnswer(service, answer, riskOf(args.risk)),
        probabilities: answer.probabilities,
        inputTokens: evaluation.usage.input_tokens,
        outputTokens: evaluation.usage.output_tokens,
      }
    },
  })
}

/**
 * Build the Score tool.
 *
 * @param service - The plugin service.
 * @returns A registry-ready tool definition.
 */
function createScoreTool(service: JevService): ToolDefinition {
  return defineTool({
    name: 'jev_score',
    description:
      'Rate something against ordered levels you describe, using TypeSafe Jev instead of '
      + 'your own reasoning. Use it for severity, quality, urgency, and any judgement that '
      + 'sits on a spectrum. Returns the probability-weighted score, the level it lands '
      + 'closest to, the confidence, and a route.',
    parameters: {
      state: {
        type: 'json',
        description: 'The evidence to rate: a string, or an object/array of named fields.',
        required: true,
      },
      instructions: {
        type: 'string',
        description: 'What to rate, for example "How severe is this defect?"',
        required: true,
      },
      levels: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Ordered level descriptions from lowest to highest, between two and ten. Each '
          + 'level must say what it means, not just its number.',
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
          score: { type: 'number', required: true },
          level: { type: 'string', required: true },
          confidence: { type: 'number', required: true },
          route: { type: 'string', required: true },
          probabilities: { type: 'json', required: true },
          inputTokens: { type: 'integer', required: true },
          outputTokens: { type: 'integer', required: true },
        },
      },
      render: (_args, value) =>
        textBlock(
          `score=${value.score.toFixed(SUMMARY_DIGITS)} level="${value.level}" `
          + `confidence=${value.confidence.toFixed(SUMMARY_DIGITS)} route=${value.route}`,
        ),
    },
    presentCall: args => ({
      card: 'generic',
      kind: 'other',
      title: `Jev score: ${oneLine(args.instructions, 'rate against levels')}`,
      rawInput: { levels: args.levels },
    }),
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const evaluation = await service.evaluate({
        state: args.state,
        questions: {
          [PRIMARY_ANSWER_ID]: {
            type: 'score',
            instructions: args.instructions,
            criteria: args.levels,
          },
        },
        source: 'jev_score',
        signal: exec.signal,
      })
      const answer = requireScoreAnswer(evaluation, PRIMARY_ANSWER_ID)
      const nearest = Math.round(answer.score)
      return {
        score: answer.score,
        level: answer.legend[String(nearest)] ?? '',
        confidence: answer.confidence,
        route: routeForAnswer(service, answer, riskOf(args.risk)),
        probabilities: answer.probabilities,
        inputTokens: evaluation.usage.input_tokens,
        outputTokens: evaluation.usage.output_tokens,
      }
    },
  })
}

/**
 * Build the Noul question, including only the criteria the caller described.
 *
 * @param statement - The yes/no statement.
 * @param meansYes - Description of what a yes means, when supplied.
 * @param meansNo - Description of what a no means, when supplied.
 * @returns The question to send.
 */
function noulQuestion(
  statement: string,
  meansYes: string | undefined,
  meansNo: string | undefined,
): JevNoulQuestion {
  const question: JevNoulQuestion = { type: 'noul', instructions: statement }
  if (meansYes === undefined && meansNo === undefined) {
    return question
  }
  const criteria: { true?: JevJson; false?: JevJson } = {}
  if (meansYes !== undefined) {
    criteria.true = meansYes
  }
  if (meansNo !== undefined) {
    criteria.false = meansNo
  }
  question.criteria = criteria
  return question
}

/**
 * Build the Noul tool.
 *
 * @param service - The plugin service.
 * @returns A registry-ready tool definition.
 */
function createCheckTool(service: JevService): ToolDefinition {
  return defineTool({
    name: 'jev_check',
    description:
      'Decide whether a yes/no statement holds, using TypeSafe Jev instead of your own '
      + 'reasoning. Use it for guardrails and binary facts: does this contain a credential, '
      + 'is this request asking for a refund, is this claim supported. Returns the '
      + 'probability that the answer is yes, a boolean verdict, and a route.',
    parameters: {
      state: {
        type: 'json',
        description: 'The evidence to check: a string, or an object/array of named fields.',
        required: true,
      },
      statement: {
        type: 'string',
        description: 'The yes/no statement to evaluate, phrased so that "yes" is unambiguous.',
        required: true,
      },
      meansYes: {
        type: 'string',
        description: 'Optional description of what a yes means, to pin the boundary cases.',
      },
      meansNo: {
        type: 'string',
        description: 'Optional description of what a no means, to pin the boundary cases.',
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
          noul: { type: 'number', required: true },
          verdict: { type: 'boolean', required: true },
          route: { type: 'string', required: true },
          inputTokens: { type: 'integer', required: true },
          outputTokens: { type: 'integer', required: true },
        },
      },
      render: (_args, value) =>
        textBlock(
          `noul=${value.noul.toFixed(SUMMARY_DIGITS)} `
          + `verdict=${String(value.verdict)} route=${value.route}`,
        ),
    },
    presentCall: args => ({
      card: 'generic',
      kind: 'other',
      title: `Jev check: ${oneLine(args.statement, 'yes/no statement')}`,
    }),
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const evaluation = await service.evaluate({
        state: args.state,
        questions: {
          [PRIMARY_ANSWER_ID]: noulQuestion(args.statement, args.meansYes, args.meansNo),
        },
        source: 'jev_check',
        signal: exec.signal,
      })
      const answer = requireNoulAnswer(evaluation, PRIMARY_ANSWER_ID)
      return {
        noul: answer.noul,
        verdict: noulVerdict(answer, NOUL_YES_THRESHOLD) === true,
        route: routeForAnswer(service, answer, riskOf(args.risk)),
        inputTokens: evaluation.usage.input_tokens,
        outputTokens: evaluation.usage.output_tokens,
      }
    },
  })
}

export { createCheckTool, createClassifyTool, createScoreTool }

