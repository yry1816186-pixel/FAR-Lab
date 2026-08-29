import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import type { App } from '../src/app/composition.js';
import { createApiServer } from '../src/server/api.js';
import type { ApiServer } from '../src/server/api.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';

// *** TEST-ONLY *** terminal HTTP surface over REAL login-shell sessions: the
// API round-trip (create → SSE stream → input → output → kill) runs against a
// real server process and a real researcher shell — no session stubs.

let tmp: string;
let app: App;
let api: ApiServer;
let base: string;

const executor = (runId: string): Promise<unknown> => Promise.resolve(app.store.getRun(runId));

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-api-term-'));
  app = await createApp({ dataDir: tmp, providerOverride: createTestStubProvider([]) });
  api = createApiServer(app, { port: 0, executor, staticRoot: path.join(tmp, 'no-web-dist') });
  const port = await api.start();
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await api.stop();
  app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

type Json = Record<string, unknown>;

const request = async (method: string, urlPath: string, body?: unknown): Promise<{ status: number; body: Json | null }> => {
  const res = await fetch(`${base}${urlPath}`, {
    method,
    ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed: Json | null;
  try { parsed = text.length > 0 ? (JSON.parse(text) as Json) : null; } catch { parsed = null; }
  return { status: res.status, body: parsed };
};

describe('terminal sessions API (real shells)', () => {
  it('creates a session, streams output over SSE, accepts input, kills', async () => {
    const created = await request('POST', '/api/v1/terminal/sessions');
    expect(created.status).toBe(201);
    const session = created.body as { id: string; shell: { program: string }; alive: boolean };
    expect(session.alive).toBe(true);
    expect(session.shell.program.length).toBeGreaterThan(0);

    const listed = await request('GET', '/api/v1/terminal/sessions');
    expect(listed.status).toBe(200);
    expect(((listed.body as { sessions: unknown[] }).sessions ?? []).length).toBeGreaterThan(0);

    // SSE stream: connect first so live output is captured, then send input.
    const controller = new AbortController();
    const stream = await fetch(`${base}/api/v1/terminal/sessions/${session.id}/events`, { signal: controller.signal });
    expect(stream.status).toBe(200);
    expect(stream.headers.get('content-type')).toContain('text/event-stream');
    const reader = stream.body!.getReader();
    const decoder = new TextDecoder();
    let received = '';
    const readSome = async (ms: number): Promise<void> => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        const next = await Promise.race([
          reader.read(),
          new Promise<undefined>((r) => setTimeout(() => r(undefined), Math.max(0, deadline - Date.now()))),
        ]);
        if (next === undefined) continue;
        if (next.done) break;
        received += decoder.decode(next.value, { stream: true });
        if (received.includes('far-api-term-marker')) break;
      }
    };

    const wrote = await request('POST', `/api/v1/terminal/sessions/${session.id}/input`, { text: 'node -e "console.log(\'far-api-term-marker\')"\n' });
    expect(wrote.status).toBe(200);
    await readSome(45_000);
    controller.abort();
    expect(received).toContain('far-api-term-marker');

    const killed = await request('DELETE', `/api/v1/terminal/sessions/${session.id}`);
    expect(killed.status).toBe(200);
    expect((killed.body as { killed: boolean }).killed).toBe(true);
  }, 90_000);

  it('rejects cwd escapes with 400 before spawning anything', async () => {
    const res = await request('POST', '/api/v1/terminal/sessions', { cwd: '..' });
    expect(res.status).toBe(400);
  });

  it('refuses input to unknown sessions (409-shaped)', async () => {
    const res = await request('POST', '/api/v1/terminal/sessions/00000000-0000-0000-0000-000000000000/input', { text: 'x\n' });
    expect(res.status).toBe(409);
  });
});
