import { createHash } from 'node:crypto';
import type { Db } from '../persistence/db.js';
import type { SourceFamily } from '../domain/source.js';
import type { RawRetrievalResult } from '../shared/ports.js';

/**
 * RU-10 GO1 — cross-run scholarly-API response cache (read-through, per-source TTL).
 *
 * Precedent: pyalex wraps requests-cache with SQLite TTLs; Crossref's own REST
 * tips say "keep a local cache of results"; OpenAlex docs recommend caching
 * over parallelism. arXiv metadata is versioned (not immutable) — 7d refresh;
 * OpenAlex projections are volatile — 1d on the STABLE projection only.
 *
 * Stale-on-error discipline: an expired entry encountered while the source is
 * rate-limiting (429/Retry-After) is served with `stale: true` so the caller
 * can receipt it as cache=stale — a cached honest answer beats a blocked run.
 * Non-cacheable shapes (resolve() identifier path) are not cached here.
 */

const TTL_DAYS: Readonly<Record<string, number>> = {
  arxiv: 7,
  crossref: 7,
  europepmc: 7,
  openalex: 1,
};

export const cacheTtlDays = (family: string): number => TTL_DAYS[family] ?? 7;

export const cacheKey = (family: SourceFamily, query: string, limit: number): string =>
  `rc:${family}:${limit}:${createHash('sha256').update(query.trim().toLowerCase().replace(/\s+/g, ' ')).digest('hex').slice(0, 32)}`;

export interface CachedSearch {
  result: RawRetrievalResult;
  /** true when an EXPIRED entry was served because the source was erroring/rate-limited. */
  stale: boolean;
  cachedAt: string;
}

export interface ResponseCacheStore {
  getCachedSearch(key: string): { json: string; cached_at: string } | null;
  putCachedSearch(key: string, family: string, json: string, at: string): void;
}

export const openResponseCacheStore = (db: Db): ResponseCacheStore => {
  db.exec(`CREATE TABLE IF NOT EXISTS source_response_cache (
    key TEXT PRIMARY KEY,
    family TEXT NOT NULL,
    json TEXT NOT NULL,
    cached_at TEXT NOT NULL
  )`);
  const put = db.prepare('INSERT OR REPLACE INTO source_response_cache (key, family, json, cached_at) VALUES (?,?,?,?)');
  return {
    getCachedSearch: (key) => {
      const row = db.prepare('SELECT json, cached_at FROM source_response_cache WHERE key=?').get(key) as { json: string; cached_at: string } | undefined;
      return row === undefined ? null : { json: String(row.json), cached_at: String(row.cached_at) };
    },
    putCachedSearch: (key, family, json, at) => { put.run(key, family, json, at); },
  };
};

export const isFresh = (cachedAt: string, family: string, nowMs: number): boolean =>
  nowMs - Date.parse(cachedAt) < cacheTtlDays(family) * 86_400_000;

/**
 * Read-through wrapper for one adapter.search call. Deterministic offline:
 * the adapter is injectable, so tests mock one HTTP round and assert the
 * second call never reaches it.
 */
export const cachedSearch = async (
  cache: ResponseCacheStore,
  family: SourceFamily,
  query: string,
  limit: number,
  nowMs: number,
  live: () => Promise<RawRetrievalResult>,
  opts: { onErrorStale?: (e: unknown) => boolean } = {},
): Promise<CachedSearch> => {
  const key = cacheKey(family, query, limit);
  const hit = cache.getCachedSearch(key);
  if (hit !== null && isFresh(hit.cached_at, family, nowMs)) {
    return { result: JSON.parse(hit.json) as RawRetrievalResult, stale: false, cachedAt: hit.cached_at };
  }
  try {
    const result = await live();
    cache.putCachedSearch(key, family, JSON.stringify(result), new Date(nowMs).toISOString());
    return { result, stale: false, cachedAt: new Date(nowMs).toISOString() };
  } catch (e) {
    if (hit !== null && (opts.onErrorStale?.(e) ?? false)) {
      return { result: JSON.parse(hit.json) as RawRetrievalResult, stale: true, cachedAt: hit.cached_at };
    }
    throw e;
  }
};
