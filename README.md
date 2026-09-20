# dsh-plugin-jev

TypeSafe [Jev](https://docs.typesafe.ai/introduction) (System One) as a DeepSeek
Harness plugin.

Jev is not a chat model. It evaluates typed **questions** against a **state** and
returns typed answers with probabilities and confidence — no generated prose to
parse. This package puts that behind three agent tools, system-prompt guidance
that tells the model to prefer them, a skill carrying the detail, an operator
command, three HTTP endpoints, and a browser settings page with an API-key
field.

- **Half the cost and half the time** on the coding, testing and exploring
  decisions an agent makes every day — [measured](#benchmarks), not asserted.
- **Narrow judgements go to a model built for them** — classify, score, or check,
  and get a typed answer plus a calibrated confidence.
- **The agent is told to reach for it.** A tool description says what a tool
  does; a system-prompt section says to prefer it, and says when not to.
- **Every call reports what it cost**, and the same ledger feeds the browser
  panel, `/jev usage`, and an HTTP route.

---

## Install

Needs Node 22+ and a DSH profile. `dsh-base` supplies everything else.

### 1. Put the package in a profile

```sh
dsh plugin --profile web add github:minhlucvan/dsh-plugin-jev

# or a local checkout, while developing:
dsh plugin --profile web add link:/path/to/dsh-plugin-jev
```

### 2. List it as a bundle

So the plugin's own `cordis.patch.yml` applies. In
`~/.dsh/profiles/web/package.json`:

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-plugin-jev"
      ]
    }
  }
}
```

That inserts the core row, the tools, the skill and the command.

Two companions are **opt-in**, because a pending injection blocks startup in a
profile that cannot satisfy it. Add one to the profile's `cordis.patch.yml`
only if you want it:

```yaml
- insert:
    - id: dsh-plugin-jev-routes
      name: dsh-plugin-jev/routes
```

| Companion | Needs | Ordinary profiles |
| --- | --- | --- |
| `./routes` | `webServer` | present in `dsh-web-app`, absent when headless |
| `./invariant` | `invariants` | not provided by any ordinary profile |

### 3. Give it the API key

Either export it:

```sh
export TYPESAFE_API_KEY=...
```

or enter it in **Settings → System One**. The key is stored by the host's credential
service in `$DSH_HOME/.credentials.yaml` — never by this plugin, and never in
the bundle patch. Configuration carries the *name* of the reference, never the
secret.

Both work at once and the host decides which wins: an inherited environment
variable counts as this run's explicit intent and is read-only, so the settings
field reports the reference as not writable rather than appearing to save over
it. The plugin re-resolves the credential on **every** evaluation, so a key saved
in the settings page reaches the very next tool call without a restart.

### 4. Restart and check

```sh
curl http://127.0.0.1:3080/api/dsh-plugin-jev/health
# {"ok":true,"enabled":true,"model":"jev-latest"}
```

A missing key never blocks startup: activating is what installs the settings
section you would supply one through, so the plugin loads, warns once naming the
reference, and every evaluation that needs the key reports it by name. The
credential seam is looked up on each evaluation rather than once at activation,
which is also what makes the row order between this plugin and the host's
credential provider irrelevant — an inserted row lands ahead of the rows it
patches over. Set `enabled: false` to mount it with no credential at all.

---

## Benchmarks

Four decisions a coding agent makes every day, priced under five ways of getting
them answered — on dollars, seconds, tokens, **and whether the answers were
right**. Jev's figures are measured against the live API; the baseline (the agent
reasoning it out itself) is modelled from the reference reasoning the corpus
ships. The full report, the method and the caveats live in
[BENCHMARK.md](BENCHMARK.md).

### What to ship

| Shape | What it does | Cost | Time | Answers matched |
| --- | --- | ---: | ---: | ---: |
| **Bank call** | one `jev_reason` call naming a shipped bank | **+52.4%** | **+59.8%** | 86.7% (13/15) |
| Bank + fallback | the bank call, then the model re-reasons the low-confidence answers | −1.5% | +14.5% | 86.7% (13/15) |
| Ad-hoc call | one `jev_ask` call whose questions the model writes itself | −51.5% | −117.8% | 83.3% (20/24) |
| Call per question | one call per question, the state re-sent every time | −167.4% | −287.6% | 83.3% (20/24) |
| Reason it out | no call at all — the baseline every row is measured against | — | — | — |

Positive is better, and each shape is compared against reasoning *its own*
scenarios out. Over the three scenarios a bank covers — 15 decisions:

- **A bank call is 52% cheaper and 60% faster** than reasoning the same decisions
  out, while moving 19% *more* tokens. Those extra tokens cost $0.042/Mtok and
  Jev's output is free; the tokens it removes cost $0.15–0.60/Mtok. That is not a
  contradiction, it is the whole trade.
- **Writing the questions yourself is 52% dearer than not delegating at all.**
  Generated tokens are the entire difference between the two Jev shapes.
- **A call per question costs 1.8× one batched call and 10.8× the bank call.**
  Nine atomic questions about one state are one request, not nine.
- **The fallback is not free.** At the shipped confirm floor 7 of 15 answers were
  handed back, and re-reasoning them took the saving from +52.4% to −1.5%. The
  break-even is 40% of decisions on cost, 60% on wall-clock: use a fallback
  deliberately, or lower the threshold.

The rule the numbers support: **keep the question definitions in the package, and
ask about one state once.**

### Prices used

| | Input | Output |
| --- | ---: | ---: |
| Jev | $0.042 / Mtok | free |
| Agent model (DeepSeek Flash, off-peak) | $0.15 / Mtok | $0.60 / Mtok |

Peak hours double the agent model's rates and leave Jev's unchanged, which moves
the comparison further in Jev's favour. Every figure is a flag:
`--llm-input-price`, `--llm-output-price`, `--jev-input-price`,
`--tokens-per-second`, `--jev-latency`, `--fallback-threshold`.

### Run it

```sh
pnpm run build:host
pnpm run bench                    # modelled, instant, no network
TYPESAFE_API_KEY=... pnpm run bench:live
pnpm run bench:live -- --out report.md
pnpm run bench -- --llm-input-price 0.30 --llm-output-price 1.20   # peak hours
```

Jev's tokens **and round trips** are measured by `--live`, and every answer is
graded against the expected answer the corpus ships. The baseline is **modelled**
from the reference reasoning shipped beside each scenario in
`src/benchmark/items-*.ts` — read it, disagree with it, replace it with
`--trace <file>`, and re-run. The corpus, the five shapes and the fallback curve
are documented in [BENCHMARK.md](BENCHMARK.md).


### Cost inside a running session

Four surfaces over one ledger, so they cannot disagree:

| Surface | Shows |
| --- | --- |
| **Settings → System One** | totals, billed input tokens, the Mtok figure, per-tool breakdown, recent calls |
| `/jev usage` | the same totals without a model round trip; `/jev reset` zeroes them |
| `jev_usage` tool | lets the agent price a judgement before repeating it |
| `GET /api/dsh-plugin-jev/usage` | the same ledger as JSON |

---

## Tools

| Tool | Question types | Returns |
| --- | --- | --- |
| `jev_ask` | `choice`, `score`, `noul` | every answer in one request, plus a per-answer route |
| `jev_reason` | a shipped bank | the bank's answers, a one-line-per-decision summary, and the strictest route |
| `jev_usage` | — | session token accounting by tool |

`jev_ask` is the general tool: it takes a map of answer id to typed question,
so a `choice` (an option map), a `score` (ordered levels, lowest first) and a
`noul` (a yes/no with optional `true`/`false` criteria) all go in one call.
Reach for a shipped bank through `jev_reason` when one covers the decision, and
express the rest yourself with `jev_ask`.

Every tool returns the tokens the call cost, so the model can see the price of
repeating a judgement.

### `route` is confidence-gated routing

The answer says *what*; the confidence says *whether to act*. Each tool collapses
the two:

- `act` — proceed.
- `verify` — proceed, but confirm before doing anything hard to undo.
- `escalate` — do not act on the answer.

Pass `risk: "high"` for destructive or irreversible actions; that raises the bar
before a route becomes `act`. Noul carries no confidence of its own, so the
plugin derives one from how far the probability sits from an even split.

### Question banks — the classification options

`jev_reason` runs one of six banks shipped in the package. Three are the shapes the
benchmark prices; the other three cover decisions the benchmark does not measure.

| Bank | Classifies |
| --- | --- |
| `change` | a code change before it is reviewed: what kind of change, how far its effects reach, whether a migration is needed, how deeply it must be checked |
| `test` | a failing test: what caused it, is it a regression, is the test itself wrong, how much of the failure is understood |
| `reasoning` | the shape of a task: what kind of work, is the context sufficient, is external data needed, how costly is an error, is it ambiguous, is it decomposable |
| `answer` | a draft before it is returned: is every claim grounded, does it answer what was asked, does it overstate certainty |
| `request` | an incoming request: intent, planning depth, whether it needs clarification |
| `content` | a passage before it is copied: personal data, secrets, durability, time sensitivity |

Each question is atomic, they are all evaluated in parallel against one state,
and the answers are combined in code rather than in a prompt. The banks are also
readable at `GET /api/dsh-plugin-jev/catalog`.

---

## Configuration

| Field | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | master switch; `false` loads without contacting TypeSafe |
| `apiKeyEnv` | `TYPESAFE_API_KEY` | the credential reference to resolve |
| `baseUrl` | `https://api.typesafe.ai` | evaluation endpoint |
| `model` | `jev-latest` | model id or alias; pin `jev-1.13.0` if you tuned thresholds against it |
| `timeoutMs` | `30000` | per-attempt deadline |
| `maxRetries` | `2` | attempts after the first, for 429/529/5xx/transport |
| `confidenceFloor` | `0.5` | below this an answer is not acted on |
| `confirmFloor` | `0.85` | at or above this a high-risk answer may act unreviewed |
| `maxStateChars` | `200000` | refuse a larger state locally rather than bill for a rejected request |
| `ledgerLimit` | `500` | recent entries retained; cumulative totals are unaffected |
| `adoptionPrompt` | `true` | tell the agent, in its system prompt, to delegate a narrow decision |
| `banks` | all six | ids of the question banks the agent may run; the rest are refused |
| `tools.*` | all `true` | per-tool switches, so a profile publishes only part of the catalog |

Every field is validated at resolution, and `confidenceFloor` may not exceed
`confirmFloor`.

**Two channels.** The Cordis config above is the *deployment* channel: an operator
sets it in the profile patch and it applies to everyone. The plugin also installs
a per-user section with the host's settings provider, carrying the same fields
with the same bounds, so the browser page is a real configuration path rather
than a form with nowhere to write. The resolved value is schema defaults, then
the profile, then whatever the user saved. The section is installed rather than
required: a profile without a settings provider falls back to the composition
entry and behaves exactly as before.

---

## Getting the agent to actually use it

A tool description says what a tool does. It does not say the tool should be
*preferred*, and a model that has reasoned its way through thousands of
classifications in its own context will keep doing that by default. Three things
push it the other way, in order of strength:

1. **`./prompt`** registers a system-prompt section at the moment the model
   reads what its tools are for. It states the economics — a typed decision
   costs a fraction of a reasoning pass and returns in one round trip — and
   names the shapes to delegate: one option from a list, a position on a scale,
   yes/no where the probability is the signal, and a task whose shape is unclear.
   It also says the two things that decide whether delegating is *actually*
   cheaper: batch every question about one state into a single call, and prefer a
   shipped bank over ad-hoc questions so the question definitions stay out of the
   model'''s own output.
2. **`./skills`** loads on demand when the description matches the task, and
   carries the detail: how to keep the state small, how to read a `route`.
3. **The tool descriptions themselves** say "instead of your own reasoning", so a
   model that is scanning the catalog sees the intent without loading anything.

Every prompt section costs tokens on every turn, so the guidance is written to
be worth them and is one switch away: set `adoptionPrompt: false` to remove it
without unmounting anything else.

---

## Companion surfaces

| Export | Contributes |
| --- | --- |
| `./tools` | the three tools above |
| `./prompt` | a system-prompt section telling the agent to **delegate a decision instead of reasoning it out**, and which shapes to delegate. This is the adoption lever — see below |
| `./skills` | `jev-narrow-judgements` — when a Jev call beats reasoning, how to keep the state small, how to read a route. The body is rendered from the live thresholds |
| `./commands` | `/jev` — `usage` and `reset`, read from the ledger without touching the model |
| `./routes` | `GET /api/dsh-plugin-jev/{health,usage,catalog}`; no route returns a credential |
| `./client` | the browser face: settings, the API-key field, and the usage panel |
| `./invariant` | asserts the ledger's accounting identity — cumulative totals must equal what was evicted plus what is retained |

Each is a separate entry, so the core bundle carries none of the DSH tool stack,
command registry, skill registry or browser carrier.

---

## Development

```sh
pnpm install
pnpm run lint        # Oxlint, type-aware, denies warnings
pnpm test            # Vitest: node and dom projects
pnpm run build       # host entries, browser bundle, artifact verification
node scripts/check-package.mjs
```

All four must pass before a change is done. `docs/dsh-plugin-contracts.md`
records the standalone-plugin contract this repository follows, and
`.agents/skills/dsh-plugin-*` carries the repository-local workflow.

## License

BSD-3-Clause.

