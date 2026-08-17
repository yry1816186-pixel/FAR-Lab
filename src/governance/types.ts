// src/governance/types.ts
// 职责：治理登记机器层类型 SSOT —— Unknown/Assumption 生命周期 + reopen 传播
// （宪法 GOV-UNKNOWN-001 / GOV-REOPEN-001 的源代码化，与 src/planning/types.ts 同模式）。
//
// 设计原则：
//   1. zod schema 是 SSOT，类型用 z.infer 推导。
//   2. 全部为确定性纯数据 —— 无 LLM、无 IO、无随机。
//   3. reopen 事件是不可变追加账目（evidence = registries + reopen log）。
//   4. 本机制不能证明的：reopen 图只覆盖登记在册的引用边（affectedDecisions/blocking），
//      未登记的依赖不会传播 —— 登记完整性由 lint 的 knownItemIds 交叉校验守护。

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Unknown —— 显式生命周期的未知项（GOV-UNKNOWN-001）
// ---------------------------------------------------------------------------

export const UNKNOWN_STATUSES = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'ABANDONED'] as const;
export type UnknownStatus = (typeof UNKNOWN_STATUSES)[number];

/** ISO 日期（YYYY-MM-DD）。 */
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const UnknownEntrySchema = z.object({
  /** 唯一 ID（UNK- 前缀约定，登记内跨种类唯一）。 */
  id: z.string().min(1),
  /** 未知的是什么。 */
  what: z.string().min(1),
  /** 为什么未知（证据缺口来源）。 */
  whyUnknown: z.string().min(1),
  /** 若判错的影响面（哪些结论/决策受影响）。 */
  impact: z.string().min(1),
  /** 已做/待做的调查动作。 */
  investigation: z.string().min(1),
  /** 被该项未知阻塞的决策/需求/声明 ID（reopen 传播边）。 */
  blocking: z.array(z.string().min(1)),
  /** 责任人。 */
  owner: z.string().min(1),
  /** 判定所需的 target evidence（RESOLVED 时必须有非空 resolution evidence 达成它）。 */
  targetEvidence: z.array(z.string().min(1)),
  /** 生命周期状态。 */
  status: z.enum(UNKNOWN_STATUSES),
  /** 解决时间（仅 RESOLVED/ABANDONED）。 */
  resolvedAt: IsoDateSchema.nullable().default(null),
  /** 解决证据（RESOLVED 必填——lint 强制）。 */
  resolutionEvidence: z.array(z.string().min(1)).default([]),
});
export type UnknownEntry = z.infer<typeof UnknownEntrySchema>;

// ---------------------------------------------------------------------------
// Assumption —— 显式生命周期的假设（GOV-UNKNOWN-001）
// ---------------------------------------------------------------------------

export const ASSUMPTION_STATUSES = ['ACTIVE', 'INVALIDATED', 'RETIRED'] as const;
export type AssumptionStatus = (typeof ASSUMPTION_STATUSES)[number];

export const AssumptionEntrySchema = z.object({
  /** 唯一 ID（ASM- 前缀约定，登记内跨种类唯一）。 */
  id: z.string().min(1),
  /** 假设陈述。 */
  statement: z.string().min(1),
  /** 当前支撑证据。 */
  evidence: z.array(z.string().min(1)),
  /** 置信度 [0,1]。 */
  confidence: z.number().min(0).max(1),
  /** 受该假设影响的决策/需求/声明 ID（失效时 reopen 传播边）。 */
  affectedDecisions: z.array(z.string().min(1)),
  /** 失效触发器（什么新事实出现则该假设作废）。 */
  invalidationTrigger: z.string().min(1),
  /** 复查日期（YYYY-MM-DD；与 reviewEvent 至少其一非空——lint 强制）。 */
  reviewDate: IsoDateSchema.nullable().default(null),
  /** 复查事件（触发复查的事件描述）。 */
  reviewEvent: z.string().nullable().default(null),
  /** 生命周期状态。 */
  status: z.enum(ASSUMPTION_STATUSES),
  /** 失效时间（仅 INVALIDATED）。 */
  invalidatedAt: IsoDateSchema.nullable().default(null),
  /** 失效理由（仅 INVALIDATED；lint 强制非空）。 */
  invalidationReason: z.string().nullable().default(null),
});
export type AssumptionEntry = z.infer<typeof AssumptionEntrySchema>;

// ---------------------------------------------------------------------------
// Registry —— 登记簿整体
// ---------------------------------------------------------------------------

export const GovernanceRegistrySchema = z.object({
  unknowns: z.array(UnknownEntrySchema),
  assumptions: z.array(AssumptionEntrySchema),
});
export type GovernanceRegistry = z.infer<typeof GovernanceRegistrySchema>;

// ---------------------------------------------------------------------------
// Reopen —— 触发器与传播事件（GOV-REOPEN-001）
// ---------------------------------------------------------------------------

/** 宪法 GOV-REOPEN-001 枚举的九类触发器。 */
export const REOPEN_TRIGGERS = [
  'regression',
  'new_evidence',
  'changed_requirement',
  'benchmark_fcs_shift',
  'dependency_security_event',
  'architecture_schema_change',
  'invalidated_assumption',
  'correction_retraction',
  'reproducibility_failure',
] as const;
export type ReopenTrigger = (typeof REOPEN_TRIGGERS)[number];

export const REOPEN_EVENT_KINDS = ['reopen', 'impacted'] as const;
export type ReopenEventKind = (typeof REOPEN_EVENT_KINDS)[number];

/**
 * reopen 传播事件（不可变账目条目）。
 *
 * kind=reopen：主体被显式重开（状态回到待重估）。
 * kind=impacted：主体的支撑假设/阻塞项被重开 → 主体标记待复查（深度 2 截止，
 *   更深链路不做自动传播——超出登记边界的推断必须回到人工审计，防自动化猜测）。
 */
export const ReopenEventSchema = z.object({
  /** 账目序号（由追加方按既有 log 长度分配，引擎不猜测）。 */
  seq: z.number().int().nonnegative(),
  /** ISO 日期。 */
  at: IsoDateSchema,
  /** 触发器（宪法九类之一）。 */
  trigger: z.enum(REOPEN_TRIGGERS),
  /** 事件种类。 */
  kind: z.enum(REOPEN_EVENT_KINDS),
  /** 被重开/受影响的主体 ID（决策/需求/声明/假设）。 */
  subjectId: z.string().min(1),
  /** 传播方式：direct = 触发器直接命中；propagated = 经登记边传播。 */
  via: z.enum(['direct', 'propagated']),
  /** 传播深度（direct=1；impacted=2 封顶）。 */
  chainDepth: z.number().int().positive(),
  /** 引发的登记条目 ID（假设/未知项）或外部 cause 引用。 */
  causeRef: z.string().min(1),
  /** 一行理由。 */
  reason: z.string().min(1),
});
export type ReopenEvent = z.infer<typeof ReopenEventSchema>;

/**
 * 触发器输入（判别联合）：
 *   invalidated_assumption → 失效一条假设并传播其 affectedDecisions；
 *   new_evidence + unknownId → 解决一条未知项并释放其 blocking（解决即新证据）；
 *   其余七类 → 显式 subjectIds 直接重开 + 登记边传播。
 */
export type TriggerEvent =
  | { trigger: 'invalidated_assumption'; at: string; assumptionId: string; reason: string }
  | { trigger: 'new_evidence'; at: string; unknownId: string; resolutionEvidence: string[] }
  | {
      trigger: Exclude<ReopenTrigger, 'invalidated_assumption' | 'new_evidence'>;
      at: string;
      subjectIds: string[];
      causeRef: string;
      reason: string;
    };

/** applyTrigger 的结果：新登记状态 + 追加事件 + 受影响图（主体 → 事件列表）。 */
export interface TriggerOutcome {
  readonly registry: GovernanceRegistry;
  readonly events: readonly ReopenEvent[];
  /** 传播可达性快照：subjectId → 命中它的事件。 */
  readonly affectedGraph: ReadonlyMap<string, readonly ReopenEvent[]>;
}

// ---------------------------------------------------------------------------
// Stale / Degraded —— 失效语义（GOV-UNKNOWN-001 Failure 分支）
// ---------------------------------------------------------------------------

export interface StaleAssumption {
  readonly id: string;
  readonly reviewDate: string;
  readonly daysOverdue: number;
}

/** 降级结论：支撑假设已失效或过期 → 依赖它的结论必须降级（不得维持原判）。 */
export interface DegradedConclusion {
  readonly decisionId: string;
  readonly assumptionId: string;
  readonly cause: 'invalidated' | 'stale';
}

// ---------------------------------------------------------------------------
// Lint —— 登记完整性
// ---------------------------------------------------------------------------

export const LINT_RULES = [
  'duplicate_id',
  'unknown_resolved_without_evidence',
  'assumption_invalidated_without_reason',
  'assumption_missing_review_anchor',
  'dangling_reference',
  'unknown_abandoned_without_reason',
] as const;
export type LintRule = (typeof LINT_RULES)[number];

export interface LintViolation {
  readonly rule: LintRule;
  readonly entryId: string;
  readonly detail: string;
}

export interface LintOptions {
  /** 已知合法主体 ID 集（需求/声明/决策登记）；提供时校验引用边悬空。 */
  readonly knownItemIds?: readonly string[] | undefined;
}
