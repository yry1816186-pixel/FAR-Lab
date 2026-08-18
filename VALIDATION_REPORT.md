# FAR-Lab Human Experience Validation Report

Validation date: 2026-08-18
Target branch: `main`
Current production closure commit under validation: `82cc84d809e605b06770be530dc09367836f2631`

## Status

**NOT COMPLETED** under the repository Definition of Done.

The Human Experience refactor is merged to `main`, including the final removal of the fixture-led V2 Receipt production flow, but the complete build/test/browser matrix has not been re-executed against the current `main` commit. This report therefore keeps historical failures visible and does not relabel them as passes.

## Last complete hosted command matrix

GitHub Actions run: `32105915454` (2026-08-18). This run predates the final `main` fixes recorded below.

| Check | Command | Exit | Duration | Result |
|---|---|---:|---:|---|
| Build / typecheck / lint aggregate | `pnpm run build:check` | 0 | 40s | **PASS** |
| Frontend Vitest | `npm --prefix frontend run test` | 1 | 27s | **FAIL** |
| Root Node tests | `pnpm run test` | 1 | 116s | **FAIL** |
| Python tests | `pnpm run test:py` | 0 | 1s | **PASS** |
| UX + CLI gates | `node --test tests/gates/*.test.ts tests/cli/*.test.ts` | 0 | 20s | **PASS** |
| Lab performance budget | `pnpm run perf:budget` | 0 | 2s | **PASS** |
| OpenAPI contract | `pnpm run openapi:check` | 0 | 1s | **PASS** |
| CLI help | `node src/cli/far.ts --help` | 0 | 1s | **PASS** |
| CLI `NO_COLOR` help | `env NO_COLOR=1 node src/cli/far.ts --help` | 0 | 0s | **PASS** |

### Actual counts from that run

- Frontend Vitest: **36 files; 35 passed / 1 failed. 394 tests; 393 passed / 1 failed.**
- Root Node tests: **4036 tests; 4020 passed / 1 failed** (remaining tests were non-failing skipped/todo/cancelled categories reported by the runner).
- Python: **129 passed**.
- Explicit UX / CLI gates: **299 passed / 0 failed**.

## Historical failures and source resolution

### Frontend: V2 Receipt production page

The single frontend failure was `V2ReceiptPage`: the page blocked on the built-in `/api/v2/receipts/demo` request before exposing the real receipt workspace. That was a product defect, not merely a test timing issue.

Resolved in `82cc84d809e605b06770be530dc09367836f2631`:

- production `/v2-receipt` no longer calls `useDemoReceipt`;
- the demo/reference receipt is no longer a production data source, page-level loading gate, success state, provenance state, or six-dimension result source;
- persisted receipts, `runId` deep links, envelope upload verification, manifest details, latest verification dimensions, and re-verification remain real API-backed paths;
- tests were rewritten to assert that the production page never requests `/api/v2/receipts/demo` and that six assurance dimensions come from the real verification response path.

A complete current-main frontend Vitest rerun is still required before this item can be marked fully validated.

### Root tests: complexity ledger

The single root failure was the governance complexity ledger: nine module budgets were stale after the refactor (`discovery`, `evaluation`, `far_proof`, `gates`, `math`, `retrieval`, `science`, `science_harness`, `statistics`). Current `main` contains the corrected actual counts rather than suppressing the gate.

A targeted post-fix run of `tests/governance/complexity_ledger.test.ts` was executed in the reconstructed source snapshot with the current budget values using Node + ts-node: **5 tests passed / 0 failed**. The complete current-main root suite has not yet been rerun.

## Browser / responsive / accessibility evidence

The historical browser QA artifact contains **25 Chromium screenshots**:

- all 17 named product routes at desktop/light;
- Research at desktop dark, tablet, mobile light, and mobile dark;
- Integrity desktop dark;
- Report tablet dark;
- Audit mobile;
- Overview at 1920×1080.

The browser job itself was **FAILURE** because the automation pressed `Ctrl+K` immediately after `DOMContentLoaded`, before the React effect registering the command-center shortcut was guaranteed to be mounted. The route screenshots were captured before that failure. This is not recorded as a command-center product pass.

Because `/v2-receipt` changed after that artifact, a new complete current-main browser run across desktop/tablet/mobile, light/dark, zh/en, keyboard flows, and axe/WCAG 2.2 AA gates is still required.

## Accessibility

Implemented product contracts include landmarks, skip/focus behavior, localized `<html lang>`, keyboard command-center and mobile navigation behavior, semantic status text/icons, reduced-motion support, responsive data tables, and non-color-only verdict/integrity semantics.

The historical browser workflow included axe-core WCAG-tagged checks, but its job did not complete successfully. Therefore **WCAG 2.2 AA is not claimed as fully revalidated for current `main`**.

## Performance

`pnpm run perf:budget` passed in the hosted run. Its measured dimensions were:

- `cli_cold_start_ms`;
- `demo_wall_ms`;
- `demo_heap_cap`.

This is a **Lab Measurement / repository performance gate**, not field Core Web Vitals. No field-performance claim is made. A new current-main production bundle measurement was not completed after the V2 Receipt closure.

## Environment limitation affecting final validation

The available ChatGPT container cannot resolve external package registries, and the repository dependency tree is not preinstalled. GitHub App content writes also did not provide a reliable new Actions trigger/discovery path in this session. As a result, the exact current `main` dependency graph could not be installed here for a fresh full frontend/root/browser matrix.

This limitation does **not** convert unexecuted checks into PASS. The product remains `NOT COMPLETED` against the requested Definition of Done until those checks run successfully on the current `main` SHA.
