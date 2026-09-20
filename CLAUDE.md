# CLAUDE.md — Working in this Repository

Repository contract for sessions in `dsh-plugin-jev`, a standalone ESM Cordis
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
| `src/config.ts` | Serializable Schemastery schema, defaults, validation, `resolveConfig` |
| `src/runtime.ts` | Host boundary (`PluginRuntime`), credential resolution, activation |
| `src/tools.ts` | `./tools` companion: registration through `ctx.tools` |
| `src/skills.ts` | `./skills` companion and the rendered skill body |
| `src/commands.ts` | `./commands` companion: `/jev` |
| `src/routes.ts` | `./routes` companion: the three read-only endpoints |
| `src/invariant.ts` | `./invariant` companion: the ledger accounting identity |
| `src/client/` | Browser face: settings form and usage panel |
| `src/jev/contracts.ts` | Wire types and response guards |
| `src/jev/errors.ts` | `JevRequestError` and its failure classification |
| `src/jev/transport.ts` | Deadlines, backoff, status classification, JSON decoding |
| `src/jev/client.ts` | The evaluation client, retry recursion, response validation |
| `src/jev/ledger.ts` | Cumulative token accounting and its self-check |
| `src/jev/routing.ts` | Confidence thresholds, routes, answer summaries |
| `src/jev/catalog.ts` | The four shipped question banks |
| `src/jev/service.ts` | The `jev` service the companions inject |
| `src/jev/tool-*.ts` | The tool definitions and their shared helpers |
| `src/benchmark/` | Corpus, cost arms, live measurement, report rendering |
| `scripts/benchmark.mjs` | The CLI over the built benchmark module |

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
- **The credential is a name, not a value.** Configuration carries
  `apiKeyEnv`; the runtime reads the variable. Never log, return, or commit the
  secret. Activation fails loudly when the plugin is enabled and the variable is
  empty.
- **The benchmark must stay honest.** The baseline arm is modelled from
  reference reasoning that ships as data. If a change makes the result look
  better, check whether it made the comparison worse.
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

