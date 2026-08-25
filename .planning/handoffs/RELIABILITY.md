# RELIABILITY.md — Reliability & Observability Workstream Handoff (2026-08-24)

Mandate: prove FAR-Lab does not easily break in real, long, imperfect
environments — and that when it breaks, both humans and agents can SEE what
happened and RECOVER. Not a new Scientific Core; a reliability case over the
existing one.

Baseline read: `evidence/W-G/perf-baseline.md` (canonical concurrency baseline —
model-bound pipeline, mapBounded stage concurrency, receipts profile).

## Verdict up front

**System holds under real fault injection and an hours-equivalent accelerated
soak; failures are visible and recoverable; one production write bottleneck was
found and fixed (9× end-to-end); three real defects were found and fixed; two
pre-existing test defects were found and fixed.** All claims below carry the
command + evidence file that produced them. Residual risks are enumerated —
none is a silent data-loss path.

## What was executed (all real paths, offline, no live APIs)

| Proof | Command | Result | Evidence |
|---|---|---|---|
| Expanded fault injection (9 cases) | `node spikes/reliability-faults.mjs` | **9/9 PASS** | `evidence/reliability/faults.json` |
| Accelerated soak (hours-equivalent by volume) | `node spikes/reliability-soak.mjs` | **PASS** (23,526 events ≈ 5.7× the real workspace's full history; RSS +36.8MB bounded; handles +0; hash chain intact on every run; WAL checkpoint stable at 4MB; db 24.5MB proportional) | `evidence/soak.json`, `evidence/soak-samples.json` |
| Backup / restore / migration drill | `node spikes/reliability-backup-drill.mjs` | **5/5 PASS** | `evidence/backup-drill.json` |
| Performance profile | `node spikes/reliability-perf.mjs` | read paths healthy (3–79ms at 15k events); write bottleneck found → fixed → re-measured | `evidence/perf.json` |
| Reliability unit suites | `npx vitest run tests/reliability-*.test.ts tests/gc.test.ts tests/storage-hardening.test.ts` | all green | console |
| W8 durability regression (pre-existing) | included in full suite | green | `tests/wave8-durability.test.ts` |
| Pre-existing live kill/adoption soak (W8) | see `spikes/wave8-fault-injection.mjs` | 20/20 (2026-08-22, unchanged) | `evidence/W8/fault-injection.json` |

## Defects found and FIXED this workstream

1. **P1 — non-atomic artifact landing** (`src/persistence/artifacts.ts`):
   `writeFileSync(flag:'wx')` at the content-addressed path is not crash-atomic;
   a process death mid-write leaves a truncated blob that `get()` silently
   returns as the artifact (only bundle-verify hashes content; fullText /
   revise-archive readers trust it). Fixed: temp-sibling write + same-directory
   rename (atomic on POSIX and NTFS). Regression: `tests/reliability-artifact-atomicity.test.ts`.
2. **P1 — silent downgrade-open of newer workspaces** (`src/persistence/db.ts`):
   a db with `user_version > HEAD` opened without complaint, risking
   schema-misreads and corrupting writes. Fixed: fail-visible refusal naming
   the version and the remedy. Regression: `tests/reliability-db-guards.test.ts`
   + drill 5 in `backup-drill.mjs`.
3. **P2 — gc blob regex unanchored** (`src/cli/gc.ts`): `/[0-9a-f]{64}/` also
   matched inside put-temp names, corrupting counts and hiding temps from the
   orphan branch. Fixed (anchored) + orphan temps now reported always / swept
   under `--apply` (they are crash residue, never evidence).
4. **P1 (perf) — WAL synchronous=FULL on the event spine** (`src/persistence/db.ts`):
   every commit fsynced (5544ms vs 83ms per 3k single-statement tx = 67×
   micro; 31.6s → 3.5s per 15k appended events = 9× end-to-end including CPU
   work). Fixed: WAL+NORMAL (SQLite-recommended pairing) with
   `FARLAB_DB_SYNCHRONOUS=FULL` escape hatch. Honest durability statement in
   the code comment: process crash loses nothing; power loss may roll back the
   most recent commits — atomic transactions only, chain stays self-consistent,
   corruption impossible.
5. **Pre-existing flaky test (time-of-day)** (`tests/storage-hardening.test.ts`):
   the backwards-clock test seeded the write-floor with the REAL wall clock via
   `mkRun`'s `run_created`, so it failed every afternoon (found because this
   workstream ran full suites at 13:38 and 21:04 and got different
   regressedSeconds). Fixed: deterministic floor reset before the synthetic
   timestamps.
6. **Test-harness grade issues fixed along the way**: harness drivers no longer
   pollute the evidence dir; Windows dynamic-import paths go through
   `pathToFileURL`.

## Domain-by-domain state

### 1. Observability — IMPLEMENTED, tested
The spine was already strong (append-only hash-chained events, receipts with
latency/usage/cost, stage attempts, `/health` with lazy chain verification and
watchdog degradation, SSE with Last-Event-Id resume). Added the missing layer:
  - **Unified error taxonomy** (`src/app/observability.ts`): 18 categories
    across provider/system planes with deterministic classification
    (errno codes, domain error shapes, provider kinds, the product's own
    `model call failed (<kind>)` string format) + `retryable` / `needsHuman`
    verdicts; `errorProfileForRun` aggregates a run's failure events.
  - **Resource & storage sampling**: `sampleProcess` (RSS/heap/handles/requests
    — the leak signature), `sampleStorage` (db/wal/scheduler bytes, blob count,
    orphan temps, run/event/object/receipt counts via new `Store.workspaceCounts()`).
  - **Correlation contract** (`CorrelationSpan` + `formatCorrelation`): the one
    join vocabulary (run/stage#attempt/step/receipt/seq/obj/exp/holder).
  - **Operator console**: `far data obs` (process + storage + per-run recovery
    phases + workspace error profile; `--json` for agents).
  - **OTel decision** (`evidence/reliability/otel-evaluation.md`):
    REJECT the SDK (zero-runtime-deps invariant, single-machine product, spine
    is already transactionally durable — stricter than in-memory spans), ADOPT
    the semantic conventions (trace_id=runId, spans=stage attempts, span
    events=event rows, error.type=ErrorCategory), with two concrete reversal
    triggers (multi-host execution; a real collector in the deployment).

### 2. Long-running stability — PROVEN (accelerated equivalence)
`soak.mjs`: 6 concurrent runs × 40 reopen-and-extend rounds with continuous
churn (terminal runs replaced by fresh ones; 60 total), each round through the
real Orchestrator with checkpointed subtasks, receipts, artifact puts and
progress events. 23,526 events / 7,294 receipts / 7,294 artifact blobs in
~3min; every run's hash chain verifies; RSS bounded (+36.8MB on a 64MB start,
allowance 120); active handles +0 (no leak); WAL stable (checkpoint working);
db growth proportional (bytes-per-row ≤ 2048 budget). Context: the real
workspace's full history is ~4.1k events — this soak is ~5.7× that in one
session.

### 3. Fault injection — PROVEN beyond W8 (all real child processes / real DB / real fs)
Nine cases (`faults.json` for numbers): SIGINT mid-run (frozen signature →
watchdog-equivalent adoption → completed, chain intact); DB busy under a 2.5s
exclusive writer (append succeeded after busy_timeout, chain intact); DB
corruption boundary (mid-file byte flip → detected by integrity_check, never
silently served); disk-full at the artifact write (ENOSPC fail-visible, zero
blobs, zero residue); permission-denied at rename (EACCES fail-visible, zero
blobs); cross-process duplicate execute (1 completed, 1 `RunLeaseHeldError`,
chain ok, attempt>1 only with an audited `quality_gate_regeneration` event);
model-plane 429→502→ECONNRESET→malformed through the REAL retry core at the
`fetchImpl` seam (fail-visible `provider_error`, backoff sleeps [10,2000]ms
observed, clean transport recovers to ok); outbox crash-window (intent
persisted → drained after reopen: 1 then 0 — exactly-once); concurrent
two-process appends (80/80 unique, monotonic seq, chain ok).
Together with W8's live kill/adoption soak (20/20) this covers: process crash,
SIGINT, 429, 5xx, timeout-budget, malformed JSON, DB busy, corruption
boundary, partial file, disk full, permission denied, lost lease, duplicate
request, duplicate event, out-of-order event. **Not covered offline** (recorded
honestly): DNS failure (needs a resolver seam — same EAI_AGAIN classification
path as ECONNRESET), SSH reset / container death / subagent death on the remote
experiment gateway (requires the live Docker/WSL2 target — the E5 lane's
blocked surface, `.control/EXECUTION_STATE.json` CP-EEL3).

### 4. Idempotency — AUDITED, mechanism-mapped (`evidence/reliability/idempotency-audit.md`)
Ten-effect ledger with file:line + evidence per effect. Headlines: artifacts
idempotent by construction (content-addressing); experiments exactly-once
(outbox intent_id, dual-write window closed by migration v8 — proven by
drill); run execution single-writer (lease + fence + checkpoints, redo ≤
in-flight subtask); revisions fingerprint-idempotent; model retries re-bill by
protocol necessity but record exactly one receipt per final attempt and never
over-count in the ledger. Residual recorded: same-process concurrent execute
is not lease-refused (holder is pid+boot-nonce) — server's in-process
`executing` map guards it today; P2, fix = orchestrator-instance nonce if a
same-process fan-out caller ever appears.

### 5. Performance — PROFILED, one real bottleneck FIXED (`evidence/perf.json`)
Read paths are healthy and need no work: CLI cold start 105–302ms; createApp
17–27ms; API start 12–18ms; GET /runs 15–17ms; run detail with a 15k-event
history 3–4ms; event pagination 66–79ms; SSE first bytes 3–4ms; chain
verification of 15k events 31–48ms (lazy, once per server, then 1–2ms).
The one real bottleneck was WRITE: synchronous=FULL fsync per commit on the
event spine (fixed, see defect #4): 15k appended events 31.6s → 3.5s. Not
pursued (measured as noise or out of lane): web bundle fonts/sourcemaps
(parallel-session zone, W-G P3), retrieve/DB micro-reads (~1.6% of wall in the
receipts profile).

### 6. Resource governance — MAPPED, no theater added (`evidence/reliability/resource-governance.md`)
Eight channels mapped to live enforcement: token (run budget, receipts-derived,
exhaustion = honest skip + resume-reopen), money (workspace USD ceiling,
fail-closed at the provider boundary), time (three independent bounds: 120s
per-call chain, 240s lease + watchdog, bounded regeneration/iteration rounds),
disk (conservative gc, dry-run default, orphan sweep, obs reporting), memory
(soak-verified bounded), CPU (single-threaded + `FARLAB_STAGE_CONCURRENCY`
cap), network (corpus cap + retry budget + exfil guard), GPU (experiment
sidecar's per-job accounting). Explicitly NOT built, with reasons: a fourth
global wall-clock authority, and a CPU quota with no failure mode to catch.
Operator surface: `far data obs`.

### 7. Recovery UX contract — IMPLEMENTED for the layer below the UI
`src/app/recovery-state.ts` derives, from persisted state only (run doc, lease
row, budget markers, spend ledger, classified lastError): `running`,
`frozen_recoverable` (expired lease; includes the real `far research resume`
command and the auto-adoption fact), `paused_budget` (raise + resume re-opens
skipped stages), `paused_spend`, `retryable_partial`, `blocked_needs_human`,
`partial`, `completed`, `cancelled`, `failed`, `irrecoverable` — each with its
evidence block and the exact user action. 13 tests pin the derivations
(`tests/reliability-observability.test.ts`). **HX integration note**: the web
layer already renders SSE reconnect state (eventStreamTracker +
StreamStatusChip); wiring `recoveryStateForRun` into the run page's status
header is a small, pure-addition task for the HX lane — the derivation is
server-agnostic (pure function of store state) and `far research status`
already surfaces the FROZEN banner on the same evidence.

### 8. Backup / restore / migration — DRILLED, conservative
`backup-drill.mjs` (5/5): roundtrip via `VACUUM INTO` (counts + chains +
identical); the WAL-copy trap PROVEN (a naive far.db copy made before any
checkpoint does not even contain the schema — strongest form of the trap;
backupTo is the only backup path); v1-schema database forward-migrates 1→8
preserving rows and creating all 7 later tables; newer-than-build db refused
visibly (fix #2); gc conservatism re-proven on a restored workspace
(referenced blob never a candidate). Migration discipline: forward-only,
BEGIN IMMEDIATE + in-transaction re-check (concurrent-open safe), no rollback
path exists by design — rollback = restore a backup (that is the documented
drill: `docs/backup-restore.md`, `far backup`). GC/cleanup/retention audit:
`deleteRunCascade` is tombstoned + trigger-guarded; `deleteObject` mirrors FTS
rows; retention/compaction — **no VACUUM/compaction/auto-prune exists in any
production path** (only `far gc`, dry-run default); nothing deletes evidence
silently; `deleted_runs` keeps the fact of deletion.

## Honest boundaries

- No live-API/network-egress fault was injected (workspace rule: offline
  verification only; live routes BLOCKED-live). The transport seam used
  (`deps.fetchImpl`) exercises the identical code path a real socket would.
- Remote-executor faults (SSH reset, container death, subagent death on the
  gateway) are gated on the Docker/WSL2 target being up (CP-EEL3, user-gated).
- The soak's "hours-scale equivalence" is by event/artifact volume and
  churn (5.7× the workspace's full history), not wall-clock hours; per the
  mandate ("or equivalent accelerated"), with growth verdicts computed from
  samples rather than eyeballed.
- Same-process concurrent `execute` residual (P2, above) is documented, not
  fixed — the minimal-sufficient rule says wait for a real caller.

## Files landed (this workstream)

Code: `src/app/observability.ts`, `src/app/recovery-state.ts` (new);
`src/persistence/artifacts.ts`, `src/persistence/db.ts`, `src/cli/gc.ts`,
`src/persistence/store.ts` (+`workspaceCounts` only), `src/cli/main.ts`
(+`far data obs` only) (surgical).
Tests: `tests/reliability-artifact-atomicity.test.ts`,
`tests/reliability-observability.test.ts`, `tests/reliability-db-guards.test.ts`
(new); `tests/gc.test.ts` (+orphan-temp case), `tests/storage-hardening.test.ts`
(+deterministic floor fix).
Harnesses+docs (tracked): `spikes/reliability-{faults,soak,perf,backup-drill}.mjs`;
`evidence/reliability/{otel-evaluation,idempotency-audit,resource-governance}.md`
+ `{faults,soak,soak-samples,perf,backup-drill}.json`.
`work/reliability-observability/` remains as the (gitignored) scratch workspace
with a README pointing at the tracked locations.

Sibling-session files were NOT touched or committed: the time-travel edits in
`src/cli/main.ts` / `src/persistence/store.ts` / `src/server/api.ts` /
`tests/time-travel.test.ts` remain the sibling's uncommitted work (this
handoff's commits use explicit file lists and `git add -p`-style separation
where files overlap — main.ts/store.ts contain both sessions' hunks; only the
reliability hunks were staged).
