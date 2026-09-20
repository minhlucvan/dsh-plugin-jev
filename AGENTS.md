# Contributor Notes

This repository is a standalone DeepSeek Harness (DSH) Cordis plugin that puts
TypeSafe Jev (System One) behind agent tools. It was scaffolded from the
standalone-plugin template and follows that template's contract.

- Preserve the function-plugin named exports: `name`, `inject`, `Config`, and
  `apply`; do not add a default export. Cordis Loader unwraps
  `exports.default ?? exports`, so a stray default silently discards all four.
- Keep Loader metadata in `src/index.ts`, schema and defaults in `src/config.ts`,
  and the host boundary plus activation in `src/runtime.ts`.
- The core plugin provides the `jev` Cordis service; `./tools`, `./skills`,
  `./commands`, `./routes` and `./invariant` inject it. Never let a companion
  build its own client — the ledger and the policy have to be one instance.
- Keep everything under `src/jev/` free of host imports. It is the portable
  core: contracts, transport, ledger, routing, catalog, service.
- Keep all registrations scoped to the plugin fiber and test disposal.
- Host APIs are peer dependencies; resolve development imports from this
  repository's declared dependencies.
- Do not add source, configuration, documentation, or project-reference paths
  that leave this repository, and do not add `link:` or `file:` dependencies.
- Describe repository files with project-root paths such as
  `docs/dsh-plugin-contracts.md`; never use parent-directory navigation.
- The package name is `dsh-plugin-system-one` and the Cordis plugin id is `jev`. Use
  both verbatim in package metadata, bundle rows, invariant registration, tests,
  and documentation.
- Update `README.md`, configuration JSDoc, tests, and `cordis.patch.yml` together
  when behavior changes.
- Adoption is a feature, not a nicety: a model that has always reasoned its own
  way through a classification keeps doing that. The `./prompt` companion is the
  lever that tells it otherwise, so keep its guidance accurate, specific, and
  worth the tokens it adds to every turn.
- The credential is read through the host's credential seam, never from a value
  in configuration. The browser settings section stores it there; the plugin
  re-resolves it on every evaluation so a saved key reaches the next call.
- The benchmark makes a public claim. Any change to a cost arm, a shape, the
  corpus, or the assumptions must keep `pnpm run bench` honest and update both
  the table in `README.md` and the measured section of `BENCHMARK.md`. Never
  tune the corpus to flatter the result, and never drop an answer-grading result
  because it makes the plugin look worse: the disagreements are the finding.
- Run `pnpm run lint`, `pnpm test`, `pnpm run build`, and
  `node scripts/check-package.mjs` before publishing changes.

