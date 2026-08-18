# FAR-Lab Refactor Validation Report

Validation date: 2026-08-18
Original target: `main@a6647be68c8012246ffb57de8752649657a847f2`
Work branch: `ux-refactor/2026-08-18`
GitHub Actions run id: `32105847576`

## Actual command validation

| Check | Command | Exit | Duration | Result |
|---|---|---:|---:|---|
| `build_check` | `pnpm run build:check` | 0 | 34s | **PASS** |
| `frontend_vitest` | `npm --prefix frontend run test` | 1 | 23s | **FAIL** |
| `root_tests` | `pnpm run test` | 1 | 103s | **FAIL** |
| `python_tests` | `pnpm run test:py` | 0 | 2s | **PASS** |
| `ux_gate_tests` | `node --test tests/gates/*.test.ts tests/cli/*.test.ts` | 0 | 19s | **PASS** |
| `performance_budget` | `pnpm run perf:budget` | 0 | 1s | **PASS** |
| `openapi_contract` | `pnpm run openapi:check` | 0 | 1s | **PASS** |
| `cli_help` | `node src/cli/far.ts --help` | 0 | 0s | **PASS** |
| `cli_no_color` | `env NO_COLOR=1 node src/cli/far.ts --help` | 0 | 0s | **PASS** |

Validation job result: **FAILURE**.

## Browser / accessibility / responsive QA

- Browser job result: **FAILURE**; browser evidence artifact was unavailable to the packaging job.

## Performance

- `pnpm run perf:budget` is recorded above as the repository lab performance gate.
- This is a lab/CI measurement. No claim is made that CI timing equals production field Core Web Vitals.

## Environment limitations

- The ChatGPT container could not resolve github.com and had no project dependency installation, so direct local clone/build was unavailable.
- To avoid reporting unexecuted checks as success, build/test/browser evidence above comes from the GitHub-hosted runner using the repository lockfiles and declared Node/Python toolchain.
