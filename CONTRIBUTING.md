# Contributing

## The contract (read first)

FAR-Lab is a scientific-research operating environment whose core value is
**verifiable honesty**: every claim the product emits is bound to artifacts the
product can re-verify. Contributions are held to the same standard.

Hard lines (violations are reworked, not argued):

- No mocked success paths in product code; test doubles live behind explicit
  test-only gates (`FARLAB_TEST_DOUBLE`).
- No weakened tests/assertions/thresholds to make a gate green. If a threshold
  fails, fix the root cause.
- New capabilities must be reachable on a real path with a real caller, and
  failure/cancel/retry/partial results are implemented and tested at the same
  level as the happy path.
- Credentials never enter files, logs, or exports. Provider keys are
  `process.env`-only.
- New code is type-clean: no `any`, no double assertions, no `@ts-ignore`, no
  empty `catch`.

## Workspaces

| dir | what |
| --- | --- |
| `src/` | engine: domain, pipeline stages, persistence, server, CLI |
| `web/` | React UI (its own tsconfig/vite) |
| `desktop/` | Tauri shell (`desktop/src-tauri`) |
| `experiment-runtime/` | Python sidecar (uv-managed, one lock for 3.11/3.12) |
| `tests/` | root vitest suite (drives real sidecars where possible) |
| `zcode-harness/` | repo automation gates (sweep ledger, completion gate) |

## Gates

Root (`npm ci` first):

```
npm run typecheck
npm run lint
npm test          # full vitest suite
npm run build     # tsc -p tsconfig.json (dist for spawn tests & far CLI)
```

Web (`cd web && npm ci`): `npx tsc -p tsconfig.json --noEmit && npx vite build`.
E2E: `npx playwright test` (needs the dev server env from `scripts/serve-e2e.mjs`).

A pull request is mergeable only with all of these green plus CI (3-OS verify
matrix, browser-matrix e2e, dependency audits, CodeQL, desktop compile-only).
CI failing on `windows-latest` while green elsewhere is still failing — see
docs/TROUBLESHOOTING.md for the Windows-specific traps (docker OSType, stale
`dist`, git template leakage) before assuming flake.

## Workflow

1. Branch per lane from `main` (`lane/<topic>`), rebase onto `main` before
   merge, fast-forward merge — one squash-topic per lane, no merge commits.
2. One commit does one thing; subject ≤ 72 chars, `type(scope): subject`
   (`feat` / `fix` / `refactor` / `docs` / `test` / `chore` / `perf` / `ci`).
3. Shared worktree discipline: if another session is active on the same tree,
   re-read shared files before editing them (`web/src/i18n/dict.ts`,
   `web/src/lab/StudyMap.tsx`, `src/server/api.ts` are the usual contention
   points) and keep your lane's file set disjoint.
4. Evidence discipline: a claim of "done" includes the command, its exit code,
   and where the pointer was recorded (SWEEP-LOG / FA / ACCEPTANCE_STATUS).

## Adding capability code

Pipeline stages, executors, sources, parsers, and evaluators are extension
points — see docs/EXTENSIBILITY.md. Deterministic code owns verdicts; the model
proposes within a closed space. Numerics must validate against analytic
solutions or a reference implementation (see the FEM executor tests for the
pattern).
