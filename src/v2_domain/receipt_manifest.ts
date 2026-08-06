/**
 * Receipt V2 Mandatory Manifest + All-Member Digests.
 *
 * Authority: docs/far-lab-reboot/19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md §3.3,
 *   17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md §2.
 * Closes: IRG-007 (mandatory manifest), IRG-004 (all-member digests).
 *
 * The manifest is the fail-closed authority. A receipt without a manifest, or with
 * a manifest missing a required member, MUST fail verification — never silently downgrade.
 * This implements doc19 VS-02/VS-03 (required component byte flip / manifest removed →
 * hard downgrade failure; no legacy auto-detection).
 *
 * 模型中立 · 零容忍合规: 无 any / @ts-ignore / 空 catch. 全 readonly.
 */

import { createHash } from 'node:crypto';
import { canonicalJson } from '../evidence_log/hasher.ts';
import { compareStringsDeterministic } from '../evidence_log/hasher.ts';

// ===========================================================================
// Required member kinds
// ===========================================================================

/**
 * Required manifest member kinds (doc17 §2). Every receipt MUST include a digest
 * for each of these. Absence = verification failure, never silent downgrade.
 */
export const REQUIRED_MANIFEST_MEMBER_KINDS = [
  'claim',
  'fecSnapshot',
  'protocolFreeze',
  'datasetBindings',
  'workflowBindings',
  'experimentRuns',
  'measurementResults',
  'statisticalResults',
  'verdictTrace',
  'antiTheaterReport',
  'ledgerRoot',
] as const;
/** Type alias: manifest member kind. */
export type ReceiptManifestMemberKind = (typeof REQUIRED_MANIFEST_MEMBER_KINDS)[number];

// ===========================================================================
// Types
// ===========================================================================

/** A single manifest member: one required component's digest + size. */
export interface ReceiptManifestMember {
  readonly kind: ReceiptManifestMemberKind;
  readonly digest: string;       // 64-hex sha256
  readonly sizeBytes: number;
}

/** A complete receipt manifest: sorted members + root digest. */
export interface ReceiptManifest {
  readonly members: readonly ReceiptManifestMember[];
  readonly rootDigest: string;   // sha256(canonical_json(sorted members))
  readonly requiredMemberCount: number;
  readonly schemaVersion: 'far.receipt-manifest.v1';
}

/** Result of verifying a manifest against required-member rules. */
export interface ReceiptManifestVerification {
  readonly isValid: boolean;
  readonly missingMembers: readonly ReceiptManifestMemberKind[];
  readonly invalidDigestMembers: readonly ReceiptManifestMemberKind[];
  readonly duplicateKinds: readonly ReceiptManifestMemberKind[];
  readonly reasonCode: 'MANIFEST_VALID' | 'MANDATORY_MEMBER_MISSING' | 'MANIFEST_DIGEST_INVALID' | 'DUPLICATE_KIND';
}

// ===========================================================================
// buildReceiptManifest
// ===========================================================================

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * Build a receipt manifest from member entries.
 * Members are sorted by kind (deterministic) and a root digest is computed.
 * This function does NOT validate completeness — use verifyReceiptManifest for that.
 */
export function buildReceiptManifest(
  members: readonly ReceiptManifestMember[],
): ReceiptManifest {
  // Sort by kind deterministically (code-unit order, locale-independent).
  const sorted = [...members].sort((a, b) => compareStringsDeterministic(a.kind, b.kind));

  const rootDigest = createHash('sha256')
    .update(canonicalJson(sorted, 'buildReceiptManifest'), 'utf8')
    .digest('hex');

  return Object.freeze({
    members: sorted,
    rootDigest,
    requiredMemberCount: REQUIRED_MANIFEST_MEMBER_KINDS.length,
    schemaVersion: 'far.receipt-manifest.v1' as const,
  });
}

// ===========================================================================
// verifyReceiptManifest — fail-closed
// ===========================================================================

/**
 * Verify a receipt manifest against mandatory-member rules.
 * Fail-closed: any missing required member, invalid digest, or duplicate kind
 * makes the manifest invalid. Never silently downgrade.
 *
 * doc19 VS-02/VS-03: manifest removed or required member stripped → hard failure.
 */
export function verifyReceiptManifest(manifest: ReceiptManifest): ReceiptManifestVerification {
  const seenKinds = new Set<string>();
  const duplicateKinds: ReceiptManifestMemberKind[] = [];
  const invalidDigestMembers: ReceiptManifestMemberKind[] = [];

  for (const member of manifest.members) {
    // Duplicate detection.
    if (seenKinds.has(member.kind)) {
      duplicateKinds.push(member.kind);
    }
    seenKinds.add(member.kind);

    // Digest format validation.
    if (!HEX64.test(member.digest)) {
      invalidDigestMembers.push(member.kind);
    }
  }

  // Missing required member detection.
  const missingMembers = REQUIRED_MANIFEST_MEMBER_KINDS.filter(
    (kind) => !seenKinds.has(kind),
  );

  // Determine validity + reason code (priority: missing > invalid > duplicate > valid).
  let isValid = true;
  let reasonCode: ReceiptManifestVerification['reasonCode'] = 'MANIFEST_VALID';

  if (missingMembers.length > 0) {
    isValid = false;
    reasonCode = 'MANDATORY_MEMBER_MISSING';
  } else if (invalidDigestMembers.length > 0) {
    isValid = false;
    reasonCode = 'MANIFEST_DIGEST_INVALID';
  } else if (duplicateKinds.length > 0) {
    isValid = false;
    reasonCode = 'DUPLICATE_KIND';
  }

  return Object.freeze({
    isValid,
    missingMembers,
    invalidDigestMembers,
    duplicateKinds,
    reasonCode,
  });
}
