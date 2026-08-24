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
 *
 * Cache-exclusive exact replay (RU-R frontier candidate 3): a store opened
 * with mode 'replay' NEVER calls the live source — fresh-or-expired hits are
 * served with `replay: true` (receipted cache=replay), and a miss throws
 * ReplayCacheMissError so the caller fails explicitly instead of silently
 * producing a different corpus. TTLs do not apply in replay: the point is
 * byte-identical reproduction of the recorded responses, not freshness.
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

export type CacheMode = 'read_through' | 'replay';

export interface CachedValue<T> {
  result: T;
  /** true when an EXPIRED entry was served because the source was erroring/rate-limited. */
  stale: boolean;
  /** true when an exclusive-replay store served a recorded response (no live call). */
  replay: boolean;
  cachedAt: string;
}

export interface ResponseCacheStore {
  getCachedSearch(key: string): { json: string; cached_at: string } | null;
  putCachedSearch(key: string, family: string, json: string, at: string): void;
  /**
   * Exclusive-replay marker (frontier candidate 3). Absent = read-through
   * (legacy behavior): misses go live, hits respect TTL, stale-on-error allowed.
   */
  readonly mode?: CacheMode;
}

/** Thrown by replay-mode stores on a cache miss — the live source must not be called. */
export class ReplayCacheMissError extends Error {
  constructor(readonly key: string, readonly family: string) {
    super(
      `replay cache miss for ${family} (${key}) — exact replay impossible: the recorded response is absent. ` +
        'Re-run in read-through mode first to record it.',
    );
    this.name = 'ReplayCacheMissError';
  }
}

export const openResponseCacheStore = (db: Db, mode: CacheMode = 'read_through'): ResponseCacheStore => {
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
    ...(mode === 'replay' ? { mode } : {}),
  };
};

export const isFresh = (cachedAt: string, family: string, nowMs: number): boolean =>
  nowMs - Date.parse(cachedAt) < cacheTtlDays(family) * 86_400_000;

/**
 * Generic read-through/replay value cache over one adapter call (search OR a
 * citation-chase op). Deterministic offline: the adapter is injectable, so
 * tests mock one HTTP round and assert the second call never reaches it.
 */
export const cachedValue = async <T>(
  cache: ResponseCacheStore,
  family: SourceFamily,
  query: string,
  limit: number,
  nowMs: number,
  live: () => Promise<T>,
  opts: { onErrorStale?: (e: unknown) => boolean } = {},
): Promise<CachedValue<T>> => {
  const key = cacheKey(family, query, limit);
  const hit = cache.getCachedSearch(key);
  if (cache.mode === 'replay') {
    if (hit !== null) {
      return { result: JSON.parse(hit.json) as T, stale: false, replay: true, cachedAt: hit.cached_at };
    }
    throw new ReplayCacheMissError(key, family);
  }
  if (hit !== null && isFresh(hit.cached_at, family, nowMs)) {
    return { result: JSON.parse(hit.json) as T, stale: false, replay: false, cachedAt: hit.cached_at };
  }
  try {
    const result = await live();
    cache.putCachedSearch(key, family, JSON.stringify(result), new Date(nowMs).toISOString());
    return { result, stale: false, replay: false, cachedAt: new Date(nowMs).toISOString() };
  } catch (e) {
    if (hit !== null && (opts.onErrorStale?.(e) ?? false)) {
      return { result: JSON.parse(hit.json) as T, stale: true, replay: false, cachedAt: hit.cached_at };
    }
    throw e;
  }
};

/** Typed read-through wrapper for one adapter.search call. */
export const cachedSearch = (
  cache: ResponseCacheStore,
  family: SourceFamily,
  query: string,
  limit: number,
  nowMs: number,
  live: () => Promise<RawRetrievalResult>,
  opts: { onErrorStale?: (e: unknown) => boolean } = {},
): Promise<CachedValue<RawRetrievalResult>> =>
  cachedValue<RawRetrievalResult>(cache, family, query, limit, nowMs, live, opts);
