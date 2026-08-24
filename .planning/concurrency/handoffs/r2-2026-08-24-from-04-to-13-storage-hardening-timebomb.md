# Handoff 04 → 13: RU-7.3 backwards-clock test is a time bomb (stable failure after 2026-08-24 12:00 UTC)

- **Date**: 2026-08-24
- **From**: lane 04 (retrieval-evidence)
- **To**: lane 13 (reliability-security; `src/persistence/store.ts` stewardship co-signed with 12)
- **Urgency**: high — every full-suite run in every worktree/CI on this lineage fails from now on

## Observed (evidence)

`npx vitest run tests/storage-hardening.test.ts` in the R2 lane worktree
(`ws/r2/04-retrieval-evidence`, base `baseline/parallel-r2` = 47cc373 + retrieval
commits only — none touch persistence):

- 3/3 runs fail identically: `expected 12013 to be 3600` at
  `tests/storage-hardening.test.ts:57` (`regressedSeconds`).
- BASELINE.md records this suite green at 96b2637 on 2026-08-24 — that evidence
  was produced BEFORE 12:00 UTC that day (see mechanism).

## Root cause (mechanism, not a guess)

1. `Store.createRun()` (src/persistence/store.ts:163) defaults
   `now = new Date().toISOString()` and appends the `run_created` event at REAL
   wall-clock time — anchoring the backwards-clock floor
   `storage:last_write_at` (store.ts:271-286) to the machine clock.
2. The test then writes events with FIXED timestamps
   (`2026-08-24T12:00:00.000Z` then `11:00:00.000Z`) expecting a 3600s
   regression.
3. Once the real clock passes `2026-08-24T12:00:00Z` (= 20:00 Beijing), the
   FIRST synthetic event is itself below the floor: jump #1 fires with
   `regressedSeconds = realNow − 12:00Z`. Observed 12013s = 14:20:13Z − 12:00Z
   at run time; the assertion reads jump #1, not the intended jump #2.

The test is deterministic-broken for every machine after that instant. It is
NOT flaky and NOT related to any lane-04 change (diff-stat proof: lane commits
touch no persistence file).

## Proposed fix (test-side, one line-ish — semantics of the store stay intact)

Pass an explicit synthetic creation time so the floor is fixture-anchored, e.g.
in `mkRun`:

```ts
return store.createRun(q, {}, '2026-08-24T10:00:00.000Z').id;  // below both later writes
```

(any fixed `now` ≤ 11:00:00Z keeps the observed regression exactly 3600s).
Alternative: derive the expected value from the persisted floor instead of a
literal.

## Files

- `tests/storage-hardening.test.ts` (fix site)
- `src/persistence/store.ts` (read-only mechanism reference)
