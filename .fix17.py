import pathlib, sys
root = pathlib.Path('.')
failures = []

def patch(rel, old, new):
    p = root / rel
    t = p.read_text()
    if old not in t:
        failures.append(rel + ' :: ' + repr(old[:70])); return
    p.write_text(t.replace(old, new, 1))
    print('patched', rel)

patch('tsdown.config.ts', "    benchmark: 'src/benchmark.ts',", "    benchmark: 'src/benchmark/index.ts',")

for rel in ['tests/benchmark.test.ts']:
    p = root / rel
    t = p.read_text()
    for old, new in {
        "'#src/benchmark-cost'": "'#src/benchmark/cost'",
        "'#src/benchmark-corpus'": "'#src/benchmark/corpus'",
        "'#src/benchmark-estimator'": "'#src/benchmark/estimator'",
        "'#src/benchmark-report'": "'#src/benchmark/report'",
    }.items():
        t = t.replace(old, new)
    p.write_text(t)
    print('rewrote', rel)

for rel, pairs in {
    'README.md': [
        ('`src/benchmark-items-routing.ts` and
`src/benchmark-items-judgement.ts`',
         '`src/benchmark/items-routing.ts` and
`src/benchmark/items-judgement.ts`'),
    ],
    'AGENTS.md': [
        ('| `src/benchmark*.ts` |', '| `src/benchmark/` |'),
    ],
    'CLAUDE.md': [
        ('| `src/benchmark*.ts` | Corpus, cost arms, live measurement, report rendering |',
         '| `src/benchmark/` | Corpus, cost arms, live measurement, report rendering |'),
    ],
}.items():
    p = root / rel
    t = p.read_text()
    for old, new in pairs:
        if old in t:
            t = t.replace(old, new)
            print('rewrote', rel)
        else:
            failures.append(rel + ' :: pattern ' + repr(old[:50]))
    p.write_text(t)

if failures:
    print('FAILED:'); [print(' -', f) for f in failures]; sys.exit(1)
print('ok')
