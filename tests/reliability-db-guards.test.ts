import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb, MIGRATIONS } from '../src/persistence/db.js';

// Reliability workstream 2026-08-24: forward-only migration discipline.

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) {
    try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 60 }); } catch { /* Windows handle-release lag on just-closed sqlite handles; tmp dirs are OS-cleaned */ }
  }
  dirs = [];
});

const HEAD = MIGRATIONS[MIGRATIONS.length - 1]!.version;

describe('db migration guards', () => {
  it('a newer-schema db (user_version > HEAD) is refused visibly, not silently opened', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-guard-'));
    dirs.push(dir);
    const dbPath = path.join(dir, 'far.db');
    const raw = new DatabaseSync(dbPath);
    raw.exec(`PRAGMA user_version = ${HEAD + 1}`);
    raw.close();
    expect(() => openDb(dbPath)).toThrow(/newer than this build supports/);
    // and the refusal made NO changes to the file
    const check = new DatabaseSync(dbPath, { readOnly: true });
    expect(Number(check.prepare('PRAGMA user_version').get()?.user_version ?? 0)).toBe(HEAD + 1);
    check.close();
  });

  it('a HEAD-version db opens unchanged (no re-migration, no rewrite)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-guard2-'));
    dirs.push(dir);
    const dbPath = path.join(dir, 'far.db');
    const first = openDb(dbPath);
    first.close();
    const second = openDb(dbPath); // reopen at HEAD
    expect(Number(second.prepare('PRAGMA user_version').get()?.user_version ?? 0)).toBe(HEAD);
    second.close();
  });

  it('migrations are strictly increasing versions starting at 1 (chain integrity of the mechanism itself)', () => {
    const versions = MIGRATIONS.map((m) => m.version);
    expect(versions[0]).toBe(1);
    for (let i = 1; i < versions.length; i++) expect(versions[i]).toBe(versions[i - 1]! + 1);
  });
});
