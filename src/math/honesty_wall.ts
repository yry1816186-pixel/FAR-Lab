// spec 38 §8 · Honesty wall for the math verification layer.
// Renders a transparent boundary showing:
//   - requiredLevel vs achievedLevel
//   - each verification record with backend fingerprint and outcome
//   - whether the formal gate was satisfied
//   - clear statements about what was and was NOT verified
//
// Model-neutrality: this file references NO model/provider.

import { derivedAchievedLevel, meetsRequiredLevel } from './math_claim.ts';
import type {
  MathClaim,
  MathVerificationRecord,
  VerificationLevel,
} from './math_claim.ts';

export const MATH_VERIFICATION_BOUNDARY = 'math_verification_boundary';

export interface HonestyWallInput {
  readonly claim: MathClaim;
  readonly verifications: readonly MathVerificationRecord[];
}

export interface HonestyWallRender {
  readonly boundary: typeof MATH_VERIFICATION_BOUNDARY;
  readonly text: string;
  readonly achievedLevel: VerificationLevel | null;
  readonly meetsRequiredLevel: boolean;
  readonly verificationCount: number;
  readonly hasDisabledBackends: boolean;
}

/**
 * Render the math verification honesty wall.
 * The output is a multi-line string suitable for display in CLI / UI / reports.
 */
export function renderMathHonestyWall(input: HonestyWallInput): HonestyWallRender {
  const achieved = derivedAchievedLevel(input.verifications);
  const meets = meetsRequiredLevel(achieved, input.claim.requiredLevel);
  const hasDisabled = input.verifications.some(
    (record) => record.compileLog === 'backend_disabled',
  );

  const lines: string[] = [];
  lines.push('=== Math Verification Boundary ===');
  lines.push(`Claim: ${input.claim.naturalLanguage}`);
  lines.push(`Kind: ${input.claim.claimKind}`);
  lines.push(`Required level: ${input.claim.requiredLevel}`);
  lines.push(`Expected outcome: ${input.claim.expectedOutcome}`);
  lines.push(`Require formal verification: ${input.claim.requireFormalVerification}`);
  lines.push(`Achieved level: ${achieved ?? 'none (no symbolic verification performed)'}`);
  lines.push(`Meets required level: ${meets}`);
  lines.push('');
  lines.push(`Verifications (${input.verifications.length} total):`);

  if (input.verifications.length === 0) {
    lines.push('  (none — claim has not been verified by any backend)');
  } else {
    for (const record of input.verifications) {
      const disabled = record.compileLog === 'backend_disabled' ? ' [DISABLED]' : '';
      lines.push(`  - ${record.backendId} (${record.backendKind}): ${record.outcome}${disabled}`);
      lines.push(`    input_hash: ${record.inputHash}`);
      if (record.compileLog !== null && record.compileLog !== 'backend_disabled') {
        const truncated = record.compileLog.length > 120
          ? record.compileLog.slice(0, 120) + '...'
          : record.compileLog;
        lines.push(`    log: ${truncated}`);
      }
    }
  }

  lines.push('');
  if (hasDisabled) {
    lines.push('WARNING: one or more backends were DISABLED (outcome=unknown).');
    lines.push('Install SymPy/Z3/Lean4/Dafny to enable full verification.');
  }
  if (!meets) {
    lines.push(`NOTE: achieved level does not meet required level (${input.claim.requiredLevel}).`);
    lines.push('The claim should NOT be marked as fully verified.');
  }
  if (input.claim.requireFormalVerification && (achieved === null || achieved !== 'L3_formal')) {
    lines.push('GATE: requireFormalVerification=true but L3_formal not achieved.');
    lines.push('The falsifiability 判定 should be forced to UNTESTED.');
  }

  return {
    boundary: MATH_VERIFICATION_BOUNDARY,
    text: lines.join('\n'),
    achievedLevel: achieved,
    meetsRequiredLevel: meets,
    verificationCount: input.verifications.length,
    hasDisabledBackends: hasDisabled,
  };
}
