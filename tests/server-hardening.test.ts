import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createApp } from '../src/app/composition.js';
import type { App } from '../src/app/composition.js';
import { createApiServer } from '../src/server/api.js';
import type { ApiServer } from '../src/server/api.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';

// RU-3 COGSEC T0 regression lock: the F-1 loopback guard (src/server/api.ts,
// security audit) must reject DNS-rebinding Host headers and cross-site
// Origins while passing loopback callers (CLI/tests carry no Origin header).
// Raw node:http requests are used because fetch() refuses to send a forged Host.

let tmp: string;
let app: App;
let api: ApiServer;
let port: number;

/** Fire one raw request with fully controlled Host/Origin headers. */
const rawRequest = (opts: { host?: string; origin?: string; path?: string; method?: string }): Promise<{ status: number; body: string }> =>
  new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method: opts.method ?? 'GET',
        path: opts.path ?? '/api/v1/health',
        headers: {
          ...(opts.host !== undefined ? { host: opts.host } : {}),
          ...(opts.origin !== undefined ? { origin: opts.origin } : {}),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-hardening-'));
  app = await createApp({
    dataDir: tmp,
    providerOverride: createTestStubProvider([]), // empty script fails loudly if called
  });
  api = createApiServer(app, { port: 0, staticRoot: path.join(tmp, 'no-web-dist') });
  port = await api.start();
});

afterAll(async () => {
  await api.stop();
  app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('F-1 loopback guard (RU-3 COGSEC T0)', () => {
  it('passes a loopback Host with no Origin (CLI/test caller shape)', async () => {
    const res = await rawRequest({ host: `127.0.0.1:${port}` });
    expect(res.status).toBe(200);
  });

  it('passes a localhost Host with a loopback Origin (workbench caller shape)', async () => {
    const res = await rawRequest({ host: `localhost:${port}`, origin: `http://127.0.0.1:${port}` });
    expect(res.status).toBe(200);
  });

  it('rejects a non-loopback Host (DNS-rebinding shape)', async () => {
    const res = await rawRequest({ host: `evil.example.com:${port}` });
    expect(res.status).toBe(400);
    expect(res.body).toContain('Host');
  });

  it('rejects a cross-site Origin even with a loopback Host', async () => {
    const res = await rawRequest({ host: `127.0.0.1:${port}`, origin: 'https://evil.example.com' });
    expect(res.status).toBe(400);
    expect(res.body).toContain('cross-origin');
  });

  it('rejects a null Origin (sandboxed/file pages must not drive the API)', async () => {
    const res = await rawRequest({ host: `localhost:${port}`, origin: 'null' });
    expect(res.status).toBe(400);
  });
});
