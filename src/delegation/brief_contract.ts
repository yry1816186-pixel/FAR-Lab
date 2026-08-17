// src/delegation/brief_contract.ts
// 职责：AGENT-BRIEF / AGENT-WRITE / AGENT-VERIFY —— 子代理委派合同三件套的机器化。
//
// 宪法三规则（DOMAIN_PROTOCOLS.md E 节）：
//   AGENT-BRIEF-001：Brief 至少 9 字段（objective/Context Pack/requirement IDs/allowed
//     write set/forbidden files+actions/evidence expectation/commands+acceptance/
//     return schema/stop+escalation）。**写委派必须合同完整——不完整合同不得委派写操作**。
//   AGENT-WRITE-001：读可并行，写单一 owner。同文件/同状态不得多 Agent 无协调并发写；
//     写前查 worktree/branch ownership；冲突时停写不盲覆盖。
//   AGENT-VERIFY-001：子 Agent 不得自证完成。协调者复核 diff/关键命令/证据源/边界影响；
//     无 coordinator verification receipt → 状态保持 IMPLEMENTED_UNVERIFIED。
//
// Cannot-prove：本层证明「委派合同结构完整、写所有权无冲突、无收据不得宣称 DONE」的
// 机器可检部分；不证明子代理实际遵守了合同边界（那是 diff 审查与 write-set 对拍的事，
// 由 verifyDelegation 的 receipt 字段承载人工/机检混合证据）。

import { z } from 'zod';

import { RISK_LEVELS } from '../planning/types.ts';

// ---------------------------------------------------------------------------
// AGENT-BRIEF-001：九字段委派合同
// ---------------------------------------------------------------------------

export const DelegationBriefSchema = z.object({
  /** 委派 ID（delegation record 引用键）。 */
  briefId: z.string().min(1),
  /** 目标（要解决的真实问题，≤ 一行）。 */
  objective: z.string().min(1),
  /** Context Pack：子代理需要的前置事实（checkpoint/ADR/相关文件引用）。 */
  contextPack: z.array(z.string().min(1)).min(1),
  /** 关联宪法需求 ID。 */
  requirementIds: z.array(z.string().min(1)).min(1),
  /** 允许写入集（空 = 只读委派；非空 = 写委派，触发完整合同门）。 */
  allowedWriteSet: z.array(z.string().min(1)),
  /** 禁止文件。 */
  forbiddenFiles: z.array(z.string().min(1)),
  /** 禁止动作（P4 红线必须显式列入——写委派的硬约束）。 */
  forbiddenActions: z.array(z.string().min(1)),
  /** 证据期望（返回什么才算数：命令输出/文件/测试名）。 */
  evidenceExpectation: z.string().min(1),
  /** 验收命令（协调者复核时重跑的锚点）。 */
  acceptanceCommands: z.array(z.string().min(1)).min(1),
  /** 返回 schema 声明（结果必须可绑定：字段名 + 类型描述）。 */
  returnSchema: z.array(
    z.object({
      field: z.string().min(1),
      type: z.string().min(1),
      description: z.string().min(1),
    }),
  ).min(1),
  /** 停止/升级条件（何时停下交回协调者）。 */
  stopConditions: z.array(z.string().min(1)).min(1),
  /** 升级联系人/方式（stop 后找谁）。 */
  escalation: z.string().min(1),
  /** 风险级（§12 P0-P4）。 */
  risk: z.enum(RISK_LEVELS),
});

export type DelegationBrief = z.infer<typeof DelegationBriefSchema>;

/** P4 红线动作（写委派的 forbiddenActions 必须全部显式包含）。 */
export const P4_FORBIDDEN_DEFAULTS: readonly string[] = [
  'git-push',
  'git-tag',
  'pr-merge',
  'release-publish',
  'deploy',
  'migration-edit',
  'history-rewrite',
];

export interface BriefViolation {
  readonly code: BriefViolationCode;
  readonly message: string;
}

export type BriefViolationCode =
  | 'WRITE_DELEGATION_WITHOUT_FULL_CONTRACT'
  | 'WRITE_DELEGATION_MISSING_P4_FORBIDDEN'
  | 'SCOPE_SELF_CONTRADICTION';

export interface BriefValidationResult {
  readonly ok: boolean;
  readonly violations: readonly BriefViolation[];
  /** 只读委派（allowedWriteSet 空）= 可并行，无需所有权协调。 */
  readonly readOnly: boolean;
}

/**
 * 校验委派合同（AGENT-BRIEF-001 语义门）。
 * 写委派的硬规则：不完整合同不得委派写操作（Failure 分支 fail-closed）。
 */
export function validateDelegationBrief(brief: DelegationBrief): BriefValidationResult {
  const violations: BriefViolation[] = [];
  const readOnly = brief.allowedWriteSet.length === 0;

  if (!readOnly) {
    // 写委派：P4 红线必须全部显式禁止
    const declared = new Set(brief.forbiddenActions);
    const missing = P4_FORBIDDEN_DEFAULTS.filter((a) => !declared.has(a));
    if (missing.length > 0) {
      violations.push({
        code: 'WRITE_DELEGATION_MISSING_P4_FORBIDDEN',
        message: `write delegation must explicitly forbid all P4 actions; missing: ${missing.join(', ')}`,
      });
    }
    // 写委派：forbiddenFiles 与 allowedWriteSet 不得同条目（自相矛盾）
    const allowed = new Set(brief.allowedWriteSet);
    for (const f of brief.forbiddenFiles) {
      if (allowed.has(f)) {
        violations.push({
          code: 'SCOPE_SELF_CONTRADICTION',
          message: `path '${f}' in both allowedWriteSet and forbiddenFiles`,
        });
      }
    }
  }

  // 九字段完备性由 zod 保证（min 约束）；本函数承载语义互斥规则
  return { ok: violations.length === 0, violations, readOnly };
}

// ---------------------------------------------------------------------------
// 委派结果（可绑定到任务与证据）
// ---------------------------------------------------------------------------

export const DelegationResultSchema = z.object({
  briefId: z.string().min(1),
  /** DONE 只有在获得协调者收据后才成立（见 AGENT-VERIFY-001）；子代理自报值。 */
  selfReportedStatus: z.enum(['DONE', 'IMPLEMENTED_UNVERIFIED', 'BLOCKED']),
  /** 证据引用（命令输出锚点/文件/测试名——DONE 必须非空，schema 外由 verify 强制）。 */
  evidenceRefs: z.array(z.string().min(1)).default([]),
  /** 声称写入的文件（对拍 allowedWriteSet）。 */
  filesWritten: z.array(z.string().min(1)).default([]),
});

export type DelegationResult = z.infer<typeof DelegationResultSchema>;

// ---------------------------------------------------------------------------
// AGENT-WRITE-001：写所有权（读并行，写单一 owner）
// ---------------------------------------------------------------------------

export interface OwnershipClaim {
  /** 仓库相对路径（精确或目录前缀，同 writeSetAllows 语义）。 */
  readonly path: string;
  readonly owner: string;
  /** 声明时的基线分支 HEAD（写前 staleness 检查）。 */
  readonly baseHead: string;
}

export interface WriteCollision {
  readonly path: string;
  readonly owners: readonly string[];
}

export interface OwnershipCheckResult {
  readonly ok: boolean;
  readonly collisions: readonly WriteCollision[];
  /** baseHead 落后于 currentHead 的声明（写前必须 rebase/复核，停写不盲写）。 */
  readonly staleClaims: readonly OwnershipClaim[];
}

/** 两个路径是否重叠（精确相等或目录前缀包含——同文件或同子树即冲突）。 */
export function pathsOverlap(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.endsWith('/**')) return b.startsWith(a.slice(0, -2));
  if (b.endsWith('/**')) return a.startsWith(b.slice(0, -2));
  if (a.endsWith('/')) return b.startsWith(a);
  if (b.endsWith('/')) return a.startsWith(b);
  return false;
}

/**
 * 写前所有权检查：同一路径多 owner = 冲突（fail：停写）；baseHead ≠ currentHead = stale
 * （写前必须复核）。宪法：冲突时优先停止写而非盲目覆盖。
 */
export function checkWriteOwnership(
  claims: readonly OwnershipClaim[],
  currentHead: string,
): OwnershipCheckResult {
  const collisionGroups: { path: string; owners: Set<string> }[] = [];

  for (let i = 0; i < claims.length; i += 1) {
    for (let j = i + 1; j < claims.length; j += 1) {
      const a = claims[i] as OwnershipClaim;
      const b = claims[j] as OwnershipClaim;
      if (a.owner !== b.owner && pathsOverlap(a.path, b.path)) {
        const existing = collisionGroups.find(
          (g) => pathsOverlap(g.path, a.path) || pathsOverlap(g.path, b.path),
        );
        if (existing !== undefined) {
          existing.owners.add(a.owner);
          existing.owners.add(b.owner);
        } else {
          collisionGroups.push({ path: a.path, owners: new Set([a.owner, b.owner]) });
        }
      }
    }
  }

  const staleClaims: OwnershipClaim[] = [];
  for (const c of claims) {
    if (c.baseHead !== currentHead) staleClaims.push(c);
  }

  return {
    ok: collisionGroups.length === 0 && staleClaims.length === 0,
    collisions: collisionGroups.map((g) => ({ path: g.path, owners: [...g.owners] })),
    staleClaims,
  };
}

// ---------------------------------------------------------------------------
// AGENT-VERIFY-001：协调者验证收据（子代理不得自证完成）
// ---------------------------------------------------------------------------

export const VERIFICATION_CHECK_KINDS = [
  'diff-inspected',
  'command-rerun',
  'evidence-source-checked',
  'boundary-impact-checked',
] as const;
export type VerificationCheckKind = (typeof VERIFICATION_CHECK_KINDS)[number];

export const CoordinatorReceiptSchema = z.object({
  briefId: z.string().min(1),
  checks: z
    .array(
      z.object({
        kind: z.enum(VERIFICATION_CHECK_KINDS),
        item: z.string().min(1),
        pass: z.boolean(),
      }),
    )
    .min(1),
  /** 低风险重复项抽样的方法声明（存在抽样时必填——宪法要求说明抽样方法）。 */
  sampleMethod: z.string().min(1).nullable().default(null),
  verdict: z.enum(['VERIFIED', 'IMPLEMENTED_UNVERIFIED', 'BLOCKED']),
});

export type CoordinatorReceipt = z.infer<typeof CoordinatorReceiptSchema>;

export interface VerifyOutcome {
  /** 子代理的真实状态：无收据/收据未过 → 一律 IMPLEMENTED_UNVERIFIED（宪法 Failure 分支）。 */
  readonly effectiveStatus: 'DONE' | 'IMPLEMENTED_UNVERIFIED' | 'BLOCKED';
  readonly reason: string;
}

/**
 * 协调者裁决：DONE 需同时满足——
 *   1. 自报 DONE；
 *   2. evidenceRefs 非空（无证据的 DONE 是断言）；
 *   3. 存在协调者收据且 verdict=VERIFIED 且四类检查至少各一、全 pass；
 *   4. 收据声明了抽样时必须给出抽样方法。
 */
export function adjudicateDelegation(
  result: DelegationResult,
  receipt: CoordinatorReceipt | null,
): VerifyOutcome {
  if (result.selfReportedStatus === 'BLOCKED') {
    return { effectiveStatus: 'BLOCKED', reason: 'sub-agent self-reported BLOCKED' };
  }
  if (result.selfReportedStatus === 'IMPLEMENTED_UNVERIFIED') {
    return { effectiveStatus: 'IMPLEMENTED_UNVERIFIED', reason: 'sub-agent self-reported IMPLEMENTED_UNVERIFIED' };
  }

  // 自报 DONE 之后的降级链
  if (result.evidenceRefs.length === 0) {
    return { effectiveStatus: 'IMPLEMENTED_UNVERIFIED', reason: 'DONE without evidenceRefs — assertion, not evidence' };
  }
  if (receipt === null) {
    return { effectiveStatus: 'IMPLEMENTED_UNVERIFIED', reason: 'no coordinator receipt — sub-agent cannot self-certify (AGENT-VERIFY-001)' };
  }
  if (receipt.briefId !== result.briefId) {
    return { effectiveStatus: 'IMPLEMENTED_UNVERIFIED', reason: `receipt briefId mismatch: ${receipt.briefId} vs ${result.briefId}` };
  }
  const failed = receipt.checks.filter((c) => !c.pass);
  if (receipt.verdict !== 'VERIFIED' || failed.length > 0) {
    return { effectiveStatus: 'IMPLEMENTED_UNVERIFIED', reason: `receipt not VERIFIED (${receipt.verdict}, ${failed.length} failed check(s))` };
  }
  const kinds = new Set(receipt.checks.map((c) => c.kind));
  const missingKinds = VERIFICATION_CHECK_KINDS.filter((k) => !kinds.has(k));
  if (missingKinds.length > 0) {
    return { effectiveStatus: 'IMPLEMENTED_UNVERIFIED', reason: `receipt missing check kinds: ${missingKinds.join(', ')}` };
  }
  if (receipt.sampleMethod === null && receipt.checks.some((c) => c.item.startsWith('sampled:'))) {
    return { effectiveStatus: 'IMPLEMENTED_UNVERIFIED', reason: 'sampled items present but sampleMethod undeclared' };
  }
  return { effectiveStatus: 'DONE', reason: 'coordinator-verified with full check coverage' };
}
