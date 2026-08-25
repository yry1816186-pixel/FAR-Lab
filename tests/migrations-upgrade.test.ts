import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS, openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { EvidenceRelation, ResearchQuestion, ResearchRun, newId } from '../src/domain/index.js';

/**
 * Cross-version upgrade proof (R2-12): a db last written by schema-v5-era code
 * (pre event chain / event tags / memory / outbox / corpus_items) must open
 * under CURRENT code, migrate to the latest version, repair derivable history
 * (chain hashes, event tags, lineage edges), keep every authoritative row, and
 * accept new-era writes. Fresh-db migration coverage exists (waveg-wp2 v4
 * regression); this pins the UPGRADE path the goal contract requires.
 */

const LEGACY_VERSION = 5;

const buildLegacyDb = (dbPath: string): {
  runId: string; questionId: string; relationId: string; hypothesisId: string;
} => {
  const raw = new DatabaseSync(dbPath);
  for (const m of MIGRATIONS) {
    if (m.version > LEGACY_VERSION) break;
    raw.exec(m.sql);
    raw.exec(`PRAGMA user_version = ${m.version}`);
  }
  // Seed exactly the rows a v5-era workspace could contain. Timestamps are
  // arbitrary fixed ISO strings — zod validates format only, and the derived
  // repairs (chain/tags/edges) never compare against the real clock.
  const questionId = newId('q');
  const runId = newId('run');
  const hypothesisId = newId('hyp');
  const relationId = newId('ev');
  const question = ResearchQuestion.parse({
    id: questionId, text: 'legacy upgrade?', goalType: 'explanatory',
    createdAt: '2026-01-15T08:00:00.000Z', scope: { domain: 'd', phenomena: ['p'] }, constraints: {},
  });
  const relation = EvidenceRelation.parse({
    id: relationId, runId, relation: 'contradicts', targetHypothesisId: hypothesisId,
    rationale: 'legacy seeded counter-evidence', createdAt: '2026-01-15T08:05:00.000Z',
  });
  const run = ResearchRun.parse({
    id: runId, questionId, status: 'completed', currentStage: 'export',
    stages: [{ stage: 'export', state: 'done' }],
    createdAt: '2026-01-15T08:00:00.000Z', updatedAt: '2026-01-15T09:00:00.000Z', tags: [],
  });
  raw.prepare('INSERT INTO runs (id, question_id, status, current_stage, doc, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(run.id, run.questionId, run.status, run.currentStage, JSON.stringify(run), run.createdAt, run.updatedAt);
  for (let i = 0; i < 3; i += 1) {
    const payload = { runId, at: `2026-01-15T08:0${i}:00.000Z`, type: 'note', detail: { i } };
    raw.prepare('INSERT INTO events (run_id, at, type, payload) VALUES (?,?,?,?)')
      .run(runId, payload.at, 'note', JSON.stringify(payload));
  }
  raw.prepare('INSERT INTO objects (kind, id, run_id, json, created_at) VALUES (?,?,?,?,?)')
    .run('question', question.id, '__none__', JSON.stringify(question), question.createdAt);
  raw.prepare('INSERT INTO objects (kind, id, run_id, json, created_at) VALUES (?,?,?,?,?)')
    .run('evidence_relation', relation.id, runId, JSON.stringify(relation), relation.createdAt);
  raw.close();
  return { runId, questionId, relationId, hypothesisId };
};

describe('cross-version migration upgrade (v5 -> latest)', () => {
  it('upgrades a legacy db in place: latest user_version, repaired derivables, authoritative rows intact, new tables usable', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-upgrade-'));
    const dbPath = path.join(dir, 'far.db');
    const seed = buildLegacyDb(dbPath);

    const store = new Store(openDb(dbPath));
    const db = store['db'];

    // schema version moved to the latest migration
    const latest = MIGRATIONS[MIGRATIONS.length - 1]!.version;
    expect(Number(db.prepare('PRAGMA user_version').get()?.user_version)).toBe(latest);

    // derivable history repaired by the open: chain, tags, lineage edges
    const chain = store.verifyEventChain(seed.runId);
    expect(chain.ok).toBe(true);
    expect(chain.length).toBe(3);
    expect(store.queryEvents({ tags: ['kind:note'], runId: seed.runId })).toHaveLength(3);
    const edges = store.listLineageEdges({ fromId: seed.relationId });
    expect(edges).toHaveLength(1);
    expect(edges[0]!.kind).toBe('counter_evidence');
    expect(edges[0]!.toId).toBe(seed.hypothesisId);

    // authoritative rows intact and re-validatable (fail-closed reads still pass)
    expect(store.getRun(seed.runId)?.id).toBe(seed.runId);
    expect(store.getObject('question', seed.questionId)?.id).toBe(seed.questionId);
    expect(store.listEvents(seed.runId)).toHaveLength(3);

    // new-era surfaces exist on the upgraded db and accept writes
    expect(store.putCorpusItem({
      title: 'post-upgrade seed', identifiers: [{ kind: 'doi', value: '10.1/x' }],
      firstSeenRun: seed.runId,
    })).toBe(true);

    db.close();
  });

  it('re-opening the upgraded db is a no-op: migrations and backfills do not duplicate', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-upgrade-'));
    const dbPath = path.join(dir, 'far.db');
    const seed = buildLegacyDb(dbPath);

    const first = new Store(openDb(dbPath));
    first['db'].close();

    const second = new Store(openDb(dbPath));
    const db = second['db'];
    const latest = MIGRATIONS[MIGRATIONS.length - 1]!.version;
    expect(Number(db.prepare('PRAGMA user_version').get()?.user_version)).toBe(latest);
    // backfill count-guards hold: no re-tagging, no duplicate edges, chain still verifies
    expect(second.queryEvents({ tags: ['kind:note'], runId: seed.runId })).toHaveLength(3);
    expect(second.listLineageEdges({ fromId: seed.relationId })).toHaveLength(1);
    expect(second.verifyEventChain(seed.runId).ok).toBe(true);
    db.close();
  });
});
