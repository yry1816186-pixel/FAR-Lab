import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { MemoryItemSchema, newMemoryId } from '../src/domain/memory.js';
import { ResearchQuestion, newId } from '../src/domain/index.js';
import { editMemory, archiveMemory, MemoryOpError } from '../src/server/memory-ops.js';
import { createApp } from '../src/app/composition.js';
import type { App } from '../src/app/composition.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';

// FA-HAR-06 memory management ops: append-only edit (supersession) + terminal
// archive, every real mutation audited, idempotent no-ops mutate nothing.
// All offline — the stub provider is never called by these paths.

const mkItem = (over: Partial<Parameters<typeof MemoryItemSchema.parse>[0]> = {}) =>
  MemoryItemSchema.parse({
    id: newMemoryId(), kind: 'semantic', entityType: 'finding',
    title: 'vitamin D and depression', body: 'meta-analysis finds no significant effect',
    status: 'active', trustClass: 'external_literature', taint: 'untrusted_literal',
    provenance: { sourceRef: 'doi:10.1234/example' },
    createdAt: '2026-08-24T00:00:00.000Z', lastAccessedAt: '2026-08-24T00:00:00.000Z', accessCount: 0,
    ...over,
  });

const mkApp = async (): Promise<{ app: App; dir: string }> => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-memops-'));
  const app = await createApp({ dataDir: dir, providerOverride: createTestStubProvider([]) });
  return { app, dir };
};

describe('archiveMemory (store + op)', () => {
  it('marks an active item archived with a spine edge, closes the activation surface', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-memops-'));
    const store = new Store(openDb(path.join(dir, 'far.db')));
    const item = mkItem();
    store.putMemory(item);
    store.archiveMemory(item.id, 'archived_human');
    expect(store.getMemory(item.id)?.status).toBe('archived');
    const edges = store.listMemoryEdges({ fromId: item.id });
    expect(edges.some((e) => e.relationType === 'archived_human' && e.toId === item.id)).toBe(true);
    // retrieval surface closes: archived rows never surface in search
    expect(store.searchMemory({ query: 'vitamin' })).toHaveLength(0);
  });

  it('rejects terminal lifecycle transitions (archived has no exits)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-memops-'));
    const store = new Store(openDb(path.join(dir, 'far.db')));
    const item = mkItem();
    store.putMemory(item);
    store.archiveMemory(item.id, 'archived_human');
    expect(() => store.archiveMemory(item.id, 'archived_human')).toThrow(/lifecycle forbids archived/);
  });

  it('op: archive requires reason, idempotent second archive is a no-op', async () => {
    const { app } = await mkApp();
    const item = mkItem();
    app.store.putMemory(item);
    expect(() => archiveMemory(app, item.id, {})).toThrow(MemoryOpError);
    const r1 = archiveMemory(app, item.id, { reason: 'stale literature' });
    expect(r1.status).toBe('archived');
    // workspace-global item: no run event possible — the reason edge is the audit
    expect(r1.eventId).toBeNull();
    expect(app.store.listMemoryEdges({ fromId: item.id }).some((e) => e.relationType.startsWith('archived_human:'))).toBe(true);
    const r2 = archiveMemory(app, item.id, { reason: 'stale literature' });
    expect(r2.eventId).toBeNull(); // idempotent: nothing mutated or audited
    // spine shows exactly one human archive act
    expect(app.store.listMemoryEdges({ fromId: item.id }).filter((e) => e.relationType.startsWith('archived_human:'))).toHaveLength(1);
  });
});

describe('editMemory (supersession)', () => {
  it('supersedes with untrusted taint, re-derived trust, and preserved provenance', async () => {
    const { app } = await mkApp();
    const item = mkItem();
    app.store.putMemory(item);
    const r = editMemory(app, item.id, { body: 'corrected: strong null effect across 3 cohorts', reason: 'typo fix' });
    expect(r.newId).toBeDefined();
    expect(app.store.getMemory(item.id)?.status).toBe('superseded');
    const next = app.store.getMemory(r.newId!);
    expect(next?.status).toBe('active');
    expect(next?.taint).toBe('untrusted_literal');
    expect(next?.trustClass).toBe('external_literature'); // re-derived from taint+sourceRef, never copied
    expect(next?.provenance.sourceRef).toBe('doi:10.1234/example');
    expect(next?.supersedesId).toBe(item.id);
    const edges = app.store.listMemoryEdges({ fromId: item.id });
    expect(edges.some((e) => e.relationType === 'supersedes' && e.toId === r.newId)).toBe(true);
  });

  it('a human edit cannot mint own_* trust (own_verified original -> external_* replacement)', async () => {
    const { app } = await mkApp();
    // an own_unverified item (own_verified without resolvable receipt fences on write)
    const item = mkItem({ trustClass: 'own_unverified', taint: 'trusted', provenance: {} });
    app.store.putMemory(item);
    const r = editMemory(app, item.id, { body: 'hand-corrected', reason: 'fix' });
    expect(app.store.getMemory(r.newId!)?.trustClass).toBe('external_untrusted');
  });

  it('idempotent no-op (no changed fields) mutates nothing and events nothing', async () => {
    const { app } = await mkApp();
    const item = mkItem();
    app.store.putMemory(item);
    const r = editMemory(app, item.id, { reason: 'no actual change' });
    expect(r.eventId).toBeNull();
    expect(r.newId).toBeUndefined();
    expect(app.store.getMemory(item.id)?.status).toBe('active');
  });

  it('rejects editing superseded/archived items (lifecycle 409) and unknown ids (404)', async () => {
    const { app } = await mkApp();
    const item = mkItem();
    app.store.putMemory(item);
    const first = editMemory(app, item.id, { body: 'v2', reason: 'first' });
    try {
      editMemory(app, item.id, { body: 'v3', reason: 'second' });
      expect.unreachable('second edit of a superseded item must throw');
    } catch (e) {
      expect((e as MemoryOpError).code).toBe('lifecycle');
      expect((e as MemoryOpError).status).toBe(409);
    }
    expect(first.newId).toBeDefined();
    try { editMemory(app, 'mem_doesnotexist', { body: 'x', reason: 'r' }); } catch (e) {
      expect((e as MemoryOpError).code).toBe('not_found');
    }
  });

  it('run-scoped items append the *_human note event to their provenance run', async () => {
    const { app } = await mkApp();
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'does X cause Y?', goalType: 'explanatory', createdAt: new Date().toISOString(),
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {},
    });
    const run = app.store.createRun(q);
    const item = mkItem({ provenance: { runId: run.id }, trustClass: 'own_unverified', taint: 'trusted' });
    app.store.putMemory(item);
    editMemory(app, item.id, { body: 'revised', reason: 'clarify' });
    const notes = app.store.listEvents(run.id)
      .map((e) => (e.detail as { reason?: string })?.reason)
      .filter((r): r is string => r !== undefined);
    expect(notes).toContain('memory_edited_human');
  });

  it('workspace-scoped items audit via a reason-bearing spine edge (no run event possible)', async () => {
    const { app } = await mkApp();
    const item = mkItem(); // no runId — workspace-global: the events table only
    // accepts branded run ids, so the durable audit is the memory_edges row.
    app.store.putMemory(item);
    const r = archiveMemory(app, item.id, { reason: 'stale literature' });
    expect(r.eventId).toBeNull();
    const edges = app.store.listMemoryEdges({ fromId: item.id });
    const audit = edges.find((e) => e.relationType.startsWith('archived_human:'));
    expect(audit).toBeDefined();
    expect(audit!.relationType).toContain('stale literature');
    expect(audit!.toId).toBe(item.id); // self-edge: the item's own audit spine
  });
});
