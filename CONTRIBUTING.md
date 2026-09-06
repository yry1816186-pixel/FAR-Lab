# Contributing to FAR-Lab

Thank you for your interest in contributing. FAR-Lab is a scientific-research
operating environment whose core value is **verifiable honesty** — every claim the
product emits is bound to artifacts the product can re-verify. Contributions are
held to the same standard.

This guide covers the contract, your environment, and the workflow. Skim the
[Table of contents](#table-of-contents) first.

## Table of contents

- [The contract](#the-contract)
- [Development setup](#development-setup)
- [Workspaces](#workspaces)
- [Quality gates](#quality-gates)
- [Workflow](#workflow)
- [Commit messages](#commit-messages)
- [Adding capability code](#adding-capability-code)
- [Asking for help](#asking-for-help)

## The contract

Hard lines (violations are reworked, not argued):

- **No mocked success paths in product code.** Test doubles live behind explicit
  test-only gates (`FARLAB_TEST_DOUBLE`). A file, endpoint, or module existing does
  not prove the capability is integrated, reachable, or production-ready.
- **No weakening tests, assertions, or thresholds to make a gate green.** If a
  threshold fails, fix the root cause. A failed test is information, not an
  obstacle.
- **New capabilities must be reachable on a real path with a real caller**, and
  failure / cancel / retry / partial-result behavior is implemented and tested at
  the same level as the happy path.
- **Credentials never enter files, logs, or exports.** Provider keys are
  `process.env`-only.
- **New code is type-clean:** no `any`, no double assertions, no `@ts-ignore`, no
  empty `catch`.
- **Claim it, show it.** A "done" report includes the command, its exit code, and
  where the evidence pointer was recorded.

## Development setup

```bash
# Core engine (Node ≥ 24)
npm install
npm run build          # tsc -p tsconfig.json → dist/

# Web workbench (separate package)
cd web && npm install

# Experiment sidecar (Python ≥ 3.11, uv-managed) — only for experiment tests
cd experiment-runtime && uv sync

# Optional: sandbox image required for production explore_code
npm run sandbox:build && npm run sandbox:verify
```

## Workspaces

| Directory | What lives there |
| --- | --- |
| `src/` | engine: domain, pipeline stages, persistence, server, CLI |
| `web/` | React UI (its own tsconfig / Vite) |
| `desktop/` | Tauri shell (`desktop/src-tauri`) |
| `experiment-runtime/` | Python sidecar (uv-managed, one lock for 3.11/3.12) |
| `packages/tui/` | optional interactive terminal UI (isolated Ink package) |
| `tests/` | root Vitest suite (drives real sidecars where possible) |
| `zcode-harness/` | repo automation gates (sweep ledger, completion gate) |
| `project-spec/` `docs/` | specification, policies, and long-form docs |

## Quality gates

A pull request is mergeable only when everything below is green, locally and in CI.

```bash
# Root (run `npm ci` first)
npm run typecheck
npm run lint
npm test              # full Vitest suite
npm run build         # dist/ for spawn tests and the far CLI

# Web (`cd web && npm ci` first)
npx tsc -p tsconfig.json --noEmit && npx vite build

# End-to-end (needs the dev server env from scripts/serve-e2e.mjs)
npx playwright test
```

CI runs the same checks across a three-OS verify matrix, a browser e2e matrix,
dependency audits, CodeQL, and desktop compile-only builds. **CI failing on
`windows-latest` while green elsewhere is still failing** — check
[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for the Windows-specific traps
(Docker OSType, stale `dist`, git template leakage) before assuming a flake.

## Workflow

1. **Branch per lane from `main`** (`lane/<topic>`); integrate via pull request.
   Direct commits to `main` are hook-rejected, and the repo ruleset gates merges on
   CI. Keep one squash-topic per lane; merge commits happen only at the PR boundary,
   never on the lane itself.
2. **One commit does one thing** (see [Commit messages](#commit-messages)).
3. **Shared-worktree discipline.** If another session is active on the same tree,
   re-read shared files before editing them (`web/src/i18n/dict.ts`,
   `web/src/lab/StudyMap.tsx`, `src/server/api.ts` are the usual contention points)
   and keep your lane's file set disjoint.
4. **Open a PR** describing the change, the behavior before/after, and the exact
   commands you ran with their exit codes. Link the issue or spec section.

## Commit messages

Use Conventional Commits: `type(scope): subject`, subject ≤ 72 characters,
imperative mood, no trailing period.

Allowed types: `feat` · `fix` · `refactor` · `docs` · `test` · `chore` · `perf` · `ci`.

```
fix(audit): root-fix findings from the offline adversarial audit
feat(eval): opt-in judge-band calibration framework
docs(readme): restructure features, correct counts, add zh summary
```

Body (optional) explains the *why*, not the *what*; reference issues with
`Fixes #NNN` / `Refs #NNN`.

## Adding capability code

Pipeline stages, executors, sources, parsers, and evaluators are extension points —
see [docs/EXTENSIBILITY.md](docs/EXTENSIBILITY.md). The governing split:
**deterministic code owns verdicts; the model proposes within a closed space.**
Numerics must validate against analytic solutions or a reference implementation (see
the FEM executor tests for the pattern). Prefer reuse over rebuilding commodity
infrastructure, and make the smallest sufficient change.

## Asking for help

Open an issue for bugs and feature discussions; for anything covered by
[SECURITY.md](SECURITY.md) — including suspected vulnerabilities — report privately
and do **not** open a public issue.
