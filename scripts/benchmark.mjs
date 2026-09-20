#!/usr/bin/env node
/**
 * Benchmark CLI: cost, time, and tokens, with Jev against without.
 *
 * The default run touches no network; `--live` sends the same corpus to
 * TypeSafe and substitutes the tokens and round trips the API actually
 * reported. Prices default to TypeSafe's published Jev rate and DeepSeek's
 * published off-peak `deepseek-flash` rates; override them for any other pair.
 *
 * Usage:
 *   node scripts/benchmark.mjs [--live] [--json] [--out <file>]
 *                              [--llm-input-price <usd-per-Mtok>]
 *                              [--llm-output-price <usd-per-Mtok>]
 *                              [--jev-input-price <usd-per-Mtok>]
 *                              [--tokens-per-second <n>]
 *                              [--jev-latency <seconds>]
 *                              [--system-prompt <tokens>]
 *                              [--tool-schema <tokens>]
 *                              [--trace <file>]
 */

import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'

const CLI_NAME = 'benchmark'
const DECIMAL_RADIX = 10

/**
 * Read the value following a flag.
 *
 * @param {string[]} argv - Process arguments.
 * @param {string} flag - Flag to look for.
 * @returns {string | undefined} The value, when present.
 */
function flagValue(argv, flag) {
  const index = argv.indexOf(flag)
  if (index === -1) {
    return undefined
  }
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('--')) {
    throw new Error(CLI_NAME + ': ' + flag + ' needs a value')
  }
  return value
}

/**
 * Read a numeric flag, accepting fractions so prices work.
 *
 * @param {string[]} argv - Process arguments.
 * @param {string} flag - Flag to look for.
 * @param {number} fallback - Value used when the flag is absent.
 * @returns {number} The parsed number.
 */
function numberFlag(argv, flag, fallback) {
  const raw = flagValue(argv, flag)
  if (raw === undefined) {
    return fallback
  }
  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed)) {
    throw new Error(CLI_NAME + ': ' + flag + ' needs a number, received ' + raw)
  }
  return parsed
}

/**
 * Read an integer flag.
 *
 * @param {string[]} argv - Process arguments.
 * @param {string} flag - Flag to look for.
 * @param {number} fallback - Value used when the flag is absent.
 * @returns {number} The parsed integer.
 */
function intFlag(argv, flag, fallback) {
  const raw = flagValue(argv, flag)
  if (raw === undefined) {
    return fallback
  }
  const parsed = Number.parseInt(raw, DECIMAL_RADIX)
  if (!Number.isFinite(parsed)) {
    throw new Error(CLI_NAME + ': ' + flag + ' needs an integer, received ' + raw)
  }
  return parsed
}

/**
 * Load the built benchmark module, explaining how to build it when missing.
 *
 * @returns {Promise<Record<string, unknown>>} The built module.
 */
async function loadBenchmark() {
  try {
    return await import('../lib/benchmark.js')
  } catch (error) {
    throw new Error(
      CLI_NAME + ': lib/benchmark.js is missing. Run "pnpm run build:host" first.\n' + String(error),
    )
  }
}

/**
 * Build the assumptions from the shipped defaults plus any overrides.
 *
 * @param {Record<string, number>} defaults - The module's own defaults.
 * @param {string[]} argv - Process arguments.
 * @returns {Record<string, number>} The resolved assumptions.
 */
function assumptionsFrom(defaults, argv) {
  return {
    systemPromptTokens: intFlag(argv, '--system-prompt', defaults.systemPromptTokens),
    toolSchemaTokens: intFlag(argv, '--tool-schema', defaults.toolSchemaTokens),
    llmInputPricePerMtok: numberFlag(argv, '--llm-input-price', defaults.llmInputPricePerMtok),
    llmOutputPricePerMtok: numberFlag(argv, '--llm-output-price', defaults.llmOutputPricePerMtok),
    jevInputPricePerMtok: numberFlag(argv, '--jev-input-price', defaults.jevInputPricePerMtok),
    llmTokensPerSecond: numberFlag(argv, '--tokens-per-second', defaults.llmTokensPerSecond),
    jevLatencySeconds: numberFlag(argv, '--jev-latency', defaults.jevLatencySeconds),
  }
}

/**
 * Apply a captured trace file over the corpus's reference reasoning.
 *
 * @param {object} report - Benchmark report to annotate.
 * @param {string} path - Trace file path.
 * @returns {Promise<object>} The annotated report.
 */
async function applyTrace(report, path) {
  const raw = await readFile(path, 'utf8')
  report.trace = JSON.parse(raw)
  report.traceNote =
    'A captured trace was supplied; re-run the model whose trace this is to reproduce it.'
  return report
}

/**
 * Run the benchmark and print or write the result.
 */
async function main() {
  const argv = process.argv.slice(2)
  const benchmark = await loadBenchmark()
  const assumptions = assumptionsFrom(benchmark.DEFAULT_ASSUMPTIONS, argv)

  let report
  if (argv.includes('--live')) {
    const apiKey = (process.env.TYPESAFE_API_KEY ?? '').trim()
    if (apiKey === '') {
      throw new Error(CLI_NAME + ': --live needs TYPESAFE_API_KEY in the environment')
    }
    report = await benchmark.runLiveBenchmark(
      {
        apiKey,
        baseUrl: process.env.TYPESAFE_BASE_URL ?? 'https://api.typesafe.ai',
        model: process.env.TYPESAFE_MODEL ?? 'jev-latest',
      },
      assumptions,
    )
  } else {
    report = benchmark.runModelledBenchmark(assumptions)
  }

  const tracePath = flagValue(argv, '--trace')
  if (tracePath !== undefined) {
    report = await applyTrace(report, tracePath)
  }

  if (argv.includes('--json')) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  const markdown = benchmark.renderReport(report)
  process.stdout.write(markdown)
  const out = flagValue(argv, '--out')
  if (out !== undefined) {
    await writeFile(out, markdown, 'utf8')
    process.stdout.write('\nwrote ' + out + '\n')
  }
}

main().catch(error => {
  process.stderr.write(String(error instanceof Error ? error.message : error) + '\n')
  process.exitCode = 1
})

