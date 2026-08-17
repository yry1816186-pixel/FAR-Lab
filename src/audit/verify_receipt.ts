// src/audit/verify_receipt.ts
// 职责：ENG-AUDIT-001 —— 统一审计验证收据（跨链聚合 + 锚点轮换 + 高风险 fail-closed）。
//
// 现状衔接：仓库已有六条 append-only 哈希链（campaign 台账 / orchestration 决策账 /
// 操作审计账 / stage 收据链 / guard 事件账 / discovery 注册链）——各自有验证器但
// 相互不知情，无统一「audit verify receipt」（宪法 Evidence 面要求的工件），无
// 轮换（rotation）机制，无「审计失败时高风险操作 fail-closed」的统一策略。
//
// 本模块三层：
//   1. 跨链聚合：N 条链各自验证 → 统一收据（逐链 count/valid/firstBroken/reason +
//      收据自身内容哈希——收据可被第三方复核）。
//   2. 锚点轮换：rotateChainAnchor(oldHead, reason) 产轮换事件（携带旧链头哈希），
//      新链 prevHash = hash(轮换事件)——验证跨轮换边界 = 旧链验证 + 轮换链接校验 +
//      新链验证（无静默历史切断）。
//   3. 高风险门：auditFailurePolicy——任一链 invalid 时高风险操作（发布/合并/删除/
//      外部副作用）一律拒绝（宪法原文 fail-closed 分支）。
//
// Cannot-prove：收据证明「验证时刻各链哈希完整」；不证明验证时刻之后的完整性
//（时点性证明）。链条语义（事件内容为真）与哈希完整性是两回事——各链模块头已声明。

import { createHash } from 'node:crypto';

import { z } from 'zod';

import { verifyCampaignEventChain } from '../campaign/event_log.ts';
import type { CampaignEvent } from '../campaign/types.ts';
import { verifyDecisionChain } from '../agent_loop/decision_log.ts';
import type { StoredDecision } from '../agent_loop/decision_log.ts';
import { verifyOperationAuditLog } from '../agent_loop/operation_audit.ts';
import type { OperationAuditEntry } from '../agent_loop/operation_audit.ts';
import { verifyGuardEventLog } from '../campaign/guard_registry.ts';
import type { GuardEvent } from '../campaign/guard_registry.ts';

// ---------------------------------------------------------------------------
// 链适配（各链验证器签名不同——统一为 {valid, firstBroken, reason}）
// ---------------------------------------------------------------------------

export interface ChainCheck {
  readonly valid: boolean;
  readonly firstBroken: number | null;
  readonly reason: string | null;
}

export interface AuditChainInput {
  /** 链名（收据中逐链列名）。 */
  readonly name: string;
  readonly check: ChainCheck;
  readonly entryCount: number;
}

export const AuditVerifyReceiptSchema = z.object({
  /** 验证时刻（ISO；不参与 receiptHash——时点元数据）。 */
  at: z.string().min(1),
  chains: z.array(
    z.object({
      name: z.string().min(1),
      entryCount: z.number().int().nonnegative(),
      valid: z.boolean(),
      firstBroken: z.number().int().nullable(),
      reason: z.string().nullable(),
    }),
  ).min(1),
  allValid: z.boolean(),
  /** 收据内容哈希（chains+allValid 的 canonical 哈希——第三方复核锚）。 */
  receiptHash: z.string().length(64),
});

export type AuditVerifyReceipt = z.infer<typeof AuditVerifyReceiptSchema>;

function stableHash(value: unknown): string {
  const stable = JSON.stringify(value, (_k, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );
  return createHash('sha256').update(stable).digest('hex');
}

/** 聚合验证 → 统一收据（Evidence：audit verify receipt）。 */
export function buildAuditVerifyReceipt(at: string, chains: readonly AuditChainInput[]): AuditVerifyReceipt {
  const chainResults = chains.map((c) => ({
    name: c.name,
    entryCount: c.entryCount,
    valid: c.check.valid,
    firstBroken: c.check.firstBroken,
    reason: c.check.reason,
  }));
  const allValid = chainResults.every((c) => c.valid);
  const receiptHash = stableHash({ chains: chainResults, allValid });
  return AuditVerifyReceiptSchema.parse({ at, chains: chainResults, allValid, receiptHash });
}

// 既有链的现成适配器（新增链时在此追加一行）：

export function campaignChain(events: readonly CampaignEvent[]): AuditChainInput {
  const v = verifyCampaignEventChain(events);
  return {
    name: 'campaign-ledger',
    check: { valid: v.valid, firstBroken: v.firstBrokenIndex, reason: v.reason },
    entryCount: events.length,
  };
}

export function decisionChain(chain: readonly StoredDecision[]): AuditChainInput {
  const v = verifyDecisionChain(chain);
  return {
    name: 'orchestration-decisions',
    check: { valid: v.valid, firstBroken: v.firstBrokenSeq, reason: v.reason },
    entryCount: chain.length,
  };
}

export function operationAuditChain(log: readonly OperationAuditEntry[]): AuditChainInput {
  const v = verifyOperationAuditLog(log);
  const firstViolationIndex = v.violations[0] !== undefined ? Number(/^entry\[(\d+)\]/.exec(v.violations[0])?.[1] ?? -1) : -1;
  return {
    name: 'operation-audit',
    check: {
      valid: v.ok,
      firstBroken: v.ok ? null : (firstViolationIndex >= 0 ? firstViolationIndex : null),
      reason: v.ok ? null : (v.violations[0] ?? 'unknown violation'),
    },
    entryCount: log.length,
  };
}

export function guardEventChain(log: readonly GuardEvent[]): AuditChainInput {
  const v = verifyGuardEventLog(log);
  return {
    name: 'guard-events',
    check: { valid: v.valid, firstBroken: v.firstBrokenSeq, reason: v.reason },
    entryCount: log.length,
  };
}

// ---------------------------------------------------------------------------
// 锚点轮换（rotation——无静默历史切断）
// ---------------------------------------------------------------------------

export const RotationEventSchema = z.object({
  type: z.literal('chain-rotation'),
  /** 轮换前链头哈希（空链 = 创世轮换，prev=''）。 */
  previousHead: z.string().length(64),
  reason: z.string().min(1),
  at: z.string().min(1),
});

export type RotationEvent = z.infer<typeof RotationEventSchema>;

/** 轮换事件自身哈希 = 新链的 prevHash 起点。 */
export function rotationHash(rotation: RotationEvent): string {
  return stableHash(rotation);
}

export function rotateChainAnchor(oldHead: string, reason: string, at: string): { rotation: RotationEvent; newGenesisPrevHash: string } {
  const rotation = RotationEventSchema.parse({ type: 'chain-rotation', previousHead: oldHead, reason, at });
  return { rotation, newGenesisPrevHash: rotationHash(rotation) };
}

export interface RotationCheck {
  readonly valid: boolean;
  readonly reason: string | null;
}

/** 跨轮换边界校验：旧链头必须等于轮换事件携带的 previousHead，且新链 prevHash 必须等于轮换事件哈希。 */
export function verifyRotationBoundary(oldTailHash: string, rotation: RotationEvent, newChainPrevHash: string): RotationCheck {
  if (rotation.previousHead !== oldTailHash) {
    return { valid: false, reason: `rotation previousHead '${rotation.previousHead.slice(0, 12)}…' ≠ actual old tail '${oldTailHash.slice(0, 12)}…' (history mismatch)` };
  }
  if (newChainPrevHash !== rotationHash(rotation)) {
    return { valid: false, reason: `new chain genesis prevHash does not link to rotation event (expected ${rotationHash(rotation).slice(0, 12)}…)` };
  }
  return { valid: true, reason: null };
}

// ---------------------------------------------------------------------------
// 高风险操作门（审计失败 → fail-closed；宪法原文分支）
// ---------------------------------------------------------------------------

export const HIGH_RISK_ACTIONS = ['release-publish', 'pr-merge', 'destructive-delete', 'external-side-effect', 'config-change'] as const;
export type HighRiskAction = (typeof HIGH_RISK_ACTIONS)[number];

export interface HighRiskDecision {
  readonly allowed: boolean;
  readonly reason: string;
}

/**
 * 高风险操作 vs 审计状态：任一链 invalid 或收据缺失 → 拒绝（fail-closed）。
 * 低风险操作不受此门约束（读路径可继续——审计验证失败不应冻结只读能力）。
 */
export function highRiskOperationAllowed(receipt: AuditVerifyReceipt | null, action: HighRiskAction): HighRiskDecision {
  if (receipt === null) {
    return { allowed: false, reason: `high-risk action '${action}' without an audit verify receipt — no receipt, no high-risk op (fail-closed)` };
  }
  if (!receipt.allValid) {
    const broken = receipt.chains.filter((c) => !c.valid).map((c) => c.name);
    return { allowed: false, reason: `high-risk action '${action}' blocked: audit chains invalid [${broken.join(', ')}] — fail-closed until chains verified` };
  }
  return { allowed: true, reason: `all ${receipt.chains.length} audit chain(s) valid` };
}
