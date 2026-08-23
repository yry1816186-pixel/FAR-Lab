import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';

// RU-10 GO4 — persistent researcher library (corpus_items). Offline/deterministic.

const mkStore = (): Store => new Store(openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'far-ci-')), 'far.db')));

describe('corpus_items persistent library', () => {
  it('putCorpusItem is idempotent by content key — re-seeding across runs never duplicates', () => {
    const store = mkStore();
    const item = {
      title: 'Vitamin D and depression: a randomized trial',
      identifiers: [{ kind: 'doi', value: '10.1/lib.1' }],
      text: 'abstract text',
      year: 2024,
      authors: ['A. Researcher'],
      firstSeenRun: 'run_first000000000000000000000a',
    };
    expect(store.putCorpusItem(item)).toBe(true);   // new row lands
    expect(store.putCorpusItem({ ...item, firstSeenRun: 'run_second0000000000000000000a' })).toBe(false); // same content -> ignored, provenance kept
    const all = store.listCorpusItems();
    expect(all).toHaveLength(1);
    expect(all[0]!.firstSeenRun).toBe('run_first000000000000000000000a');
    expect(all[0]!.family).toBe('user_provided');
    expect(all[0]!.identifiers).toEqual([{ kind: 'doi', value: '10.1/lib.1' }]);
  });

  it('different papers coexist; list is bounded; CJK titles persist losslessly', () => {
    const store = mkStore();
    store.putCorpusItem({ title: '血清白蛋白与术后并发症', identifiers: [{ kind: 'doi', value: '10.1/zh.9' }], firstSeenRun: 'r1' });
    store.putCorpusItem({ title: 'Insulin sensitivity', identifiers: [{ kind: 'doi', value: '10.1/en.2' }], firstSeenRun: 'r1' });
    const all = store.listCorpusItems();
    expect(all).toHaveLength(2);
    expect(all.some((i) => i.title === '血清白蛋白与术后并发症')).toBe(true);
    expect(store.listCorpusItems({ limit: 1 })).toHaveLength(1);
  });

  it('the retrieve-stage persistence hook lands surviving seeds (integration shape)', async () => {
    // Direct-store equivalence of what retrieve.ts now does per surviving seed:
    // the hook call is identical; verify the store side end-to-end.
    const store = mkStore();
    store.putCorpusItem({
      title: 'Seed-only evidence paper',
      identifiers: [{ kind: 'other', value: 'user-seed:1:Seed-only evidence paper' }],
      firstSeenRun: 'run_seedonly000000000000000000a',
    });
    expect(store.listCorpusItems()[0]!.identifiers[0]!.kind).toBe('other'); // honest synthetic marker persists
  });
});
