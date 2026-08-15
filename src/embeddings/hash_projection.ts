/**
 * embeddings/stub — the deterministic hash-projection provider (first
 * implementation of the EmbeddingProvider contract).
 *
 * Math: per text, sha256(text) is expanded by repeated hashing into enough
 * bytes; dimension i takes byte pair (2i, 2i+1) → sign from the first byte's
 * high bit, magnitude from the second / 255; the vector is then L2-normalized.
 * Only integer extraction + one division per component + one normalization
 * division — no locale-dependent operations, no libc float variance — the
 * same text yields the byte-identical vector on every platform.
 *
 * NOT SEMANTIC (module-level honesty contract, directive §6.8): distances
 * between these vectors carry NO meaning about text similarity. The provider
 * id `deterministic-hash-v1` is frozen — any consumer can detect that a
 * metric was computed on the stub by checking configHash/provider and must
 * not present it as a semantic measurement.
 */

import { createHash } from 'node:crypto';

import { canonicalEmbeddingConfigHash, type EmbeddingConfig } from './config.ts';
import type { EmbeddingProvider, EmbeddingResult } from './provider.ts';

/** Deterministically expand one text into `bytes` pseudo-random octets. */
function hashExpand(text: string, bytes: number): Buffer {
  const out = Buffer.alloc(bytes);
  let block = createHash('sha256').update(text, 'utf8').digest();
  let filled = 0;
  while (filled < bytes) {
    const take = Math.min(block.length, bytes - filled);
    block.copy(out, filled, 0, take);
    filled += take;
    block = createHash('sha256').update(block).digest();
  }
  return out;
}

/** Project one text into a fixed-dimension L2-normalized vector (pure). */
export function projectDeterministicVector(text: string, dimensions: number): number[] {
  const bytes = hashExpand(text, dimensions * 2);
  const raw: number[] = [];
  for (let i = 0; i < dimensions; i += 1) {
    const sign = (bytes[2 * i]! & 0x80) === 0 ? 1 : -1;
    const magnitude = bytes[2 * i + 1]! / 255;
    // Normalize -0 to +0: a zero magnitude under a negative sign would
    // otherwise produce -0, which breaks byte-stability across JSON
    // round-trips (cache envelopes, ledger records) under strict equality.
    const v = sign * magnitude;
    raw.push(v === 0 ? 0 : v);
  }
  const norm = Math.sqrt(raw.reduce((acc, v) => acc + v * v, 0));
  // An all-zero vector is impossible (signs are fixed ±1 magnitudes > 0) but
  // the guard keeps the function total for degenerate dimensions.
  if (norm === 0) return raw;
  // x/1 leaves -0 impossible here (norm ≥ magnitude > 0 per component math),
  // but tiny components can still round to ±0 — normalize once more.
  return raw.map((v) => {
    const normalized = v / norm;
    return normalized === 0 ? 0 : normalized;
  });
}

/** Build the deterministic hash-projection provider for a configuration. */
export function createDeterministicHashEmbeddingProvider(
  config: EmbeddingConfig,
): EmbeddingProvider {
  const configHash = canonicalEmbeddingConfigHash(config);
  return {
    config,
    async embed(texts: readonly string[]): Promise<EmbeddingResult> {
      return {
        vectors: texts.map((text) => projectDeterministicVector(text, config.dimensions)),
        configHash,
        provider: config.provider,
      };
    },
  };
}
