import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { ResearchQuestion, EvidenceRelation, Revision } from '../src/domain/index.js';
import { newId } from '../src/domain/ids.js';

// RU-2 lineage storage (migration v5): authoritative lineage_edges + deterministic
// event_tags + the queryEvents tag plane. All offline/deterministic.

const mkDb = (): { dir: string; store: Store } => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-lineage-'));
  const db = openDb(path.join(dir, 'far.db'));
  return { dir, store: new Store(db) };
};

const mkQuestion = (): ResearchQuestion =>
  ResearchQuestion.parse({ id: newId('q'), text: 'does X cause Y?', goalType: 'explanatory', createdAt: '2026-08-24T00:00:00.000Z', scope: { domain: 'd', phenomena: ['p'] }, constraints: {} });

describe('lineage_edges (RU-2 G3)', () => {
  it('records and queries edges; PK dedupe makes double-writes idempotent', () => {
    const { store } = mkDb();
    store.recordLineageEdge({ fromId: 'run_a', toId: 'run_b', kind: 'forked_from', runId: 'run_b', at: '2026-08-24T00:00:00Z' });
    store.recordLineageEdge({ fromId: 'run_a', toId: 'run_b', kind: 'forked_from', runId: 'run_b', at: '2026-08-24T00:00:00Z' });
    expect(store.listLineageEdges({ toId: 'run_b' })).toHaveLength(1);
    expect(store.listLineageEdges({ fromId: 'run_a', kind: 'forked_from' })[0]!.toId).toBe('run_b');
    expect(store.listLineageEdges({ kind: 'revised_into' })).toHaveLength(0);
  });

  it('rejects malformed edge payloads at the zod boundary (fail-closed)', () => {
    const { store } = mkDb();
    expect(() => store.recordLineageEdge({ fromId: '', toId: 'x', kind: 'revises', runId: 'r' })).toThrow();
    expect(() => store.recordLineageEdge({ fromId: 'a', toId: 'b', kind: 'nonsense' as never, runId: 'r' })).toThrow();
  });

  it('backfills edges from existing evidence_relation and revision payloads on first open', () => {
    const { dir, store } = mkDb();
    const q = mkQuestion();
    const run = store.createRun(q);
    const rel = EvidenceRelation.parse({
      id: newId('ev'), runId: run.id, sourceClaimId: newId('clm'), relation: 'contradicts',
      targetHypothesisId: newId('hyp'), rationale: 'same measure, opposite sign',
      createdAt: '2026-08-24T00:00:00.000Z', confidence: 'moderate',
    });
    store.putObject('evidence_relation', rel);
    const rev = Revision.parse({
      id: newId('rev'), runId: run.id, triggerFeedbackId: newId('fbk'),
      causalReason: 'counter-evidence contradicts the primary comparison',
      fromVersionLabel: 'v0', toVersionLabel: 'v1',
      operations: [{ objectType: 'hypothesis', objectId: rel.targetHypothesisId!, operation: 'weaken', reason: 'counter-evidence' }],
      qualityDelta: { status: 'worse', claim: 'primary comparison no longer clean', evidenceRefs: [rel.id] },
      createdAt: '2026-08-24T00:01:00.000Z',
    });
    store.putObject('revision', rev);

    // Simulate a pre-v5 database: wipe the derived tables, reopen, backfill must restore.
    (store as unknown as { db: { exec: (s: string) => void; raw?: unknown } }).db.exec('DELETE FROM lineage_edges');
    const db2 = openDb(path.join(dir, 'far.db'));
    const store2 = new Store(db2);
    const counter = store2.listLineageEdges({ kind: 'counter_evidence' });
    expect(counter).toHaveLength(1);
    expect(counter[0]!.fromId).toBe(rel.id);
    expect(counter[0]!.toId).toBe(rel.targetHypothesisId);
    expect(store2.listLineageEdges({ kind: 'caused_revision' })[0]!.toId).toBe(rev.id);
    expect(store2.listLineageEdges({ kind: 'revises' })[0]!.toId).toBe(rel.targetHypothesisId);
    db2.close();
  });
});

describe('event_tags + queryEvents (RU-2 G6)', () => {
  it('fills tags atomically at append; queryEvents filters by tag with run scoping and keyset pagination', () => {
    const { store } = mkDb();
    const q = mkQuestion();
    const run = store.createRun(q);
    store.appendEvent(run.id, { type: 'stage_started', stage: 'retrieve' });
    store.appendEvent(run.id, { type: 'stage_failed', stage: 'retrieve', detail: { error: 'boom' } });
    store.appendEvent(run.id, { type: 'stage_started', stage: 'plan' });

    const started = store.queryEvents({ tags: ['kind:stage_started'], runId: run.id });
    expect(started).toHaveLength(2);
    // ANY-of semantics (documented): stage:retrieve matches both retrieve events.
    const retrieveAll = store.queryEvents({ tags: ['stage:retrieve'], runId: run.id });
    expect(retrieveAll).toHaveLength(2);
    const retrieveFail = store.queryEvents({ tags: ['kind:stage_failed'], runId: run.id });
    expect(retrieveFail).toHaveLength(1);
    expect(retrieveFail[0]!.seq).toBeGreaterThan(started[0]!.seq);

    // keyset: everything after the first event
    const after = store.queryEvents({ tags: ['kind:stage_started'], runId: run.id, afterSeq: started[0]!.seq });
    expect(after).toHaveLength(1);
    expect(after[0]!.stage).toBe('plan');

    // limit clamp
    expect(store.queryEvents({ tags: ['kind:stage_started'], limit: 1 })).toHaveLength(1);
    // malformed tag fail-closed
    expect(() => store.queryEvents({ tags: ['stage!bad'] })).toThrow(/malformed/);
    expect(() => store.queryEvents({ tags: [] })).toThrow(/at least one tag/);
  });

  it('backfills event_tags for pre-v5 events on reopen', () => {
    const { dir, store } = mkDb();
    const run = store.createRun(mkQuestion());
    store.appendEvent(run.id, { type: 'receipt_recorded', stage: 'rank', detail: { purpose: 'judge' } });
    (store as unknown as { db: { exec: (s: string) => void } }).db.exec('DELETE FROM event_tags');
    const db2 = openDb(path.join(dir, 'far.db'));
    const store2 = new Store(db2);
    const hits = store2.queryEvents({ tags: ['stage:rank'], runId: run.id });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.type).toBe('receipt_recorded');
    db2.close();
  });
});

describe('live lineage writer (re-audit fix)', () => {
  it('putObject records evidence/revision edges IMMEDIATELY — no backfill needed', () => {
    const { store } = mkDb();
    const q = ResearchQuestion.parse({ id: newId('q'), text: 'live writer?', goalType: 'explanatory', createdAt: '2026-08-24T00:00:00.000Z', scope: { domain: 'd', phenomena: ['p'] }, constraints: {} });
    const run = store.createRun(q);
    store.putObject('evidence_relation', {
      id: newId('ev'), runId: run.id, claimId: newId('clm'), relation: 'contradicts',
      targetHypothesisId: newId('hyp'), rationale: 'live', strength: 'moderate',
      createdAt: '2026-08-24T00:00:00.000Z', uncertainties: [],
    } as never);
    const edges = store.listLineageEdges({ kind: 'counter_evidence' });
    expect(edges).toHaveLength(1); // written at putObject time, same store instance
    expect(edges[0]!.runId).toBe(run.id);
  });
});
