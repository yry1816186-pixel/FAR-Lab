/**
 * embeddings/index — public surface of the embedding infrastructure
 * (directive §6.8). Factory + cached provider wrapper.
 *
 * Current implementation: the deterministic hash projection (`stub.ts`) —
 * zero network, zero cost, byte-reproducible. Real API providers plug into
 * the same EmbeddingProvider contract later; when they do, the config
 * constant changes → EMBEDDING_CONFIG_HASH changes → caches miss → the §6.8
 * full-recompute-and-compare obligation applies (documented in config.ts).
 */

import { EMBEDDING_CONFIG, EMBEDDING_CONFIG_HASH } from './config.ts';
import { createEmbeddingCache } from './cache.ts';
import type { EmbeddingProvider, EmbeddingResult } from './provider.ts';
import { createDeterministicHashEmbeddingProvider } from './hash_projection.ts';

export {
  EMBEDDING_CONFIG,
  EMBEDDING_CONFIG_HASH,
  canonicalEmbeddingConfigHash,
  type EmbeddingConfig,
} from './config.ts';
export { embeddingCacheKey, createEmbeddingCache, DEFAULT_EMBEDDING_CACHE_ROOT } from './cache.ts';
export type { EmbeddingProvider, EmbeddingResult } from './provider.ts';
export { createDeterministicHashEmbeddingProvider, projectDeterministicVector } from './hash_projection.ts';

/**
 * The default provider: the deterministic hash projection WITH persistent
 * caching. Every embed() consults the cache first; misses are computed and
 * stored. configHash on every result = the audit anchor.
 */
export function createEmbeddingProvider(opts: { now?: () => Date } = {}): EmbeddingProvider {
  const inner = createDeterministicHashEmbeddingProvider(EMBEDDING_CONFIG);
  const cache = createEmbeddingCache();
  const now = opts.now ?? (() => new Date());
  return {
    config: EMBEDDING_CONFIG,
    async embed(texts: readonly string[]): Promise<EmbeddingResult> {
      const result = await inner.embed(texts);
      const vectors = texts.map((text, index) => {
        const cached = cache.lookup(EMBEDDING_CONFIG_HASH, text);
        if (cached !== null) return cached;
        const computed = result.vectors[index]!;
        cache.store(EMBEDDING_CONFIG_HASH, text, computed, now().toISOString());
        return computed;
      });
      return { vectors, configHash: EMBEDDING_CONFIG_HASH, provider: EMBEDDING_CONFIG.provider };
    },
  };
}
