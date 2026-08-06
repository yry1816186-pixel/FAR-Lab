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
 * M14 接线（2026-08-06）：标准验证策略注册表（buildStandardPolicyRegistry +
 * resolveStandardPolicyId）接入 verify/export 生产路径——verificationPolicyId 不再
 * 硬编码字符串，改从注册表 resolveLatest + assertPolicyApplicable fail-closed 解析。
 * 语义（WP-05）：策略被 deprecated → assertPolicyApplicable 抛 POLICY_DEPRECATED →
 * verify/export fail-closed（无静默降级）。
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

// ===========================================================================
// 标准验证策略（M14 接线·verify/export 生产路径默认策略）
// ===========================================================================

/** 标准验证策略 ID（doc19 §4·与既有 'far.policy.standard-v0.v1' 字面量同值）。 */
export const STANDARD_POLICY_ID = 'far.policy.standard-v0';

/** 标准验证策略版本（当前 v1）。 */
export const STANDARD_POLICY_VERSION = 1;

/** 六维 assurance 全维度（标准策略 requiredDimensions·doc19 §4）。 */
export const STANDARD_POLICY_DIMENSIONS: readonly AssuranceDimension[] = [
  'provenance',
  'integrity',
  'identity',
  'processConformance',
  'executionReproduction',
  'scientificVerdict',
];

/**
 * 标准验证策略 v1（确定性构造·digest 由 canonicalJson 重算·防策略漂移）。
 *
 * digest 语义：policy 级内容锚（覆盖 policyId/version/requiredDimensions）——
 * 策略定义变更 → digest 变化 → registryDigest 变化 → 绑定旧策略的收据可追溯受影响
 * （findAffectedReceipts 枚举·WP-05）。
 */
export function standardPolicyV1(): VersionedPolicy {
  return {
    policyId: STANDARD_POLICY_ID,
    version: STANDARD_POLICY_VERSION,
    digest: createHash('sha256')
      .update(
        canonicalJson(
          {
            policyId: STANDARD_POLICY_ID,
            version: STANDARD_POLICY_VERSION,
            requiredDimensions: STANDARD_POLICY_DIMENSIONS,
          },
          'standardPolicyV1',
        ),
        'utf8',
      )
      .digest('hex'),
    requiredDimensions: [...STANDARD_POLICY_DIMENSIONS],
    deprecated: false,
  };
}

/**
 * 构建标准策略注册表（含 1 条标准策略·resolveLatest + registryDigest 就绪）。
 */
export function buildStandardPolicyRegistry(): PolicyRegistry {
  return buildPolicyRegistry([standardPolicyV1()]);
}

/**
 * 解析标准策略的 qualified id（`far.policy.standard-v0.v1` 形态·M14 生产接线）。
 *
 * fail-closed：标准策略不在注册表 → POLICY_UNKNOWN；已 deprecated →
 * assertPolicyApplicable 抛 POLICY_DEPRECATED。调用方（verify/export 路径）用返回值
 * 填充 verificationPolicyId，保证策略状态变更时验证/导出不再静默沿用旧策略。
 *
 * @throws Error POLICY_UNKNOWN / POLICY_DEPRECATED（禁静默降级）
 */
export function resolveStandardPolicyId(): string {
  const registry = buildStandardPolicyRegistry();
  const policy = registry.resolveLatest(STANDARD_POLICY_ID);
  if (policy === undefined) {
    throw new Error(
      `POLICY_UNKNOWN: ${STANDARD_POLICY_ID} missing from standard policy registry`,
    );
  }
  assertPolicyApplicable(registry, STANDARD_POLICY_ID, policy.version);
  return `${policy.policyId}.v${policy.version}`;
}
