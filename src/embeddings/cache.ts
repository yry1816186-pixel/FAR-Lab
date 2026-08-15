/**
 * embeddings/cache — persistent content-addressed vector cache (directive
 * §6.8): `.far/cache/embeddings/<sha256(configHash + text)>.json`.
 *
 * The configHash is part of the cache KEY, so a provider/model/dimension
 * change misses by construction — new and old vectors can never mix (the
 * silent-drift risk §6.8 legislates against). Envelope shape:
 * { vector, configHash, cachedAt }. There is no TTL: embedding validity is
 * versioned by configuration, not by source-data freshness.
 *
 * Environment: FAR_EMBEDDING_CACHE_DIR overrides the root (tests inject temp
 * dirs); FAR_EMBEDDING_CACHE=0 disables caching entirely (always-miss).
 * Same atomic-write pattern as the retrieval cache (tmp + renameWithRetry).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { safeJoin } from '../paths.ts';
import { rawSha256Hex } from '../retrieval/hash.ts';
import { renameWithRetry } from '../research/run_lifecycle.ts';

export const DEFAULT_EMBEDDING_CACHE_ROOT = '.far/cache/embeddings';

interface CacheEnvelope {
  readonly vector: readonly number[];
  readonly configHash: string;
  readonly cachedAt: string;
}

export interface EmbeddingCache {
  /** Cached vector for (configHash, text), or null on miss/corruption/disabled. */
  lookup(configHash: string, text: string): readonly number[] | null;
  /** Persist a vector (best-effort durability; deterministic providers make rewrites idempotent). */
  store(configHash: string, text: string, vector: readonly number[], cachedAt: string): void;
  /** Path for a key (test/inspection surface). */
  pathFor(configHash: string, text: string): string;
}

/** Cache key = sha256(configHash + '\n' + text) — version-mixed lookups are impossible. */
export function embeddingCacheKey(configHash: string, text: string): string {
  return rawSha256Hex(`${configHash}\n${text}`);
}

export function createEmbeddingCache(rootDir: string = resolveRoot()): EmbeddingCache {
  const enabled = process.env.FAR_EMBEDDING_CACHE !== '0';
  return {
    lookup(configHash, text) {
      if (!enabled) return null;
      const path = this.pathFor(configHash, text);
      if (!existsSync(path)) return null;
      try {
        const envelope = JSON.parse(readFileSync(path, 'utf8')) as CacheEnvelope;
        if (envelope.configHash !== configHash || !Array.isArray(envelope.vector)) {
          return null; // corrupt or foreign → miss (never poison the caller)
        }
        return envelope.vector;
      } catch {
        return null; // corrupt JSON → miss
      }
    },
    store(configHash, text, vector, cachedAt) {
      if (!enabled) return;
      const path = this.pathFor(configHash, text);
      mkdirSync(dirname(path), { recursive: true });
      const envelope: CacheEnvelope = { vector, configHash, cachedAt };
      const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
      writeFileSync(tmp, JSON.stringify(envelope), 'utf8');
      renameWithRetry(tmp, path);
    },
    pathFor(configHash, text) {
      return safeJoin(rootDir, `${embeddingCacheKey(configHash, text)}.json`);
    },
  };
}

function resolveRoot(): string {
  const override = process.env.FAR_EMBEDDING_CACHE_DIR;
  return override !== undefined && override !== '' ? override : DEFAULT_EMBEDDING_CACHE_ROOT;
}
