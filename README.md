# dsh-plugin-jev

TypeSafe [Jev](https://docs.typesafe.ai/introduction) (System One) as a DeepSeek
Harness plugin.

Jev is not a chat model. It evaluates typed **questions** against a **state** and
returns typed answers with probabilities and confidence — no generated prose to
parse. This package puts that behind six agent tools, a skill that teaches the
model when a Jev call beats reasoning it out, an operator command, three HTTP
endpoints, and a browser settings page with an API-key field.

- **Narrow judgements go to a model built for them** — classify, score, or check,
  and get a typed answer plus a calibrated confidence.
- **Every call reports what it cost**, and the same ledger feeds the browser
  panel, `/jev usage`, and an HTTP route.
- **Whether it pays is measured, not asserted** — a reproducible benchmark
  compares the same decisions with and without Jev.

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

or enter it in **Settings → Jev**. The key is stored by the host's credential
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

If the credential service is mounted — every ordinary profile has it — the plugin
loads without a key and the first tool call that needs one says so by name.
Without that service the environment is the only source, so a missing key fails
at startup instead. Set `enabled: false` to mount it with no credential at all.

---

## Cost: with Jev vs without

The same 21 atomic decisions, across five scenarios, answered both ways against
the live API at `--output-weight 4`:

| Shape | Without Jev | With Jev | Δ |
| --- | ---: | ---: | ---: |
| Ad-hoc `jev_ask`, raw tokens | 3,946 | 6,351 | **−60.9%** |
| Ad-hoc `jev_ask`, output-weighted ×4 | 7,807 | 11,712 | **−50.0%** |
| `jev_reason` with a built-in bank, raw tokens | 2,179 | 2,989 | −37.2% |
| `jev_reason` with a built-in bank, output-weighted ×4 | 4,141 | 3,553 | **+14.2%** |

**Read the last line, not the first.** Jev buys back deliberation tokens and pays
for them with billed input plus the tokens the agent spends restating the
evidence. In the bank shape those meet at an output weight of **2.7**: above it
Jev is cheaper, below it Jev is not. Reasoning models bill generated tokens at
roughly four to eight times their input rate, so the bank shape saves in practice
even though it loses on a raw count.

The ad-hoc shape **never** breaks even at any output weight, because there the
agent also generates the question definitions. Use `jev_reason`. Do not use
`jev_ask` to ask about a large document.

### What is measured, and what is modelled

The Jev half is **measured**: `--live` sends the corpus to the API and uses the
`usage.input_tokens` it reports. The baseline half is **modelled** from reference
reasoning shipped as data in `src/benchmark/items-routing.ts` and
`src/benchmark/items-judgement.ts` — read it, disagree with it, replace it with
`--trace <file>`, and re-run.

The modelled run reports a **+32.5%** bank saving rather than **+14.2%**, because
four characters per token under-counts Jev's billed input by about **1.6×** on
this corpus: JSON structure and criteria prose tokenize worse than English prose
does. That gap is why `--live` exists, and why the measured figures are the ones
printed here. Run both; trust the measured one.

### Run it

```sh
pnpm run build:host
pnpm run bench                                       # modelled, instant, no network
TYPESAFE_API_KEY=... pnpm run bench:live -- --output-weight 4
pnpm run bench -- --json | jq .totals
```

Flags: `--live`, `--json`, `--out <file>`, `--output-weight <n>`,
`--system-prompt <n>`, `--tool-schema <n>`, `--trace <file>`.

### Cost inside a running session

Four surfaces over one ledger, so they cannot disagree:

| Surface | Shows |
| --- | --- |
| **Settings → Jev** | totals, billed input tokens, the Mtok figure, per-tool breakdown, recent calls |
| `/jev usage` | the same totals without a model round trip; `/jev reset` zeroes them |
| `jev_usage` tool | lets the agent price a judgement before repeating it |
| `GET /api/dsh-plugin-jev/usage` | the same ledger as JSON |

---

## Tools

| Tool | Primitive | Returns |
| --- | --- | --- |
| `jev_classify` | Choice | `choice`, `confidence`, `route`, `probabilities` |
| `jev_score` | Score | `score`, nearest `level`, `confidence`, `route` |
| `jev_check` | Noul | `noul` (0–1), boolean `verdict`, `route` |
| `jev_ask` | mixed | every answer in one request, plus a per-answer route |
| `jev_reason` | mixed | a built-in bank's answers, a one-line-per-decision summary, and the strictest route |
| `jev_usage` | — | session token accounting by tool |

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

`jev_reason` runs one of four banks shipped in the package:

| Bank | Classifies |
| --- | --- |
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

## Companion surfaces

| Export | Contributes |
| --- | --- |
| `./tools` | the six tools above |
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

