// spec 38 §8 · Math gate — extends the falsifiability layer.
// When requireFormalVerification === true, the gate forces the falsifiability
// 判定 to UNTESTED unless the achieved math verification level >= L3_formal.
//
// Backward compatibility: requireFormalVerification defaults to false. When
// false, the gate is OFF — math verification is informational enrichment, not
// a blocking gate. The caller maps the MathGateResult to a Verdict.
//
// Model-neutrality: this file references NO model/provider. It does NOT import
// the standalone Verdict type (red-line safety); the caller maps the structured
// result to a Verdict.

import {
  derivedAchievedLevel,
  LEVEL_RANK,
  meetsRequiredLevel,
} from './math_claim.ts';
import type {
  MathClaim,
  MathVerificationRecord,
  VerificationLevel,
} from './math_claim.ts';

export interface MathGateInput {
  readonly claim: MathClaim;
  readonly verifications: readonly MathVerificationRecord[];
}

export interface MathGateResult {
  /** Whether the claim can be confirmed given the math verification state. */
  readonly canConfirm: boolean;
  /** Non-null when the gate forces UNTESTED (caller maps to Verdict='UNTESTED'). */
  readonly forcedUntestedReason: string | null;
  readonly achievedLevel: VerificationLevel | null;
  readonly meetsRequiredLevel: boolean;
  readonly requireFormalVerification: boolean;
}

/**
 * Evaluate the math gate for a claim.
 *
 * Rules (spec 38 §8):
 * - requireFormalVerification === false → gate OFF. canConfirm = true (backward
 *   compatible; math verification is enrichment, not blocking).
 * - requireFormalVerification === true → gate ON.
 *   - achievedLevel === null → canConfirm = false (no symbolic verification).
 *   - LEVEL_RANK[achievedLevel] < LEVEL_RANK[L3_formal] → canConfirm = false
 *     (formal level not reached).
 *   - Otherwise → canConfirm = true.
 * - In all cases, meetsRequiredLevel and achievedLevel are reported for
 *   transparency (honesty wall).
 */
export function canConfirmWithMathGate(input: MathGateInput): MathGateResult {
  const achievedLevel = derivedAchievedLevel(input.verifications);
  const meets = meetsRequiredLevel(achievedLevel, input.claim.requiredLevel);

  if (!input.claim.requireFormalVerification) {
    // Gate OFF — backward compatible. Math verification is informational.
    return {
      canConfirm: true,
      forcedUntestedReason: null,
      achievedLevel,
      meetsRequiredLevel: meets,
      requireFormalVerification: false,
    };
  }

  // Gate ON — require formal verification.
  const formalRank = LEVEL_RANK['L3_formal'];
  const achievedRank = achievedLevel === null ? 0 : LEVEL_RANK[achievedLevel];

  if (achievedLevel === null) {
    return {
      canConfirm: false,
      forcedUntestedReason: 'math_gate: requireFormalVerification=true but no symbolic verification was performed',
      achievedLevel,
      meetsRequiredLevel: meets,
      requireFormalVerification: true,
    };
  }

  if (achievedRank < formalRank) {
    return {
      canConfirm: false,
      forcedUntestedReason: `math_gate: requireFormalVerification=true but achievedLevel=${achievedLevel} < L3_formal`,
      achievedLevel,
      meetsRequiredLevel: meets,
      requireFormalVerification: true,
    };
  }

  return {
    canConfirm: true,
    forcedUntestedReason: null,
    achievedLevel,
    meetsRequiredLevel: meets,
    requireFormalVerification: true,
  };
}
