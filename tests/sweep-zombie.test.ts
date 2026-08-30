import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { ResearchQuestion, newId } from '../src/domain/index.js';

/**
 * FA-PRF-05 (endgame audit STUCK-10): sweep-zombie-runs.mjs had ZERO tests and
 * a hardcoded data dir. These tests drive the REAL script as a child process
 * against a real workspace: dry-run changes nothing; --execute marks only
 * stale running runs partial with an audit event; fresh runs stay untouched.
 */

const SCRIPT = path.resolve('zcode-harness/scripts/sweep-zombie-runs.mjs');

let tmp: string;
let db: Db;
let store: Store;

const mkRun = (id: string, status: string, updatedAt: string): string => {
  const q = ResearchQuestion.parse({
    id: newId('q'), text: `sweep fixture ${id}`, background: '', goalType: 'explanatory',
    scope: { domain: 'reliability', phenomena: ['zombie sweep'] }, constraints: {}, createdAt: updatedAt,
  });
  const run = store.createRun(q, {}, updatedAt);
  if (status !== 'created') {
    db.prepare('UPDATE runs SET status=?, updated_at=? WHERE id=?').run(status, updatedAt, run.id);
  }
  return run.id;
};

const sweep = (args: string[]): string =>
  execFileSync(process.execPath, [SCRIPT, ...args], {
    env: { ...process.env, FARLAB_DATA_DIR: tmp },
    encoding: 'utf8',
  });

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-sweep-'));
  db = openDb(path.join(tmp, 'far.db'));
  store = new Store(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('sweep-zombie-runs (FA-PRF-05)', () => {
  it('dry-run (default) reports the stale running run but changes nothing', () => {
    const stale = mkRun('stale', 'running', new Date(Date.now() - 90 * 60_000).toISOString());
    const out = sweep(['--stale-minutes', '30']);
    expect(out).toContain(stale);
    expect(out).toContain('dry-run');
    expect(db.prepare('SELECT status FROM runs WHERE id=?').get(stale)?.status).toBe('running');
  });

  it('--execute marks stale running runs partial with a run_status_changed audit event', () => {
    const stale = mkRun('stale', 'running', new Date(Date.now() - 90 * 60_000).toISOString());
    const fresh = mkRun('fresh', 'running', new Date().toISOString());
    const done = mkRun('done', 'completed', new Date(Date.now() - 90 * 60_000).toISOString());
    const out = sweep(['--stale-minutes', '30', '--execute']);
    expect(out).toContain('(APPLIED)');

    expect(db.prepare('SELECT status FROM runs WHERE id=?').get(stale)?.status).toBe('partial');
    expect(db.prepare('SELECT status FROM runs WHERE id=?').get(fresh)?.status).toBe('running'); // live worker protected
    expect(db.prepare('SELECT status FROM runs WHERE id=?').get(done)?.status).toBe('completed'); // not running — not sweepable

    const events = db.prepare("SELECT type FROM events WHERE run_id=? ORDER BY at DESC").all(stale) as Array<{ type: string }>;
    expect(events.some((e) => e.type === 'run_status_changed')).toBe(true);
  });

  it('no zombies -> clean exit, no changes', () => {
    const out = sweep(['--stale-minutes', '30']);
    expect(out).toContain('no zombie runs');
  });
});
