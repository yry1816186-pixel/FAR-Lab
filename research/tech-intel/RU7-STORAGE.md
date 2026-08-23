# RU-7 STORAGE — Research Packet (2026-08-24, SEARCH_SATURATED)

Main-Agent direct research (subagent lane died: deepseek 402 billing — see
PROGRESS-tech-intel-p1.md). Status: SOURCE_VERIFIED for runtime primitives
(live probes on this machine's Node 24.14 / SQLite 3.51.2); prior-art verified
at Level A/B via GitHub API + npm registry.

## Problem
Persistence-plane reliability hardening across 7 leaves:
C3.1 WAL/multi-process contention policy · C3.4 transactional outbox
(far.db ↔ scheduler.db dual-write) · C3.5 clock discipline (HLC, suspend-safe
leases, payload upcasting) · C3.6 backup/restore/DR · C5.1 poison-job DLQ +
bounded redelivery · C11.3 SSE backpressure · C12.1 fault-injection category.
Already-owned (do not re-litigate): leases+heartbeat+watchdog+fencing,
OAOO step_outputs checkpoints (W8/D-054).

## Why FAR-Lab needs it
far.db is the single authority (receipts = provenance product's core claim);
scheduler.db is a second write surface; desktop users hit Windows
sleep/resume; no backup story today means a corrupt file loses all research
provenance. Receipts currently prove app-level commits, not crash-survival.

## Search vocabulary run
- outbox: `transactional outbox pattern`, `dual write problem`, `at-least-once idempotent consumer`, `polling publisher` → microservices.io (HTTP 200), brandur.org (200)
- clock: `hybrid logical clock`, `HLC typescript`, `lamport timestamp tiebreak wall clock`
- backup: `node:sqlite backup API`, `VACUUM INTO online backup`, `litestream sqlite replication`, `integrity_check cadence`
- DLQ: `sqlite dead letter queue`, `bounded redelivery max attempts parked`, `poison job`
- backpressure: `server-sent events slow consumer`, `whatwg streams counting queue strategy`
- fault-injection: `toxiproxy`, `crash consistency assertion harness`, `sqlite corruption byte flip`

## Runtime primitive facts (FACT — probed live on this machine)
| Primitive | Result | Consequence |
|---|---|---|
| `db.backup()` in node:sqlite | **undefined** (absent) | No online-backup API; VACUUM INTO is the only in-process consistent snapshot |
| `VACUUM INTO ?` from live db | 8192B file written; reopened readOnly; readback `{x:42}`; integrity_check ok | Backup = one prepared statement + restore verification loop; works while WAL active |
| `PRAGMA wal_checkpoint` | parses & executes (busy/log/checkpointed row returned) | Checkpoint-before-backup policy implementable; TRUNCATE mode semantics per sqlite.org (docs reachable HTTP 200), runtime-probed default mode |
| `PRAGMA integrity_check` | returns ok row | Schedulable drill |
| Trigger `RAISE(ABORT)` guard | fires correctly (`park_first` abort observed) | DB-enforced park-before-retry DLQ discipline possible without app cooperation |

## Candidate table (SR=source/doc read, PR=paper/pattern read, SC=registry/API check)
| Candidate | Org | License | Maturity | Solves | Family | Tag |
|---|---|---|---|---|---|---|
| Transactional Outbox pattern | Chris Richardson microservices.io | free article (pattern) | canonical since 2018 | atomic state+publication | outbox + polling publisher | PR |
| brandur.org postgres-queues | Brandur Leach | blog | widely cited | job-queue failure taxonomy (idempotency, DLQ, bounded retries) | design vocabulary | PR |
| litestream | benbjohnson | Apache-2.0 | active (v0.5.16, 2026-08-05 release; pushed 2026-08-21) | continuous WAL replication to S3/file | external replicator process | SC |
| @consento/hlc | consento-org | MIT | stale (2021, v2.1.0) | HLC impl w/ codec | reference implementation to EXTRACT algorithm from (~100 LoC) | SR(registry)+SC |
| liepoch | npm | MIT, zero-deps | new (2026-06) | distributed timestamps | same family; younger, less battle-tested | SC |
| Kuzu-style embedded graph db | — | — | — | n/a here | rejected in RU-2 already | — |
| toxiproxy | Shopify | MIT | active (pushed 2026-08-04) | TCP-level fault injection (provider drops, latency) | proxy-based fault injection | SC |
| sqlean-style DLQ/job tables | community repos (reliable-job-queue, sqlite-eventbus, queueforge) | various | small | DLQ schema precedents | pattern references only | SC |

## Source-level findings
1. **Outbox applied to two SQLite files** (synthesis from Richardson + our W8
   assets): far.db gains `outbox(event_json, status pending|sent|dead,
   attempts, next_visible_at)` written IN the same txn as the state change;
   a single-owner relay (the server process — the one writer of scheduler.db)
   polls with `WHERE status='pending' AND next_visible_at<=now` keyset order,
   writes job rows in scheduler.db inside ITS txn, then marks sent. Consumer
   idempotency already exists (step_fingerprints OAOO). Crash between the two
   txns ⇒ at-least-once redelivery, absorbed by fingerprints. No distributed
   txn needed because each db has exactly one writer process.
2. **HLC**: algorithm is timestamp=(phys,logic); ~80-120 LoC TS; @consento/hlc
   is MIT and small enough to port (not vendor). Worth it ONLY for the
   cross-process event spine merge (CLI/TUI/web/desktop concurrent writers);
   suspend-resume makes pure wall-clock ordering lie. Lamport+wallclock
   tiebreak gives causal order but breaks "receive-time ≥ send-time"
   monotonicity that lease math wants. Verdict: BUILD hlc.ts (EXTRACT
   algorithm), adopt for event spine `hlc` column at migration v6+; keep
   existing seq as local total order.
3. **Suspend-safe leases**: Windows sleep freezes wall clock but heartbeat
   piggyback already renews on wake (W8). Residual risk = TTL computed across
   a sleep boundary by OTHER processes. Fix: monotonic-ish lease check =
   `lease_until < now` evaluated with post-wake immediate watchdog sweep +
   HLC-stamped heartbeats make staleness detectable even if wall clock jumped.
4. **DLQ**: schema `attempts INT, parked_reason TEXT NULL, next_visible_at`;
   exponential backoff on redelivery; trigger-guard enforces "cannot exceed
   max_attempts unless parked_reason set" (probe above proves RAISE(ABORT)
   path works in node:sqlite). Bounded redelivery = attempts≥N AND
   parked_reason IS NOT NULL → dead; surfaced in GET /runs/:id health.
5. **Backpressure**: narrative feed is capped-at-2000 buffer (App.tsx:33) —
   static cap masquerading as flow control. WhatWG counting strategy applies
   server-side per-SSE-subscriber: track consumer lag (events emitted vs
   acked-by-TCP-buffer); policy: drop-oldest *narrative* events (they are
   projections, replayable from spine) never receipts; disconnect after
   sustained full buffer + client reconnects via Last-Event-ID (already
   implemented D-094).
6. **Backup/DR**: nightly-on-first-launch VACUUM INTO `backups/far-YYYYMMDD.db`
   + wal_checkpoint first; verify by reopening + integrity_check + row-count
   spot checks; retain last N=7. Litestream (Apache-2.0, very alive) is the
   real answer for continuous DR but adds an external Go process — DEFER
   behind trigger: multi-machine sync or >10GB workspaces.
7. **Fault-injection matrix** (implementable offline, extends evidence/W8):
   | Scenario | Injection | Assertion |
   |---|---|---|
   | receipt durability | kill -9 node mid-stage-loop | committed receipt visible in fresh reader; WAL replay complete |
   | outbox crash window | kill between far.db txn and scheduler txn | redelivery once; fingerprint absorbs; no dup job effect |
   | lease steal during sleep | fake clock jump +12h | watchdog reclaims; no double-writer (fence holds) |
   | provider drop | toxiproxy timeout on LLM conn | retry-with-jitter; budget ledger unchanged; fail-visible after cap |
   | corruption | flip bytes in COPY of db | integrity_check fails; refuse-to-open + point to backup; never silently recover-write |
   | SSE flood | 50k events, slow consumer | drop-oldest narrative only; receipts intact; reconnect resumes at cursor |

## Adjacent-field findings
- Event-sourcing literature (brandur): "at-least-once + idempotent consume" is
  the only sane contract across process crash; exactly-once is a marketing
  term. Our fingerprints already embody this — outbox completes the write side.
- Postgres ecosystem settled on `SELECT ... FOR UPDATE SKIP LOCKED` for queue
  claims; SQLite equivalent = single-writer + `UPDATE ... RETURNING` claim
  under IMMEDIATE txn (already our pattern for jobs).

## Verdicts (main-Agent, closed vocab)
- Outbox mechanism: **BUILD** (in-far.db outbox table + single-relay poller; no framework)
- HLC: **BUILD** (EXTRACT algorithm à la @consento/hlc, MIT; zero-dep ~100 LoC)
- Lease suspend-hardening: **BUILD** (watchdog wake-sweep + HLC heartbeat stamps)
- DLQ/bounded redelivery: **BUILD** (schema + trigger guard + backoff, probe-proven)
- SSE backpressure: **BUILD** (per-consumer lag counter + drop-oldest-narrative-only policy)
- VACUUM INTO backup + verify + rotation: **BUILD** (only viable in-process primitive)
- litestream: **DEFER** — trigger: continuous replication demand (multi-machine or large corpora)
- toxiproxy: **ADOPT (devDep, fault-injection rig only)** — never shipped
- rqlite/distributed SQL: **REJECT** (network-coordinated store violates local-first)
- @consento/hlc / liepoch as deps: **REJECT as dependency / EXTRACT algorithm** (dep gate)

## Integration sketch (owners)
- store.ts owns: outbox table, DLQ columns, trigger guards, backup job (DDL-only migration v6)
- server main.ts owns: single-relay poller (it is the only scheduler.db writer), SSE lag counters
- supervisor.ts consumes: dead-letter counts as stall signals
- CLI: `far backup [--verify]` thin wrapper over same store method
- Windows-specific risks recorded: AV can hold .db files (retry-open loop),
  sleep/resume handled above, NTFS flush ≠ fsync guarantee → rely on WAL
  synchronous=NORMAL/FULL review at migration time.

## Deterministic validation workload (offline)
Fault-injection matrix executed in vitest child processes (kill signals are
deterministic on POSIX-spawned children; Windows uses taskkill /PID);
backup round-trip golden test (write→backup→corrupt original→restore→readback);
outbox redelivery property test (crash-window simulation via injected throw);
trigger-guard unit tests (probe already proves mechanics); SSE drop-oldest
order-preservation test on narrative vs receipts.

## UNVERIFIED
- litestream Windows service-mode quality (release notes only read)
- exact Node docs page for sqlite (network flake) — runtime probe supersedes doc claim anyway
- whether any AV suite in user population locks WAL mid-checkpoint (needs field data)
