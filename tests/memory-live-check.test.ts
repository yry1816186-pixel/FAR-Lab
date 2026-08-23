import { it, expect } from 'vitest';
import path from 'node:path';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { consolidateRun } from '../src/app/memory.js';

// LIVE-PATH verification (single-shot, real workspace far.db at .far-run/):
// migration v5+v6 apply to real history; lineage/event-tag backfills populate
// from real payloads; one real completed run consolidates into searchable memory.
// Runs only when FAR_MEMORY_LIVE=1 (explicit invocation; not part of CI).

const runLive = process.env.FAR_MEMORY_LIVE === '1';

(it.skipIf(!runLive) as typeof it)('real far.db: migrations, backfill, consolidation, retrieval', () => {
  const db = openDb(path.resolve('.far-run/far.db'));
  const store = new Store(db);
  const version = Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
  expect(version).toBeGreaterThanOrEqual(6);

  const tagCount = Number(db.prepare('SELECT COUNT(*) AS n FROM event_tags').get()?.n ?? 0);
  const edgeCount = Number(db.prepare('SELECT COUNT(*) AS n FROM lineage_edges').get()?.n ?? 0);
  const eventCount = Number(db.prepare('SELECT COUNT(*) AS n FROM events').get()?.n ?? 0);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ version, eventCount, tagCount, edgeCount }));

  expect(tagCount).toBeGreaterThanOrEqual(eventCount); // every event >= 1 tag
  expect(edgeCount).toBeGreaterThan(0); // real history has evidence relations/revisions

  // tag query on real data: every run has run_created
  const created = store.queryEvents({ tags: ['kind:run_created'], limit: 200 });
  expect(created.length).toBeGreaterThan(10);

  // consolidate ONE real completed run (exactly what the orchestrator now does)
  const runs = store.listRuns(50);
  const completed = runs.find((r) => r.status === 'completed');
  expect(completed).toBeDefined();
  const result = consolidateRun(store, completed!.id);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ consolidated: result }));

  const episodic = store.listMemory({ kind: 'episodic', runId: completed!.id });
  expect(episodic).toHaveLength(1);
  const q = store.getRun(completed!.id);
  const question = q !== null ? store.getObject('question', q.questionId) : null;
  const needle = (question?.text ?? '').split(/\s+/).slice(0, 3).join(' ');
  if (needle.length >= 3) {
    const hits = store.searchMemory({ query: needle, trustClasses: ['own_unverified', 'own_verified'] });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ needle, hits: hits.length }));
    expect(hits.map((h) => h.id)).toContain(episodic[0]!.id);
  }
  db.close();
});
