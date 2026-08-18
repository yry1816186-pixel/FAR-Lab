# FAR-Lab Refactor Validation Report

Validation date: 2026-08-18  
Baseline: `main@1e2c8b3c7c8706292f890138e88948ab7dcb80a3`  
Work branch: `ux-refactor/2026-08-18`

This report distinguishes checks actually executed from checks blocked by the current execution sandbox.

## Baseline GitHub Actions (before refactor changes)

The baseline PR-triggered CI was executed on the synchronized `main` content plus the isolated source-export workflow.

| Check | Actual result |
|---|---|
| Source export checkout/package/upload | PASS |
| Cross-platform matrix | PASS |
| Frontend typecheck | PASS |
| Frontend ESLint | PASS |
| Frontend Vitest | PASS — 123 tests reported by CI job |
| Frontend production build | PASS |
| Root TypeScript typecheck | PASS |
| Root ESLint | PASS |
| Root TS test shards | PASS |
| Performance budget gate | PASS |
| OpenAPI/JSON-schema contract checks | PASS |
| Offline release smoke (`doctor`, `version`, demo, export, verify) | PASS |
| LaTeX real render + `pdflatex` compile | PASS |

Python and Build Integrity jobs were still completing when the refactor working copy was first created; final post-refactor results are recorded below after publication.

## Local execution sandbox

- Node.js: `v22.16.0`.
- `pnpm`: unavailable in the sandbox PATH.
- Repository `node_modules` / `frontend/node_modules`: intentionally not included in source artifact.
- Direct GitHub clone/network package installation is unavailable from the sandbox.

Attempted local command:

```text
node --test tests/cli/render.test.ts
```

Result: **BLOCKED BY LOCAL ENVIRONMENT**, exit 1, because plain Node in this sandbox has no `.ts` loader and dependencies were not installed. This is not counted as a product test failure; the same repository tests are run in GitHub Actions with the project's declared toolchain.

## Refactor-specific validation targets

Post-refactor CI must verify:

- command-center TypeScript, lint, keyboard navigation regression test;
- i18n zh/en key parity;
- semantic color-token compilation through Tailwind/Vite;
- CLI CJK display-width regression test;
- HTML report semantic/print assertions;
- existing frontend 123+ tests and production build;
- existing root TS/Python/integrity/cross-platform/release smoke gates.

## Post-refactor GitHub Actions

_To be replaced with actual run/job outcomes after the refactor commit is published._

## Visual QA

_To be replaced with actual browser screenshot/run outcomes after the refactor commit is published. Visual QA is performed ephemerally in CI so the project does not acquire a heavyweight browser-test runtime dependency solely for screenshots._

## Performance

The repository's existing `scripts/perf_budget_check.mjs` remains the authoritative lab performance gate. No field Core Web Vitals claim is made: CI/lab measurement is not production field telemetry.
