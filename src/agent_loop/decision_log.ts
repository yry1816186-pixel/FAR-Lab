// src/agent_loop/decision_log.ts
// 职责：CAMPAIGN-REPLAY-001 第 3 层 —— Orchestration Decision Log（编排决策追加账）。
//
// 宪法要求重放能回答五问：选了什么、为什么、淘汰什么、哪个预算/故障规则触发、何处降级。
// FSM 事件流（events.ts）记录「转移」不记录「决策依据」；本模块把决策本身做成
// append-only 哈希链账（与 campaign 台账同纪律：seq 连续 + prevHash 链 + 重放校验）。
//
// Cannot-prove：账本证明「决策被如实记录且不可篡改」；不证明决策本身正确——
// 正确性归各决策器的校验层（scorecard/kernel），本层只承诺诚实可追。

import { createHash } from 'node:crypto';

import { z } from 'zod';

export const DECISION_SCHEMA_VERSION = 1;

/** 决策类型（对齐宪法五问的回答面）。 */
export const DECISION_KINDS = [
  'selected',       // 选了什么
  'rejected',       // 淘汰了什么
  'degraded',       // 何处降级
  'budget_rule',    // 哪个预算规则触发
  'failure_rule',   // 哪个故障规则触发
] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

export const DecisionEntrySchema = z.object({
  schemaVersion: z.literal(DECISION_SCHEMA_VERSION),
  seq: z.number().int().positive(),
  at: z.string().min(1),
  kind: z.enum(DECISION_KINDS),
  /** 决策对象（候选/步骤/问题 id）。 */
  subject: z.string().min(1),
  /** 选了什么 / 规则名（selected/budget_rule 等的主体内容）。 */
  chosen: z.string().min(1),
  /** 为什么（一句依据——评分/约束/预算余量）。 */
  why: z.string().min(1),
  /** 淘汰了什么（rejected 项列表；其余类型可空）。 */
  rejected: z.array(z.string().min(1)).default([]),
  /** 触发的规则名（budget_rule/failure_rule 的具体规则；其余 null）。 */
  ruleTriggered: z.string().nullable().default(null),
  /** 降级位置（degraded 的落点描述；其余 null）。 */
  degradedAt: z.string().nullable().default(null),
  prevHash: z.string().length(64),
});

export type DecisionEntry = z.infer<typeof DecisionEntrySchema>;

export interface DecisionChainCheck {
  readonly valid: boolean;
  readonly firstBrokenSeq: number | null;
  readonly reason: string | null;
}

function entryHash(e: Omit<DecisionEntry, 'prevHash'>, prevHash: string): string {
  const payload = { ...e, prevHash };
  const stable = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(stable).digest('hex');
}

/** 创世前哈希（与 campaign 台账同约定：64 个 '0'）。 */
export const GENESIS_PREV = '0'.repeat(64);

/** 存储形态：决策条目 + 其自身哈希（链节点）。 */
export interface StoredDecision {
  readonly entry: DecisionEntry;
  readonly hash: string;
}

export function buildStoredDecision(
  chain: readonly StoredDecision[],
  input: Omit<DecisionEntry, 'schemaVersion' | 'seq' | 'prevHash'>,
): StoredDecision {
  const tail = chain.at(-1);
  const entry: DecisionEntry = {
    ...input,
    schemaVersion: DECISION_SCHEMA_VERSION,
    seq: (tail?.entry.seq ?? 0) + 1,
    prevHash: tail?.hash ?? GENESIS_PREV,
  };
  return { entry, hash: entryHash(entry, entry.prevHash) };
}

/** 全链校验：seq 连续（1..n）+ prevHash 链 + hash 重算（篡改可枚举定位）。 */
export function verifyDecisionChain(chain: readonly StoredDecision[]): DecisionChainCheck {
  let prevHash = GENESIS_PREV;
  for (let i = 0; i < chain.length; i += 1) {
    const sd = chain[i] as StoredDecision;
    const expectedSeq = i + 1;
    if (sd.entry.seq !== expectedSeq) {
      return { valid: false, firstBrokenSeq: sd.entry.seq, reason: `seq discontinuity at position ${i + 1} (got ${sd.entry.seq})` };
    }
    if (sd.entry.prevHash !== prevHash) {
      return { valid: false, firstBrokenSeq: sd.entry.seq, reason: `prevHash chain break at seq ${sd.entry.seq}` };
    }
    const recomputed = entryHash(sd.entry, sd.entry.prevHash);
    if (recomputed !== sd.hash) {
      return { valid: false, firstBrokenSeq: sd.entry.seq, reason: `hash mismatch at seq ${sd.entry.seq} (tampered)` };
    }
    prevHash = sd.hash;
  }
  return { valid: true, firstBrokenSeq: null, reason: null };
}

export interface ReplayAnswerReport {
  /** 选了什么（selected 决策的 subject→chosen 列表）。 */
  readonly selected: readonly { subject: string; chosen: string; why: string }[];
  /** 淘汰了什么（rejected 决策与各条 rejected 列表）。 */
  readonly rejected: readonly { subject: string; items: string[] }[];
  /** 哪个预算/故障规则触发（ruleTriggered 非空条目）。 */
  readonly rulesTriggered: readonly { kind: DecisionKind; subject: string; rule: string }[];
  /** 何处降级（degradedAt 非空条目）。 */
  readonly degradations: readonly { subject: string; at: string; why: string }[];
  readonly entryCount: number;
}

/** 从决策账重放推导五问报告（重放报告的决策层分量）。 */
export function replayAnswerReport(chain: readonly StoredDecision[]): ReplayAnswerReport {
  return {
    selected: chain
      .filter((sd) => sd.entry.kind === 'selected')
      .map((sd) => ({ subject: sd.entry.subject, chosen: sd.entry.chosen, why: sd.entry.why })),
    rejected: chain
      .filter((sd) => sd.entry.kind === 'rejected' || sd.entry.rejected.length > 0)
      .map((sd) => ({ subject: sd.entry.subject, items: [...sd.entry.rejected] })),
    rulesTriggered: chain
      .filter((sd) => sd.entry.ruleTriggered !== null)
      .map((sd) => ({ kind: sd.entry.kind, subject: sd.entry.subject, rule: sd.entry.ruleTriggered as string })),
    degradations: chain
      .filter((sd) => sd.entry.degradedAt !== null)
      .map((sd) => ({ subject: sd.entry.subject, at: sd.entry.degradedAt as string, why: sd.entry.why })),
    entryCount: chain.length,
  };
}
