# dsh-plugin-jev

TypeSafe [Jev](https://docs.typesafe.ai/introduction) (System One) as a
DeepSeek Harness plugin: typed, calibrated decisions the agent can call as
tools, with the token accounting to prove what they cost.

Jev is not a chat model. It evaluates typed **questions** against a **state**
and returns typed answers with probabilities and confidence — no generated
prose to parse. This plugin puts that behind six agent tools, a skill that
teaches the model when a Jev call is cheaper than reasoning, an operator
command, three HTTP endpoints, a browser panel, and a package-owned invariant
over the usage ledger.

---

## Start with the honest benchmark

`pnpm run bench` costs the same 21 atomic decisions two ways over a shipped
corpus of five scenarios. The result is **not** a uniform win, and this README
does not pretend otherwise.

Measured against the live API, both Jev arms, at `--output-weight 4`:

| Shape | Baseline tokens | Jev tokens | Saved |
| --- | ---: | ---: | ---: |
| Ad-hoc `jev_ask`, raw tokens | 3,946 | 6,351 | **−60.9%** |
| Ad-hoc `jev_ask`, output-weighted ×4 | 7,807 | 11,712 | **−50.0%** |
| Built-in bank, raw tokens | 2,179 | 2,989 | **−37.2%** |
| Built-in bank, output-weighted ×4 | 4,141 | 3,553 | **+14.2%** |

**The decision rule.** Jev buys back deliberation tokens and pays for them with
billed input plus the tokens the agent spends restating the evidence. In the
bank shape those meet at an output weight of **2.7**: above it Jev is cheaper,
below it Jev is not. Ordinary reasoning models bill generated tokens at four to
eight times their input rate, so the bank shape is a real saving in practice and
a loss in principle. The ad-hoc shape **never** breaks even at any output
weight, because there the agent also generates the questions.

**On the estimator.** The modelled run (`pnpm run bench`, no network) reports a
+32.5% bank saving rather than +14.2%. Four characters per token under-counts
Jev's billed input by about 1.6× on this corpus — JSON structure and criteria
prose tokenize worse than English prose does. That gap is why `--live` exists,
and it is why the measured figures are the ones printed here. Run both; trust
the measured one.

**When the agent has to restate the evidence inside its tool call, an ad-hoc
Jev call is not a token saving.** The state is paid for twice — once as the
agent's generated tool call, once as Jev's billed input — and that costs more
than the deliberation it removes. This is measured, not guessed, and the
benchmark says so in its own output.

The saving is real in one specific shape, and it is the shape this plugin is
built around:

- **Built-in banks.** `jev_reason` sends the state and a bank id. The question
  definitions — option maps, level ladders, criteria prose — stay in the package
  instead of being regenerated in the model's completion. That is where the
  tokens go.
- **Generated tokens are the expensive ones.** A reasoning model bills its
  output at several times its input rate, so removing deliberation buys more
  than a raw count suggests. `--output-weight` sets that multiplier.
- **Round trips.** Every question about one state is evaluated in parallel in
  one request, so a five-way classification is one call rather than five passes.
- **TypeSafe bills input only.** Output tokens are free, and the response
  reports `usage.input_tokens` so the Jev half of the comparison is measured
  rather than modelled in `--live` mode.

Run it yourself:

```sh
pnpm run build:host
pnpm run bench                      # modelled, no network
pnpm run bench -- --output-weight 8
pnpm run bench:live                 # needs TYPESAFE_API_KEY; uses real usage numbers
pnpm run bench -- --json | jq .totals
```

`scripts/benchmark.mjs --help`-style flags: `--live`, `--json`, `--out <file>`,
`--output-weight <n>`, `--system-prompt <n>`, `--tool-schema <n>`, `--trace <file>`.

**What is measured, what is modelled.** The Jev arm is measured in `--live`
mode from `usage.input_tokens`. The baseline arm is modelled from reference
reasoning shipped as data in `src/benchmark/items-routing.ts` and
`src/benchmark/items-judgement.ts` — read it, disagree with it, replace it with
`--trace`, and re-run. The estimator is four characters per token, applied
identically to both arms, so the ratio is more meaningful than the absolute
figures.

---

## Install and compose

The package ships prebuilt; installation never runs a build.

```sh
pnpm add dsh-plugin-jev
# or from Git, in a DSH profile:
dsh plugin add github:minhlucvan/dsh-plugin-jev
```

`cordis.patch.yml` inserts the core row, the tools row, the skill and the
command, because `dsh-base` provides `tools`, `commands` and `skills` on any
ordinary profile. The route and invariant rows are documented as opt-ins: a
pending injection blocks startup, and not every profile provides `webServer`
(headless does not) or `invariants` (no ordinary profile does).

### The API key

Enter it in the plugin's settings section, in the same place as the model and
the thresholds. It is stored by the host's credential service in
`$DSH_HOME/.credentials.yaml`, not by this plugin, and it is never logged,
returned, or written into the bundle patch.

You can also export it instead:

```sh
export TYPESAFE_API_KEY=...
```

Both work at once, and the host decides which wins. An inherited process
environment is treated as this run's explicit intent and is read-only, so the
settings field reports the reference as not writable and refuses to shadow it;
the provider-managed store otherwise wins over a `.env` file the checkout
happens to carry. The plugin re-resolves the credential on **every** evaluation,
so a key saved in the settings page reaches the very next tool call without
restarting the host.

Configuration carries the **name** of the reference, never the secret.

Where a failure lands depends on whether the key can still be supplied later.
With the credential service mounted — every ordinary profile has it — activation
succeeds and an unset key fails the call that needs it, naming the reference.
Without that service the environment is the only source, so activation stays the
earliest point it can be judged and a missing key fails there. To mount the
plugin with no credential at all, set `enabled: false`; it then publishes no live tool and logs a
warning.

---

## Configuration

| Field | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Master switch; `false` loads without contacting TypeSafe. |
| `apiKeyEnv` | `TYPESAFE_API_KEY` | Environment variable holding the key. |
| `baseUrl` | `https://api.typesafe.ai` | Evaluation endpoint. |
| `model` | `jev-latest` | Model id or alias. Pin `jev-1.13.0` if you tuned thresholds against it. |
| `timeoutMs` | `30000` | Per-attempt deadline. |
| `maxRetries` | `2` | Attempts after the first, for 429/529/5xx/transport. |
| `confidenceFloor` | `0.5` | Below this, an answer is not acted on. |
| `confirmFloor` | `0.85` | At or above this, a high-risk answer may act unreviewed. |
| `maxStateChars` | `200000` | Refuse a larger state locally rather than bill for a rejected request. |
| `ledgerLimit` | `500` | Recent entries retained; cumulative totals are unaffected. |
| `tools.*` | all `true` | Per-tool switches, so a profile publishes only part of the catalog. |

Every field is validated at resolution, and `confidenceFloor` may not exceed
`confirmFloor`.

---

## The tools

| Tool | Primitive | Returns |
| --- | --- | --- |
| `jev_classify` | Choice | `choice`, `confidence`, `route`, `probabilities` |
| `jev_score` | Score | `score`, nearest `level`, `confidence`, `route` |
| `jev_check` | Noul | `noul` (0–1), boolean `verdict`, `route` |
| `jev_ask` | mixed | Every answer in one request, plus a per-answer route |
| `jev_reason` | mixed | A built-in bank's answers, a one-line-per-decision summary, and the strictest route |
| `jev_usage` | — | Session token accounting by tool |

Every tool returns the tokens the call cost, so the model can see the price of
repeating a judgement.

### `route` is confidence-gated routing

The answer says *what*; the confidence says *whether to act*. Each tool
collapses the two:

- `act` — proceed.
- `verify` — proceed, but confirm before doing anything hard to undo.
- `escalate` — do not act on the answer.

Pass `risk: "high"` for destructive or irreversible actions; that raises the
bar before a route becomes `act`. Noul carries no confidence of its own, so the
plugin derives one from the distance of the probability from an even split.

### Question banks — the classification options

`jev_reason` runs one of four banks shipped in the package:

| Bank | Classifies |
| --- | --- |
| `reasoning` | The shape of a task: what kind of work, is the context sufficient, is external data needed, how costly is an error, is it ambiguous, is it decomposable. |
| `answer` | A draft before it is returned: is every claim grounded, does it answer what was asked, does it overstate certainty. |
| `request` | An incoming request: intent, planning depth, whether it needs clarification. |
| `content` | A passage before it is copied: personal data, secrets, durability, time sensitivity. |

They are the "classification options" the System One model is designed around:
each question is atomic, they are evaluated in parallel against one state, and
the answers are combined in code rather than in a prompt. The same banks are
readable over HTTP at `GET /api/dsh-plugin-jev/catalog`.

---

## Companion surfaces

- **`./skills`** contributes `jev-narrow-judgements`, which teaches when a Jev
  call beats reasoning it out, how to keep the state small, and how to read a
  route. The body is rendered from the live configuration, so the thresholds it
  quotes are the ones in force.
- **`./commands`** contributes `/jev` — `/jev usage` reports the session's
  billed tokens, `/jev reset` zeroes the counters. Neither touches the model.
- **`./routes`** serves `GET /api/dsh-plugin-jev/health`, `/usage` and
  `/catalog` for a dashboard. No route returns a credential.
- **`./client`** is the browser face: the settings form and a live usage panel.
- **`./invariant`** asserts the ledger's accounting identity — cumulative totals
  must equal what was evicted plus what is retained — through the host's
  `invariants` service.

Each companion is a separate entry, so the core bundle carries none of the DSH
tool stack, command registry, skill registry or browser carrier.

---

## Development

```sh
pnpm install
pnpm run lint        # Oxlint, type-aware, denies warnings
pnpm test            # Vitest: node and dom projects
pnpm run build       # host entries, browser bundle, artifact verification
pnpm pack --dry-run --json
```

All four must pass before a change is done. `docs/dsh-plugin-contracts.md`
records the standalone-plugin contract this repository follows, and
`.agents/skills/dsh-plugin-*` carries the repository-local workflow.

## License

BSD-3-Clause.

