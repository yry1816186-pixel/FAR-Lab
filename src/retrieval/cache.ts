/**
 * retrieval/cache — persistent, content-addressed retrieval cache
 * (directive §7: `.far/cache/retrieval/`, repeat questions served without
 * re-burning the daily API budget).
 *
 * Honesty contract (trust-adjacent, §7-spirit):
 *   - A cache hit REPLAYS the recorded response: the envelope stores the
 *     ORIGINAL retrievedAt, so a hit re-parses to byte-identical documents
 *     (rawHash / corpus snapshotId stay stable across runs — idempotent
 *     grounding, verifiable by test).
 *   - cacheHit is surfaced on FetchedText and counted in RetrievalCache.hits —
 *     a hit is never reported as a fresh live fetch.
 *   - Filename = sha256(url) hex — user query text never touches the
 *     filesystem path (path-injection proof by construction; safeJoin on top).
 *
 * TTL per source (decision record, retrieval-hardening-v1): arXiv 7d
 * (metadata effectively immutable), OpenAlex 24h (index updates daily),
 * Crossref 48h (metadata evolves slowly). Overridable via constructor.
 *
 * Disable: FAR_RETRIEVAL_CACHE=0 (or constructor). Root override:
 * FAR_RETRIEVAL_CACHE_DIR (tests point at a temp dir).
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { rawSha256Hex } from './hash.ts';
import { safeJoin } from '../paths.ts';

/** Per-host cache TTL (ms) — rationale in the module header. */
const HOST_TTL_MS: Record<string, number> = {
  'export.arxiv.org': 7 * 24 * 60 * 60 * 1000,
  'api.openalex.org': 24 * 60 * 60 * 1000,
  'api.crossref.org': 48 * 60 * 60 * 1000,
};
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/** Default root (relative to cwd, like .far/research-runs). */
export const DEFAULT_CACHE_ROOT = '.far/cache/retrieval';

/** The recorded response envelope persisted per URL. */
export interface CacheEnvelope {
  readonly url: string;
  readonly host: string;
  readonly status: number;
  readonly body: string;
  /** ISO timestamp of the ORIGINAL successful fetch (reused verbatim on hit). */
  readonly retrievedAt: string;
  /** ISO timestamp the envelope was stored (TTL anchor). */
  readonly storedAt: string;
}

export interface RetrievalCacheOptions {
  /** Root directory (default: FAR_RETRIEVAL_CACHE_DIR or .far/cache/retrieval). */
  readonly rootDir?: string;
  /** Explicit disable (default: enabled unless FAR_RETRIEVAL_CACHE=0). */
  readonly disabled?: boolean;
  /** TTL overrides per host (tests). */
  readonly ttlMs?: Readonly<Record<string, number>>;
  /** Clock (tests). */
  readonly now?: () => number;
}

/** rename with Windows-EPERM retry (same pattern as run_lifecycle.renameWithRetry). */
function renameWithRetry(from: string, to: string, attempts = 5): void {
  for (let i = 0; ; i += 1) {
    try {
      renameSync(from, to);
      return;
    } catch (err) {
      if (i >= attempts - 1) throw err;
      // AV/indexer short locks on Windows — brief exponential-ish backoff.
      const delay = 20 * 2 ** i;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
    }
  }
}

/** Persistent content-addressed cache for retrieval responses. */
export class RetrievalCache {
  private readonly rootDir: string;
  private readonly disabled: boolean;
  private readonly ttlMs: Readonly<Record<string, number>>;
  private readonly now: () => number;
  /** Count of hits served since construction (honest accounting surface). */
  public hits = 0;

  constructor(opts: RetrievalCacheOptions = {}) {
    const envRoot = process.env.FAR_RETRIEVAL_CACHE_DIR;
    this.rootDir = opts.rootDir ?? (envRoot !== undefined && envRoot !== '' ? envRoot : DEFAULT_CACHE_ROOT);
    this.disabled =
      opts.disabled ?? process.env.FAR_RETRIEVAL_CACHE === '0';
    this.ttlMs = { ...HOST_TTL_MS, ...opts.ttlMs };
    this.now = opts.now ?? (() => Date.now());
  }

  /** Look up a cached response (null on miss/expiry/disabled/corruption). */
  lookup(url: string): CacheEnvelope | null {
    if (this.disabled) return null;
    const path = this.pathFor(url);
    if (!existsSync(path)) return null;
    let envelope: CacheEnvelope;
    try {
      envelope = JSON.parse(readFileSync(path, 'utf8')) as CacheEnvelope;
    } catch {
      // Corrupt/partial envelope = miss (fail-open to the network); the
      // subsequent store overwrites the bad file.
      return null;
    }
    if (envelope.url !== url || typeof envelope.body !== 'string') return null;
    const ttl = this.ttlMs[envelope.host] ?? DEFAULT_TTL_MS;
    const storedAt = Date.parse(envelope.storedAt);
    if (Number.isNaN(storedAt) || this.now() - storedAt > ttl) return null;
    this.hits += 1;
    return envelope;
  }

  /** Persist a successful response (never throws — a failed store is a miss). */
  store(envelope: CacheEnvelope): void {
    if (this.disabled) return;
    try {
      mkdirSync(this.rootDir, { recursive: true });
      const final = this.pathFor(envelope.url);
      const tmp = `${final}.tmp-${process.pid}-${Date.now()}`;
      writeFileSync(tmp, JSON.stringify(envelope), 'utf8');
      renameWithRetry(tmp, final);
    } catch {
      // Disk-full/permission: caching is best-effort; retrieval proceeds live.
    }
  }

  /** sha256(url) filename — user text never becomes a path segment. */
  private pathFor(url: string): string {
    return safeJoin(this.rootDir, `${rawSha256Hex(url)}.json`);
  }
}
