import type { StageContext } from '../types.js';
import type { ClaimId, EvidenceRelation, HypothesisCandidate, ScientificClaim } from '../../domain/index.js';
import { RELATION_POLARITY } from '../../domain/evidence.js';

/**
 * Small deterministic utilities shared by the hypothesis-group stages
 * (generate_hypotheses / critique_falsify / rank). No LLM involvement here:
 * everything in this module is pure bookkeeping over persisted domain objects.
 */

/** Marker appended to derivation.rationale of paraphrase-duplicate candidates. */
export const DUPLICATE_MARKER = 'duplicate-of-representative:';

/**
 * A candidate is a cluster representative iff it was not marked as a
 * paraphrase duplicate during clustering. Only representatives are
 * falsified and ranked; duplicates stay stored for provenance.
 */
export const isRepresentative = (h: Pick<HypothesisCandidate, 'derivation'>): boolean =>
  !h.derivation.rationale.includes(DUPLICATE_MARKER);

/** Structured cancellation checkpoint — the message prefix is what the orchestrator matches. */
export const assertNotCancelled = (ctx: StageContext, stage: string): void => {
  if (ctx.cancelled()) throw new Error(`cancelled by user during ${stage}`);
};

/** Minimal claim projection safe to serialize into model prompts. */
export const claimsForPrompt = (claims: readonly ScientificClaim[]): { id: string; text: string }[] =>
  claims.map((c) => ({ id: c.id, text: c.text }));

export interface ClaimBuckets {
  /** Verified claims not implicated in any counter/neutral-direction relation (default affirmative evidence). */
  supporting: ScientificClaim[];
  /** Claims implicated in counter-polarity relations (either side of a conflict) or only in neutral ones. */
  counter: ScientificClaim[];
}

/**
 * Deterministic direction split of the verified evidence base.
 *
 * EvidenceRelation polarity (RELATION_POLARITY) is the only signal available at
 * hypothesis-generation time:
 * - a claim on EITHER side (claimId or targetClaimId) of a counter-polarity relation
 *   (contradicts/weakens/fails_to_replicate/alternative_explanation) is counter-direction —
 *   conflicts are never averaged away, and the contested claim belongs with the conflict;
 * - a claim implicated only in neutral relations (qualifies/depends_on/derived_from/
 *   methodological_limitation/unknown) is counter-direction too (qualifies/unknown bucket);
 * - everything else is supports-direction (uncontested affirmative evidence).
 */
export const bucketClaims = (
  claims: readonly ScientificClaim[],
  relations: readonly EvidenceRelation[],
): ClaimBuckets => {
  const counterIds = new Set<string>();
  const neutralIds = new Set<string>();
  for (const rel of relations) {
    if (!rel.claimId) continue; // source-level relations carry no claim-direction signal
    const polarity = RELATION_POLARITY[rel.relation];
    const parties = [rel.claimId, rel.targetClaimId].filter((id): id is string => typeof id === 'string');
    for (const id of parties) {
      if (polarity === 'counter') counterIds.add(id);
      else if (polarity === 'neutral') neutralIds.add(id);
    }
  }
  const isCounter = (c: ScientificClaim) => counterIds.has(c.id) || neutralIds.has(c.id);
  return {
    supporting: claims.filter((c) => !isCounter(c)),
    counter: claims.filter(isCounter),
  };
};

export interface ClaimRefPartition {
  valid: ClaimId[];
  invalid: string[];
}

/**
 * Evidence references must point at claim ids that actually exist in this run.
 * Invalid references are dropped (never silently kept) and surfaced as warnings.
 */
export const partitionClaimRefs = (
  referenced: readonly string[],
  existing: ReadonlySet<string>,
): ClaimRefPartition => {
  const valid: ClaimId[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const id of referenced) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (existing.has(id)) valid.push(id as ClaimId);
    else invalid.push(id);
  }
  return { valid, invalid };
};

/** All persisted claim ids for the run — the existence oracle for reference filtering. */
export const runClaimIds = (ctx: StageContext): Set<string> =>
  new Set(ctx.store.listObjects('claim', ctx.run.id).map((c) => c.id));

/** Verified claims of the run (the only admissible conditioning base for generation). */
export const verifiedClaims = (ctx: StageContext): ScientificClaim[] =>
  ctx.store.listObjects('claim', ctx.run.id).filter((c) => c.bindingStatus === 'verified');
