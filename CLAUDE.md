# CLAUDE.md — Working in this Repository

Repository contract for sessions in `dsh-plugin-system-one`, a standalone ESM Cordis
plugin for DeepSeek Harness that exposes TypeSafe Jev (System One) as agent
tools.

## Commands

Run everything from the repository root:

```sh
pnpm install            # registry dependencies only
pnpm run lint           # Oxlint, type-aware, denies warnings
pnpm test               # Vitest
pnpm run build          # host entries, browser bundle, artifact verification
pnpm pack --dry-run --json
node scripts/check-package.mjs   # needs a prior build
```

Benchmark commands live beside them: `pnpm run bench` (modelled, no network),
`pnpm run bench:live` (needs `TYPESAFE_API_KEY`), `pnpm run bench:report`.

All four gates must pass before a change is considered done.

## Ownership map

| Path | Owns |
|---|---|
| `src/index.ts` | Loader-facing namespace: `name`, `inject`, `Config`, `apply` re-exports only |
| `src/config.ts` | Serializable Schemastery schema, validation, `resolveConfig` |
| `src/config-defaults.ts` | Default values and bounds for every configurable field |
| `src/runtime.ts` | Host boundary (`PluginRuntime`), credential resolution, activation |
| `src/tools.ts` | `./tools` companion: registration through `ctx.tools` |
| `src/skills.ts` | `./skills` companion and the rendered skill body |
| `src/commands.ts` | `./commands` companion: `/jev` |
| `src/routes.ts` | `./routes` companion: the three read-only endpoints |
| `src/prompt.ts` | `./prompt` companion: the system-prompt guidance that drives adoption |
| `src/invariant.ts` | `./invariant` companion: the ledger accounting identity |
| `src/settings.ts` | Per-user settings section installed with the host settings provider |
| `src/client/` | Browser face: settings form, API-key field, and usage panel |
| `src/client/credentials.ts` | Narrow wrapper over the generated `remote.credentials` namespace |
| `src/client/credential-store.ts` | Credential state: reference status, draft, save and clear |
| `src/client/settings-bounds.ts` | Boundary rules: how a stored or typed value becomes a usable one |
| `src/client/usage-store.ts` | The ledger store the usage panel renders from |
| `src/client/styles.ts` / `stylesheet.ts` | The panel's scoped stylesheet and the fiber-owned injector |
| `src/client/tabs.tsx` | The settings tab list and its panel |
| `src/jev/contracts.ts` | Wire types and response guards |
| `src/jev/errors.ts` | `JevRequestError` and its failure classification |
| `src/jev/transport.ts` | Deadlines, backoff, status classification, JSON decoding |
| `src/jev/client.ts` | The evaluation client, retry recursion, response validation |
| `src/jev/ledger.ts` | Cumulative token accounting and its self-check |
| `src/jev/routing.ts` | Confidence thresholds, routes, answer summaries |
| `src/jev/catalog/` | The shipped question banks, one module each, with a registry index |
| `src/jev/service.ts` | The `jev` service the companions inject |
| `src/jev/tool-*.ts` | The tool definitions and their shared helpers |
| `src/benchmark/corpus.ts` | The scenarios, their expected answers, and their task classes |
| `src/benchmark/approaches.ts` | The five integration shapes, priced |
| `src/benchmark/questioning.ts` | What the model has to write, per shape |
| `src/benchmark/live.ts` | Live measurement of every shape, and grading |
| `src/benchmark/quality.ts` | Type-aware answer grading against the expected answer |
| `src/benchmark/escalation.ts` | Which answers a confidence floor hands back |
| `src/benchmark/rows.ts` / `report.ts` | Per-item pricing, then aggregation by shape and task |
| `src/benchmark/breakeven.ts` | The fallback curve and where it stops paying |
| `src/benchmark/sections.ts` / `method.ts` / `format.ts` / `render.ts` | The report |
| `scripts/benchmark.mjs` | The CLI over the built benchmark module |
| `BENCHMARK.md` | The published benchmark: prose, the measured report, the caveats |

## Hard rules

- **No default export.** Every test run asserts `'default' in plugin === false`.
- **Everything is fiber-owned.** Registrations go through `ctx.effect()`,
  `ctx.on()`, or a registry disposer. The `jev` service is provided inside an
  effect so it disappears with the fiber.
- **The core stays host-free.** Nothing under `src/jev/` may import Cordis or
  `dsh-tools`. That boundary is what makes the client, ledger, routing and
  benchmark testable in plain Node.
- **No parent imports.** With one exception, modules import siblings with
  `./name.ts`. `src/jev/service.ts` declares the configuration subset it needs
  rather than reaching up to `src/config.ts`.
- **Stay inside this repository.** No source, configuration, or documentation
  path may leave the root; no `link:` or `file:` dependencies.
- **The credential is a reference, not a value.** Configuration carries
  `apiKeyEnv`; the runtime resolves it per evaluation through `ctx.credentials`
  when that service is mounted, and through the environment when it is not.
  Never log, return, or commit the secret, and never cache it across calls — a
  key saved in the settings page must reach the next call. The seam itself is
  looked up per evaluation too: Cordis mounts the host's credential provider as
  its own row, and this plugin's inserted row is applied first, so sampling the
  seam once at activation would report "no provider" for the life of the fiber.
  A missing key therefore never refuses activation — activation is what installs
  the settings section that supplies one. It warns once, and the call that needs
  the key names it.
- **The benchmark must stay honest.** The baseline arm is modelled from
  reference reasoning that ships as data. If a change makes the result look
  better, check whether it made the comparison worse. Every shape is graded
  against the corpus's expected answer as well as priced, because a cheaper shape
  that answers the wrong question is not a cheaper integration. `BENCHMARK.md`
  publishes the numbers; the prose around its measured report is hand-written and
  the report section is the CLI's output.
- **No TypeScript-only escapes.** `@ts-ignore`/`@ts-expect-error` and `any`
  leaks are lint errors.
- **Keep documentation in sync.** Behavior changes update `README.md`,
  configuration JSDoc, tests, and `cordis.patch.yml` together.

## Client architecture

The browser face is a React tree over a zustand store: one store per plugin
instance, narrow selectors in `hooks.ts`, components that take no state as
props, and a slot-facing seam that only mounts the provider. `zustand` is
bundled, not host-supplied — never add it to `deps.neverBundle` in
`tsdown.client.config.ts`.

## Testing

- The `node` project covers `tests/**/*.test.ts`; the `dom` project covers
  `tests/**/*.test.tsx`.
- Test companions against fakes of the services they inject, asserting both
  registration and disposal. A registration that survives disposal leaks across
  reloads and is invisible until the profile reloads.
- Transport cases use an injected `fetch` and a no-op `sleep`, so retry policy
  is tested without a network or a real wait.

## Release

- `pnpm run build` produces `lib/`; `pnpm pack --dry-run --json` must list every
  file named by `main`, `types`, `exports`, and `files`.
- The package ships prebuilt: installation never runs a `prepare` hook.
- `.github/workflows/release.yml` packs on every push to `main` and attaches the
  tarball to the GitHub Release tagged `v<package.json version>`.
- Publishing to npm is not automated. Do not run `pnpm publish` or bump the
  version unless the request explicitly asks for it.

