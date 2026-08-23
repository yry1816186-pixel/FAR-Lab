import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import { createApiServer, type ApiServer } from '../src/server/api.js';
import { ProvenanceReceipt, ResearchQuestion } from '../src/domain/index.js';
import { newId } from '../src/domain/ids.js';
import { withSpendGate, readSpendLimit, writeSpendLimit, workspaceSpendStatus } from '../src/app/spend-limit.js';
import type { App } from '../src/app/composition.js';
import type { ModelProvider } from '../src/shared/ports.js';

/**
 * Gap R5: workspace USD spend ceiling. The gate is fail-closed (quota_exceeded,
 * non-retryable) once priced receipts reach the declared limit; unpriced calls
 * never advance the number; limit edits apply on the next call. HTTP contract:
 * GET/PUT /api/v1/model-configs/spend-limit with validation. Offline throughout.
 */

let app: App;
let api: ApiServer;
let base: string;
let dataDir: string;

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-spend-'));
  app = await createApp({ dataDir });
  api = createApiServer(app, { port: 0, automations: { enabled: false } });
  base = `http://127.0.0.1:${await api.start()}`;
});

afterAll(async () => {
  await api.stop();
  app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const HASH = 'a'.repeat(64);

const seedReceipt = (provider: string, promptTok: number, completionTok: number): void => {
  const q = ResearchQuestion.parse({
    id: newId('q'), text: 'spend', background: '', goalType: 'exploratory',
    scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
  });
  const run = app.store.createRun(q);
  app.store.putObject('receipt', ProvenanceReceipt.parse({
    id: newId('rcp'), runId: run.id, kind: 'model_call', executionMode: 'test', at: new Date().toISOString(),
    stage: 'scope',
    modelCall: {
      provider, modelId: 'm1', usage: { promptTokens: promptTok, completionTokens: completionTok, totalTokens: promptTok + completionTok },
      latencyMs: 1, requestHash: HASH, outputHash: HASH,
    },
  }));
};

/** Counting inner provider: proves the gate either forwarded or blocked. */
const countingInner = (): { provider: ModelProvider; calls: () => number } => {
  let n = 0;
  return {
    calls: () => n,
    provider: {
      name: 'counting-stub',
      liveReady: true,
      structuredCall: <T,>(_req: unknown, _parse: (raw: unknown) => T | Error) => {
        n += 1;
        return Promise.resolve({ ok: true, data: undefined as T, receipt: { provider: 'counting-stub', modelId: 'm1', latencyMs: 1, usage: {}, requestHash: HASH, outputHash: HASH, executionMode: 'test' } });
      },
    },
  };
};

const req = async (method: string, pathName: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> => {
  const res = await fetch(`${base}/api/v1${pathName}`, {
    method,
    ...(body !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json() as Record<string, unknown> };
};

describe('spend gate (provider boundary)', () => {
  it('is transparent while unlimited or under the limit', async () => {
    const inner = countingInner();
    const gated = withSpendGate(app.store, inner.provider);
    const r1 = await gated.structuredCall({ purpose: 'probe' }, (x) => x as never);
    expect(r1.ok).toBe(true);
    expect(inner.calls()).toBe(1);

    writeSpendLimit(app.store, 5);
    seedReceipt('zai', 1_000_000, 0); // zai has NO pricing declared yet -> unpriced
    expect(workspaceSpendStatus(app.store).spentUsd).toBe(0);
    const r2 = await gated.structuredCall({ purpose: 'probe' }, (x) => x as never);
    expect(r2.ok).toBe(true); // unpriced receipts never advance the ceiling
    expect(inner.calls()).toBe(2);
  });

  it('fails closed (quota_exceeded, non-retryable) once priced spend reaches the limit — and clears instantly', async () => {
    // Declare zai pricing: $2/M in, $4/M out -> the earlier 1M-prompt receipt now costs $2.
    const put = await req('PUT', '/model-configs/builtin-routes/zai', { pricing: { inputUsdPerMTok: 2, outputUsdPerMTok: 4 } });
    expect(put.status).toBe(200);
    expect(workspaceSpendStatus(app.store).spentUsd).toBe(2);

    writeSpendLimit(app.store, 2); // exactly reached
    const inner = countingInner();
    const gated = withSpendGate(app.store, inner.provider);
    const blocked = await gated.structuredCall({ purpose: 'probe' }, (x) => x as never);
    expect(blocked.ok).toBe(false);
    expect(blocked.error?.kind).toBe('quota_exceeded');
    expect(blocked.error?.retryable).toBe(false);
    expect(inner.calls()).toBe(0); // the inner provider was never touched

    writeSpendLimit(app.store, null); // clear -> resumes immediately
    const resumed = await gated.structuredCall({ purpose: 'probe' }, (x) => x as never);
    expect(resumed.ok).toBe(true);
    expect(inner.calls()).toBe(1);
  });

  it('writeSpendLimit rejects non-positive or non-finite values', () => {
    expect(() => writeSpendLimit(app.store, 0)).toThrow();
    expect(() => writeSpendLimit(app.store, -1)).toThrow();
    expect(() => writeSpendLimit(app.store, Number.NaN)).toThrow();
    expect(readSpendLimit(app.store)).toBeNull();
  });
});

describe('spend limit HTTP contract', () => {
  it('GET reports limit + spent + unpriced; PUT validates and persists', async () => {
    const before = await req('GET', '/model-configs/spend-limit');
    expect(before.status).toBe(200);
    expect(before.json.spentUsd).toBe(2);
    expect(before.json.limitUsd).toBeNull();
    expect(before.json.unpricedCalls).toBe(0);

    const bad = await req('PUT', '/model-configs/spend-limit', { limitUsd: -5 });
    expect(bad.status).toBe(400);

    const set = await req('PUT', '/model-configs/spend-limit', { limitUsd: 12.5 });
    expect(set.status).toBe(200);
    expect(set.json.ok).toBe(true);
    expect(set.json.limitUsd).toBe(12.5);

    const cleared = await req('PUT', '/model-configs/spend-limit', { limitUsd: null });
    expect(cleared.status).toBe(200);
    expect(cleared.json.limitUsd).toBeNull();
  });
});
