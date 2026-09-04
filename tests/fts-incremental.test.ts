import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { ResearchQuestion, newId } from '../src/domain/index.js';

// FA-DAT-04: incremental FTS mirror upsert — a put must rewrite ONLY its own
// mirror row, never reindex the whole kind. Questions become searchable through
// createRun (their search leg joins the run row — pre-existing semantics);
// updates then go through putObject like every production rewrite.

const mkStore = (): Store => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-fts-inc-'));
  return new Store(openDb(path.join(dir, 'far.db')));
};

const mkQuestion = (text: string): ResearchQuestion =>
  ResearchQuestion.parse({ id: newId('q'), text, goalType: 'exploratory', createdAt: '2026-09-04T00:00:00.000Z', scope: { domain: 'd', phenomena: ['p'] }, constraints: {} });

const rowCount = (store: Store, table: string): number =>
  Number((store['db'].prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE kind='question'`).get() as { n: number }).n);

describe('FTS incremental upsert (FA-DAT-04)', () => {
  it('an update rewrites only its own row: new text searchable, old text gone, no duplicates', () => {
    const store = mkStore();
    const q = mkQuestion('维生素D补充对抑郁评分影响的研究');
    store.createRun(q);
    expect(store.searchText('维生素D补充', { questions: 5, hypotheses: 0, claims: 0 }).questions.length).toBe(1); // materialize mirrors
    expect(rowCount(store, 'far_search')).toBe(1);
    expect(rowCount(store, 'far_search_tri')).toBe(1);

    store.putObject('question', { ...q, text: '二甲双胍对胰岛素敏感性影响的研究' });
    expect(store.searchText('二甲双胍', { questions: 5, hypotheses: 0, claims: 0 }).questions.length).toBe(1);
    expect(store.searchText('维生素D', { questions: 5, hypotheses: 0, claims: 0 }).questions.length).toBe(0);
    expect(rowCount(store, 'far_search')).toBe(1);
    expect(rowCount(store, 'far_search_tri')).toBe(1);
    store['db'].close();
  });

  it('mirror rows stay 1:1 with objects across bulk puts and updates (no drift, no leaks)', () => {
    const store = mkStore();
    const questions = Array.from({ length: 300 }, (_, i) => mkQuestion(`bulk question ${i} about mechanism alpha`));
    for (const q of questions) store.createRun(q);
    store.searchText('mechanism', { questions: 5, hypotheses: 0, claims: 0 }); // materialize
    expect(rowCount(store, 'far_search')).toBe(300);
    for (let i = 0; i < 50; i++) store.putObject('question', { ...questions[i]!, text: `bulk question ${i} rewritten beta` });
    expect(rowCount(store, 'far_search')).toBe(300);
    expect(rowCount(store, 'far_search_tri')).toBe(300);
    expect(store.searchText('rewritten', { questions: 300, hypotheses: 0, claims: 0 }).questions.length).toBe(50);
    store['db'].close();
  });

  it('a single put stays O(1): 2000-object mirror, one update touches only its own rows', () => {
    const store = mkStore();
    const questions = Array.from({ length: 2000 }, (_, i) => mkQuestion(`amplification corpus sentence ${i} with shared tokens`));
    for (const q of questions) store.createRun(q);
    store.searchText('corpus', { questions: 5, hypotheses: 0, claims: 0 }); // materialize mirrors (full build)
    expect(rowCount(store, 'far_search')).toBe(2000);

    const warm = mkQuestion('warmup write');
    store.createRun(warm);
    store.putObject('question', { ...warm, text: 'warmup write two' }); // warm the statements

    // Deterministic O(1) evidence: the COUNT of changed rows during one put.
    // (The previous wall-clock budget flaked on stalled shared CI runners —
    // timing measures the machine, total_changes measures the algorithm.)
    // Old behavior rewrote all 2000 rows per table (~4000 FTS inserts + 2 bulk
    // deletes); the O(1) path touches only this object's own rows.
    const changesOf = (): number => Number((store['db'].prepare('SELECT total_changes() AS n').get() as { n: number }).n);
    const before = changesOf();
    store.putObject('question', { ...questions[1000]!, text: 'the single measured update' });
    const changedRows = changesOf() - before;
    expect(changedRows).toBeLessThan(50);
    expect(store.searchText('measured update', { questions: 5, hypotheses: 0, claims: 0 }).questions.length).toBe(1);
    expect(rowCount(store, 'far_search')).toBe(2001);
    store['db'].close();
  });
});
