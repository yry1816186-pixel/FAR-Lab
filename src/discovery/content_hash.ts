/**
 * discovery/content_hash — the scientific-content hash of a hypothesis.
 *
 * Leaf module (hasher only — no domain imports) so every consumer (registry,
 * research memory, fan-out dedup) shares ONE implementation with no import
 * cycles. Stable across packaging edits: covers the falsifiable CONTENT
 * (statement + mechanism + falsification method), not presentation.
 */

import { hashCanonicalJson } from '../evidence_log/hasher.ts';
import type { HypothesisCandidate } from '../research/types.ts';

/** sha256 over canonical {statement, mechanism, falsificationMethod}. */
export function hypothesisContentHash(candidate: HypothesisCandidate): string {
  return hashCanonicalJson({
    statement: candidate.statement,
    mechanism: candidate.mechanism,
    falsificationMethod: candidate.falsificationMethod,
  });
}
