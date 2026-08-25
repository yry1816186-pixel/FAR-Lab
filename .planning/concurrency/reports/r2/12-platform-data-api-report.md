# R2-12 platform-data-api — Lane Report

Branch `ws/r2/12-platform-data-api` from `baseline/parallel-r2` (`47cc373`).
Mission: coherent, durable platform/domain/persistence/API architecture —
audit consequential ownership, fix the highest-leverage defects, prove the
persistence contract. No-live-API policy honored (all evidence offline).

## Commits

| SHA | Subject |
|---|---|
| `7fcc2ac` | fix(persistence): v9 schema consolidation, searchText column read, clock-robust fixtures |
| `0f70e97` | refactor(domain): single id-prefix vocabulary for schemas and ObjectRef checks |

## Architecture audit (findings the fixes follow from)

Ownership map verified against reality — **no duplicate authoritative engines
found**:

- **Durable state**: `far.db` via one adapter (`persistence/db.ts openDb`), one
  facade (`Store`). SQLite owns runs/objects/events/meta/lineage/memory/outbox;
  WAL + busy_timeout 10s + foreign_keys; migrations transactional with in-tx
  concurrency re-check.
- **Artifacts**: content-addressed FS store (`artifacts.ts`), hash-gated,
  collision-refused. Large payloads never enter SQLite by design.
- **Config**: one dotenv loader (`platform/dotenv.ts`); `FARLAB_DATA_DIR` honored
  at the single composition root (`app/composition.ts`) — CLI/server/data-info
  agree on one data root.
- **IDs**: `domain/ids.ts` is the single minter (`newId`) and shape authority.
- **API**: `/api/v1` only (non-v1 404s, traversal 404-never-fallback); shared
  error envelope `{error:{code,message,retryable,runId?}}`; loopback+Origin and
  JSON-content-type guards; delegated modules keep their semantics (screening /
  zotero / conversations / automations / experiment-ops / hypothesis-ops) with
  route registration only in `api.ts`.
- **Events**: append-only enforced by DB triggers (v7) + per-run SHA-256 chain;
  privileged deletion (deleteRunCascade) tombstoned in `deleted_runs`.
- **Queue**: far.db outbox (v8, idempotent by intent id) + scheduler's own
  `far-scheduler.db` — see "considered, kept" below.

Deliberate designs verified as correct (no action):
- `experiment/scheduler.ts` opens its own `DatabaseSync` instead of `openDb` —
  documented ("own tiny migration track, independent of far.db migrations");
  running far.db MIGRATIONS against the scheduler db would be wrong. WAL/FK/
  BEGIN-IMMEDIATE discipline is manually mirrored. Not a duplicate engine.
- `api.ts` at 2110 lines: audited for coupling evidence (route inventory,
  error semantics, dependency wiring) — none found beyond file length; per the
  no-refactor-for-aesthetics rule it stays whole.
- FTS mirror tables are created lazily on purpose: creation doubles as the FTS5
  availability probe with an honest LIKE degrade path — moving them into the
  migration chain would break pre-FTS5 runtimes. corpus_items (no degrade
  rationale) was the opposite case and DID move (v9).

## Defects fixed (root cause -> fix)

1. **Date-sensitive RU-7.3 fixture** (lane-gate red at baseline on every
   machine after 2026-08-24T12:00Z): the test's absolute timestamps collided
   with the real-clock floor `createRun` stamps into `storage:last_write_at`.
   Fixture now derives all timestamps from `Date.now()`; assertion unchanged
   (`regressedSeconds === 3600`, still exactly one jump note). Class swept:
   storage-hardening was the only test passing absolute dates into the
   floor-touching `appendEvent` path.
2. **Schema double authority**: `corpus_items` DDL existed in the migration
   chain's shadow as a lazy runtime CREATE (second owner). Migration v9 now
   owns it; the lazy path is deleted (has a real caller: retrieve-stage seed
   ingestion).
3. **searchText hot-path**: question->run owner resolution JSON.parsed every
   run doc per search; now reads the `runs.question_id` column (same values by
   construction — written at INSERT from the same field).
4. **Every-open full scan**: the unchained-events repair check
   (`COUNT(*) WHERE prev_hash IS NULL`) scanned the events table on each Store
   open; partial index `idx_events_unchained` (v9) makes it an empty-index
   probe while preserving repair semantics.
5. **Per-row prepare** in `queryEvents` hoisted out of the loop.
6. **Double id grammar** in `ids.ts`: prefix regexes existed twice (idOf
   schemas + OBJECT_REF_ID_SHAPES). Now one `ID_PREFIX` vocabulary; schemas and
   the ObjectRef superRefine derive from it. Behavior identical.

## Persistence proof obligations (goal contract)

| Obligation | Evidence |
|---|---|
| Migration/upgrade | NEW `tests/migrations-upgrade.test.ts`: legacy v5 db (real seeded rows) -> open -> latest user_version, chain/tags/lineage derivables repaired, authoritative rows intact, corpus_items writable; reopen is a no-op (no duplicate backfill). Fresh-db version pin already existed (waveg-wp2) and auto-extends to v9. |
| Restore | `storage-hardening` RU-7.1: VACUUM INTO snapshot reopens, integrity ok, event chain verifies; `far backup` CLI verb end-to-end incl. overwrite refusal. |
| Concurrent access | NEW two-connection WAL test: interleaved appendEvent x50 on one run from two Store connections; both per-run chains verify; cross-connection visibility asserted. |
| Idempotency | outbox insert-only-by-intent (`tests/outbox.test.ts` 5), corpus item deterministic content key, reopen no-op (migrations-upgrade #2). |
| Large-state | events chain exercised at modest scale; no artificial large-state suite added (suite-time discipline) — remaining honest gap, low materiality at workspace scale. |
| Fresh data-dir launch | every persistence test runs on fresh temp dirs; `far backup` E2E spawns the real CLI with `FARLAB_DATA_DIR`. |
| API compatibility | `tests/api.test.ts` 59 contract tests green on the changed store. |
| Retention vs provenance | `tests/gc.test.ts`: only unreferenced blobs swept; bundle-referenced (bare-hex AND prefixed) survive; tombstoned deletions keep deletion facts. |

## Verification (commands + results, lane worktree)

- Setup gate (pre-edit): `npm ci` (root/web/tui) → 0 vulnerabilities findings
  blocking; `npm run typecheck && npm run build` → exit 0.
- Baseline suite: 1441 passed / **1 failed** (the date-sensitive RU-7.3) /
  4 skipped — failure pre-existing at the base tag, owned and fixed by this lane.
- Post-fix full suite: **1444 passed / 0 failed / 4 skipped** (exit 0), plus
  storage-hardening re-run 4/4 standalone after the concurrency test was added
  post-collection; final full-suite gate (all four new/fixed tests collected):
  **1445 passed / 0 failed / 4 skipped, exit 0** (`npx vitest run`, 143 files).
  One intermediate run exited 1 transiently with no failure summary retained;
  two consecutive complete runs after it were fully green — classified
  environmental (parallel sibling suites on this machine), not a product defect.
- `node zcode-harness/scripts/secret-scan.mjs` → PASS (exit 0; findings only
  in `experiment-runtime/.venv` third-party site-packages, pre-existing).
- `npx eslint src/domain/ids.ts src/persistence/` → clean.

## Conflict notes (shared files)

- `src/persistence/**`, `src/domain/ids.ts`, root configs: exclusively lane-12
  owned per OWNERSHIP.md — no sibling overlap.
- `tests/storage-hardening.test.ts`: shared-tests area, edited only for
  behavior this lane changed (the store clock floor).
- Migration **v9** appended after v8; waveg-wp2's "latest version" assertion
  auto-extends — verified green.
- No changes to any other lane's files; no merges into the lane branch.

## Handoffs

- None opened. The scheduler-db observation (above) was audited and classified
  as a documented deliberate design, not a defect — no handoff warranted.
- For lane 01/05: none needed; searchText result shape unchanged.

## Deviations

- Branch named `ws/r2/12-platform-data-api` per OWNERSHIP.md's binding
  `ws/r2/<nn>-<slug>` format (the goal-pack text `ws/r2-platform-data-api/main`
  predates the reshard contract; the concurrency contract wins). Report lives
  at `reports/r2/12-platform-data-api-report.md` per the same contract.

## Remaining / unverified

- Nothing in this lane's scope is BLOCKED. Large-state stress remains an
  honest low-materiality gap (documented above). The outbox drain CONSUMER
  (scheduler side) is lane 10's surface; store-side methods are proven here.
