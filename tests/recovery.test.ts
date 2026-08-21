import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb, MIGRATIONS } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { ResearchQuestion, newId } from '../src/domain/index.js';

/**
 * Recovery / corruption semantics (ACC-12): a corrupted checkpoint must fail visibly
 * with a diagnosable error — never silently continue, never fabricate state.
 */
describe('recovery: corrupted checkpoint behavior', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'far-recovery-'));

  it('corrupted run doc fails closed on read (no silent fake state)', () => {
    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'question', background: '', goalType: 'explanatory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    const run = store.createRun(q);
    db.prepare('UPDATE runs SET doc = ? WHERE id = ?').run('{"id": "run_broken_not_json', run.id);
    const store2 = new Store(openDb(path.join(dir, 'far.db')));
    expect(() => store2.getRun(run.id)).toThrow();
    db.close();
  });

  it('corrupted domain object row fails closed with run-scoped blast radius', () => {
    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'question', background: '', goalType: 'explanatory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    store.putObject('question', q);
    db.prepare("UPDATE objects SET json = '{\"id\": \"clm_x\", \"garbage\": true' WHERE kind='question'").run();
    // direct read of the corrupted row fails closed
    expect(() => store.getObject('question', q.id)).toThrow();
    // but the rest of the store (runs/events) remains queryable — blast radius is scoped
    const run = store.createRun(q);
    expect(store.getRun(run.id)?.status).toBe('created');
    db.close();
  });

  it('database integrity check surface exists for recovery tooling', () => {
    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    expect(db.integrityCheck()).toBe('ok');
    expect(MIGRATIONS.length).toBeGreaterThan(0);
    db.close();
  });
});
