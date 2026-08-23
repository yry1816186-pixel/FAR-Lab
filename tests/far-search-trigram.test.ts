import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { ResearchQuestion, newId } from '../src/domain/index.js';

// RU-10 GO3 — corpus-side trigram dual-index. Offline/deterministic.

const mkStore = (): Store => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-tri-'));
  return new Store(openDb(path.join(dir, 'far.db')));
};

const mkQuestion = (text: string): ResearchQuestion =>
  ResearchQuestion.parse({ id: newId('q'), text, goalType: 'explanatory', createdAt: '2026-08-24T00:00:00.000Z', scope: { domain: 'd', phenomena: ['p'] }, constraints: {} });

describe('far_search trigram dual-index', () => {
  it('a CJK question is findable by a CJK phrase substring (trigram path)', () => {
    const store = mkStore();
    store.createRun(mkQuestion('维生素D补充对抑郁评分影响的随机对照试验研究'));
    const hits = store.searchText('维生素D补充', { questions: 5, hypotheses: 0, claims: 0 });
    expect(hits.questions.length).toBe(1);
    store['db'].close();
  });

  it('a >=3-char latin substring query hits via trigram (unicode61 tokenization cannot do substrings)', () => {
    const store = mkStore();
    store.createRun(mkQuestion('The prognostic nutritional index after resection'));
    // 'rognostic' is a mid-word substring — unicode61 word tokens can't match it
    const hits = store.searchText('rognostic', { questions: 5, hypotheses: 0, claims: 0 });
    expect(hits.questions.length).toBe(1);
    store['db'].close();
  });

  it('latin word search and short-query LIKE fallback behavior unchanged', () => {
    const store = mkStore();
    store.createRun(mkQuestion('Insulin sensitivity in elderly patients'));
    expect(store.searchText('insulin', { questions: 5, hypotheses: 0, claims: 0 }).questions.length).toBe(1);
    store['db'].close();
  });

  it('deleteRunCascade cleans BOTH index tables for run-owned kinds (no ghost rows)', () => {
    const store = mkStore();
    const q = mkQuestion('维生素D与抑郁症的补充剂试验');
    const run = store.createRun(q);
    // A run-owned mirrored kind (questions live under __none__ by design and are
    // wiped wholesale by the next reindexFts — pre-existing behavior, not ours).
    store.putObject('hypothesis', {
      id: newId('hyp'), runId: run.id, version: 0, status: 'active',
      statement: '维生素D改善抑郁评分的假设陈述', mechanism: 'm', premises: ['p'],
      predictions: ['抑郁评分下降'],
      derivation: { strategy: 'evidence_conditioned', rationale: 'r', inputClaimIds: [] },
      createdAt: '2026-08-24T00:00:00.000Z', updatedAt: '2026-08-24T00:00:00.000Z',
    } as never);
    // far_search materializes on FIRST SEARCH (lazy ensureFts) — trigger it so
    // the mirrors exist before asserting cascade cleanliness.
    expect(store.searchText('抑郁', { questions: 5, hypotheses: 5, claims: 0 }).hypotheses.length).toBe(1);
    expect(store['db'].prepare("SELECT COUNT(*) AS n FROM far_search_tri WHERE kind='hypothesis'").get()?.n).toBe(1);
    expect(store['db'].prepare("SELECT COUNT(*) AS n FROM far_search WHERE kind='hypothesis'").get()?.n).toBe(1);
    store.deleteRunCascade(run.id);
    expect(store['db'].prepare("SELECT COUNT(*) AS n FROM far_search_tri WHERE kind='hypothesis'").get()?.n).toBe(0);
    expect(store['db'].prepare("SELECT COUNT(*) AS n FROM far_search WHERE kind='hypothesis'").get()?.n).toBe(0);
    store['db'].close();
  });
});
