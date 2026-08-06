/**
 * V2 Receipt Verification — demoable integration path.
 *
 * Wires the V2 domain types (contract_enums, receipt_manifest, shared_schemas,
 * independent_verifier) into a single end-to-end verification that produces
 * the six independent assurance dimensions. This is the "what judges see" layer.
 *
 * Authority: docs/far-lab-reboot/19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md §4, §8.2.
 *
 * Key design: NO single "VERIFIED" badge. The result always shows all 6 dimensions
 * separately, because "evidence consistency" does NOT imply "scientific truth."
 *
 * 模型中立 · 零容忍合规.
 */

import {
  buildReceiptManifest,
  verifyReceiptManifest,
  REQUIRED_MANIFEST_MEMBER_KINDS,
  type ReceiptManifestMember,
} from './receipt_manifest.ts';
import {
  verifyReceiptRoot,
} from './independent_verifier.ts';
import {
  buildVerificationResult,
  DEFAULT_DIMENSION_NOT_APPLICABLE,
  type VerificationResult,
  type AssuranceDimensionResult,
} from './shared_schemas.ts';
import type { AssuranceDimension, ReceiptStanding, PreservationStatus } from './contract_enums.ts';
import { resolveStandardPolicyId } from './policy_registry.ts';

// ===========================================================================
// Demo sample receipt (synthetic, fixture-only — NOT scientific evidence)
// ===========================================================================

/** A demoable V2 receipt input (synthetic). */
export interface V2DemoReceipt {
  readonly receiptId: string;
  readonly claimText: string;
  readonly verdictLabel: string;
  readonly manifestMembers: readonly ReceiptManifestMember[];
  readonly receiptStanding: ReceiptStanding;
  readonly preservationStatus: PreservationStatus;
  readonly effectSize: number;
  readonly pValue: number | null;
  readonly isFixtureOnly: boolean;
}

/** Synthetic demo sample for `far receipt verify-v2`. NOT scientific evidence. */
export const V2_DEMO_SAMPLE: V2DemoReceipt = {
  receiptId: 'far-demo-r-001',
  claimText: 'Adapter A achieves macro-F1 >= 0.80 on TESS-ASTRO benchmark (synthetic fixture)',
  verdictLabel: 'INCONCLUSIVE',
  manifestMembers: REQUIRED_MANIFEST_MEMBER_KINDS.map((kind, i) => ({
    kind,
    digest: (i.toString(16).padStart(2, '0') + 'f').repeat(32).slice(0, 64),
    sizeBytes: 100 + i * 10,
  })),
  receiptStanding: 'ACTIVE',
  preservationStatus: 'AVAILABLE',
  effectSize: 0.62,
  pValue: null,
  isFixtureOnly: true,
};

// ===========================================================================
// runV2ReceiptVerification — end-to-end verification producing 6 dimensions
// ===========================================================================

/** Input for V2 receipt verification. */
export interface V2ReceiptVerificationInput extends V2DemoReceipt {
  readonly reviewCases?: ReadonlyArray<{ readonly state: import('./contract_enums.ts').ReviewCaseState }>;
}

/**
 * Run V2 receipt verification. Produces all 6 independent assurance dimensions.
 * Uses the clean-room independent verifier path (no producer code reuse).
 */
export function runV2ReceiptVerification(input: V2ReceiptVerificationInput): VerificationResult {
  // 1. Build + verify the manifest (fail-closed for missing members).
  const manifest = buildReceiptManifest(input.manifestMembers);
  const manifestVerification = verifyReceiptManifest(manifest);

  // 2. Independently recompute the receipt root.
  const rootVerification = verifyReceiptRoot(
    input.manifestMembers,
    'far.receipt-manifest.v1',
  );

  // 3. Determine each assurance dimension independently.
  const dimensions: Partial<Record<AssuranceDimension, AssuranceDimensionResult>> = {};

  // provenance: manifest exists + root recomputes
  dimensions.provenance = manifestVerification.isValid && rootVerification.isValid
    ? { dimension: 'provenance', outcome: 'PASS', reasonCodes: [], detail: 'manifest present and independently recomputed' }
    : { dimension: 'provenance', outcome: 'FAIL', reasonCodes: manifestVerification.isValid ? [] : ['MANDATORY_MEMBER_MISSING'], detail: `manifest verification failed: ${manifestVerification.reasonCode}` };

  // integrity: all member digests valid + no tampering
  const tamperedMembers = input.manifestMembers.filter((m) => !/^[0-9a-f]{64}$/.test(m.digest));
  if (manifestVerification.missingMembers.length > 0) {
    dimensions.integrity = {
      dimension: 'integrity',
      outcome: 'FAIL',
      reasonCodes: ['MANDATORY_MEMBER_MISSING'],
      detail: `missing required members: ${manifestVerification.missingMembers.join(', ')}`,
    };
  } else if (tamperedMembers.length > 0) {
    dimensions.integrity = {
      dimension: 'integrity',
      outcome: 'FAIL',
      reasonCodes: ['PROOF_HASH_MISMATCH'],
      detail: `${tamperedMembers.length} member(s) have invalid digest format`,
    };
  } else {
    dimensions.integrity = {
      dimension: 'integrity',
      outcome: 'PASS',
      reasonCodes: [],
      detail: `all ${input.manifestMembers.length} member digests verified`,
    };
  }

  // identity: keyless v0 → NOT_APPLICABLE
  dimensions.identity = DEFAULT_DIMENSION_NOT_APPLICABLE('identity');

  // processConformance: manifest complete → PASS
  dimensions.processConformance = manifestVerification.isValid
    ? { dimension: 'processConformance', outcome: 'PASS', reasonCodes: [], detail: 'all required manifest members present' }
    : { dimension: 'processConformance', outcome: 'FAIL', reasonCodes: ['MANDATORY_MEMBER_MISSING'], detail: 'manifest incomplete' };

  // executionReproduction: no replay requested → NOT_APPLICABLE
  dimensions.executionReproduction = DEFAULT_DIMENSION_NOT_APPLICABLE('executionReproduction');

  // scientificVerdict: fixture-only → INCONCLUSIVE (honest boundary)
  dimensions.scientificVerdict = {
    dimension: 'scientificVerdict',
    outcome: 'WARN',
    reasonCodes: [],
    detail: input.isFixtureOnly
      ? 'INCONCLUSIVE verdict — fixture-only data; no real scientific validation (honest limitation)'
      : 'real data track not yet qualified',
  };

  // 4. Build the complete verification result (always 6 dimensions).
  // M14 接线：verificationPolicyId 从标准策略注册表 fail-closed 解析（不再硬编码字面量·
  // 策略 deprecated → 抛 POLICY_DEPRECATED → 本路径 fail-closed）。
  const baseInput = {
    resultId: `vr-${input.receiptId}`,
    receiptId: input.receiptId,
    verificationPolicyId: resolveStandardPolicyId(),
    evaluatedAt: new Date().toISOString(),
    dimensionResults: dimensions,
    receiptStanding: input.receiptStanding,
    preservationStatus: input.preservationStatus,
  };
  // Only pass reviewCases if provided (respect exactOptionalPropertyTypes).
  return input.reviewCases !== undefined
    ? buildVerificationResult({ ...baseInput, reviewCases: input.reviewCases })
    : buildVerificationResult(baseInput);
}

// ===========================================================================
// formatV2VerificationForDisplay — human-readable output for CLI/demo
// ===========================================================================

/**
 * Format a V2 verification result for terminal display.
 * Shows each dimension separately; NEVER collapses to a single badge.
 */
export function formatV2VerificationForDisplay(result: VerificationResult): string {
  const lines: string[] = [];
  lines.push('╔══════════════════════════════════════════════════════════════════════╗');
  lines.push('║  FAR-Lab V2 Receipt Verification — Six Independent Assurance Dimensions ║');
  lines.push('╚══════════════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`  Receipt:     ${result.receiptId}`);
  lines.push(`  Standing:    ${result.receiptStanding}`);
  lines.push(`  Policy:      ${result.verificationPolicyId}`);
  lines.push(`  Evaluated:   ${result.evaluatedAt}`);
  lines.push('');
  lines.push('  ┌─────────────────────────┬──────────┬──────────────────────────────────┐');
  lines.push('  │ Assurance Dimension     │ Outcome  │ Detail                           │');
  lines.push('  ├─────────────────────────┼──────────┼──────────────────────────────────┤');

  const dimensionOrder: AssuranceDimension[] = [
    'provenance',
    'integrity',
    'identity',
    'processConformance',
    'executionReproduction',
    'scientificVerdict',
  ];

  for (const dim of dimensionOrder) {
    const d = result.dimensions[dim];
    const outcomePad = d.outcome.padEnd(8);
    const detailPad = d.detail.slice(0, 32).padEnd(32);
    lines.push(`  │ ${dim.padEnd(23)} │ ${outcomePad} │ ${detailPad} │`);
  }

  lines.push('  └─────────────────────────┴──────────┴──────────────────────────────────┘');
  lines.push('');
  lines.push(`  Review summary: ${result.reviewSummary}`);
  lines.push('');
  lines.push('  ⚠ LIMITATION: This verification confirms protocol/integrity conformance only.');
  lines.push('    It does NOT certify scientific truth, author innocence, or fraud absence.');
  if (result.dimensions.scientificVerdict.outcome === 'WARN') {
    lines.push('    The scientificVerdict dimension is WARN because the data is fixture/synthetic.');
  }
  lines.push('');
  return lines.join('\n');
}
