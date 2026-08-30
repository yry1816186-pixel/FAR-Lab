# Backup & Restore Drill (RU-7.1 + FA-DAT-02)

`far backup` writes a **workspace backup set** — one `VACUUM INTO` snapshot per
database plus a `MANIFEST.json` — and `far restore` performs a **verified**
restore of that set. The WAL-copy trap (copying `far.db` while its `-wal`
holds recent commits silently loses them) is structurally avoided: `VACUUM
INTO` runs inside the engine and writes fully checkpointed standalone copies.

## What is backed up

| member | role | loss impact |
| --- | --- | --- |
| `far.db` | scientific authority (runs, events, objects, memory, lineage, receipts) | catastrophic — this is the product |
| `far-scheduler.db` | experiment job queue | operational; queues recreatable via `far experiment enqueue` |
| `source-cache.db` | retrieval response cache | QoS only; safe to lose |

Absent members are honestly omitted from the manifest; a set without `far.db`
is refused (absence must never verify as success).

## Backup

```bash
far backup                      # <dataDir>/backup/set-<timestamp>/
far backup /path/to/set-dir     # explicit destination (must not exist)
```

The manifest carries per-member sha256 + `user_version`. Refuses to overwrite
an existing destination — a good backup is never replaced by a possibly-bad one.

## Restore (FA-DAT-02)

```bash
far restore <set-dir> --replace
```

Order of operations (each step is load-bearing):

1. **Verify first, read-only**: every member's sha256 is checked against the
   manifest, then `PRAGMA integrity_check` runs through READ-ONLY sqlite
   connections (never `openDb` — that would run forward migrations on the
   backup). Any mismatch aborts before the live workspace is touched.
2. **Hot-writer guard**: a `-wal` sibling next to a live database means a
   server/worker may be running; restore refuses. Stop it first.
3. **Move-aside, not delete**: live files become `<name>.pre-restore-<stamp>`.
   Rollback is literally renaming them back — no destructive step exists.
4. Copy the verified members in; an aborted restore rolls back its own
   partial moves.

`--replace` is REQUIRED when a live file exists — restoring is deliberately
not a silent clobber.

## Verified drills (tests/restore-drill.test.ts + tests/storage-hardening.test.ts)

- round-trip: seed run → backup → byte-corrupt live `far.db` (real mid-file
  flip) → restore → run readable again, integrity ok
- refuse without `--replace`; live file untouched
- refuse a hash-tampered backup set before touching the live workspace
- refuse under a live `-wal` (hot writer)
- refuse an empty "backup" (no far.db)

## What the backup set does NOT include

- `artifacts/` content-addressed blobs — copy the directory alongside the
  restore (`cp -r .far-run.broken/artifacts .far-run/artifacts`);
  `far gc --dry-run` reports orphans if a blob is missing.
- `.far-run/devices.json` (SSH device registry) — copy alongside if present.

## Cadence

No automatic schedule is imposed. For active research sessions, a manual
`far backup` after completing a run is the recommended rhythm; the set is
cheap (single-pass, size-proportional) and never blocks a later one.
