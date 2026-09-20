import pathlib, re, sys
root = pathlib.Path('.')

# service.ts hands the pre-flight checks to their own module.
p = root / 'src/jev/service.ts'
t = p.read_text()

start = t.index('/** Maximum options Jev accepts in one Choice question. */')
end = t.index('/** One evaluation, as the faces request it. */')
t = t[:start] + t[end:]

start = t.index('/**
 * Measure a state and refuse one that exceeds the configured limit.')
end = t.index('/**
 * Build the client options for one resolved configuration.')
t = t[:start] + t[end:]

t = t.replace("import { createUsageLedger } from './ledger.ts'",
              "import { createUsageLedger } from './ledger.ts'\nimport { assertQuestions, measureState } from './validation.ts'", 1)

t = t.replace("""export {
  MAX_CHOICE_OPTIONS,
  MAX_SCORE_LEVELS,
  MIN_QUESTIONS,
  MIN_SCORE_LEVELS,
  assertQuestions,
  createJevService,
  measureState,
  type JevEvaluateInput,""",
"""export { MAX_CHOICE_OPTIONS, MAX_SCORE_LEVELS, MIN_QUESTIONS, MIN_SCORE_LEVELS } from './validation.ts'
export { assertQuestion, assertQuestions, measureState } from './validation.ts'
export {
  createJevService,
  type JevEvaluateInput,""", 1)
p.write_text(t)
print('service.ts:', len(t.splitlines()), 'lines')

# A live credential can arrive after activation, so the fallback key is optional.
p = root / 'src/jev/service.ts'
t = p.read_text()
t = t.replace("""  /** Credential used when no per-call resolver is supplied. */
  apiKey: string""",
"""  /** Credential used when no per-call resolver is supplied. */
  apiKey?: string""", 1)
t = t.replace("""    await Promise.resolve()
    return deps.apiKey""",
"""    await Promise.resolve()
    return deps.apiKey ?? ''""", 1)
p.write_text(t)
print('made the fallback key optional')

# The environment resolver needs one honest await.
p = root / 'src/runtime.ts'
t = p.read_text()
old = """  return {
    fromProvider: false,
    resolve: async (): Promise<string | undefined> => {
      const value = readApiKey(env, config.apiKeyEnv)
      if (value === '') {
        return undefined
      }
      return value
    },
  }
}"""
new = """  return {
    fromProvider: false,
    resolve: async (): Promise<string | undefined> => {
      await Promise.resolve()
      const value = readApiKey(env, config.apiKeyEnv)
      if (value === '') {
        return undefined
      }
      return value
    },
  }
}"""
if old not in t:
    print('runtime resolver anchor missing'); sys.exit(1)
p.write_text(t.replace(old, new, 1))
print('fixed environment resolver')
