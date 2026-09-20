# Jev benchmark — which integration shape pays

Jev is cheap per token and produces no deliberation at all, so the interesting
question is not *whether* to delegate a decision to it but *how* to call it. This
benchmark prices five integration shapes on four axes — dollars, seconds, tokens,
and whether the answers were right — over four decisions a coding agent makes
every day.

Everything Jev-side below is **measured** against `api.typesafe.ai`
(`jev-latest`, 2026-09-20, one sample per shape). The baseline — the agent
reasoning the same decisions out in its own context — is **modelled** from the
reference reasoning the corpus ships, because a model that was never asked to run
the comparison reports nothing about it. That is the one number here nobody
measured, and the Method section says so.

## What to ship

| If the decision is… | Ship | Measured |
| --- | --- | --- |
| one a bank already covers | **one `jev_reason` call** | **52% cheaper, 60% faster** than reasoning it out |
| covered, but you distrust low-confidence answers | the bank call, then judge *whether* to fall back | falling back on 7 of 15 answers erased the entire saving |
| not covered by a bank | one batched `jev_ask` call — and expect to pay for it | **52% dearer** than reasoning it out |
| several questions about one state | still one call | one call per question costs **1.8× one batched call**, and **10.8× the bank call** |

The rule the numbers support: **keep the question definitions in the package, and
ask about one state once.** A bank does both. Hand-written questions do neither,
and a per-question fan-out does the opposite of both.

## What the numbers say

**1. A bank call is the only shape that beats reasoning.** It sends the state and
a bank id; the option maps, level ladders and criteria prose stay in the package,
so the model writes a few dozen tokens instead of several hundred. Measured over
the three scenarios a bank covers: **+52.4% cost, +59.8% time** — while moving
**19% more tokens**. The tokens it adds are the cheap kind ($0.042/Mtok, output
free); the ones it removes are the expensive kind ($0.15–0.60/Mtok).

**2. Writing the questions yourself is worse than not delegating.** The ad-hoc
shape makes the same one round trip, but the model has to write the state *and*
every question into its own completion. Measured: **−51.5% cost, −117.8% time** —
it is dearer and slower than simply thinking. Generated tokens are the whole
difference between the shapes.

**3. Fanning out one call per question is far worse than either.** The state is
re-sent with every call and the round trips stop overlapping: **−167.4% cost,
−287.6% time** — $0.004704 against $0.002665 for the same questions in one
batched call. Nine atomic questions about one state are one request, not nine.

**4. The fallback is not free — and the default threshold overshoots.** The gated
shape asks the bank, then hands the answers below the confirm floor (0.85) back to
the model. On this corpus 7 of 15 answers fell below it, and re-reasoning those 7
moved the shape from **+52.4% to −1.5%**: the fallback consumed the entire saving.
The break-even curve says a fallback is affordable up to **40%** of decisions on
cost and **60%** on wall-clock, so a deployment that wants both the bank's price
and a safety net should lower its threshold rather than accept the default.
Whether that is worth doing is per class: at this threshold the fallback still
leaves the bank shape ahead on coding (**+17.9%**) and exploring (**+6.7%**), and
behind on testing (**−35.4%**, where the model was least sure).

**5. Accuracy is close, and not perfect.** Every measured shape was graded against
the answer a careful reader reaches: the bank shape matched **13 of 15** (86.7%),
the ad-hoc and per-question shapes **20 of 24** (83.3%). Splitting the call did
not improve a single answer — it only cost 3.3× as much. The disagreements are
listed in the report below, because a bank whose taxonomy disagrees with its
readers is a bank worth editing.

## The measured report

### Recommendation

**Bank call** — One call naming a shipped bank; the questions stay in the package.

Over the 3 scenarios this shape covers (15 decisions): **+52.4% cost**, **+59.8% time**, −19.1% tokens against reasoning it out.

### Every shape, over what it covers

| Shape | Scenarios | Decisions | Cost | Time | Tokens | Kept | Answers matched |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Reason it out | 4 | 24 | — | — | — | — | — |
| Bank call | 3 | 15 | +52.4% | +59.8% | −19.1% | — | 86.7% (13/15) |
| Bank + fallback | 3 | 15 | −1.5% | +12.8% | −79.8% | 7/15 | 86.7% (13/15) |
| Ad-hoc call | 4 | 24 | −51.5% | −117.8% | −58.7% | — | 83.3% (20/24) |
| Call per question | 4 | 24 | −167.4% | −287.6% | −237.8% | — | 83.3% (20/24) |

Positive is better. Each row is compared against reasoning *its own* scenarios
out, so a shape that covers fewer scenarios is not flattered by the ones it skips.

### What that is in absolute terms

The figure in brackets is what reasoning the same scenarios out costs.

| Shape | Cost | Time | Tokens |
| --- | ---: | ---: | ---: |
| Reason it out | $0.001759 ($0.001759) | 36.3s (36.3s) | 6,274 (6,274) |
| Bank call | $0.000437 ($0.000917) | 8.1s (20.1s) | 3,701 (3,107) |
| Bank + fallback | $0.000931 ($0.000917) | 17.5s (20.1s) | 5,587 (3,107) |
| Ad-hoc call | $0.002665 ($0.001759) | 79.2s (36.3s) | 9,957 (6,274) |
| Call per question | $0.004704 ($0.001759) | 140.9s (36.3s) | 21,192 (6,274) |

### Per task class

Cells are cost / time saved against reasoning that class out.

| Task | Decisions | Bank call | Bank + fallback | Ad-hoc call | Call per question |
| --- | ---: | ---: | ---: | ---: | ---: |
| coding | 5 | +53.4% / +63.6% | +17.9% / +36.6% | −20.9% / −58.2% | −127.4% / −190.6% |
| testing | 4 | +39.9% / +40.1% | −35.4% / −27.0% | −37.5% / −90.1% | −154.5% / −253.2% |
| exploring | 6 | +61.0% / +70.4% | +6.7% / +19.7% | −30.2% / −72.9% | −126.5% / −211.4% |
| investigating | 9 | — | — | −75.9% / −173.7% | −203.1% / −376.3% |

### Where the answers disagreed

Every measured shape is graded against the answer a careful reader reaches.
These are the decisions that came back different:

| Scenario | Question | Expected | Answered | Shapes |
| --- | --- | --- | --- | --- |
| coding | review_depth | The diff and the surrounding code must both be read | It must be run, and the result reasoned about against the whole system | bank, gated, adhoc, split |
| testing | is_regression_test | yes | no | bank, gated, adhoc, split |
| comparing | profile-repository::change_cost | Moderate: more than one caller reaches the file, so a change needs tests around each of them | Low: the file is narrowly scoped, so a change can be made and verified in isolation | adhoc, split |
| comparing | profile-sync::change_cost | Moderate: more than one caller reaches the file, so a change needs tests around each of them | Low: the file is narrowly scoped, so a change can be made and verified in isolation | adhoc, split |

### Where the fallback stops paying

Escalating the least confident answers first, over the scenarios a shipped bank covers:

| Answers kept | Cost | Time |
| ---: | ---: | ---: |
| 0.0% | +52.4% | +59.8% |
| 5.0% | +52.4% | +59.8% |
| 10.0% | +31.6% | +44.9% |
| 15.0% | +21.1% | +38.1% |
| 20.0% | +21.1% | +38.1% |
| 25.0% | +14.4% | +30.0% |
| 30.0% | +10.4% | +25.6% |
| 35.0% | +10.4% | +25.6% |
| 40.0% | +3.8% | +18.8% |
| 45.0% | −1.1% | +13.2% |
| 50.0% | −4.9% | +8.6% |
| 55.0% | −4.9% | +8.6% |
| 60.0% | −11.2% | +2.4% |
| 65.0% | −15.7% | −2.4% |
| 70.0% | −22.7% | −11.1% |
| 75.0% | −26.7% | −15.2% |
| 80.0% | −26.7% | −15.2% |
| 85.0% | −26.7% | −15.2% |
| 90.0% | −40.6% | −31.8% |
| 95.0% | −47.6% | −40.2% |
| 100.0% | −47.6% | −40.2% |

The bank shape stays cheaper on cost until **40.0%** of decisions are handed back, and faster until **60.0%**.

### Per scenario

Cost saved against reasoning the same scenario out.

| Scenario | Task | Decisions | Bank | Ad-hoc | Per question |
| --- | --- | ---: | ---: | ---: | ---: |
| Coding — classify a change before reporting it | coding | 5 | +53.4% | −20.9% | −127.4% |
| Testing — triage a failing test | testing | 4 | +39.9% | −37.5% | −154.5% |
| Exploring — scope an unfamiliar task | exploring | 6 | +61.0% | −30.2% | −126.5% |
| Comparing — rank three suspects in one fan-out | investigating | 9 | — | −75.9% | −203.1% |

### Method

Every shape answers the same questions about the same state, and every call is
counted the same way: the tokens the agent model reads, the tokens it writes
(including the tool call it has to generate), and the tokens TypeSafe bills.

- **Mode**: measured. Jev tokens, round trips and answers came back from the API.
- **Prices**: agent model $0.15/Mtok in and $0.6/Mtok out at 50 tok/s; Jev $0.042/Mtok in, output free.
- **Fallback threshold**: 85.0% — answers below it are reasoned out by the model instead.
- **Baseline**: modelled from the reference reasoning the corpus ships
  (`src/benchmark/items-*.ts`). Read it, disagree with it, replace it with
  `--trace <file>`, and re-run.
- **Time** is generated tokens divided by the agent model rate, plus the Jev
  round trip. Generating a deliberation is what takes the time.

### Limitations

- The baseline is modelled, not captured. It is the one number in the report
  nobody measured, and the one the comparison is most sensitive to.
- A live run measures one sample per shape. Billing figures repeat closely;
  round trips depend on the network to TypeSafe.
- The corpus is four scenarios a coding agent meets daily, not a random sample
  of everything an agent does. It is sized to be read and argued with.
- Prices move. Every figure is a function of the price list above, and the CLI
  overrides exist so another pair can be priced without touching the corpus.

## Per task class: what the table above is telling you

The per-class matrix in the report is the part worth acting on. Its shape is
uniform: a bank pays wherever one exists, and the only class where delegation
costs money — investigating, the nine-question fan-out — is the class no bank
covers. That is an argument for shipping more banks rather than for writing
better ad-hoc questions, and it is why this package ships six.

## Reproduce

```sh
pnpm run build:host
pnpm run bench                                   # modelled, instant, no network
TYPESAFE_API_KEY=... pnpm run bench:live -- --out report.md          # the report section of this file
pnpm run bench -- --fallback-threshold 0.5       # price a different fallback policy
pnpm run bench -- --llm-input-price 0.30 --llm-output-price 1.20   # peak hours
```

Everything under `## The measured report` is that command's output pasted in; the
prose around it is not generated. Prices, the fallback threshold, the instruction
and tool-schema sizes, and the agent model's throughput are all flags, so the
comparison can be re-priced for another deployment without touching the corpus.

---

## Appendix: the modelled run

The same shapes priced from the corpus alone, with no network. The fallback row is
absent because a modelled run has no measured confidence to escalate on.


### Recommendation

**Bank call** — One call naming a shipped bank; the questions stay in the package.

Over the 3 scenarios this shape covers (15 decisions): **+56.5% cost**, **+44.3% time**, +9.6% tokens against reasoning it out.

### Every shape, over what it covers

| Shape | Scenarios | Decisions | Cost | Time | Tokens | Kept | Answers matched |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Reason it out | 4 | 24 | — | — | — | — | — |
| Bank call | 3 | 15 | +56.5% | +44.3% | +9.6% | — | — |
| Bank + fallback | 0 | 0 | — | — | — | — | — |
| Ad-hoc call | 4 | 24 | −49.0% | −123.4% | −42.1% | — | — |
| Call per question | 4 | 24 | −151.8% | −360.5% | −133.3% | — | — |

Positive is better. Each row is compared against reasoning *its own* scenarios
out, so a shape that covers fewer scenarios is not flattered by the ones it skips.

### What that is in absolute terms

The figure in brackets is what reasoning the same scenarios out costs.

| Shape | Cost | Time | Tokens |
| --- | ---: | ---: | ---: |
| Reason it out | $0.001759 ($0.001759) | 36.3s (36.3s) | 6,274 (6,274) |
| Bank call | $0.000399 ($0.000917) | 11.2s (20.1s) | 2,809 (3,107) |
| Bank + fallback | $0.000000 ($0.000000) | 0.0s (0.0s) | 0 (0) |
| Ad-hoc call | $0.002621 ($0.001759) | 81.2s (36.3s) | 8,918 (6,274) |
| Call per question | $0.004428 ($0.001759) | 167.4s (36.3s) | 14,637 (6,274) |

### Per task class

Cells are cost / time saved against reasoning that class out.

| Task | Decisions | Bank call | Bank + fallback | Ad-hoc call | Call per question |
| --- | ---: | ---: | ---: | ---: | ---: |
| coding | 5 | +57.8% / +47.1% | — | −16.5% / −62.6% | −107.1% / −273.6% |
| testing | 4 | +44.8% / +22.3% | — | −32.6% / −101.1% | −134.5% / −334.7% |
| exploring | 6 | +64.2% / +57.5% | — | −27.0% / −80.8% | −106.9% / −292.1% |
| investigating | 9 | — | — | −75.2% / −176.9% | −192.1% / −438.5% |

### Per scenario

Cost saved against reasoning the same scenario out.

| Scenario | Task | Decisions | Bank | Ad-hoc | Per question |
| --- | --- | ---: | ---: | ---: | ---: |
| Coding — classify a change before reporting it | coding | 5 | +57.8% | −16.5% | −107.1% |
| Testing — triage a failing test | testing | 4 | +44.8% | −32.6% | −134.5% |
| Exploring — scope an unfamiliar task | exploring | 6 | +64.2% | −27.0% | −106.9% |
| Comparing — rank three suspects in one fan-out | investigating | 9 | — | −75.2% | −192.1% |

### Method

Every shape answers the same questions about the same state, and every call is
counted the same way: the tokens the agent model reads, the tokens it writes
(including the tool call it has to generate), and the tokens TypeSafe bills.

- **Mode**: modelled. Jev tokens and round trips are estimated; run with --live to measure them.
- **Prices**: agent model $0.15/Mtok in and $0.6/Mtok out at 50 tok/s; Jev $0.042/Mtok in, output free.
- **Fallback threshold**: 85.0% — answers below it are reasoned out by the model instead.
- **Baseline**: modelled from the reference reasoning the corpus ships
  (`src/benchmark/items-*.ts`). Read it, disagree with it, replace it with
  `--trace <file>`, and re-run.
- **Time** is generated tokens divided by the agent model rate, plus the Jev
  round trip. Generating a deliberation is what takes the time.

### Limitations

- The baseline is modelled, not captured. It is the one number in the report
  nobody measured, and the one the comparison is most sensitive to.
- A live run measures one sample per shape. Billing figures repeat closely;
  round trips depend on the network to TypeSafe.
- The corpus is four scenarios a coding agent meets daily, not a random sample
  of everything an agent does. It is sized to be read and argued with.
- Prices move. Every figure is a function of the price list above, and the CLI
  overrides exist so another pair can be priced without touching the corpus.
