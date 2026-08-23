import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import type { App } from '../src/app/composition.js';
import { createApiServer } from '../src/server/api.js';
import type { ApiServer } from '../src/server/api.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { ConversationSchema } from '../src/domain/index.js';
import { newId } from '../src/domain/index.js';

/**
 * Settings-center surfaces: agent approval policy (fail-closed posture made
 * visible + per-conversation remembered kinds revocable) and server meta
 * (version/data dir). HTTP contract on a real store; no live route.
 */

let tmp: string;
let app: App;
let api: ApiServer;
let base: string;

const executor = (runId: string): Promise<unknown> => Promise.resolve(app.store.getRun(runId));

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-agent-policy-'));
  app = await createApp({ dataDir: tmp, providerOverride: createTestStubProvider([]) });
  api = createApiServer(app, { port: 0, executor, staticRoot: path.join(tmp, 'no-web-dist') });
  base = `http://127.0.0.1:${await api.start()}`;
});

afterAll(async () => {
  await api.stop();
  app.close();
});

type Json = Record<string, unknown>;

const request = async (method: string, urlPath: string, body?: unknown): Promise<{ status: number; body: Json | null }> => {
  const res = await fetch(`${base}${urlPath}`, {
    method,
    ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed: Json | null;
  try {
    parsed = text.length > 0 ? (JSON.parse(text) as Json) : null;
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed };
};

const mkConversation = (autoApprove: string[]): string => {
  const now = new Date().toISOString();
  const conv = ConversationSchema.parse({
    id: `conv_${newId('x').slice(2)}`,
    title: 'policy fixture conversation',
    status: 'open',
    messages: [],
    runIds: [],
    turns: 0,
    autoApprove,
    createdAt: now,
    updatedAt: now,
  });
  app.store.putObject('conversation', conv);
  return conv.id;
};

describe('GET /api/v1/agent-policy', () => {
  it('reports the fail-closed posture and only conversations with remembered kinds', async () => {
    const { status, body } = await request('GET', '/api/v1/agent-policy');
    expect(status).toBe(200);
    expect(body?.defaultPolicy).toBe('ask_per_conversation');
    expect(Array.isArray(body?.remembered)).toBe(true);

    const convId = mkConversation(['launch_research', 'create_automation']);
    const after = await request('GET', '/api/v1/agent-policy');
    const entry = (after.body?.remembered as Array<{ conversationId: string; kinds: string[] }>)
      .find((r) => r.conversationId === convId);
    expect(entry?.kinds).toEqual(['launch_research', 'create_automation']);
    expect(entry?.conversationTitle).toBe('policy fixture conversation');
  });
});

describe('DELETE /api/v1/agent-policy/remember/:conversationId', () => {
  it('revokes remembered kinds for that conversation only', async () => {
    const keep = mkConversation(['create_tool_integration']);
    const revoke = mkConversation(['launch_research']);
    const del = await request('DELETE', `/api/v1/agent-policy/remember/${revoke}`);
    expect(del.status).toBe(200);
    expect(del.body?.kinds).toEqual([]);

    const after = await request('GET', '/api/v1/agent-policy');
    const ids = (after.body?.remembered as Array<{ conversationId: string }>).map((r) => r.conversationId);
    expect(ids).toContain(keep);
    expect(ids).not.toContain(revoke);
  });

  it('404s for an unknown conversation', async () => {
    expect((await request('DELETE', '/api/v1/agent-policy/remember/conv_doesnotexist0000')).status).toBe(404);
  });
});

describe('GET /api/v1/meta', () => {
  it('returns a real version (never fabricated) and the data dir', async () => {
    const { status, body } = await request('GET', '/api/v1/meta');
    expect(status).toBe(200);
    expect(typeof body?.version).toBe('string');
    expect(body?.version).not.toBe('unknown'); // package.json sits two levels up from dist/server
    expect(String(body?.dataDir)).toContain(tmp.slice(0, -1).split(path.sep).pop()!);
  });
});
