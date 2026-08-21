# W0 Spike Report: SQLite Persistence Route — `node:sqlite` vs `better-sqlite3`

- **Date**: 2026-08-21
- **Environment**: Windows 10.0.26200 (win32-x64), Git Bash, Node `v24.14.0`, npm `11.9.0`
- **Scripts** (all rerunnable): `spikes/sqlite-spike/exp{1..6}*.mjs`
- **Verdict**: **ADOPT Route A (`node:sqlite`)**, with a thin persistence adapter; keep Route B (`better-sqlite3` 13.0.3) as a verified drop-in fallback.

## TL;DR

| # | Question | Result |
|---|----------|--------|
| 1 | `node:sqlite` usable without flag on Node 24? | YES — exit 0, SQLite 3.51.2, prints `ExperimentalWarning` on stderr |
| 2 | BEGIN/COMMIT/ROLLBACK correct, before/after WAL? | YES — 15/15 assertions PASS in both `delete` and `wal` journal modes |
| 3 | Crash (SIGKILL mid-transaction) recovery? | YES — `integrity_check=ok`, uncommitted txn rolled back, WAL auto-recovered, db writable after |
| 4 | Concurrent writers / busy_timeout? | Default timeout = 0 → `SQLITE_BUSY` (errcode 5, "database is locked"); `busy_timeout=3000` → 0 errors, 0 lost writes. Constructor option `timeout` (ms) works; `busyTimeout` is ignored |
| 5 | `PRAGMA user_version` incremental migrations? | YES — ordered apply, idempotent re-run, atomic rollback on failure, fresh-db replay |
| 6 | `better-sqlite3` on Node 24 win32-x64? | Installs clean in 6.0 s, 26.4 MB, **zero compile** (8-platform prebuilds ship inside the npm tarball); CRUD/txn/WAL smoke PASS |

---

## Experiment 1 — Availability of `node:sqlite` (no flag)

**Script**: `exp1-usability.mjs` (spawns a fresh node child so import-time stderr is captured verbatim)
**Command**: `node exp1-usability.mjs`
**Exit code**: `0`

Key output (verbatim):

```
node version : v24.14.0
exit code    : 0
--- child stdout ---
typeof DatabaseSync = function
sqlite_version = 3.51.2
smoke select = [{"id":1,"val":"hello-farlab"}]
SMOKE_OK
--- child stderr (verbatim) ---
(node:19680) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
smoke result           : PASS
```

**Conclusion**: `import { DatabaseSync } from 'node:sqlite'` works with no flag on Node 24.14.0. The module emits an `ExperimentalWarning` ("SQLite is an experimental feature and might change at any time") once per process on stderr — cosmetic, does not affect behavior. API risk is real (module still marked experimental in 24.x) and must be contained behind an adapter.

## Experiment 2 — Transaction semantics (default journal mode, then WAL)

**Script**: `exp2-transactions.mjs`
**Command**: `node exp2-transactions.mjs`
**Exit code**: `0` — `ALL PASS` (15 checks)

Key output (verbatim, abridged to assertions):

```
-- Phase A: default journal mode = delete --
  [PASS] A1 rollback discards | count=0
  [PASS] A2 commit persists | count=2
  [PASS] A3a mid-txn constraint error throws | ERR_SQLITE_ERROR UNIQUE constraint failed: runs.tag
  [PASS] A3b rollback after error discards | count=2
  [PASS] A4 close-without-commit rolls back | count=2
  [PASS] A4b committed rows survive reopen
  [PASS] A4c integrity_check (post-reopen)
-- Phase B: PRAGMA journal_mode=WAL -> wal --
  [PASS] B0 journal mode switches to wal
  [PASS] B1 rollback under WAL discards | count=2
  [PASS] B2 commit under WAL persists | count=3
  sidecar files while open       : exp2.db, exp2.db-shm, exp2.db-wal
  [PASS] B3 rollback after mid-txn error | count=3; err=...UNIQUE constraint failed
  [PASS] B4 integrity_check under WAL
  [PASS] B5 mode + data survive reopen | mode=wal, count=3
  sidecar files after last close : exp2.db
[exp2] result: ALL PASS
```

**Conclusion**: Full BEGIN/COMMIT/ROLLBACK correctness in both `delete` and `wal` journal modes. SQL errors mid-transaction surface as `ERR_SQLITE_ERROR` with the SQLite message; closing a connection with an open transaction implicitly rolls back. WAL sidecars (`-wal`, `-shm`) exist while open and are checkpointed away on last close. Note: `DatabaseSync` does **not** create parent directories (`unable to open database file`, errcode 14) — the owner code must `mkdirSync` the data dir first.

## Experiment 3 — Crash recovery (SIGKILL mid-transaction)

**Scripts**: `exp3-crash-recovery.mjs` (parent) + `exp3-child.mjs` (victim)
**Method**: child commits 5 baseline rows, opens `BEGIN`, streams uncommitted inserts; parent sends `SIGKILL` (Windows: `TerminateProcess`, no cleanup handlers) on the first `PROGRESS` line; parent then reopens the db.
**Command**: `node exp3-crash-recovery.mjs`
**Exit code**: `0` — `ALL PASS` (both scenarios)

Key output (verbatim, WAL scenario):

```
    child> BASELINE_COMMITTED 5
    child> IN_TXN
    child> PROGRESS 1000
    parent> SIGKILL sent after first PROGRESS line
    child exit: code=null signal=SIGKILL killed=true
    files present right after crash: exp3-wal.db, exp3-wal.db-shm, exp3-wal.db-wal
    [PASS] child was killed before COMMIT | signal=SIGKILL
    [PASS] integrity_check = ok | got=ok
    [PASS] uncommitted txn rolled back | txn rows=0
    [PASS] committed baseline survived | baseline rows=5/5
    [PASS] journal mode still wal after recovery | mode=wal
    [PASS] db writable after recovery (insert+commit survives) | rows=1
    [PASS] integrity_check ok after post-crash write
```

DELETE-journal scenario additionally left `exp3-del.db-journal` after the crash and recovered identically (all PASS).

**Conclusion**: Hard-killed process mid-transaction leaves the expected sidecar files; on reopen SQLite recovers automatically — `integrity_check=ok`, the uncommitted transaction fully rolled back, committed data intact, WAL mode preserved, and the db remains writable. Recovery behavior identical in WAL and rollback-journal modes.

## Experiment 4 — Concurrent writers and busy_timeout

**Scripts**: `exp4-concurrency.mjs` + `exp4-worker.mjs` (2 processes x 300 single-statement `BEGIN IMMEDIATE ... COMMIT` transactions against one WAL db)
**Command**: `node exp4-concurrency.mjs`
**Exit code**: `0` — `ALL PASS`

Key output (verbatim):

```
-- Round 0: busy_timeout configuration probe --
  default PRAGMA busy_timeout          = {"timeout":0} (ms; 0 = off)
  constructor option {"timeout":1234} -> PRAGMA busy_timeout = {"timeout":1234}
  constructor option {"busyTimeout":1234} -> PRAGMA busy_timeout = {"timeout":0}
  after PRAGMA busy_timeout = 2500       -> {"timeout":2500}

-- Round A: 2 concurrent writers, DEFAULT busy_timeout (off) --
  worker A: ok=300/300 busy_errs=0  ...
  worker B: ok=0/300   busy_errs=300 ... sample-err: errcode=5: database is locked
  rows actually in db: 300 (per worker: {"A":300})
-- Round B: 2 concurrent writers, PRAGMA busy_timeout=3000 --
  worker A: ok=300/300 busy_errs=0 other_errs=0 busy_timeout=3000ms elapsed=552ms
  worker B: ok=300/300 busy_errs=0 other_errs=0 busy_timeout=3000ms elapsed=1204ms
  rows actually in db: 600 (per worker: {"A":300,"B":300})
  [PASS] Round B: busy_timeout=3000 eliminates busy errors | busy=0
  [PASS] Round B: no writes lost (ok counts also clean) | other=0
```

(Run-to-run Round A varies: a separate run saw A=1/299-busy, B=135/165-busy; db rows always exactly equal to the sum of `ok` counts.)

**Conclusion**: `node:sqlite` **does** expose busy_timeout — two ways: constructor option `new DatabaseSync(path, { timeout: ms })` and `PRAGMA busy_timeout = ms` (the option `busyTimeout` is silently ignored). Default is **0 = off**, so raw `SQLITE_BUSY` (`errcode=5`, "database is locked") errors appear immediately under writer contention. With 3000 ms both writers complete 300/300 with zero errors and zero lost writes. No corruption or partial writes observed in any round. Production code must set a busy timeout.

## Experiment 5 — Incremental migrations via `PRAGMA user_version`

**Script**: `exp5-migrations.mjs` (v1 create table -> v2 add column + backfill -> v3 index + audit table; each step inside `BEGIN IMMEDIATE` with `PRAGMA user_version = n`)
**Command**: `node exp5-migrations.mjs`
**Exit code**: `0` — `ALL PASS`

Key output (verbatim):

```
run #1 (to v1): {"before":0,"applied":[1]}
run #1b (to latest): {"before":1,"applied":[2,3]}
run #2: {"before":3,"applied":[]}          <- idempotent no-op
  [PASS] v2 backfill filled pre-existing NULL rows | H1.status=draft
  [PASS] v2 backfill preserved existing values | H2.status=ranked
  [PASS] failed migration throws | table bad_table already exists
  [PASS] rollback removes partial schema
  [PASS] user_version unchanged after failed migration
  [PASS] fresh db replays full chain | {"before":0,"applied":[1,2,3]}
```

**Conclusion**: The standard `user_version` incremental-migration pattern works on `node:sqlite`: ordered application, idempotent re-runs, atomic per-step rollback (schema + version together), and full replay on a fresh db. This is a viable schema-migration mechanism with zero extra tooling.

## Experiment 6 — `better-sqlite3` control (isolated dir `spikes/sqlite-spike/tmp-bsql`)

**Script**: `exp6-better-sqlite3.mjs` (does `npm init -y` -> timed `npm install better-sqlite3 --no-audit --no-fund` -> size walk -> smoke run)
**Command**: `node exp6-better-sqlite3.mjs`
**Exit code**: `0`

Key output (verbatim):

```
-- npm install better-sqlite3 (timed) --
exit code : 0
duration  : 6.0s
-- key install output lines --
  added 2 packages in 6s
node_modules size: 26.4 MB

-- node smoke-better-sqlite3.mjs --  (exit code: 0)
better-sqlite3 version : 13.0.3
sqlite_version         : 3.53.4
WAL switch             : [ { journal_mode: 'wal' } ]
after committed txn    : count=2
mid-txn error          : SQLITE_CONSTRAINT_UNIQUE UNIQUE constraint failed: t.v
after failed txn       : count=2        <- db.transaction() auto-rollback
integrity_check        : [ { integrity_check: 'ok' } ]
SMOKE_OK
```

Dependency tree: `better-sqlite3@13.0.3` -> `node-addon-api@8.9.2` (only dep). No `node-gyp`/MSBuild output during install — 13.0.3 ships prebuilt binaries **inside the npm package** (`node_modules/better-sqlite3/prebuilds/` contains `win32-x64.node`, `win32-arm64.node`, `linux-x64/arm64`, `linuxmusl-*`, `darwin-*`), so no postinstall binary download and no compiler toolchain needed on this machine. (The `DEP0190` warning in the parent output came from this spike script's own `spawnSync(..., {shell:true})`, not from better-sqlite3.)

**Conclusion**: better-sqlite3 is fully viable on Node 24 / win32-x64: 6 s install, 26.4 MB, zero native-build risk on current versions, richer ergonomics (`db.transaction()` with automatic rollback, `db.pragma()`), newer bundled SQLite (3.53.4 vs 3.51.2).

---

## Comparison

| Dimension | A: `node:sqlite` (Node 24 built-in) | B: `better-sqlite3@13.0.3` |
|---|---|---|
| Availability on Node 24.14 / win32-x64 | Works, no flag; `ExperimentalWarning` on stderr | Works; prebuilt binary shipped in tarball |
| Dependencies | **0** | 1 runtime dep (`node-addon-api`), 26.4 MB node_modules |
| Install time / toolchain | n/a (built into runtime) | 6.0 s, no compiler needed (prebuilds for 8 platforms in-package) |
| SQLite version | 3.51.2 (pinned by Node, changes with Node upgrades) | 3.53.4 (pinned by package semver) |
| Transaction semantics | PASS (exp2) | PASS (exp6; plus ergonomic `db.transaction()`) |
| Crash recovery (kill -9 mid-txn) | PASS — WAL + journal modes (exp3) | not directly re-tested here; same underlying SQLite engine, well-established |
| busy_timeout | `new DatabaseSync(path, {timeout: ms})` or `PRAGMA busy_timeout`; default 0 = OFF (must set explicitly) | `db.pragma('busy_timeout=...')` / `timeout` option; default also 0 |
| Concurrent writers (WAL) | PASS with timeout set; `SQLITE_BUSY` errcode=5 without | same engine, same behavior expected |
| Migrations (`user_version`) | PASS (exp5) | same mechanism available |
| API surface / maturity | Minimal (Sync API), experimental status, API may change across Node minors | Mature, stable API, large ecosystem |
| Upgrade coupling | Advances with Node runtime upgrades (free, but not independently controllable) | Upgrades via npm; ABI tied to Node major version (future Node majors need matching release) |
| Runtime license noise | stderr warning (suppressible via `--no-warnings` or `process.emitWarning` filtering; do NOT suppress globally in prod) | none |

## ADOPT recommendation

**ADOPT Route A: `node:sqlite`**, under three containment rules that the evidence directly motivates:

1. **Wrap it in a thin persistence adapter** owned by the domain layer (open/migrate/transaction/append-audit + busy_timeout + WAL bootstrap). The module is experimental (`ExperimentalWarning` observed); the adapter is the firewall against API drift and makes Route B a drop-in replacement — exp6 proves B installs and passes the same semantics today, so switching cost stays low.
2. **Always set busy_timeout at open** (`new DatabaseSync(path, { timeout: 5000 })` or `PRAGMA busy_timeout=5000`): default is 0 and concurrent writers get immediate `SQLITE_BUSY` (exp4 Round A: 300/300 busy errors for the losing writer).
3. **Always create the parent directory before opening** — `DatabaseSync` fails with `unable to open database file` (errcode 14) otherwise (observed during exp2 development).

Migrations: use the `PRAGMA user_version` incremental pattern validated in exp5. Persistence model: WAL mode (validated in exp2/exp3/exp4) for the single transactional authority.

Route B remains a **verified fallback**, preferred only if/when: (a) async or streaming APIs become requirements better-sqlite3 serves better, (b) a needed SQLite feature exceeds Node's bundled 3.51.x, or (c) `node:sqlite`'s experimental API breaks in a future Node upgrade before the adapter can absorb it.

## Reproduction

```bash
cd spikes/sqlite-spike
node exp1-usability.mjs      # exit 0
node exp2-transactions.mjs   # exit 0, ALL PASS
node exp3-crash-recovery.mjs # exit 0, ALL PASS (kills child processes)
node exp4-concurrency.mjs    # exit 0, ALL PASS (spawns 2 writers x 2 rounds)
node exp5-migrations.mjs     # exit 0, ALL PASS
node exp6-better-sqlite3.mjs # exit 0 (network required; recreates tmp-bsql/)
```

All six were re-run end-to-end on 2026-08-21 after initial development; all exited 0. Artifacts: db files under `spikes/sqlite-spike/data/`, better-sqlite3 sandbox under `spikes/sqlite-spike/tmp-bsql/` (26.4 MB, safe to delete).
