import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import type { App } from '../src/app/composition.js';
import { createApiServer } from '../src/server/api.js';
import type { ApiServer } from '../src/server/api.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';

// *** TEST-ONLY *** tool-integration CRUD/test HTTP surface over the real kernel
// (real Store/SQLite in a throwaway temp dir, empty scripted provider so no live
// model call can happen; MCP connectivity goes through a REAL local stdio fixture
// child process — same pattern as tests/mcp-manager.test.ts).

let tmp: string;
let app: App;
let api: ApiServer;
let base: string;

const SERVER = `
const readline = require('node:readline');
const send = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try { msg = JSON.parse(trimmed); } catch { return; }
  if (msg.id === undefined || msg.id === null) return;
  if (msg.method === 'initialize') {
    send(msg.id, { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'fake', version: '0' } });
  } else if (msg.method === 'tools/list') {
    send(msg.id, { tools: [{ name: 'echo', description: 'echo' }] });
  } else if (msg.method === 'tools/call') {
    send(msg.id, { content: [{ type: 'text', text: 'ok' }], isError: false });
  }
});
`;
const scriptPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'far-mcp-api-')), 'fake-server.cjs');
fs.writeFileSync(scriptPath, SERVER);

const executor = (runId: string): Promise<unknown> => Promise.resolve(app.store.getRun(runId));

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-api-tools-'));
  app = await createApp({
    dataDir: tmp,
    providerOverride: createTestStubProvider([]), // no live route; empty script fails loudly if called
  });
  api = createApiServer(app, { port: 0, executor, staticRoot: path.join(tmp, 'no-web-dist') });
  const port = await api.start();
  base = `http://127.0.0.1:${port}`;
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

const integrationOf = (body: Json | null): Json => {
  if (body === null || typeof body !== 'object' || typeof (body as Json).integration !== 'object') {
    throw new Error('expected { integration } body');
  }
  return (body as { integration: Json }).integration;
};

describe('tool integrations API', () => {
  it('creates an mcp_server integration, masks secrets in every projection', async () => {
    const { status, body } = await request('POST', '/api/v1/tools', {
      kind: 'mcp_server', label: 'Fake MCP', transport: 'stdio',
      command: process.execPath, args: [scriptPath], env: { SECRET_TOKEN: 'tok-1234567890' },
    });
    expect(status).toBe(201);
    const integration = integrationOf(body);
    expect(integration.id).toMatch(/^tint_[0-9a-z]{20,32}$/);
    expect(integration.createdBy).toBe('researcher');
    expect(integration.riskClass).toBe('execute');
    const env = integration.env as Record<string, string>;
    expect(env.SECRET_TOKEN).toBe('••••7890');
    // plaintext never leaves the server
    expect(JSON.stringify(body)).not.toContain('tok-1234567890');
  });

  it('rejects semantic violations (stdio without command) with 400', async () => {
    const { status, body } = await request('POST', '/api/v1/tools', {
      kind: 'mcp_server', label: 'broken', transport: 'stdio',
    });
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain('requires a command');
  });

  it('lists, updates with secret-preserving merge, and deletes', async () => {
    const created = integrationOf((await request('POST', '/api/v1/tools', {
      kind: 'mcp_server', label: 'Srv', transport: 'stdio', command: process.execPath, args: [scriptPath],
      env: { A: 'value-aaaa', B: 'value-bbbb' },
    })).body);
    const id = created.id as string;

    const listed = (await request('GET', '/api/v1/tools')).body!.integrations as Json[];
    expect(listed.some((i) => i.id === id)).toBe(true);

    // env present with only key A → B kept from store (masked round-trip safe), A replaced
    const updated = integrationOf((await request('PUT', `/api/v1/tools/${id}`, { env: { A: 'value-new' } })).body);
    expect(updated.env).toMatchObject({ A: '••••-new', B: '••••bbbb' });

    // env absent entirely → nothing changes
    const afterLabel = integrationOf((await request('PUT', `/api/v1/tools/${id}`, { label: 'Srv2' })).body);
    expect(afterLabel.label).toBe('Srv2');

    const deleted = await request('DELETE', `/api/v1/tools/${id}`);
    expect(deleted.status).toBe(200);
    expect((await request('GET', `/api/v1/tools/${id}`)).status).toBe(404);
  });

  it('test route: real stdio round-trip persisted as lastTest; failures honest; non-MCP 400', async () => {
    const ok = integrationOf((await request('POST', '/api/v1/tools', {
      kind: 'mcp_server', label: 'Live', transport: 'stdio', command: process.execPath, args: [scriptPath],
    })).body);
    const tested = await request('POST', `/api/v1/tools/${ok.id}/test`);
    expect(tested.status).toBe(200);
    const test = (tested.body as Json).test as Json;
    expect(test.ok).toBe(true);
    expect(test.summary).toMatch(/1 tool.*echo/);
    // persisted on the integration
    const reread = integrationOf((await request('GET', `/api/v1/tools/${ok.id}`)).body);
    expect((reread.lastTest as Json).ok).toBe(true);

    const bad = integrationOf((await request('POST', '/api/v1/tools', {
      kind: 'mcp_server', label: 'Dead', transport: 'stdio', command: 'definitely-not-a-real-command-far-lab',
    })).body);
    const failed = await request('POST', `/api/v1/tools/${bad.id}/test`);
    expect(failed.status).toBe(200); // the test itself succeeded in reaching a verdict
    expect(((failed.body as Json).test as Json).ok).toBe(false);

    const skill = integrationOf((await request('POST', '/api/v1/tools', {
      kind: 'skill', label: 'S', name: 'demo-skill', description: 'd', body: 'b',
    })).body);
    expect((await request('POST', `/api/v1/tools/${skill.id}/test`)).status).toBe(400);
  });
});
