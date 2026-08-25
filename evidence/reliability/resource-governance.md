# Resource Governance Map — budgets that actually fire (2026-08-24)

The workstream brief asks for CPU/memory/disk/GPU/network/token/money/time
budgets. The honest engineering answer for THIS product (single-machine
researcher workbench, local node:sqlite, model calls through provider routes)
is that seven of the eight burn-channels are already governed by mechanisms
that fire in production paths; the audit below maps each channel to its
enforcement point, and states where a channel genuinely does not need a new
mechanism (with the reason), rather than building budget theater.

| Channel | Enforcement (file:line) | Fires how | Evidence |
|---|---|---|---|
| **token** (per run) | `src/app/run-budget.ts` — receipts-derived spend, opt-in cap `FARLAB_RUN_TOKEN_BUDGET` | stages that would exceed the cap are SKIPPED with marker reason `budget_exhausted`; export always runs (honest partial); resume with raised cap re-opens exactly those stages; ≥80% soft warning event fires once | tests/run-budget.test.ts |
| **money** (USD, workspace) | `src/app/spend-limit.ts` — declared ceiling over priced receipts (no invented prices) | fail-closed at the provider boundary: `quota_exceeded`, non-retryable; limit edits apply on the NEXT call of a live run | tests/spend-limit.test.ts |
| **time** (per call / per run / autonomous rounds) | three independent bounds: provider total timeout 120s per call chain (`http.ts` DEFAULT_TOTAL_TIMEOUT_MS); run lease TTL 240s with watchdog reclaim (`orchestrator.ts:53`); iteration rounds bounded by MAX_ITERATION_ROUNDS + quality rounds by MAX_QUALITY_ROUNDS | a hung call fails into the retry budget; a hung WORKER loses its lease and the run is adopted; a weak-signal loop cannot regenerate forever | W8 fault-injection (kill→adoption within TTL+poll); quality-gate/iteration suites |
| **disk** (artifacts) | `far gc` — dry-run default, conservative reference scan (both spellings), orphan-temp sweep; `far data obs` reports blobs+bytes+temps | nothing auto-deletes; growth is reported and the researcher decides | tests/gc.test.ts; soak storage samples |
| **memory** (process) | bounded by design: per-run doc is small, soak-verified | leak verdict computed from soak samples (RSS allowance, handles) | soak.json: 23.5k events → +36.8MB RSS bounded, handles +0 |
| **CPU** | single-threaded Node runtime; stage concurrency capped by `FARLAB_STAGE_CONCURRENCY` (default 3, floor 1) in `mapBounded` | no unbounded fan-out exists to govern | waveg-concurrency-bench (W-G perf baseline) |
| **network** | source HTTP bounded by retrieval corpus cap (12-doc) + provider retry budget; exfil-guard scans every outbound payload | retrieval/source traffic is a rounding error of wall-clock (294s vs 18,138s model latency in the receipts profile) | evidence/W-G/perf-baseline.md |
| **GPU** | not a burn channel in Direction-A (no local GPU work in the Node product; experiment sidecar GPU usage is the experiment layer's accounting, pinned per-job on the scheduler) | n/a — recorded so the row is answered, not silently dropped | scheduler job queue (far-scheduler.db) |

## Where a new budget would be theater

- A **global wall-clock budget per run** on top of the three existing time
  bounds adds a fourth authority for a state machine that is already
  attempt-bounded and lease-fenced — it would fire only in scenarios the lease
  watchdog already recovers. Not built (minimal-sufficient-architecture rule).
- A **CPU quota** in a single-threaded runtime with a concurrency-capped pool
  has no failure mode to catch. Not built.

## Governance visibility (new, this workstream)

`far data obs` surfaces the live governance state in one place: spend ceiling
+ spent, per-run recovery phases (including `paused_budget` /
`blocked_needs_human`), the workspace error profile by category, and storage
growth (blobs, orphan temps, db/wal bytes). This is the operator console the
soak harness and the recovery UX contract both read from
(`src/app/observability.ts`, `src/app/recovery-state.ts`).
