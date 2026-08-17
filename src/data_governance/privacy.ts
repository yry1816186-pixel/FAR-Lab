// src/data_governance/privacy.ts
// 职责：DATA-PRIVACY-001 —— 敏感数据最小化与目的限制（data inventory + 数据流审查 +
// 确定性脱敏 + 删除计划）。
//
// 宪法四约束：
//   1. 收集/处理/保留/导出/删除与明确研究目的匹配 → DataInventoryEntry.purpose 强制 +
//      DataFlow.purpose 对拍 inventory 用途；
//   2. 默认不向外部模型发送原始敏感数据；确需发送须 授权+最小化+审计+供应商边界四门 →
//      reviewDataFlows fail-closed（personal 外发默认拒；sensitive 四门全过才放行）；
//   3. 法律监管属动态事实 → 卡上 lawfulBasis 是声明面，核验义务显式留给发布前流程
//      （不假装本模块判定合法）；
//   4. Acceptance：data-flow review / redaction / deletion / access-control /
//      exfiltration tests → 本模块提供 review/redaction/deletionPlan 三件与测试面。
//
// Cannot-prove：模块证明「声明的数据流经审查规则判定、脱敏确定性可验、删除计划完整」；
// 不证明运行时没有未声明的数据流（那是 secret_scan/zero-tolerance/审计层的职责）。

import { z } from 'zod';

import { PRIVACY_CATEGORIES } from './dataset_card.ts';
import type { PrivacyCategory } from './dataset_card.ts';

// ---------------------------------------------------------------------------
// Data inventory（Evidence 面：data inventory）
// ---------------------------------------------------------------------------

export const DataInventoryEntrySchema = z.object({
  dataId: z.string().min(1),
  category: z.enum(PRIVACY_CATEGORIES),
  /** 明确研究目的（目的限制的锚点）。 */
  purpose: z.string().min(1),
  /** lawful basis 声明（sensitive/personal 必填——validate 强制）。 */
  lawfulBasis: z.string().nullable().default(null),
  /** 数据所在位置（库/目录/制品）。 */
  locations: z.array(z.string().min(1)).min(1),
  /** 共享给谁（含外部模型供应商；空 = 不外发）。 */
  sharedWith: z.array(z.string().min(1)).default([]),
  retentionDays: z.number().int().positive().nullable().default(null),
});

export type DataInventoryEntry = z.infer<typeof DataInventoryEntrySchema>;

export interface InventoryCheck {
  readonly ok: boolean;
  readonly problems: readonly string[];
}

/** 清单完整性：sensitive/personal 条目必须 purpose + lawfulBasis 双全。 */
export function validateDataInventory(entries: readonly DataInventoryEntry[]): InventoryCheck {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.dataId)) problems.push(`duplicate dataId '${e.dataId}'`);
    seen.add(e.dataId);
    if ((e.category === 'sensitive' || e.category === 'personal') && (e.lawfulBasis ?? '').trim().length === 0) {
      problems.push(`data '${e.dataId}' category ${e.category} without lawfulBasis`);
    }
  }
  return { ok: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------
// Data flow review（外部模型发送四门 + 目的对拍）
// ---------------------------------------------------------------------------

export const DataFlowSchema = z.object({
  flowId: z.string().min(1),
  /** 引用 inventory dataId（未登记的数据流本身即违规）。 */
  dataRefs: z.array(z.string().min(1)).min(1),
  destination: z.enum(['internal', 'external-model']),
  flowPurpose: z.string().min(1),
  /** 最小化声明：只发送完成任务所需最小字段/内容。 */
  minimized: z.boolean(),
  /** 脱敏：是否已施加 + 方法。 */
  redaction: z.object({
    applied: z.boolean(),
    method: z.string().nullable().default(null),
  }),
  /** 操作者授权（外部发送必需）。 */
  authorized: z.boolean(),
  /** 供应商边界记录（数据去了哪个供应商、边界条款）。 */
  vendorBoundary: z.string().nullable().default(null),
  /** 审计引用（发送事件的审计锚点）。 */
  auditRef: z.string().nullable().default(null),
});

export type DataFlow = z.infer<typeof DataFlowSchema>;

export interface FlowVerdict {
  readonly flowId: string;
  readonly allowed: boolean;
  readonly reasons: readonly string[];
}

/** 单流审查（fail-closed：缺任一门 = 拒，原因逐条列名）。 */
export function reviewDataFlow(flow: DataFlow, inventory: readonly DataInventoryEntry[]): FlowVerdict {
  const reasons: string[] = [];
  const entries = inventory.filter((e) => flow.dataRefs.includes(e.dataId));
  const unregistered = flow.dataRefs.filter((id) => !inventory.some((e) => e.dataId === id));
  for (const id of unregistered) reasons.push(`data '${id}' not in inventory — undeclared data flow`);

  if (flow.destination === 'internal') {
    // 目的限制：流用途必须落在其数据登记用途内（子串近似是初筛——命中即过，不命中列原因）
    for (const e of entries) {
      if (!flow.flowPurpose.includes(e.purpose.split('，')[0]?.slice(0, 6) ?? '') && !e.purpose.includes(flow.flowPurpose.slice(0, 6))) {
        reasons.push(`flow purpose '${flow.flowPurpose}' mismatched with registered purpose of '${e.dataId}'`);
      }
    }
    return { flowId: flow.flowId, allowed: reasons.length === 0, reasons };
  }

  // external-model：personal 默认拒（宪法：默认避免发送原始敏感数据）
  for (const e of entries) {
    if (e.category === 'personal') {
      reasons.push(`data '${e.dataId}' is personal — external-model send denied by default (minimize or aggregate first)`);
    }
    if (e.category === 'sensitive' && !flow.redaction.applied) {
      reasons.push(`sensitive data '${e.dataId}' sent externally without redaction`);
    }
  }
  if (!flow.authorized) reasons.push('external send not authorized');
  if (!flow.minimized) reasons.push('external send not minimized (send least data that completes the task)');
  if (!flow.redaction.applied) reasons.push('external send without redaction');
  if ((flow.vendorBoundary ?? '').trim().length === 0) reasons.push('external send without vendor boundary record');
  if ((flow.auditRef ?? '').trim().length === 0) reasons.push('external send without audit reference');

  return { flowId: flow.flowId, allowed: reasons.length === 0, reasons };
}

export interface DataFlowReviewReport {
  readonly allowed: readonly string[];
  readonly denied: readonly { flowId: string; reasons: readonly string[] }[];
}

/** 全量审查（data-flow review 的机器面）。 */
export function reviewDataFlows(flows: readonly DataFlow[], inventory: readonly DataInventoryEntry[]): DataFlowReviewReport {
  const allowed: string[] = [];
  const denied: { flowId: string; reasons: readonly string[] }[] = [];
  for (const f of flows) {
    const v = reviewDataFlow(f, inventory);
    if (v.allowed) allowed.push(f.flowId);
    else denied.push({ flowId: f.flowId, reasons: v.reasons });
  }
  return { allowed, denied };
}

// ---------------------------------------------------------------------------
// 确定性脱敏（redaction —— exfiltration/minimization 面）
// ---------------------------------------------------------------------------

// 顺序敏感：身份证（18 位长模式）必须先于手机号（11 位短模式）——否则短模式会
// 吃掉长号码的中间段导致身份证漏检（2026-08-18 测试实测）。长/特异模式优先。
export const REDACTION_PATTERNS: ReadonlyArray<{ readonly name: string; readonly re: RegExp; readonly replacement: string }> = [
  { name: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, replacement: '[REDACTED:email]' },
  { name: 'id-card-cn', re: /\d{17}[\dXx]/g, replacement: '[REDACTED:id-number]' },
  { name: 'phone-cn', re: /1[3-9]\d{9}/g, replacement: '[REDACTED:phone]' },
];

export interface RedactionResult {
  readonly redacted: string;
  readonly findings: readonly { name: string; count: number }[];
}

/** 应用全部脱敏模式（确定性：同输入同输出；findings 计数供审计）。 */
export function redact(payload: string): RedactionResult {
  let out = payload;
  const findings: { name: string; count: number }[] = [];
  for (const p of REDACTION_PATTERNS) {
    const matches = out.match(p.re);
    if (matches !== null && matches.length > 0) {
      findings.push({ name: p.name, count: matches.length });
      out = out.replace(p.re, p.replacement);
    }
  }
  return { redacted: out, findings };
}

// ---------------------------------------------------------------------------
// 删除计划（deletion —— 删除义务的机器面）
// ---------------------------------------------------------------------------

export interface DeletionPlanItem {
  readonly dataId: string;
  readonly locations: readonly string[];
  readonly category: PrivacyCategory;
}

/** 全清单删除计划：每个数据条目在哪些位置需要删除（执行由运维层走，计划先完整）。 */
export function deletionPlan(inventory: readonly DataInventoryEntry[]): readonly DeletionPlanItem[] {
  return inventory.map((e) => ({ dataId: e.dataId, locations: [...e.locations], category: e.category }));
}

/** 单条删除验证（deletion tests 用：给定已删位置集，该数据条是否删净）。 */
export function deletionComplete(entry: DataInventoryEntry, deletedLocations: readonly string[]): boolean {
  return entry.locations.every((loc) => deletedLocations.includes(loc));
}
