import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import { createApiServer, type ApiServer } from '../src/server/api.js';
import { createConversation, deleteConversation } from '../src/server/conversations.js';
import type { App } from '../src/app/composition.js';

/**
 * Unified-timeline search surface: conversations are mirrored into far_search
 * by title so the palette (Ctrl+K) and GET /search find them; deleting a
 * conversation drops its mirror row (no ghost hits). Offline, real store.
 */

let app: App;
let api: ApiServer;
let base: string;
let dataDir: string;

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-conv-search-'));
  app = await createApp({ dataDir });
  api = createApiServer(app, { port: 0, automations: { enabled: false } });
  base = `http://127.0.0.1:${await api.start()}`;
});

afterAll(async () => {
  await api.stop();
  app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('conversation search surface', () => {
  it('store.searchText finds conversations by title (with snippets), scoped off by default', () => {
    const conv = createConversation(app, { title: '抗生素耐药基因的水平转移机制讨论' });
    const r = app.store.searchText('耐药', { questions: 0, hypotheses: 0, claims: 0, conversations: 5 });
    expect(r.conversations).toHaveLength(1);
    expect(r.conversations?.[0]?.id).toBe(conv.id);
    expect(r.conversations?.[0]?.text).toContain('耐药');
    // Omitted limit -> segment absent (backwards-compatible contract).
    expect(app.store.searchText('耐药', { questions: 0, hypotheses: 0, claims: 0 }).conversations).toBeUndefined();
  });

  it('GET /api/v1/search returns the conversations segment', async () => {
    const res = await fetch(`${base}/api/v1/search?q=${encodeURIComponent('水平转移')}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { conversations?: { id: string }[] };
    expect(body.conversations?.length).toBeGreaterThanOrEqual(1);
  });

  it('deleting a conversation drops its search mirror row (no ghost hits)', () => {
    const conv = createConversation(app, { title: '石墨烯带隙调控的独特标题探针' });
    expect(app.store.searchText('石墨烯', { questions: 0, hypotheses: 0, claims: 0, conversations: 5 }).conversations).toHaveLength(1);
    deleteConversation(app, conv.id);
    expect(app.store.searchText('石墨烯', { questions: 0, hypotheses: 0, claims: 0, conversations: 5 }).conversations).toHaveLength(0);
  });
});
