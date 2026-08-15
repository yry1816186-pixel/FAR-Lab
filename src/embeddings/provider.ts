/**
 * embeddings/provider — the provider contract every embedding implementation
 * satisfies (hash stub today, real APIs later — same interface, swap-in).
 *
 * Embeddings ENHANCE, never adjudicate (standing ADR): no verdict path may
 * consume vectors; consumers are ranking/diversity heuristics only.
 */

import type { EmbeddingConfig } from './config.ts';

/** Batch embedding result — vectors are index-aligned with the input texts. */
export interface EmbeddingResult {
  readonly vectors: readonly (readonly number[])[];
  /** Config hash of the producing configuration (audit anchor, §6.8). */
  readonly configHash: string;
  readonly provider: string;
}

export interface EmbeddingProvider {
  readonly config: EmbeddingConfig;
  /** Embed texts (index-aligned). Empty input → empty vectors. Fail-closed on error. */
  embed(texts: readonly string[]): Promise<EmbeddingResult>;
}
