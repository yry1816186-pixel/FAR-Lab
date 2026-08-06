/**
 * Policy/detector registry + affected-result index.
 *
 * Authority: docs/far-lab-reboot/19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md §4,
 *   WP-05 (executed policy/FEC binding).
 * Freeze: IMPL-014.
 *
 * When a policy/detector defect is found, it MUST deterministically enumerate
 * all affected receipts (no silent impact). Policy mutation triggers affected-result
 * search, freeze, correction/supersession, and rerun under a new version.
 *
 * 模型中立 · 零容忍合规.
 */

import { createHash } from 'node:crypto';
import { canonicalJson } from '../evidence_log/hasher.ts';
import type { AssuranceDimension } from './contract_enums.ts';

// ===========================================================================
// Versioned policy
// ===========================================================================

/** A versioned verification policy (doc19 §4). */
export interface VersionedPolicy {
  readonly policyId: string;
  readonly version: number;
  readonly digest: string;
  readonly requiredDimensions: readonly AssuranceDimension[];
  readonly deprecated: boolean;
  readonly successorPolicyId?: string;
}

/** A receipt's binding to a policy. */
export interface ReceiptPolicyBinding {
  readonly receiptId: string;
  readonly policyId: string;
  readonly version: number;
}

// ===========================================================================
// Policy registry
// ===========================================================================

/** Policy registry with digest. */
export interface PolicyRegistry {
  readonly policies: readonly VersionedPolicy[];
  readonly registryDigest: string;
  readonly resolveLatest: (policyId: string) => VersionedPolicy | undefined;
}

/** Build a policy registry. Rejects duplicate policyId+version pairs. */
export function buildPolicyRegistry(policies: readonly VersionedPolicy[]): PolicyRegistry {
  const seen = new Set<string>();
  for (const p of policies) {
    const key = `${p.policyId}@${p.version}`;
    if (seen.has(key)) {
      throw new Error(
        `POLICY_DUPLICATE: ${key} appears more than once in registry`,
      );
    }
    seen.add(key);
  }
  const sorted = [...policies].sort((a, b) => {
    const idCmp = a.policyId.localeCompare(b.policyId);
    return idCmp !== 0 ? idCmp : a.version - b.version;
  });
  const registryDigest = createHash('sha256')
    .update(canonicalJson(sorted, 'buildPolicyRegistry'), 'utf8')
    .digest('hex');

  // Build latest-version lookup: for each policyId, find the highest non-deprecated version.
  const latestMap = new Map<string, VersionedPolicy>();
  for (const p of sorted) {
    if (p.deprecated) {
      continue;
    }
    const existing = latestMap.get(p.policyId);
    if (!existing || p.version > existing.version) {
      latestMap.set(p.policyId, p);
    }
  }
  const resolveLatest = (policyId: string): VersionedPolicy | undefined => latestMap.get(policyId);

  return Object.freeze({ policies: sorted, registryDigest, resolveLatest });
}

// ===========================================================================
// assertPolicyApplicable — fail-closed
// ===========================================================================

/** Result of policy applicability check. */
export interface PolicyApplicabilityResult {
  readonly isApplicable: boolean;
  readonly reasonCode: string;
}

/**
 * Assert that a policy is applicable (registered, non-deprecated).
 * @throws POLICY_UNKNOWN if not in registry.
 * @throws POLICY_DEPRECATED if the policy version is marked deprecated.
 */
export function assertPolicyApplicable(
  registry: PolicyRegistry,
  policyId: string,
  version: number,
): PolicyApplicabilityResult {
  const policy = registry.policies.find(
    (p) => p.policyId === policyId && p.version === version,
  );
  if (!policy) {
    throw new Error(
      `POLICY_UNKNOWN: ${policyId}@${version} is not in the registry`,
    );
  }
  if (policy.deprecated) {
    throw new Error(
      `POLICY_DEPRECATED: ${policyId}@${version} is deprecated; use successor ${policy.successorPolicyId ?? '(none declared)'}`,
    );
  }
  return { isApplicable: true, reasonCode: 'POLICY_APPLICABLE' };
}

// ===========================================================================
// findAffectedReceipts — defect impact enumeration
// ===========================================================================

/**
 * Find all receipts bound to a specific (defective) policy version.
 * This is the affected-result index (doc19 WP-05, IMPL-014).
 * Returns receipt IDs that must be reviewed/corrected/superseded.
 */
export function findAffectedReceipts(
  bindings: readonly ReceiptPolicyBinding[],
  defectivePolicyId: string,
  defectiveVersion: number,
): readonly string[] {
  return bindings
    .filter(
      (b) => b.policyId === defectivePolicyId && b.version === defectiveVersion,
    )
    .map((b) => b.receiptId);
}
