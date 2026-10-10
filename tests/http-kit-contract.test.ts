import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import type { App } from '../src/app/composition.js';
import { createApiServer } from '../src/server/api.js';
import type { ApiServer } from '../src/server/api.js';
import { alreadyRunning, internal, notFound, validation } from '../src/server/http-kit.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { newId } from '../src/domain/index.js';

// BC-011 regression contract for the BC-002 split: the error envelope and the
// request-discipline guards are invariants of the whole API surface, so they
// are asserted against the shared http-kit constructors and a live server.
// Split PRs must keep these green — semantics frozen here are semantics the
// route families may not drift on.

let tmp: string;
let app: App;
let api: ApiServer;
let port: number;

const executor = (runId: string): Promise<unknown> =>
  new Promise((resolve) => {
    const run = app.store.getRun(runId);
    resolve(run);
  });

const rawRequest = (opts: {
  method?: string;
  path?: string;
  body?: string;
  headers?: Record<string, string>;
}): Promise<{ status: number; body: string; contentType: string | null }> =>
  new Promise((resolve, reject) => {
    const payload = opts.body;
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method: opts.method ?? 'GET',
        path: opts.path ?? '/api/v1/health',
        headers: {
          host: `127.0.0.1:${port}`,
          ...(payload !== undefined ? { 'content-length': String(Buffer.byteLength(payload)) } : {}),
          ...(opts.headers ?? {}),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body, contentType: res.headers['content-type'] ?? null }));
      },
    );
    req.on('error', reject);
    req.end(payload);
  });

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-httpkit-'));
  app = await createApp({
    dataDir: tmp,
    providerOverride: createTestStubProvider([]), // empty script fails loudly if called
  });
  api = createApiServer(app, { port: 0, staticRoot: path.join(tmp, 'no-web-dist'), executor });
  port = await api.start();
});

afterAll(async () => {
  await api.stop();
  app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('error envelope constructors (shared shape)', () => {
  it('notFound carries code/message/retryable and optional runId', () => {
    const err = notFound('run not found: run_x', 'run_x');
    expect(err.status).toBe(404);
    expect(err.payload).toEqual({ code: 'not_found', message: 'run not found: run_x', retryable: false, runId: 'run_x' });
    expect(Object.keys(err.payload).sort()).toEqual(['code', 'message', 'retryable', 'runId']);
  });

  it('notFound omits runId entirely when absent (no undefined leak)', () => {
    const err = notFound('no route');
    expect('runId' in err.payload).toBe(false);
    expect(err.payload).toEqual({ code: 'not_found', message: 'no route', retryable: false });
  });

  it('validation is 400 / not retryable', () => {
    const err = validation('bad input');
    expect(err.status).toBe(400);
    expect(err.payload).toEqual({ code: 'validation', message: 'bad input', retryable: false });
  });

  it('alreadyRunning is 409 and names the run', () => {
    const err = alreadyRunning('run_abc');
    expect(err.status).toBe(409);
    expect(err.payload.code).toBe('already_running');
    expect(err.payload.retryable).toBe(false);
    expect(err.payload.runId).toBe('run_abc');
  });

  it('internal is 500 and retryable', () => {
    const err = internal('boom');
    expect(err.status).toBe(500);
    expect(err.payload).toEqual({ code: 'internal', message: 'boom', retryable: true });
  });
});

describe('request-discipline guards over the live server', () => {
  it('cross-origin request gets the 400 validation envelope', async () => {
    const res = await rawRequest({ headers: { origin: 'https://evil.example.com' } });
    expect(res.status).toBe(400);
    const parsed = JSON.parse(res.body) as { error: { code: string; message: string; retryable: boolean } };
    expect(parsed.error).toEqual({ code: 'validation', message: 'cross-origin request rejected', retryable: false });
  });

  it('unrecognized Host (DNS-rebinding shape) gets the 400 validation envelope', async () => {
    const res = await rawRequest({ headers: { host: `evil.example.com:${port}` } });
    expect(res.status).toBe(400);
    const parsed = JSON.parse(res.body) as { error: { code: string; retryable: boolean } };
    expect(parsed.error.code).toBe('validation');
    expect(parsed.error.retryable).toBe(false);
  });

  it('bodied write verb with non-JSON content-type is refused as 400 validation', async () => {
    const res = await rawRequest({
      method: 'POST',
      path: '/api/v1/runs',
      body: 'text=not-json',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(res.status).toBe(400);
    const parsed = JSON.parse(res.body) as { error: { code: string } };
    expect(parsed.error.code).toBe('validation');
  });

  it('malformed path encoding is refused as 400 validation', async () => {
    const res = await rawRequest({ path: '/api/v1/%zz' });
    expect(res.status).toBe(400);
    const parsed = JSON.parse(res.body) as { error: { code: string } };
    expect(parsed.error.code).toBe('validation');
  });

  it('error responses are JSON with the envelope at the top level', async () => {
    const res = await rawRequest({ path: '/api/v1/nope' });
    expect(res.contentType).toContain('application/json');
    const parsed = JSON.parse(res.body) as { error: { code: string; message: string; retryable: boolean } };
    expect(parsed.error.code).toBe('not_found');
    expect(parsed.error.retryable).toBe(false);
    expect(typeof parsed.error.message).toBe('string');
  });
});

describe('health projection never leaks the plaintext key (BC-011)', () => {
  it('activeRoute shows apiKeySet/apiKeyMasked only', async () => {
    const cfgId = newId('mcfg');
    app.store.putObject('model_config', {
      id: cfgId,
      label: 'contract probe',
      wire: 'openai',
      baseUrl: 'https://example.invalid/v1',
      modelId: 'probe-model',
      apiKey: 'plaintext-secret-value-123456',
      fallbackConfigIds: [],
      pricing: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    app.store.setMeta('activeModelConfigId', cfgId);
    const res = await rawRequest({ path: '/api/v1/health' });
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as { activeRoute?: { apiKeySet: boolean; apiKeyMasked: string } };
    expect(body.activeRoute).toBeDefined();
    expect(body.activeRoute?.apiKeySet).toBe(true);
    expect(res.body).not.toContain('plaintext-secret-value-123456');
    expect(body.activeRoute?.apiKeyMasked).not.toContain('plaintext');
  });
});
