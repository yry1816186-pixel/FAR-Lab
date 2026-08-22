import { beforeEach, describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { createFallbackProvider, isFailoverWorthy, clearFallbackCooldowns, COOLDOWN_MS } from '../src/providers/fallback.js';
import { parseModels } from '../src/providers/discovery.js';
import { aggregateRunUsage, aggregateWorkspaceUsage } from '../src/app/usage-ledger.js';
import { resolveChainNames } from '../src/app/provider-resolver.js';
import { ModelProviderConfig, newId, ProvenanceReceipt, ResearchQuestion } from '../src/domain/index.js';
import type { ModelProvider, StructuredCallResult } from '../src/shared/ports.js';

/**
 * BP-4 model control plane v2. All offline/deterministic: scripted providers for
 * failover semantics, pure parser fixtures for discovery, in-memory receipts for
 * the usage ledger. Live discovery/live failover against real endpoints is
 * BLOCKED-live under the 2026-08-23 no-live-API directive.
 */

const receiptFor = (provider: string, modelId: string) => ({
  provider, modelId, latencyMs: 1, usage: { totalTokens: 1 },
  requestHash: 'a'.repeat(64), outputHash: 'b'.repeat(64), executionMode: 'test' as const,
});

const okProvider = (name: string): ModelProvider => ({
  name,
  liveReady: true,
  async structuredCall<T>(): Promise<StructuredCallResult<T>> {
    return { ok: true, data: { via: name } as T, receipt: receiptFor(name, 'm') };
  },
});

const failingProvider = (name: string, error: NonNullable<StructuredCallResult<unknown>['error']>): ModelProvider => ({
  name,
  liveReady: true,
  async structuredCall<T>(): Promise<StructuredCallResult<T>> {
    return { ok: false, error, receipt: receiptFor(name, 'm') };
  },
});

describe('failover classification (LiteLLM-verified semantics)', () => {
  const kinds: Array<[NonNullable<StructuredCallResult<unknown>['error']>['kind'], number | undefined, boolean]> = [
    ['rate_limited', 429, true],
    ['timeout', undefined, true],
    ['quota_exceeded', 429, true],
    ['auth_error', 401, true],
    ['provider_error', 500, true],
    ['provider_error', 503, true],
    ['provider_error', undefined, true], // unknown transport failure
    ['provider_error', 400, false], // malformed request class
    ['provider_error', 404, false],
    ['provider_error', 413, false],
    ['invalid_output', undefined, false], // model answered garbage: no silent model swap
  ];
  for (const [kind, httpStatus, expected] of kinds) {
    it(`${kind}${httpStatus !== undefined ? ` (${httpStatus})` : ''} -> ${expected ? 'fail over' : 'no failover'}`, () => {
      expect(isFailoverWorthy({ kind, message: 'x', retryable: false, ...(httpStatus !== undefined ? { httpStatus } : {}) })).toBe(expected);
    });
  }
});

describe('fallback chain behavior', () => {
  beforeEach(() => clearFallbackCooldowns());
  it('fails over to the second route after a failover-worthy exhaustion and reports the serving route', async () => {
    const failovers: Array<{ from: string; to: string }> = [];
    const chain = createFallbackProvider(
      [
        { provider: failingProvider('primary', { kind: 'rate_limited', message: '429', retryable: true, httpStatus: 429 }), configId: 'c1' },
        { provider: okProvider('secondary'), configId: 'c2' },
      ],
      { onFailover: (from, to) => failovers.push({ from, to }) },
    );
    const res = await chain.structuredCall({ task: 't', userPayload: {}, outputKind: 'json', purpose: 'test' }, (r) => r);
    expect(res.ok).toBe(true);
    expect(res.receipt.provider).toBe('secondary'); // WHO served the call is visible
    expect(failovers).toEqual([{ from: 'primary', to: 'secondary' }]);
  });

  it('does NOT fail over on 400-class (request is malformed for every route) — the original error returns', async () => {
    const chain = createFallbackProvider([
      { provider: failingProvider('primary', { kind: 'provider_error', message: 'bad request', retryable: false, httpStatus: 400 }), configId: 'c1' },
      { provider: okProvider('secondary'), configId: 'c2' },
    ]);
    const res = await chain.structuredCall({ task: 't', userPayload: {}, outputKind: 'json', purpose: 'test' }, (r) => r);
    expect(res.ok).toBe(false);
    expect(res.error?.httpStatus).toBe(400);
  });

  it('cooldown suppresses a route that just failed, but never empties the chain', async () => {
    let primaryAttempts = 0;
    const flaky: ModelProvider = {
      name: 'flaky',
      liveReady: true,
      async structuredCall<T>(): Promise<StructuredCallResult<T>> {
        primaryAttempts += 1;
        return primaryAttempts === 1
          ? { ok: false as const, error: { kind: 'timeout', message: 't', retryable: true }, receipt: receiptFor('flaky', 'm') }
          : { ok: true as const, data: { via: 'flaky' } as T, receipt: receiptFor('flaky', 'm') };
      },
    };
    const secondary = okProvider('secondary');
    const chain = createFallbackProvider([
      { provider: flaky, configId: 'c1' },
      { provider: secondary, configId: 'c2' },
    ]);
    const first = await chain.structuredCall({ task: 't', userPayload: {}, outputKind: 'json', purpose: 'test' }, (r) => r);
    expect(first.receipt.provider).toBe('secondary'); // failed over
    const second = await chain.structuredCall({ task: 't', userPayload: {}, outputKind: 'json', purpose: 'test' }, (r) => r);
    // c1 is inside its cooldown window -> the chain goes straight to secondary
    expect(second.receipt.provider).toBe('secondary');
    expect(primaryAttempts).toBe(1);
    expect(COOLDOWN_MS).toBeGreaterThanOrEqual(5_000);
  });

  it('single-route chains return the route result unchanged (cooldown cannot stop the product)', async () => {
    const chain = createFallbackProvider([{ provider: failingProvider('only', { kind: 'auth_error', message: '401', retryable: false, httpStatus: 401 }), configId: 'c1' }]);
    const res = await chain.structuredCall({ task: 't', userPayload: {}, outputKind: 'json', purpose: 'test' }, (r) => r);
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe('auth_error');
  });
});

describe('resolver chain building (cycles cut, depth bounded)', () => {
  const mkStore = () => new Store(openDb(':memory:'));
  const cfg = (id: string, fallbacks: string[]) =>
    ModelProviderConfig.parse({
      id, label: id, wire: 'openai', baseUrl: 'https://example.test/v1', modelId: 'm',
      apiKey: 'k', fallbackConfigIds: fallbacks, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
  // Real id shapes (mcfg_[0-9a-z]{20,32}) with readable aliases.
  const idA = newId('mcfg');
  const idB = newId('mcfg');
  const idGhost = newId('mcfg');

  it('follows the declared chain in order and cuts cycles', () => {
    const store = mkStore();
    store.putObject('model_config', cfg(idA, [idB]));
    store.putObject('model_config', cfg(idB, [idA])); // cycle back to A
    const names = resolveChainNames(store, idA);
    expect(names).toEqual([`custom:${idA}`, `custom:${idB}`]); // A not repeated
  });

  it('flattens ALL declared fallbacks breadth-first — none silently ignored (red-team P1-2)', () => {
    const store = mkStore();
    const idC = newId('mcfg');
    const idD = newId('mcfg');
    store.putObject('model_config', cfg(idA, [idB, idC, idD]));
    store.putObject('model_config', cfg(idB, []));
    store.putObject('model_config', cfg(idC, []));
    store.putObject('model_config', cfg(idD, []));
    expect(resolveChainNames(store, idA)).toEqual([`custom:${idA}`, `custom:${idB}`, `custom:${idC}`, `custom:${idD}`]);
  });

  it('cuts at a dangling fallback id without failing the primary', () => {
    const store = mkStore();
    store.putObject('model_config', cfg(idA, [idGhost]));
    expect(resolveChainNames(store, idA)).toEqual([`custom:${idA}`]);
  });

  it('no fallbacks -> single route (zero behavior change)', () => {
    const store = mkStore();
    store.putObject('model_config', cfg(idA, []));
    expect(resolveChainNames(store, idA)).toEqual([`custom:${idA}`]);
  });
});

describe('usage ledger (receipts are the only authority)', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'far-usage-'));
  const HASH = 'a'.repeat(64);
  const receipt = (runId: string, provider: string, modelId: string, p: number, c: number) =>
    ProvenanceReceipt.parse({
      id: newId('rcp'), runId, kind: 'model_call', executionMode: 'test', at: new Date().toISOString(),
      stage: 'scope',
      modelCall: {
        provider, modelId, usage: { promptTokens: p, completionTokens: c, totalTokens: p + c },
        latencyMs: 5, requestHash: HASH, outputHash: HASH,
      },
    });

  it('aggregates tokens per (provider, model); cost only from user-declared pricing; unknown stays null', async () => {
    const dir = tmp();
    const store = new Store(openDb(path.join(dir, 'far.db')));
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'question', background: '', goalType: 'explanatory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    const run = store.createRun(q);
    const priced = ModelProviderConfig.parse({
      id: newId('mcfg'), label: 'priced', wire: 'openai', baseUrl: 'https://x.test/v1', modelId: 'm1',
      apiKey: 'k', pricing: { inputUsdPerMTok: 2, outputUsdPerMTok: 4 },
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    store.putObject('model_config', priced);
    store.putObject('receipt', receipt(run.id, `custom:${priced.id}`, 'm1', 500_000, 250_000));
    store.putObject('receipt', receipt(run.id, 'zai', 'glm-4.6', 1_000, 2_000));

    const usage = aggregateRunUsage(store, run.id);
    const custom = usage.find((u) => u.provider === `custom:${priced.id}`)!;
    expect(custom.totalTokens).toBe(750_000);
    expect(custom.costUsd).toBeCloseTo(0.5 * 2 + 0.25 * 4, 6); // $2.00
    expect(custom.pricingBasis).toBe('user-configured');
    const envRoute = usage.find((u) => u.provider === 'zai')!;
    expect(envRoute.totalTokens).toBe(3_000);
    expect(envRoute.costUsd).toBeNull(); // NO invented price table
    expect(envRoute.pricingBasis).toBe('unknown');

    // workspace aggregation re-derives the same numbers from persisted receipts
    const ws = aggregateWorkspaceUsage(store);
    expect(ws.find((u) => u.provider === `custom:${priced.id}`)?.totalTokens).toBe(750_000);
    (store as unknown as { db: { close: () => void } }).db.close();
  });
});

describe('model discovery parser', () => {
  it('parses OpenAI-wire catalogs, dedups, sorts, keeps only present fields', () => {
    const models = parseModels({
      data: [
        { id: 'gpt-test-2', owned_by: 'system' },
        { id: 'gpt-test-1', owned_by: 'openai', created: 1_700_000_000 },
        { id: 'gpt-test-2' }, // duplicate id -> deduped
        { not_an_id: true }, // skipped honestly
      ],
    });
    expect(models.map((m) => m.id)).toEqual(['gpt-test-1', 'gpt-test-2']);
    expect(models[0]).toEqual({ id: 'gpt-test-1', ownedBy: 'openai' });
  });

  it('parses Anthropic-wire catalogs (display_name/created_at)', () => {
    const models = parseModels({ data: [{ type: 'model', id: 'claude-test-1', display_name: 'Claude Test', created_at: '2026-01-01T00:00:00Z' }] });
    expect(models[0]).toEqual({ id: 'claude-test-1', displayName: 'Claude Test', createdAt: '2026-01-01T00:00:00Z' });
  });

  it('throws on non-catalog shapes (fail closed, never an empty-catalog success)', () => {
    expect(() => parseModels({ error: 'nope' })).toThrow(/not a .* catalog/);
    expect(() => parseModels(null)).toThrow();
  });
});
