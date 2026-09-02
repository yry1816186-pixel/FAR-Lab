import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assertFetchDestination as sharedGuard } from '../src/shared/destination-guard.js';
import { assertFetchDestination as sourcesGuard } from '../src/sources/http.js';
import { runOpenAICompatStructuredCall } from '../src/providers/http.js';
import { McpHttpClient } from '../src/agent/mcp-http.js';
import { fetchZoteroLibrary } from '../src/server/zotero.js';
import { acquireDataset } from '../src/experiment/datasets.js';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import type { StructuredCallRequest } from '../src/shared/ports.js';

/**
 * FA-SEC-04 process-boundary egress guard regressions.
 *
 * The shared destination policy (src/shared/destination-guard.ts) is applied at
 * the providers transport chokepoint (every live adapter routes through
 * runOpenAICompatStructuredCall) and at the MCP streamable-HTTP client's
 * connect(). Sources re-exports the same owner — one invariant, one owner.
 * All fetches below are mocks; no network is touched.
 */

const REQ: StructuredCallRequest = {
  task: 'Generate one falsifiable hypothesis',
  systemPrompt: 'You are a careful research assistant.',
  userPayload: { topic: 'egress policy' },
  outputKind: 'json',
  purpose: 'unit-test',
};

const parseAnything = (raw: unknown): { received: true } | Error =>
  raw === null || typeof raw !== 'object' ? new Error('expected object') : { received: true };

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const recordingFetch = (impl: (url: string) => Promise<Response>) => {
  const urls: string[] = [];
  const fetchImpl = async (url: string, _init: RequestInit): Promise<Response> => {
    urls.push(url);
    return impl(url);
  };
  return { fetchImpl, urls };
};

describe('FA-SEC-04 process-boundary egress guard', () => {
  it('sources re-exports the single shared policy owner', () => {
    expect(sourcesGuard).toBe(sharedGuard);
  });

  it('policy: loopback in any scheme and public https pass; public plaintext and IP literals are rejected', () => {
    expect(() => sharedGuard('http://localhost:11434/v1')).not.toThrow();
    expect(() => sharedGuard('http://127.0.0.1:8080/base')).not.toThrow();
    expect(() => sharedGuard('https://api.example.com/v1')).not.toThrow();
    expect(() => sharedGuard('http://api.example.com/v1')).toThrow(/non-https/);
    expect(() => sharedGuard('https://169.254.169.254/latest/meta-data')).toThrow(/IPv4-literal/);
    expect(() => sharedGuard('https://10.1.2.3/v1')).toThrow(/IPv4-literal/);
    expect(() => sharedGuard('https://[2001:db8::1]/v1')).toThrow(/IPv6-literal/);
    expect(() => sharedGuard('not a url')).toThrow(/not a valid absolute URL/);
  });

  it('providers: a metadata-endpoint baseUrl fails closed before any wire traffic, with a receipted non-retryable error', async () => {
    const { fetchImpl, urls } = recordingFetch(() => Promise.resolve(jsonResponse(200, {})));
    const res = await runOpenAICompatStructuredCall(
      { providerName: 'egress-guard-test', baseUrl: 'https://169.254.169.254/v1', apiKey: 'test-fixture-key-egress', modelId: 'm', executionMode: 'test' },
      REQ,
      parseAnything,
      { fetchImpl, sleep: () => Promise.resolve() },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.kind).toBe('provider_error');
      expect(res.error.retryable).toBe(false);
      expect(res.error.message).toMatch(/egress guard rejected the endpoint.*IPv4-literal/);
      expect(res.error.message).not.toContain('test-fixture-key-egress');
    }
    expect(res.receipt.provider).toBe('egress-guard-test');
    expect(urls).toHaveLength(0);
  });

  it('providers: RFC1918 and plaintext-public baseUrls are rejected the same way', async () => {
    for (const baseUrl of ['https://10.0.0.9/v1', 'http://api.example.com/v1']) {
      const { fetchImpl, urls } = recordingFetch(() => Promise.resolve(jsonResponse(200, {})));
      const res = await runOpenAICompatStructuredCall(
        { providerName: 'egress-guard-test', baseUrl, apiKey: 'test-fixture-key-egress', modelId: 'm', executionMode: 'test' },
        REQ,
        parseAnything,
        { fetchImpl, sleep: () => Promise.resolve() },
      );
      expect(res.ok).toBe(false);
      expect(urls).toHaveLength(0);
    }
  });

  it('providers: a loopback http baseUrl (local LLM gateway) is legal and does reach the wire', async () => {
    const { fetchImpl, urls } = recordingFetch(() => Promise.resolve(jsonResponse(401, { error: { message: 'server fixture' } })));
    const res = await runOpenAICompatStructuredCall(
      { providerName: 'egress-guard-test', baseUrl: 'http://localhost:11434/v1', apiKey: 'test-fixture-key-egress', modelId: 'm', executionMode: 'test' },
      REQ,
      parseAnything,
      { fetchImpl, sleep: () => Promise.resolve() },
    );
    expect(res.ok).toBe(false); // 401 from the stub — but it WAS dispatched past the guard, exactly once (non-retryable class)
    if (!res.ok) expect(res.error.message).toMatch(/HTTP 401/);
    expect(urls).toEqual(['http://localhost:11434/v1/chat/completions']);
  });

  it('mcp-http: connect() rejects a metadata/ RFC1918 server URL before any handshake traffic', async () => {
    const urls: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      urls.push(String(input));
      return jsonResponse(200, { jsonrpc: '2.0' as const, id: 1, result: {} });
    };
    const client = new McpHttpClient({ url: 'https://169.254.169.254/mcp', fetchImpl });
    await expect(client.connect()).rejects.toThrow(/mcp-http: egress guard rejected.*IPv4-literal/);
    expect(urls).toHaveLength(0);
  });

  it('mcp-http: a loopback server URL stays legal and completes the handshake through the stub', async () => {
    const client = new McpHttpClient({
      url: 'http://127.0.0.1:3333/mcp',
      fetchImpl: async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        jsonResponse(200, { jsonrpc: '2.0' as const, id: 1, result: {} }),
    });
    await expect(client.connect()).resolves.toBeUndefined();
  });

  it('zotero: a non-loopback configured base must be https and not an IP literal', async () => {
    await expect(fetchZoteroLibrary({ base: 'https://169.254.169.254' })).rejects.toThrow(/destination guard: IPv4-literal/);
    await expect(fetchZoteroLibrary({ base: 'http://zotero-proxy.example.com' })).rejects.toThrow(/destination guard: non-https/);
  });

  it('datasets: an upstream-returned ARFF URL pivoting to a bad destination is rejected before any download', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'farlab-egress-'));
    const db = openDb(join(dir, 't.db'));
    const store = new Store(db);
    const artifacts = openArtifactStore(join(dir, 'artifacts'));
    const fetchCalls: string[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL): Promise<Response> => {
      fetchCalls.push(String(input));
      return jsonResponse(200, {
        data_set_description: { name: 'fixture', version: '1', licence: 'CC-BY', format: 'arff', url: 'http://169.254.169.254/x.arff' },
      });
    });
    try {
      await expect(acquireDataset(store, artifacts, 'run_fixture' as never, {
        source: { resolver: 'openml', openmlId: 1, name: 'fixture' },
        targetColumn: 'y',
        split: { method: 'random', ratios: { train: 0.7, val: 0, test: 0.3 }, seed: 42 },
      })).rejects.toThrow(/destination guard/);
      expect(fetchCalls).toHaveLength(1); // metadata only — the download never happened
    } finally {
      vi.unstubAllGlobals();
      try { db.close(); } catch { /* already closed */ }
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows lag; OS temp cleanup covers it */ }
    }
  });
});
