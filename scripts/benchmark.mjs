#!/usr/bin/env node
/**
 * Token-savings benchmark CLI.
 *
 * Runs the shipped corpus through the two cost arms and prints the comparison.
 * The default run touches no network; `--live` sends the same corpus to
 * TypeSafe and substitutes the tokens the API actually billed.
 *
 * Usage:
 *   node scripts/benchmark.mjs [--live] [--json] [--out <file>]
 *                              [--output-weight <n>] [--system-prompt <n>]
 *                              [--tool-schema <n>] [--trace <file>]
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
 * Read a numeric flag.
 *
 * @param {string[]} argv - Process arguments.
 * @param {string} flag - Flag to look for.
 * @param {number | undefined} fallback - Value used when the flag is absent.
 * @returns {number | undefined} The parsed number.
 */
function numberFlag(argv, flag, fallback) {
  const raw = flagValue(argv, flag)
  if (raw === undefined) {
    return fallback
  }
  const parsed = Number.parseInt(raw, DECIMAL_RADIX)
  if (!Number.isFinite(parsed)) {
    throw new Error(CLI_NAME + ': ' + flag + ' needs a number, received ' + raw)
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
 * Apply a captured trace file over the corpus's reference reasoning.
 *
 * @param {object} report - Benchmark report to adjust.
 * @param {string} path - Trace file path.
 * @returns {Promise<object>} The adjusted report.
 */
async function applyTrace(report, path) {
  const raw = await readFile(path, 'utf8')
  const trace = JSON.parse(raw)
  report.trace = trace
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
  const defaults = benchmark.runModelledBenchmark().assumptions
  const assumptions = {
    systemPromptTokens: numberFlag(argv, '--system-prompt', defaults.systemPromptTokens),
    toolSchemaTokens: numberFlag(argv, '--tool-schema', defaults.toolSchemaTokens),
    completionWeight: numberFlag(argv, '--output-weight', defaults.completionWeight),
  }

  const wantsLive = argv.includes('--live')
  let report
  if (wantsLive) {
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
  } else {
    const markdown = benchmark.renderReport(report)
    process.stdout.write(markdown)
    const out = flagValue(argv, '--out')
    if (out !== undefined) {
      await writeFile(out, markdown, 'utf8')
      process.stdout.write('\nwrote ' + out + '\n')
    }
  }
}

main().catch(error => {
  process.stderr.write(String(error instanceof Error ? error.message : error) + '\n')
  process.exitCode = 1
})

