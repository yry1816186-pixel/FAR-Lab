// src/agent_loop/operation_audit.ts
// 职责：CORE-SIDEFX-001 操作审计 schema —— 外部/不可逆动作的授权记录结构化落档。
//
// 设计：guardProtectedAction 是「事前闸」（决策），本模块是「事后账」（审计）——
// 两者分离遵循职责单一；appendOperationAudit 把 guard 决策与授权上下文固化为
// 不可变条目（append-only 数组 + 追加拒绝），供 replay/审计面消费。
// 红线延续：authorizedBy 只能是人类通道或受信确定性路径标识；LLM 建议发起的
// 动作在 guard 就被拒（ deny 也记账——拒绝本身是审计事实）。

import { z } from 'zod';

import { PROTECTED_ACTIONS } from './guards.ts';

export const OPERATION_AUDIT_INITIATORS = [
  'cli_user',
  'api_user',
  'deterministic_code',
  'llm_suggestion',
  'external_content',
] as const;

export const OperationAuditEntrySchema = z.object({
  /** 递增序号（追加方分配；重号/回退拒绝）。 */
  seq: z.number().int().nonnegative(),
  /** 受保护动作（PROTECTED_ACTIONS 之一——审计账只收登记动作）。 */
  action: z.enum(PROTECTED_ACTIONS),
  /** 发起方。 */
  initiator: z.enum(OPERATION_AUDIT_INITIATORS),
  /** 授权者（人类通道标识 / 'deterministic:<module>'；deny 记账时为 null）。 */
  authorizedBy: z.string().min(1).nullable(),
  /** ISO 时间戳。 */
  timestamp: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, 'expected ISO-8601'),
  /** 证据引用（guard 决策理由 / 命令行 / PR 链接——deny 记账时为拒绝理由）。 */
  evidenceRef: z.string().min(1),
  /** guard 裁决结果（allow/deny 都入账）。 */
  allowed: z.boolean(),
});
export type OperationAuditEntry = z.infer<typeof OperationAuditEntrySchema>;

export class OperationAuditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OperationAuditError';
  }
}

/**
 * 追加审计条目（append-only）：seq 必须严格递增；schema 违规拒绝。
 * 追加后的账本不可修改（调用方持只读视图）。
 */
export function appendOperationAudit(
  log: readonly OperationAuditEntry[],
  entry: OperationAuditEntry,
): readonly OperationAuditEntry[] {
  const maxSeq = log.length > 0 ? log[log.length - 1]!.seq : -1;
  if (entry.seq !== maxSeq + 1) {
    throw new OperationAuditError(
      `audit seq must continue at ${maxSeq + 1}, got ${entry.seq} (append-only, no gaps, no rewrites)`,
    );
  }
  return [...log, entry];
}

/** 校验整本账（replay/审计面用）：schema 全过 + seq 连续。 */
export function verifyOperationAuditLog(log: readonly OperationAuditEntry[]): {
  ok: boolean;
  violations: readonly string[];
} {
  const violations: string[] = [];
  log.forEach((entry, i) => {
    const parsed = OperationAuditEntrySchema.safeParse(entry);
    if (!parsed.success) {
      violations.push(`entry[${i}]: ${parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')}`);
    }
    if (entry.seq !== i) {
      violations.push(`entry[${i}]: seq ${entry.seq} breaks continuity (expected ${i})`);
    }
  });
  return { ok: violations.length === 0, violations };
}

/** 未登记动作（不在 PROTECTED_ACTIONS）尝试入账 → 拒绝（审计账不收野动作）。 */
export function auditActionRegistered(action: string): boolean {
  return (PROTECTED_ACTIONS as readonly string[]).includes(action);
}
