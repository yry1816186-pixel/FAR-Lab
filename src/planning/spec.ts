// src/planning/spec.ts
// 职责：Spec 可验证规格门禁引擎（确定性纯函数）。
//
// 门禁（SPEC 阶段）：
//   1. story 非空（一句话故事）
//   2. Delta 至少一个变更声明（ADDED/MODIFIED/REMOVED 任一非空）
//   3. 验收标准 ≥ 3 条（OpenSpec 法则：≥3 可验证 AC）
//   4. 每条 AC 有验证方法（不可验证 = 阻塞）
//   5. AC id 唯一
//   6. trust-kernel 适配：delta 触及 trust-kernel 路径时，必须 additiveOnly=true
//      + cannotProveStatement 非空（AGENTS.md §7）
//   7. REMOVED 非空时必须提供 removedJustification（破坏性变更高门槛）

import type { Spec, SpecValidationResult, SpecViolation } from './types.ts';

/**
 * trust-kernel 路径前缀（AGENTS.md §7 高风险模块）。
 * 命中任一前缀即视为触及 trust-kernel。
 */
export const TRUST_KERNEL_PATHS: readonly string[] = [
  'src/falsifiability/',
  'src/evidence_log/',
  'src/fec/',
  'src/far_proof/',
  'src/proof_envelope/',
  'src/canonical/',
  'schema/migrations/',
];

/**
 * 校验 Spec。trustKernelPaths 可覆盖默认路径表（测试与自定义仓库布局用）。
 */
export function validateSpec(
  spec: Spec,
  trustKernelPaths: readonly string[] = TRUST_KERNEL_PATHS,
): SpecValidationResult {
  const violations: SpecViolation[] = [];

  // 1. story 非空（schema 已保证，双保险）
  if (spec.story.trim().length === 0) {
    violations.push({ code: 'EMPTY_STORY', message: 'spec story must not be empty' });
  }

  // 2. Delta 至少一个变更声明
  const deltaEntries = [
    ...spec.delta.added,
    ...spec.delta.modified,
    ...spec.delta.removed,
  ];
  if (deltaEntries.length === 0) {
    violations.push({
      code: 'EMPTY_DELTA',
      message: 'delta must declare at least one ADDED/MODIFIED/REMOVED entry (no fuzzy specs)',
    });
  }

  // 3. 验收标准 ≥ 3
  if (spec.acceptanceCriteria.length < 3) {
    violations.push({
      code: 'TOO_FEW_CRITERIA',
      message: `acceptance criteria must be >= 3, got ${spec.acceptanceCriteria.length} (OpenSpec law)`,
    });
  }

  // 4/5. 每条 AC 可验证 + id 唯一
  const seenIds = new Set<string>();
  for (const ac of spec.acceptanceCriteria) {
    if (ac.verification.trim().length === 0) {
      violations.push({
        code: 'CRITERION_NOT_VERIFIABLE',
        message: `acceptance criterion '${ac.id}' has no verification method`,
      });
    }
    if (seenIds.has(ac.id)) {
      violations.push({
        code: 'DUPLICATE_CRITERION_ID',
        message: `duplicate acceptance criterion id '${ac.id}'`,
      });
    }
    seenIds.add(ac.id);
  }

  // 6. trust-kernel 声明检查
  const touchesKernel = deltaEntries.some((entry) =>
    trustKernelPaths.some((prefix) => entry.startsWith(prefix)),
  );
  if (touchesKernel) {
    if (spec.trustKernel === undefined) {
      violations.push({
        code: 'TRUST_KERNEL_MISSING_DECLARATION',
        message:
          'delta touches trust-kernel paths; trustKernel declaration required (additiveOnly + cannotProveStatement, AGENTS.md §7)',
      });
    } else if (!spec.trustKernel.additiveOnly) {
      violations.push({
        code: 'TRUST_KERNEL_NOT_ADDITIVE',
        message: 'trust-kernel changes must be additiveOnly=true (decideFiveValueVerdictInternal byte-unchanged, AGENTS.md §7)',
      });
    }
  }

  // 7. REMOVED 破坏性变更高门槛
  if (spec.delta.removed.length > 0 && (spec.removedJustification ?? '').trim().length === 0) {
    violations.push({
      code: 'REMOVED_WITHOUT_JUSTIFICATION',
      message: `delta removes ${spec.delta.removed.length} item(s); removedJustification required (grep reference graph first)`,
    });
  }

  return { ok: violations.length === 0, violations };
}
