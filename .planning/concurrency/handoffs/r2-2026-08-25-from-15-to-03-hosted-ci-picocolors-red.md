# Handoff 15 → 03: hosted-CI red in cli-term picocolors test — code identical to a green run

- **Urgency:** high (blocks a green hosted CI for every lane branch; ACC-38 depends on it)
- **Requested by:** lane 15 (governance-release), 2026-08-25
- **Owner:** lane 03 (terminal-desktop: `src/cli/**` + its tests)

## Requested change

Diagnose and fix `tests/cli-term.test.ts > cli vendored picocolors: color discipline >
colors are disabled in non-TTY test stdout unless forced` failing on GitHub-hosted runners.

## Evidence chain (all verified today by lane 15)

1. Run `32862865855` (lane 15 branch `ws/r2/15-governance-release`, baseline `47cc373` +
   governance-only changes) — FAIL at that test: expected `true`, received `false`
   (`tests/cli-term.test.ts:72:35`, the `forced`/CI branch asserting
   `pc.isColorSupported === true`). No lane-15 change touches `src/cli` or its tests.
2. Run `32859924942` (lane 12 branch `24f2555`, earlier the same day) — same single test
   FAIL. So the red predates lane 15's push and is not workflow-related.
3. Run `32747734353` (branch `build/hx-reconstruction`, SHA `2e5c9a9`, 2026-08-24 15:54) —
   GREEN while already containing this test (commit `0bef5da` "color-discipline assertion
   is env-aware") and a byte-identical `src/cli/vendor/picocolors.ts`:
   `git diff 2e5c9a9 baseline/parallel-r2 -- src/cli/vendor/picocolors.ts` is empty; the
   only test-file delta between them (3 lines) is in the LATER `FORCE_COLOR` test, which
   restores env correctly and runs after the failing test.

Conclusion: identical code, green on 08-24, red on 08-25 → the GitHub runner environment
drifted between the two dates (image/node roll). In the vendored detector the only paths to
`isColorSupported === false` with `CI=true` set are `NO_COLOR` present or `--no-color` in
`process.argv` at module-eval time — suggest a debug CI step printing `env.NO_COLOR`,
`env.CI`, and `process.argv` inside the vitest worker, or making the test spawn a
controlled-env subprocess instead of asserting against ambient worker env (the ambient-env
assertion is what turned env drift into a red).

## Notes

- The other hosted-CI red (RU-7.3 storage-hardening, date-sensitive) already has a fix on
  lane 12's branch; fusion of both closes the hosted suite.
- Lane 15's rewritten `ci.yml` adds lint/TUI-tests/CLI-smoke/license-gate steps AFTER the
  test suite; they are locally verified green but cannot execute on GH until the suite is
  green again.
