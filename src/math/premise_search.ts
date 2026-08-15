// §6.2 · Premise search (LeanDojo ReProver style).
// Selects relevant premises (theorems/lemmas) for a formal proof attempt.
//
// Fresh-clone friendliness: mathlib is almost never available locally. When
// mathlib is unavailable, the search falls back to `local_verified_claims` —
// previously-verified math claims in the local database. The sourceAnchor is
// MANDATORY and records which source the premises came from.
//
// Model-neutrality: this file references NO model/provider.

import type { MathClaim } from './math_claim.ts';
/** Origin of a premise: from a mathlib library or from locally verified claims. */
export type PremiseSource = 'mathlib' | 'local_verified_claims';
/** A single premise (theorem/lemma) relevant to a formal proof attempt. */
export interface Premise {
  readonly name: string;
  readonly statement: string;
  readonly source: PremiseSource;
}
/** Input for premise search. Contains the query, local claims fallback,
 * and a mandatory source anchor for auditability. */
export interface PremiseSearchInput {
  readonly query: string;
  /** Previously-verified claims to search when mathlib is unavailable. */
  readonly localClaims: readonly MathClaim[];
  /** Override mathlib availability detection (for testing). Default: auto-detect. */
  readonly mathlibAvailableOverride?: boolean;
  /** Mandatory: fingerprint of the search context (git commit, timestamp, etc.). */
  readonly sourceAnchor: string;
}
/** Result of a premise search: the found premises, their source,
 * and whether mathlib was available. */
export interface PremiseSearchResult {
  readonly premises: readonly Premise[];
  readonly source: PremiseSource;
  readonly mathlibAvailable: boolean;
  readonly sourceAnchor: string;
  readonly query: string;
}

/**
 * Search for premises relevant to a formal proof attempt.
 *
 * Strategy:
 * 1. If mathlib is available → search mathlib (NOT implemented in core; would
 *    require LeanDojo integration — returns empty with a note).
 * 2. If mathlib is unavailable → search local_verified_claims by keyword match
 *    against naturalLanguage.
 *
 * The sourceAnchor is ALWAYS included in the result (mandatory per §6.2).
 */
export function searchPremises(input: PremiseSearchInput): PremiseSearchResult {
  if (input.sourceAnchor.length === 0) {
    throw new Error('premise_search: sourceAnchor is mandatory and must be non-empty');
  }

  const mathlibAvailable = input.mathlibAvailableOverride ?? false; // fresh-clone default: false

  if (mathlibAvailable) {
    // Mathlib search would require LeanDojo. Not implemented in core (would be
    // a runtime dependency — AGENTS §5). Return empty with honest note.
    return {
      premises: [],
      source: 'mathlib',
      mathlibAvailable: true,
      sourceAnchor: input.sourceAnchor,
      query: input.query,
    };
  }

  // Fallback: search local verified claims by keyword.
  const keywords = input.query.toLowerCase().split(/\s+/).filter((word) => word.length > 1);
  const premises: Premise[] = [];

  for (const claim of input.localClaims) {
    const text = claim.naturalLanguage.toLowerCase();
    const matchCount = keywords.filter((keyword) => text.includes(keyword)).length;
    if (matchCount > 0) {
      premises.push({
        name: claim.claimId,
        statement: claim.naturalLanguage,
        source: 'local_verified_claims',
      });
    }
  }

  // Sort by relevance (keyword match count) — stable sort preserves insertion order for ties.
  premises.sort((a, b) => {
    const countA = keywords.filter((keyword) => a.statement.toLowerCase().includes(keyword)).length;
    const countB = keywords.filter((keyword) => b.statement.toLowerCase().includes(keyword)).length;
    return countB - countA;
  });

  return {
    premises,
    source: 'local_verified_claims',
    mathlibAvailable: false,
    sourceAnchor: input.sourceAnchor,
    query: input.query,
  };
}
