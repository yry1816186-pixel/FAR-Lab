# Handoff R2 — 02 → 12: RU-7.3 clock-regression test is time-of-day dependent

- **Date:** 2026-08-24
- **From lane:** 02 visual-design
- **To lane:** 12 platform-data-api (files: `src/persistence/store.ts`, `tests/storage-hardening.test.ts`; cc 13 reliability)
- **Urgency:** medium (red suite at certain hours; no data-corruption impact — detection still fires, only the observed magnitude is wrong)

## Observed

`tests/storage-hardening.test.ts > RU-7.3 backwards-clock detection` fails when the
suite runs after 12:00 UTC:

```
AssertionError: expected 13759 to be 3600
```

Both my full-suite runs (2026-08-24 ~15:46Z) failed exactly this one test;
1441/1446 passed. Lane-02 diff touches only `web/src/**` + `evidence/hx/**` —
no persistence code — so this is reported, not fixed (rule 2).

## Root cause (verified in source + arithmetic)

- Test writes event 1 with explicit `at = 2026-08-24T12:00:00.000Z`, then event 2
  at `11:00:00.000Z`, expecting `regressedSeconds = 3600` (floor − at).
- `store.appendEvent` (src/persistence/store.ts:270-277) computes the floor from
  the `storage:last_write_at` meta. That meta is NOT set from the caller-provided
  `at` alone — some write path (store open / another append in `mkStore`/`mkRun`
  helpers) stamps real wall-clock time, so by the time event 2 lands,
  `floor ≈ Date.now()` (≈15:49Z during the failing run).
- `regressedSeconds = (floor − at) = (15:49:19Z − 12:00Z) ≈ 13759` — matching the
  observed value exactly. Runs before 12:00 UTC pass because real now < the fixed
  timestamps, in which case the explicit writes dominate the floor.

## Suggested fix directions (owner decides)

1. Make `storage:last_write_at` track the max of persisted event timestamps when
   the caller supplies an explicit `at` (deterministic under injected clocks), or
2. Make the test inject/freeze the store's wall clock (test seam) instead of
   relying on fixed-vs-real-time interaction.

## Reproduction

`npx vitest run tests/storage-hardening.test.ts` after 12:00 UTC → red;
before 12:00 UTC → green. Evidence: two failing runs at 2026-08-24T15:46Z
(exit 0 shell due to `tail` pipe; vitest summary shows 1 failed).
