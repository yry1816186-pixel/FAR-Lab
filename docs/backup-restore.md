# Backup & Restore Drill (RU-7.1)

`far backup` is the production caller of `Store.backupTo` — a single
`VACUUM INTO` statement producing a standalone, consistent snapshot. The
WAL-copy trap (copying `far.db` while its `-wal` holds recent commits
silently loses them) is structurally avoided: `VACUUM INTO` runs inside the
engine and writes a fully checkpointed copy.

## Backup

```bash
# default: <dataDir>/backup/far-<timestamp>.db (never overwrites)
far backup

# explicit destination (must not exist)
far backup /path/to/snapshot.db
```

Refuses to overwrite an existing destination — a good backup is never
replaced by a possibly-bad one. Far-Lab locks the snapshot against
concurrent writes for the duration.

## Scheduler database

`far backup` covers `far.db` (runs, events, objects, memory, lineage,
receipts). The experiment job queue lives in `<dataDir>/far-scheduler.db`;
back it up separately if you rely on queued/in-flight experiment jobs:

```bash
cp <dataDir>/far-scheduler.db <backup>/far-scheduler.db   # only with the worker stopped
```

Job state is operational (recreatable via `far experiment enqueue`); far.db
is the scientific authority — losing the scheduler db loses queues, not results.

## Restore drill (verified procedure)

1. Stop any server/worker using the data dir.
2. Move the current data dir aside: `mv .far-run .far-run.broken`.
3. Create a fresh dir and restore the snapshot as the database:
   ```bash
   mkdir -p .far-run
   cp <snapshot>.db .far-run/far.db
   cp -r .far-run.broken/artifacts .far-run/artifacts   # content-addressed blobs live outside the db
   cp -r .far-run.broken/exports .far-run/exports 2>/dev/null || true
   ```
4. Verify integrity from the restored copy:
   ```bash
   far data info        # runs visible
   far runs            # history intact
   far verify <bundle-id>   # export bundles still verify against restored receipts
   ```
5. The audit chain check rides `/health` (`auditChain.ok`) on the next server
   start — a tampered or truncated restore is visible there, not silent.

## What the snapshot does NOT include

- `artifacts/` content-addressed blobs (restored from the file copy in step 3;
  `far gc --dry-run` reports orphans if a blob is missing).
- `.far-run/devices.json` (SSH device registry) — copy alongside if present.
- `far-scheduler.db` (see above).

## Cadence

No automatic schedule is imposed. For active research sessions, a manual
`far backup` after completing a run is the recommended rhythm; the snapshot is
cheap (single-pass, size-proportional) and never blocks a later one.
