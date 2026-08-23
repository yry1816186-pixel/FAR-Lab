import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { MemoryItemSchema, deriveTrustClass, memoryActivation, newMemoryId } from '../src/domain/memory.js';
import { consolidateRun, memoryNegativeConditioning } from '../src/app/memory.js';
import { ResearchQuestion, newId } from '../src/domain/index.js';

// RU-1 memory substrate: governance gates, poisoning co-design, deterministic
// consolidation, ACT-R-ranked retrieval, append-only supersession. All offline.

const mkStore = (): { dir: string; store: Store } => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-memory-'));
  return { dir, store: new Store(openDb(path.join(dir, 'far.db'))) };
};

const mkItem = (over: Partial<Parameters<typeof MemoryItemSchema.parse>[0]> = {}) =>
  MemoryItemSchema.parse({
    id: newMemoryId(), kind: 'semantic', entityType: 'finding',
    title: 'vitamin D and depression', body: 'meta-analysis finds no significant effect',
    status: 'active', trustClass: 'external_literature', taint: 'untrusted_literal',
    provenance: { sourceRef: 'doi:10.1234/example' },
    createdAt: '2026-08-24T00:00:00.000Z', lastAccessedAt: '2026-08-24T00:00:00.000Z', accessCount: 0,
    ...over,
  });

describe('RU-1 governance gates', () => {
  it('rejects a failed experiment_outcome without failureReason (zod + SQL CHECK both fire)', () => {
    const { store } = mkStore();
    expect(() => mkItem({ kind: 'experiment_outcome', outcome: 'failed' })).toThrow(/failureReason/);
    // SQL CHECK mirror: hand-rolled row bypassing zod still rejected
    expect(() => store['db'].prepare(
      `INSERT INTO memory_items (id,kind,entity_type,title,body,status,outcome,failure_reason,trust_class,taint,created_at,last_accessed_at,access_count)
       VALUES ('mem_x','experiment_outcome','experiment','t','b','active','failed',NULL,'own_unverified','trusted','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z',0)`,
    ).run()).toThrow(/CHECK/);
  });

  it('rejects external_literature without sourceRef', () => {
    expect(() => mkItem({ provenance: {} })).toThrow(/sourceRef/);
  });

  it('poisoning gate fences own_verified to resolvable provenance (run + receipt)', () => {
    const { store } = mkStore();
    const q = ResearchQuestion.parse({ id: newId('q'), text: 'q?', goalType: 'explanatory', createdAt: '2026-08-24T00:00:00.000Z', scope: { domain: 'd', phenomena: ['p'] }, constraints: {} });
    const run = store.createRun(q);
    // no such receipt -> fenced to own_unverified
    store.putMemory(mkItem({ trustClass: 'own_verified', taint: 'trusted', provenance: { runId: run.id, receiptId: 'rcp_missing0000000000000000000' } }));
    expect(store.getMemory(store.listMemory({ runId: run.id })[0]!.id)!.trustClass).toBe('own_unverified');
  });

  it('deterministic trust derivation: external content never becomes own_*', () => {
    expect(deriveTrustClass('untrusted_literal', { sourceRef: 'doi:x' })).toBe('external_literature');
    expect(deriveTrustClass('untrusted_literal', {})).toBe('external_untrusted');
    expect(deriveTrustClass('derived_untrusted', { runId: 'run_x', receiptId: 'r' })).toBe('external_untrusted');
    expect(deriveTrustClass('trusted', { runId: 'run_x', receiptId: 'r' })).toBe('own_verified');
    expect(deriveTrustClass('trusted', {})).toBe('own_unverified');
  });
});

describe('RU-1 deterministic consolidation', () => {
  it('projects a terminal run + experiments into idempotent memory items', () => {
    const { store } = mkStore();
    const q = ResearchQuestion.parse({ id: newId('q'), text: 'does X cause Y?', goalType: 'explanatory', createdAt: '2026-08-24T00:00:00.000Z', scope: { domain: 'd', phenomena: ['p'] }, constraints: {} });
    const run = store.createRun(q);
    store.putObject('experiment_run', {
      id: newId('xrun'), runId: run.id, specId: newId('xsp'), specHash: 'a'.repeat(64),
      status: 'failed', attempts: 1, executor: 'local',
      error: 'OpenML dataset 404', resultIds: [], statReportIds: [], createdAt: '2026-08-24T00:00:00.000Z',
    } as never);
    store.putObject('experiment_run', {
      id: newId('xrun'), runId: run.id, specId: newId('xsp'), specHash: 'b'.repeat(64),
      status: 'running', attempts: 0, executor: 'local',
      resultIds: [], statReportIds: [], createdAt: '2026-08-24T00:00:00.000Z',
    } as never);

    const r1 = consolidateRun(store, run.id);
    expect(r1.itemsWritten).toBe(2); // episodic run + failed experiment (running one skipped)
    expect(r1.skipped).toHaveLength(1);
    const failed = store.listMemory({ kind: 'experiment_outcome' })[0]!;
    expect(failed.outcome).toBe('failed');
    expect(failed.failureReason).toContain('OpenML dataset 404');

    // idempotent: second consolidation replaces, never duplicates
    const r2 = consolidateRun(store, run.id);
    expect(r2.itemsWritten).toBe(2);
    expect(store.listMemory({})).toHaveLength(2);
  });
});

describe('RU-1 FTS projection integrity', () => {
  it('putMemory re-write of the same id replaces (not duplicates) the FTS row', () => {
    const { store } = mkStore();
    const dupId = `mem_${createHash('sha256').update('test:dup').digest('hex').slice(0, 24)}`;
    store.putMemory(mkItem({ id: dupId, title: 'original body text', body: 'v1' }));
    store.putMemory(mkItem({ id: dupId, title: 'replacement body text', body: 'v2' }));
    // old text must no longer match; new text must
    expect(store.searchMemory({ query: 'original' })).toHaveLength(0);
    expect(store.searchMemory({ query: 'replacement' })).toHaveLength(1);
    const ftsCount = store.db.prepare('SELECT COUNT(*) AS n FROM memory_fts WHERE id=?').get(dupId) as { n: number };
    expect(ftsCount.n).toBe(1);
  });
});

describe('RU-1 retrieval + supersession', () => {
  it('memory consumer #1: negative conditioning retrieves own past outcomes for the question', () => {
    const { store } = mkStore();
    const q = ResearchQuestion.parse({ id: newId('q'), text: 'Does vitamin D supplementation improve depression scores?', goalType: 'explanatory', createdAt: '2026-08-24T00:00:00.000Z', scope: { domain: 'd', phenomena: ['p'] }, constraints: {} });
    const run = store.createRun(q);
    store.putObject('experiment_run', {
      id: newId('xrun'), runId: run.id, specId: newId('xsp'), specHash: 'a'.repeat(64),
      status: 'failed', attempts: 2, executor: 'local',
      error: 'dataset lacked the depression arm', resultIds: [], statReportIds: [], createdAt: '2026-08-24T00:00:00.000Z',
    } as never);
    consolidateRun(store, run.id);

    const conditioning = memoryNegativeConditioning(store, 'Does vitamin D supplementation improve depression?');
    expect(conditioning.length).toBeGreaterThanOrEqual(1);
    const failedItem = conditioning.find((m) => m.kind === 'experiment_outcome');
    expect(failedItem).toBeDefined();
    expect(failedItem!.trustClass).toBe('own_unverified'); // label travels
    // irrelevant question retrieves nothing (bounded, deterministic)
    expect(memoryNegativeConditioning(store, 'quantum computing qubit error correction')).toHaveLength(0);
  });
  it('ranks by ACT-R activation and updates access accounting', () => {
    const { store } = mkStore();
    const FRESH = 'mem_fresh0000000000000000000000';
    const STALE = 'mem_stale0000000000000000000000';
    const fresh = mkItem({ id: FRESH, title: 'CRISPR off-target rates', body: 'off-target measurement methods', lastAccessedAt: new Date().toISOString(), accessCount: 5 });
    const stale = mkItem({ id: STALE, title: 'CRISPR delivery vectors', body: 'off-target historical notes', lastAccessedAt: '2026-01-01T00:00:00.000Z', accessCount: 5 });
    store.putMemory(fresh);
    store.putMemory(stale);
    const hits = store.searchMemory({ query: 'off-target' });
    expect(hits).toHaveLength(2);
    expect(hits[0]!.id).toBe(FRESH); // fresher wins at equal counts
    expect(store.getMemory(FRESH)!.accessCount).toBe(6);
    // memoryActivation sanity: decays with age
    expect(memoryActivation({ accessCount: 5, lastAccessedAt: '2026-01-01T00:00:00.000Z' }, Date.parse('2026-08-24T00:00:00.000Z')))
      .toBeLessThan(memoryActivation({ accessCount: 5, lastAccessedAt: '2026-08-23T00:00:00.000Z' }, Date.parse('2026-08-24T00:00:00.000Z')));
  });

  it('supersession is append-only: old item marked, never deleted; edge recorded', () => {
    const { store } = mkStore();
    const OLD = 'mem_old00000000000000000000000';
    const NEXT = 'mem_new00000000000000000000000';
    const old = mkItem({ id: OLD });
    store.putMemory(old);
    const next = mkItem({ id: NEXT, title: 'corrected finding', body: 'correction with new evidence' });
    store.supersedeMemory(old.id, next);
    const oldAfter = store.getMemory(old.id)!;
    expect(oldAfter.status).toBe('superseded');
    expect(store.getMemory(next.id)!.supersedesId).toBe(old.id);
    // archived items cannot be superseded further (lifecycle terminal)
    expect(() => store.supersedeMemory(old.id, mkItem())).toThrow(/lifecycle/);
    // superseded items are excluded from default retrieval (retained for audit)
    const stillThere = store.searchMemory({ query: 'vitamin' });
    expect(stillThere.map((m) => m.id)).not.toContain(old.id);
  });
});
