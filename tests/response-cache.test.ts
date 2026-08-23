import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/persistence/db.js';
import {
  openResponseCacheStore, cachedSearch, cacheKey, cacheTtlDays, isFresh,
} from '../src/sources/response-cache.js';
import type { RawRetrievalResult } from '../src/shared/ports.js';

// RU-10 GO1 — cross-run response cache. Mock-HTTP, second call never reaches
// the live adapter. All offline/deterministic.

const mkResult = (n: number): RawRetrievalResult => ({
  httpStatus: 200,
  records: Array.from({ length: n }, (_, i) => ({
    identifiers: [{ kind: 'doi' as const, value: `10.1/${n}-${i}` }],
    title: `Paper ${n}-${i}`,
    contentDepth: 'abstract' as const,
    accessState: 'unknown' as const,
    normalized: {},
  })),
});

const mkCache = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-rcache-'));
  return openResponseCacheStore(openDb(path.join(dir, 'far.db')));
};

describe('cache keying + TTL policy', () => {
  it('key is query-normalization stable (case/whitespace) and limit-scoped; per-source TTLs', () => {
    expect(cacheKey('arxiv' as never, '  Vitamin D ', 10)).toBe(cacheKey('arxiv' as never, 'vitamin d', 10));
    expect(cacheKey('arxiv' as never, 'vitamin d', 10)).not.toBe(cacheKey('arxiv' as never, 'vitamin d', 20));
    expect(cacheTtlDays('openalex')).toBe(1);
    expect(cacheTtlDays('arxiv')).toBe(7);
    expect(cacheTtlDays('crossref')).toBe(7);
    const t0 = Date.parse('2026-08-24T00:00:00.000Z');
    expect(isFresh('2026-08-23T00:00:00.000Z', 'openalex', t0)).toBe(false); // >1d
    expect(isFresh('2026-08-23T12:00:00.000Z', 'arxiv', t0)).toBe(true); // <7d
  });
});

describe('read-through semantics (mock HTTP)', () => {
  it('first call fetches live and populates; second call SERVES FROM CACHE — the adapter is never reached again', async () => {
    const cache = mkCache();
    let httpCalls = 0;
    const live = async (): Promise<RawRetrievalResult> => {
      httpCalls += 1;
      return mkResult(5);
    };
    const t0 = Date.parse('2026-08-24T00:00:00.000Z');
    const first = await cachedSearch(cache, 'arxiv' as never, 'vitamin d', 10, t0, live);
    expect(first.stale).toBe(false);
    expect(first.result.records).toHaveLength(5);
    const second = await cachedSearch(cache, 'arxiv' as never, 'Vitamin  D ', 10, t0 + 1000, live);
    expect(second.stale).toBe(false);
    expect(second.result.records).toHaveLength(5);
    expect(httpCalls).toBe(1); // the mock HTTP saw exactly ONE round
    expect(second.cachedAt).toBe(first.cachedAt);
  });

  it('expired + source rate-limiting -> STALE served with stale:true; expired + other errors -> rethrown', async () => {
    const cache = mkCache();
    const t0 = Date.parse('2026-08-24T00:00:00.000Z');
    await cachedSearch(cache, 'openalex' as never, 'memory effect', 10, t0, async () => mkResult(3));
    const tExpired = t0 + 2 * 86_400_000; // >1d TTL
    const rateLimited = async (): Promise<RawRetrievalResult> => {
      throw new Error('OpenAlex API: 429 rate limited (Insufficient budget)');
    };
    const stale = await cachedSearch(cache, 'openalex' as never, 'memory effect', 10, tExpired, rateLimited,
      { onErrorStale: (e) => /429|rate/i.test(e instanceof Error ? e.message : String(e)) });
    expect(stale.stale).toBe(true);
    expect(stale.result.records).toHaveLength(3);
    const hardError = async (): Promise<RawRetrievalResult> => {
      throw new Error('DNS resolution failed');
    };
    await expect(cachedSearch(cache, 'openalex' as never, 'memory effect', 10, tExpired, hardError,
      { onErrorStale: (e) => /429|rate/i.test(e instanceof Error ? e.message : String(e)) })).rejects.toThrow('DNS');
  });

  it('expired + healthy source -> refetches and re-populates (no immortal entries)', async () => {
    const cache = mkCache();
    const t0 = Date.parse('2026-08-24T00:00:00.000Z');
    await cachedSearch(cache, 'openalex' as never, 'q', 10, t0, async () => mkResult(1));
    let calls = 0;
    const refreshed = await cachedSearch(cache, 'openalex' as never, 'q', 10, t0 + 2 * 86_400_000, async () => {
      calls += 1;
      return mkResult(9);
    });
    expect(calls).toBe(1);
    expect(refreshed.result.records).toHaveLength(9);
    expect(refreshed.stale).toBe(false);
  });
});
