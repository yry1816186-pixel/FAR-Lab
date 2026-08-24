import type { ScientificClaim } from './claim.js';
import type { EvidenceStrength } from './evidence.js';

/**
 * SCIENCE lane (2026-08-24) — deterministic relation-strength assignment.
 *
 * Before this module, every production relation write point hard-coded
 * strength 'unrated', which maps to a [0,0] log10-LR interval for every
 * relation type: the formal layer (Σlog-LR bands, QBAF scores, Carneades
 * proof standards, ACH diagnosticity) then computed constants for every
 * live run. "Never fabricate a grade" was the right instinct; the honest
 * resolution is not "never grade" but "grade deterministically from the
 * measured claim properties, conservatively, and disclose the derivation".
 *
 * This mapping is PURE, total, offline-testable, and deliberately
 * conservative in the GRADE tradition:
 * - claims at the certainty floor (or ungraded) carry NO weight (unrated);
 * - unverified bindings carry NO weight (fail-closed, like the relation
 *   polarity gate);
 * - literature-derived evidence caps at 'moderate' — 'strong' is reserved
 *   for experiment-derived relations (executed results), never reachable
 *   from literature alone. Single-study literature evidence does not
 *   warrant a strong body rating.
 *
 * The full mapping (disclosed in every relation's uncertainties note):
 *   binding unverified / grade very_low or absent -> unrated
 *   grade high                                     -> moderate (literature cap)
 *   grade moderate + explicit quantities           -> moderate
 *   grade moderate (no quantities) / grade low     -> weak
 */

export const STRENGTH_DERIVATION_VERSION = 'deterministic-v1';

export interface RelationStrengthInput {
  /** The claim the relation is grounded in (either endpoint for claim-claim relations). */
  gradeCertainty: ScientificClaim['gradeCertainty'];
  /** bindingStatus === 'verified' (quote-grounded). Unverified bindings never carry weight. */
  bindingVerified: boolean;
  /** The claim text carries explicit quantities/effects (GRADE imprecision domain passed). */
  quantitative: boolean;
}

/**
 * Deterministic evidence strength from measured claim properties.
 * Exported for direct testing; the derivation string rides the relation's
 * uncertainties array so every displayed weight is auditable to its inputs.
 */
export const relationStrength = (
  input: RelationStrengthInput,
): { strength: EvidenceStrength; derivation: string } => {
  const { gradeCertainty, bindingVerified, quantitative } = input;
  const evidence = `strength-v1: binding=${bindingVerified ? 'verified' : 'unverified'}, grade=${gradeCertainty ?? 'ungraded'}, quantitative=${quantitative}`;
  if (!bindingVerified) {
    return { strength: 'unrated', derivation: `${evidence} -> unrated (unverified binding carries no weight)` };
  }
  switch (gradeCertainty) {
    case 'high':
      return { strength: 'moderate', derivation: `${evidence} -> moderate (literature cap; strong reserved for experimental evidence)` };
    case 'moderate':
      return quantitative
        ? { strength: 'moderate', derivation: `${evidence} -> moderate (quantitative claim at moderate certainty)` }
        : { strength: 'weak', derivation: `${evidence} -> weak (moderate certainty without explicit quantities)` };
    case 'low':
      return { strength: 'weak', derivation: `${evidence} -> weak (low certainty still earns the weakest nonzero weight)` };
    default:
      // 'very_low' or undefined: certainty floor — zero weight, never a fabricated grade.
      return { strength: 'unrated', derivation: `${evidence} -> unrated (certainty floor carries no weight)` };
  }
};

/**
 * Strength for a claim-claim relation (D-018 cross adjudication): a
 * contradiction/support between two claims is only as strong as its
 * WEAKER endpoint — a high-certainty claim conflicting with a floored
 * claim does not license a moderate-weight attack on the body.
 */
export const crossRelationStrength = (
  a: Pick<RelationStrengthInput, 'gradeCertainty' | 'bindingVerified' | 'quantitative'>,
  b: Pick<RelationStrengthInput, 'gradeCertainty' | 'bindingVerified' | 'quantitative'>,
): { strength: EvidenceStrength; derivation: string } => {
  const sa = relationStrength(a);
  const sb = relationStrength(b);
  const order: EvidenceStrength[] = ['unrated', 'weak', 'moderate', 'strong'];
  const weaker = order.indexOf(sa.strength) <= order.indexOf(sb.strength) ? sa : sb;
  return {
    strength: weaker.strength,
    derivation: `cross-relation takes the weaker endpoint: min(${sa.strength}, ${sb.strength}) — ${weaker.derivation}`,
  };
};
