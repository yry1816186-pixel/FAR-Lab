import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import type { App } from '../src/app/composition.js';
import { createApiServer } from '../src/server/api.js';
import type { ApiServer } from '../src/server/api.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { MemoryItemSchema, newMemoryId } from '../src/domain/memory.js';

// *** TEST-ONLY *** FA-HAR-06 memory-management HTTP surface over the real
// kernel (real Store/SQLite in a throwaway dir; empty stub provider so no live
// model call can happen — these routes never call a model).

let tmp: string;
let app: App;
let api: ApiServer;
let base: string;

const executor = (runId: string): Promise<unknown> => Promise.resolve(app.store.getRun(runId));

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-memapi-'));
  app = await createApp({ dataDir: tmp, providerOverride: createTestStubProvider([]) });
  api = createApiServer(app, { port: 0, executor, staticRoot: path.join(tmp, 'no-web-dist') });
  const port = await api.start();
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await api.stop();
  app.close();
});

const mkItem = (over: Partial<Parameters<typeof MemoryItemSchema.parse>[0]> = {}) =>
  MemoryItemSchema.parse({
    id: newMemoryId(), kind: 'semantic', entityType: 'finding',
    title: 'spacing effect in vocabulary learning', body: 'spaced repetition beats massed study',
    status: 'active', trustClass: 'external_literature', taint: 'untrusted_literal',
    provenance: { sourceRef: 'doi:10.1234/spacing' },
    createdAt: '2026-08-24T00:00:00.000Z', lastAccessedAt: '2026-08-24T00:00:00.000Z', accessCount: 0,
    ...over,
  });

type Json = Record<string, unknown>;

const request = async (method: string, urlPath: string, body?: unknown): Promise<{ status: number; body: Json | null; text: string; headers: Headers }> => {
  const res = await fetch(`${base}${urlPath}`, {
    method,
    ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed: Json | null;
  try { parsed = text.length > 0 ? (JSON.parse(text) as Json) : null; } catch { parsed = null; }
  return { status: res.status, body: parsed, text, headers: res.headers };
};

describe('GET /api/v1/memory', () => {
  it('lists items with trust labels and filters by kind/status', async () => {
    app.store.putMemory(mkItem());
    app.store.putMemory(mkItem({ id: newMemoryId(), kind: 'profile', title: 'prefers conservative stats', body: 'user prefers conservative statistics', trustClass: 'own_unverified', taint: 'trusted', provenance: {} }));
    const all = await request('GET', '/api/v1/memory');
    expect(all.status).toBe(200);
    const items = (all.body?.items as Json[]) ?? [];
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.every((i) => typeof i.trustClass === 'string')).toBe(true);
    // honest-enumeration contract: the payload states its cap and completeness
    // instead of dressing a capped subset up as the workspace total
    expect(all.body?.cap).toBe(500);
    expect(all.body?.complete).toBe(true);
    expect(all.body?.count).toBe(items.length);
    const semantic = await request('GET', '/api/v1/memory?kind=semantic');
    expect(((semantic.body?.items as Json[]) ?? []).every((i) => i.kind === 'semantic')).toBe(true);
    const bad = await request('GET', '/api/v1/memory?kind=nope');
    expect(bad.status).toBe(400);
    expect((bad.body?.error as Json)?.code).toBe('validation');
  });
});

describe('GET /api/v1/memory/:id', () => {
  it('serves detail; 404 unknown; 400 malformed', async () => {
    const item = mkItem();
    app.store.putMemory(item);
    const ok = await request('GET', `/api/v1/memory/${item.id}`);
    expect(ok.status).toBe(200);
    expect((ok.body?.item as Json)?.id).toBe(item.id);
    expect((await request('GET', '/api/v1/memory/mem_missing0000000000000')).status).toBe(404);
    expect((await request('GET', '/api/v1/memory/not-an-id')).status).toBe(400);
  });
});

describe('POST /api/v1/memory/:id/edit + /archive', () => {
  it('edit requires a reason and returns newId (supersession visible over the API)', async () => {
    const item = mkItem();
    app.store.putMemory(item);
    expect((await request('POST', `/api/v1/memory/${item.id}/edit`, { body: 'x' })).status).toBe(400);
    const r = await request('POST', `/api/v1/memory/${item.id}/edit`, { body: 'corrected body', reason: 'literature correction' });
    expect(r.status).toBe(200);
    expect(typeof r.body?.newId).toBe('string');
    const detail = await request('GET', `/api/v1/memory/${item.id}`);
    expect((detail.body?.item as Json)?.status).toBe('superseded');
  });

  it('archive requires a reason, is idempotent, and lands a lifecycle-coded 409 on edit-after-archive', async () => {
    const item = mkItem();
    app.store.putMemory(item);
    expect((await request('POST', `/api/v1/memory/${item.id}/archive`, {})).status).toBe(400);
    const r1 = await request('POST', `/api/v1/memory/${item.id}/archive`, { reason: 'stale' });
    expect(r1.status).toBe(200);
    // workspace-global item: the durable audit is the reason-bearing spine edge
    expect(r1.body?.status).toBe('archived');
    expect(app.store.listMemoryEdges({ fromId: item.id }).some((e) => e.relationType.startsWith('archived_human:'))).toBe(true);
    const r2 = await request('POST', `/api/v1/memory/${item.id}/archive`, { reason: 'stale' });
    expect(r2.body?.eventId).toBeNull();
    const edit = await request('POST', `/api/v1/memory/${item.id}/edit`, { body: 'zombie', reason: 'r' });
    expect(edit.status).toBe(409);
    expect((edit.body?.error as Json)?.code).toBe('lifecycle');
  });
});

describe('GET /api/v1/memory/export', () => {
  it('serves a parseable JSON attachment whose rows deep-match the store', async () => {
    const seeded = mkItem();
    app.store.putMemory(seeded);
    const res = await request('GET', '/api/v1/memory/export');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    const parsed = JSON.parse(res.text) as { count: number; cap: number; complete: boolean; items: Json[] };
    expect(parsed.count).toBe(parsed.items.length);
    expect(parsed.cap).toBe(500);
    const row = parsed.items.find((i) => i.id === seeded.id);
    expect(row).toBeDefined();
    const fromStore = app.store.getMemory(seeded.id);
    // trust fields cannot be laundered through export: byte-compare the truth fields
    expect(row?.trustClass).toBe(fromStore?.trustClass);
    expect(row?.taint).toBe(fromStore?.taint);
    expect(row?.body).toBe(fromStore?.body);
  });
});
