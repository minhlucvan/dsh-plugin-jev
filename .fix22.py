import pathlib, sys
root = pathlib.Path('.')
failures = []

def patch(rel, old, new):
    p = root / rel
    t = p.read_text()
    if old not in t:
        failures.append(rel + ' :: ' + repr(old[:60])); return
    p.write_text(t.replace(old, new, 1))
    print('patched', rel)

patch('src/config.ts',
"/** Usage entries retained for reporting; totals stay cumulative regardless. */\nconst DEFAULT_LEDGER_LIMIT = 500",
"/** Usage entries retained for reporting; totals stay cumulative regardless. */\nconst DEFAULT_LEDGER_LIMIT = 500\n\n/** Whether the agent is told, in its system prompt, to prefer Jev for decisions. */\nconst DEFAULT_ADOPTION_PROMPT = true")

patch('src/config.ts',
"  /** Usage entries retained for reporting. */\n  ledgerLimit?: number\n  /** Per-tool switches. */\n  tools?: ToolSwitches\n}",
"  /** Usage entries retained for reporting. */\n  ledgerLimit?: number\n  /** Whether the agent is told to prefer Jev for a narrow decision. */\n  adoptionPrompt?: boolean\n  /** Per-tool switches. */\n  tools?: ToolSwitches\n}")

patch('src/config.ts',
"  /** Usage entries retained for reporting. */\n  ledgerLimit: number\n  /** Per-tool switches. */\n  tools: ResolvedToolSwitches\n}",
"  /** Usage entries retained for reporting. */\n  ledgerLimit: number\n  /** Whether the agent is told to prefer Jev for a narrow decision. */\n  adoptionPrompt: boolean\n  /** Per-tool switches. */\n  tools: ResolvedToolSwitches\n}")

patch('src/config.ts',
"  ledgerLimit: schema.number().default(DEFAULT_LEDGER_LIMIT),",
"  ledgerLimit: schema.number().default(DEFAULT_LEDGER_LIMIT),\n  adoptionPrompt: schema.boolean().default(DEFAULT_ADOPTION_PROMPT),")

patch('src/config.ts',
"    ledgerLimit: config.ledgerLimit ?? DEFAULT_LEDGER_LIMIT,",
"    ledgerLimit: config.ledgerLimit ?? DEFAULT_LEDGER_LIMIT,\n    adoptionPrompt: config.adoptionPrompt ?? DEFAULT_ADOPTION_PROMPT,")

patch('src/jev/service.ts',
"  /** Usage entries retained for reporting. */\n  ledgerLimit: number\n  /** Per-tool switches. */\n  tools: JevToolSwitches\n}",
"  /** Usage entries retained for reporting. */\n  ledgerLimit: number\n  /** Whether the agent is told to prefer Jev for a narrow decision. */\n  adoptionPrompt: boolean\n  /** Per-tool switches. */\n  tools: JevToolSwitches\n}")

patch('src/jev/service.ts',
"  /** Which tools the profile asked this plugin to publish. */\n  readonly tools: JevToolSwitches",
"  /** Which tools the profile asked this plugin to publish. */\n  readonly tools: JevToolSwitches\n  /** Whether the agent is told to prefer Jev for a narrow decision. */\n  readonly adoptionPrompt: boolean")

patch('src/jev/service.ts',
"    maxStateChars: config.maxStateChars,\n    tools: config.tools,",
"    maxStateChars: config.maxStateChars,\n    tools: config.tools,\n    adoptionPrompt: config.adoptionPrompt,")

patch('tsdown.config.ts', "    index: 'src/index.ts',", "    index: 'src/index.ts',\n    prompt: 'src/prompt.ts',")

patch('package.json', '    "./routes": {',
'''    "./prompt": {
      "types": "./lib/prompt.d.ts",
      "default": "./lib/prompt.js"
    },
    "./routes": {''')

if failures:
    print('FAILED:'); [print(' -', f) for f in failures]; sys.exit(1)
print('ok')
