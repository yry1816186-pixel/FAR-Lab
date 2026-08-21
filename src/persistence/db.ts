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
];

export const openDb = (dbPath: string): Db => {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const raw = new DatabaseSync(dbPath, { timeout: 10_000 });
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
      raw.exec('BEGIN IMMEDIATE');
      try {
        const out = fn();
        raw.exec('COMMIT');
        return out;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
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
  const current = Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.exec(`PRAGMA user_version = ${m.version}`);
    });
  }
};
