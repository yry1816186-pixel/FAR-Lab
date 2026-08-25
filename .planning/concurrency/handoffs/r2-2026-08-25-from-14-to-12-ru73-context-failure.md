# Handoff: RU-7.3 backwards-clock test fails under full suite (context-sensitive)

- **From:** lane 14 (evaluation-redteam) — **To:** lane 12 (platform-data-api, owns `src/persistence/store.ts` + storage tests)
- **Date:** 2026-08-25
- **Urgency:** medium (breaks the full-suite gate in any fresh worktree; does not affect production behavior — it is a test-context defect)

## Requested change

Diagnose and fix why `tests/storage-hardening.test.ts > RU-7.3 backwards-clock detection > records an honest observation when an event timestamp regresses below the last persisted write time` fails deterministically under the FULL suite while passing solo.

## Evidence (from lane-14 worktree `work/r2-14-evaluation-redteam`, base 47cc373)

- Full suite `npm test`: **3/3 runs failed at exactly this test** (1441 passed / 1 failed / 4 skipped each time).
- Solo `npx vitest run tests/storage-hardening.test.ts`: **3/3 pass**.
- Run-3 assertion detail: `AssertionError: expected 96595 to be 3600` at `tests/storage-hardening.test.ts:57`.
- **Smoking gun:** 96595 s is the wall-clock delta between the test's hardcoded `2026-08-24T11:00:00.000Z` write and a REAL-NOW `storage:last_write_at` floor at execution time (2026-08-25T13:49:55Z). Under the full suite the floor was real-now instead of the test's own `12:00Z` write; solo, the floor is the test's own write.
- Suspect area: `src/persistence/store.ts:271-286` (`getMeta('storage:last_write_at')` floor + `setMeta` max-update). The contamination path into a per-DB meta value is UNDETERMINED — `mkStore()` creates a fresh temp DB per test, so naive module-global state does not explain it.
- Full log preserved at `work/r2-14-evaluation-redteam/.eval-inputs/suite-run3.log` (untracked; recipe below reproduces in ~2 min).

## Reproduction recipe

```bash
git worktree add work/r14-repro -b tmp-r14-repro baseline/parallel-r2   # or any fresh worktree at 47cc373+
cd work/r14-repro && npm ci && npm run build
npm test                                  # expect: exactly 1 failed = this test (any time after 2026-08-24T12:00Z under load)
npx vitest run tests/storage-hardening.test.ts   # expect: 3/3 pass
```

## Suggested direction (not a fix)

Check whether anything writes `storage:last_write_at` (or the meta table of a DB the test shares) with real-now during parallel collection — e.g. a shared beforeAll/migration path, a WAL-visible write from another store instance pointing at the same temp dir, or a hook (recovery-state / outbox drain) firing at import time. A clock-injection seam for `appendEvent` timestamps in tests would also de-flake the fixture permanently.
