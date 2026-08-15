/**
 * embeddings/config — the frozen embedding configuration + its version hash
 * (directive §6.8 嵌入基础设施规范).
 *
 * The configuration is a CONSTANT on purpose: provider + model + dimensions
 * are fixed and hashed, so every artifact that consumed embeddings can name
 * the exact configuration (configHash travels into receipts/provenance). A
 * configuration change changes the hash → caches keyed by it miss
 * automatically → the §6.8 "upgrade ⇒ full recompute + reported comparison"
 * obligation becomes mechanically detectable instead of trust-based.
 *
 * HONESTY BOUNDARY: `deterministic-hash-v1` is NOT a semantic embedding —
 * vector distances carry no meaning about text similarity. It exists to make
 * the infrastructure (config/cache/stub/wiring) testable and deterministic
 * offline. Any semantic-capable metric (novelty/diversity/alignment scores
 * reported externally) MUST come from a real provider under a new config
 * hash, with the full-recompute comparison registered — using this stub for
 * such claims would be fabrication.
 */

import { hashCanonicalJson } from '../evidence_log/hasher.ts';

/** The frozen embedding configuration (SSOT — do not mutate; change = new hash). */
export interface EmbeddingConfig {
  /** Provider identity (never renamed for the same math). */
  readonly provider: string;
  /** Provider-side model id (null = the provider needs none, e.g. hash projection). */
  readonly model: string | null;
  /** Vector dimensionality (fixed; a change = new config hash = recompute). */
  readonly dimensions: number;
  /** Vector normalization applied before caching/return. */
  readonly normalizer: 'l2';
}

export const EMBEDDING_CONFIG: EmbeddingConfig = {
  provider: 'deterministic-hash-v1',
  model: null,
  dimensions: 64,
  normalizer: 'l2',
};

/** sha256 over the canonical config — the version identity everywhere downstream. */
export const EMBEDDING_CONFIG_HASH: string = canonicalEmbeddingConfigHash(EMBEDDING_CONFIG);

/** Pure: compute the config hash for any configuration (tests inject variants). */
export function canonicalEmbeddingConfigHash(config: EmbeddingConfig): string {
  return hashCanonicalJson(config);
}
