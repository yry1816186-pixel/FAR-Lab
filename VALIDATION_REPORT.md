# FAR-Lab Refactor Validation Report

Validation date: 2026-08-18
Original target: `main@a6647be68c8012246ffb57de8752649657a847f2`
Work branch: `ux-refactor/2026-08-18`
GitHub Actions run id: `32105125791`

## Actual command validation

| Check | Command | Exit | Duration | Result |
|---|---|---:|---:|---|
| command evidence | unavailable | — | — | **BLOCKED / missing artifact** |

Validation job result: **SKIPPED**.

## Browser / accessibility / responsive QA

- Browser job result: **SKIPPED**; browser evidence artifact was unavailable to the packaging job.

## Performance

- `pnpm run perf:budget` is recorded above as the repository lab performance gate.
- This is a lab/CI measurement. No claim is made that CI timing equals production field Core Web Vitals.

## Environment limitations

- The ChatGPT container could not resolve github.com and had no project dependency installation, so direct local clone/build was unavailable.
- To avoid reporting unexecuted checks as success, build/test/browser evidence above comes from the GitHub-hosted runner using the repository lockfiles and declared Node/Python toolchain.
