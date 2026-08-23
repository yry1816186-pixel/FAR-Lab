import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { ResearchQuestion, newId, STAGE_ORDER } from '../src/domain/index.js';
import type { RunStageName } from '../src/domain/run.js';
import {
  queryRunEvents,
  previewFor,
} from '../src/agent/research-query.js';

/**
 * Research query plane (AVO fusion G5/G6): NOOA's EventsApi gives the agent a
 * QUERY interface over the append-only history (type/tag/text/call_id with
 * compact summaries) instead of replaying everything into context. The TS
 * equivalent: queryRunEvents over the indexed tag spine, plus previewFor —
 * the pass-by-reference contract (bounded preview + ref, full payload only
 * on explicit expansion).
 */

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'far-rq-'));

const openStore = (): { store: Store; runId: string } => {
  const db = openDb(path.join(tmp(), 'far.db'));
  const store = new Store(db);
  const q = ResearchQuestion.parse({
    id: newId('q'), text: 'question', background: '', goalType: 'explanatory',
    scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
  });
  const run = store.createRun(q);
  return { store, runId: run.id };
};

describe('queryRunEvents — NOOA EventsApi-style queries over the event spine', () => {
  it('filters by kind and returns bounded results with tags', () => {
    const { store, runId } = openStore();
    for (const stage of ['retrieve', 'build_evidence', 'generate_hypotheses'] as RunStageName[]) {
      store.appendEvent(runId, { type: 'stage_started', stage });
    }
    store.appendEvent(runId, { type: 'note', detail: { text: 'pivot marker' } });
    const out = queryRunEvents(store, { runId, kinds: ['stage_started'], limit: 10 });
    expect(out.events).toHaveLength(3);
    expect(out.events.every((e) => e.type === 'stage_started')).toBe(true);
    expect(out.truncated).toBe(false);
  });

  it('enforces the limit honestly with a truncated flag', () => {
    const { store, runId } = openStore();
    for (let i = 0; i < 5; i++) store.appendEvent(runId, { type: 'note', detail: { text: `n${i}` } });
    const out = queryRunEvents(store, { runId, kinds: ['note'], limit: 2 });
    expect(out.events).toHaveLength(2);
    expect(out.truncated).toBe(true);
  });

  it('rejects empty kind lists (fail-closed, mirrors queryEvents)', () => {
    const { store, runId } = openStore();
    expect(() => queryRunEvents(store, { runId, kinds: [], limit: 5 })).toThrow(/kind/);
  });

  it('never returns events outside the requested run', () => {
    const { store, runId } = openStore();
    // a second run's events must not leak
    const q2 = ResearchQuestion.parse({
      id: newId('q'), text: 'other', background: '', goalType: 'explanatory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    const other = store.createRun(q2);
    const out = queryRunEvents(store, { runId: other.id, kinds: ['run_created', 'note', 'stage_started', 'stage_done', 'stage_failed', 'receipt_recorded', 'agent_tool_used'], limit: 50 });
    expect(out.events.every((e) => e.runId === other.id)).toBe(true);
    void runId;
  });
});

describe('previewFor — pass-by-reference contract (G5)', () => {
  it('returns a bounded preview plus a stable ref, never the full oversized payload', () => {
    const big = 'x'.repeat(10_000);
    const p = previewFor({ ref: 'sha256:abc123', kind: 'artifact', payload: big }, { maxChars: 200 });
    expect(p.ref).toBe('sha256:abc123');
    expect(p.chars).toBe(10_000);
    expect(p.preview.length).toBeLessThanOrEqual(200);
    expect(p.truncated).toBe(true);
    expect(p.payload).toBeUndefined(); // full body NOT inlined
  });

  it('inlines small payloads verbatim (no pointless truncation)', () => {
    const p = previewFor({ ref: 'sha256:def456', kind: 'artifact', payload: '{"mean": 3.0}' }, { maxChars: 200 });
    expect(p.truncated).toBe(false);
    expect(p.preview).toBe('{"mean": 3.0}');
    expect(p.chars).toBe(13);
  });

  it('handles non-string payloads via JSON serialization', () => {
    const p = previewFor({ ref: 'row:1', kind: 'table', payload: { rows: [1, 2, 3] } }, { maxChars: 500 });
    expect(p.truncated).toBe(false);
    expect(JSON.parse(p.preview)).toEqual({ rows: [1, 2, 3] });
  });
});

void STAGE_ORDER;
