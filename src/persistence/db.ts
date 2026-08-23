import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Thin adapter over node:sqlite (D-011). Isolates the experimental API surface:
 * busy_timeout on open, parent dir pre-created, WAL mode, user_version migrations.
 * better-sqlite3 is a verified drop-in fallback if this API breaks.
 */
export interface Db {
  raw: DatabaseSync;
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  };
  transaction<T>(fn: () => T): T;
  close(): void;
  integrityCheck(): string;
}

export const MIGRATIONS: readonly { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        question_id TEXT NOT NULL,
        status TEXT NOT NULL,
        current_stage TEXT NOT NULL,
        doc TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        at TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_run ON events(run_id, seq);
      CREATE TABLE IF NOT EXISTS objects (
        kind TEXT NOT NULL,
        id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (kind, id)
      );
      CREATE INDEX IF NOT EXISTS idx_objects_run ON objects(run_id, kind);
    `,
  },
  {
    // W8 S2+S1: idempotent intra-stage step checkpoints + run leases (D-039 mechanism
    // extraction from dbos operation_outputs / langgraph put_writes / temporal leases).
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS step_outputs (
        run_id TEXT NOT NULL,
        stage TEXT NOT NULL,
        step_key TEXT NOT NULL,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (run_id, stage, step_key)
      );
      ALTER TABLE runs ADD COLUMN lease_holder TEXT;
      ALTER TABLE runs ADD COLUMN lease_expires_at TEXT;
    `,
  },
  {
    // W8 audit P0-1: one stage can host SEVERAL checkpoint families with different
    // inputs fingerprints (rank: scoring batches vs tournament pairs) — the fingerprint
    // row and invalidation must be keyed per family or the families clear each other on
    // every resume. Both tables were empty at rollout (verified on production copy), so
    // a PK rebuild via drop+recreate is lossless.
    version: 3,
    sql: `
      DROP TABLE IF EXISTS step_outputs;
      DROP TABLE IF EXISTS step_fingerprints;
      CREATE TABLE step_outputs (
        run_id TEXT NOT NULL,
        stage TEXT NOT NULL,
        family TEXT NOT NULL DEFAULT '',
        step_key TEXT NOT NULL,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (run_id, stage, family, step_key)
      );
      CREATE TABLE step_fingerprints (
        run_id TEXT NOT NULL,
        stage TEXT NOT NULL,
        family TEXT NOT NULL DEFAULT '',
        fingerprint TEXT NOT NULL,
        PRIMARY KEY (run_id, stage, family)
      );
    `,
  },
  {
    // Wave-G WP2 (persistence review F5): listExpiredLeaseRuns (watchdog poll, every
    // ~5s per running run) filters runs on (status, lease_expires_at) — without a
    // covering index this is a full scan whose read transaction lengthens with run
    // count and blocks WAL writers under load.
    version: 4,
    sql: `
      CREATE INDEX IF NOT EXISTS idx_runs_status_lease ON runs(status, lease_expires_at);
    `,
  },
  {
    // RU-2 lineage storage (tech-intel expedition 2026-08-24): authoritative
    // lineage edges + deterministic event tags. Adjacency + keyset design —
    // recursive CTEs traverse at read time (shallow forests; no closure table,
    // see research/tech-intel/RU2-LINEAGE.md for the trade-off ruling).
    version: 5,
    sql: `
      CREATE TABLE IF NOT EXISTS lineage_edges (
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        run_id TEXT NOT NULL,
        at TEXT NOT NULL,
        PRIMARY KEY (from_id, to_id, kind)
      );
      CREATE INDEX IF NOT EXISTS idx_lineage_to ON lineage_edges(to_id, kind);
      CREATE TABLE IF NOT EXISTS event_tags (
        tag TEXT NOT NULL,
        run_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        PRIMARY KEY (tag, run_id, seq)
      );
      CREATE INDEX IF NOT EXISTS idx_event_tags_run ON event_tags(run_id, seq);
    `,
  },
];

export const openDb = (dbPath: string): Db => {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const raw = new DatabaseSync(dbPath, { timeout: 10_000 });
  let txDepth = 0;
  const db: Db = {
    raw,
    exec: (sql) => raw.exec(sql),
    prepare: (sql) => {
      const stmt = raw.prepare(sql);
      const args = (params: unknown[]) => params as SQLInputValue[];
      return {
        run: (...params: unknown[]) => stmt.run(...args(params)) as { changes: number | bigint; lastInsertRowid: number | bigint },
        get: (...params: unknown[]) => stmt.get(...args(params)) as Record<string, unknown> | undefined,
        all: (...params: unknown[]) => stmt.all(...args(params)) as Record<string, unknown>[],
      };
    },
    transaction: <T>(fn: () => T): T => {
      // Nesting-safe (RU-2): inner transactions (e.g. appendEvent's atomic event+tags
      // write inside createRun's transaction) become SAVEPOINTs — the outer COMMIT
      // still owns durability; a nested failure rolls back only its own scope.
      if (txDepth > 0) {
        const sp = `far_sp_${txDepth}`;
        txDepth += 1;
        raw.exec(`SAVEPOINT ${sp}`);
        try {
          const out = fn();
          raw.exec(`RELEASE SAVEPOINT ${sp}`);
          return out;
        } catch (e) {
          raw.exec(`ROLLBACK TO SAVEPOINT ${sp}`);
          raw.exec(`RELEASE SAVEPOINT ${sp}`);
          throw e;
        } finally {
          txDepth -= 1;
        }
      }
      txDepth += 1;
      raw.exec('BEGIN IMMEDIATE');
      try {
        const out = fn();
        raw.exec('COMMIT');
        return out;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      } finally {
        txDepth -= 1;
      }
    },
    close: () => raw.close(),
    integrityCheck: () => String(db.prepare('PRAGMA integrity_check').get()?.integrity_check ?? 'unknown'),
  };
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
};

const migrate = (db: Db): void => {
  let current = Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.transaction(() => {
      // Re-check INSIDE the transaction: a concurrent process may have committed this
      // migration between our read and BEGIN IMMEDIATE (W8 audit P2-1 — the ALTERs in
      // v2 would otherwise throw duplicate-column on the loser).
      current = Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
      if (m.version <= current) return;
      db.exec(m.sql);
      db.exec(`PRAGMA user_version = ${m.version}`);
    });
  }
};
