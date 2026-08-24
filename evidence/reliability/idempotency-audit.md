# Idempotency Audit — External Effects & Retry Semantics (2026-08-24)

Question put to the system: **can a retry duplicate an experiment, a network
side effect, an artifact, a memory item, a cost record, or a revision?**
Every externally-visible effect is enumerated below with its retry semantics,
the mechanism that enforces them, and the evidence that exercised it.

## Effect-by-effect ledger

| # | Effect | Retry semantics | Mechanism (file:line) | Evidence |
|---|---|---|---|---|
| 1 | **Model call** (network + cost) | Retried failures RE-BILL by protocol necessity (OpenAI-compatible APIs define no idempotency key); each FINAL attempt yields exactly ONE receipt. Retry policy is deterministic and bounded (Retry-After/exponential, 30s cap, total budget 120s). Cost is derived ONLY from persisted receipts — a retried call that never returns successfully records NO receipt and bills once at the provider, zero in the ledger (honest under-count, never over-count). | `src/providers/http.ts` (retry core, `deps.fetchImpl` seam); receipts in `orchestrator.ts:122-135` | faults.mjs `model-fault-sequence`: 429→502→ECONNRESET→malformed under the REAL retry core → fail-visible `provider_error`, backoff sleeps [10,2000]ms observed; clean transport recovers to ok |
| 2 | **Artifact write** | Content-addressed ⇒ idempotent BY CONSTRUCTION: same bytes → same hash → same path; concurrent puts converge (atomic rename, byte-identical replace). Collision with different content is refused loudly. | `src/persistence/artifacts.ts` put (temp+rename) | tests/reliability-artifact-atomicity.test.ts (concurrent identical puts → 1 blob); faults.mjs disk-full/perm-denied (no partial) |
| 3 | **Experiment submission** | EXACTLY-ONCE intent: domain write + scheduler intent land in ONE far.db transaction (outbox pattern); the drain is idempotent by intent_id (the intent id IS the job id — `INSERT OR IGNORE` on enqueue). A crash between far.db write and enqueue is recovered by drain, never lost, never duplicated. | migration v8 (outbox table); `src/experiment/scheduler.ts:316` drainOutbox; `store.ts:807` recordOutbox (INSERT OR IGNORE) | faults.mjs `outbox-drain-idempotent`: first drain=1, second drain=0, pending=0 |
| 4 | **Run execution** | Single-writer per run: a second executor (cross-process) is refused with `RunLeaseHeldError`; a disowned worker (lease lost) aborts WITHOUT writing run state; resume continues from the last persisted stage boundary with subtask-granular checkpoints (redo ≤ in-flight subtask). | `orchestrator.ts` lease acquire/fence; step_outputs/step_fingerprints (migration v2/v3) | faults.mjs `duplicate-execute-rejected` (1 completed, 1 refused, chain ok); W8 soak 20/20 (kill→adoption, redo ≤ 1 subtask, byte-identical outputs) |
| 5 | **Event append** | Append-only spine; concurrent appenders serialize via BEGIN IMMEDIATE, seq is monotonic, hash chain verifies. Duplicate append of the SAME logical note can only happen if the caller retries a non-transactional higher-level action — all production append sites fire exactly once per transition inside the owning transaction. Out-of-order arrival is structurally impossible (single AUTOINCREMENT seq). | `store.ts` appendEvent; v7 immutability triggers + prev_hash chain | faults.mjs `concurrent-append-two-processes` (2×40 appends, 80 unique, chain ok, monotonic) |
| 6 | **Revision creation** | Iteration decisions are fingerprint-gated: `decidedAlready = lastIt.round === round && lastIt.snapshot.fingerprint === it.record.snapshot.fingerprint` — a no-op resume re-derives the same fingerprint and does NOT re-decide. Quality-gate regeneration is bounded by MAX_QUALITY_ROUNDS with the reopen flag auditable in events. | `orchestrator.ts:461-473` (iteration idempotence), `:343-375` (quality gate) | faults.mjs `duplicate-execute-rejected` records `quality_gate_regeneration` events as the audited cause of attempt>1 |
| 7 | **Memory consolidation** | Deterministic projection of terminal runs into memory_items; documented idempotent; failure is fail-visible but non-fatal to the run. | `src/app/memory.ts` consolidateRun via `orchestrator.ts:513-524` | soak: memory tables created (migration v6), consolidation exercised on completed runs without duplicate-item errors |
| 8 | **Export/bundle** | A repeated export of the same state creates a new bundle OBJECT (versioned by content) — no mutation of prior bundles; verify is read-only. Duplicate bundles are distinguishable, not silently merged. | `src/pipeline/stages/export.ts` | existing export/verify suites (verifyBundle contract, tests/api.test.ts) |
| 9 | **Feedback→revise reopening** | A completed run reopens ONLY when NEW feedback signals exist; a no-op resume is a true no-op (feedback objects checked, not a counter). | `orchestrator.ts:215-234` | orchestrator unit semantics covered by run-budget/iteration suites |
| 10 | **GC deletion** | Dry-run by default; reference scan accepts BOTH `sha256:<hex>` and bare hex spellings (the 2026-08-24 P0 fix — asymmetry is deliberately fail-safe: a missed ref is silent loss, an over-retained blob is swept later). Orphaned put-temps are crash residue, never valid data, swept only under --apply. | `src/cli/gc.ts`; `store.ts:559-576` referencedArtifactHashes | tests/gc.test.ts (incl. bare-hex regression + orphan-temp case); backup-drill `gc-restore-safety` |

## Honest residual risks (recorded, not hidden)

- **Provider re-billing on retry** is inherent to the wire protocol (no
  idempotency keys in OpenAI-compatible APIs). Bounded by the retry policy
  (max ~3 transport retries inside a 120s budget per call) and surfaced by the
  spend gate before it can compound (fail-closed `quota_exceeded`).
- **Same-PROCESS concurrent `execute(runId)`** is not lease-refused (the holder
  identity is `pid+boot-nonce` — identical for two orchestrators in one
  process). The server already guards this with its in-process `executing` map;
  CLI usage is one-run-one-process. Recorded as P2 (handoff) — an
  orchestrator-instance nonce would close it if a same-process fan-out caller
  ever appears.
- **Backwards-clock events** write an honest observation note rather than
  rejecting the write; a host with a persistently wrong clock emits one note
  per regressing write (bounded by the write rate, visible in the timeline).
