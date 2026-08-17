// src/governance/adr_schema.ts
// 职责：决策台账（.far/agent/decisions.md）的机器可校验 schema —— CORE-DECISION-001。
//
// 设计：schema 贴合台账实际 7 槽位格式（日期/决策id/背景/候选/所选/依据/弃因/回滚），
// 不发明理想化 ADR 形状；解析器（scripts/parse_decisions.mjs）把 markdown 结构化为
// AdrEntry[]，schema 校验 fail-closed（缺槽位/坏 id = 台账不可信）。
// 「关键假设已登记」腿由 UNKNOWN_REGISTRY（PR #59 assumptions）承担——两登记互补：
// 决策台账记「为什么这么选」，假设登记记「这个选择依赖什么未证实前提」。
// 本 schema 不能证明的：决策内容本身的正确性（那是决策时证据的职责）；
// 只证明结构完整性（可复演所需的全部槽位在位）。

import { z } from 'zod';

/** 决策 id 形状：D-YYYY-MM-DD-NN（台账实际格式）。 */
export const ADR_ID_PATTERN = /^D-\d{4}-\d{2}-\d{2}-\d{2}$/;

export const AdrEntrySchema = z.object({
  /** 台账条目 id（## 标题行解析）。 */
  id: z.string().regex(ADR_ID_PATTERN, 'expected D-YYYY-MM-DD-NN'),
  /** 标题（## 标题行 id 之后的一段）。 */
  title: z.string().min(1),
  /** 背景：为什么需要决策。 */
  context: z.string().min(1),
  /** 候选方案清单（原文，含 ①②③ 内联编号）。 */
  options: z.string().min(1),
  /** 所选方案。 */
  chosen: z.string().min(1),
  /** 依据（可缺省——部分决策以弃因表达全部理由）。 */
  rationale: z.string().min(1).nullable(),
  /** 弃因：未选方案为何被拒。 */
  rejectedReasons: z.string().min(1),
  /** 回滚路径（可为「无」但必须显式）。 */
  rollback: z.string().min(1),
});
export type AdrEntry = z.infer<typeof AdrEntrySchema>;

export interface AdrParseResult {
  readonly entries: readonly AdrEntry[];
  /** 结构不完整（缺槽位/坏 id/空标题）的块——CORE-DECISION-001 fail-closed 面。 */
  readonly violations: readonly { readonly heading: string; readonly missingFields: readonly string[] }[];
}

/**
 * 解析决策台账文本（## D-… 标题分块 + **槽位**：值 行）。
 * 确定性纯函数：同文本同结果；槽位缺失计入 violations 而非静默跳过。
 */
export function parseDecisionLedger(text: string): AdrParseResult {
  const entries: AdrEntry[] = [];
  const violations: { heading: string; missingFields: string[] }[] = [];
  const lines = text.split(/\r?\n/);

  interface Block {
    id: string;
    title: string;
    fields: Map<string, string>;
    headingLine: string;
  }
  const blocks: Block[] = [];
  let current: Block | null = null;

  for (const line of lines) {
    const heading = /^## (D-\d{4}-\d{2}-\d{2}-\d{2}) (.+)$/.exec(line);
    if (heading !== null) {
      current = { id: heading[1]!, title: heading[2]!.trim(), fields: new Map(), headingLine: line.slice(3) };
      blocks.push(current);
      continue;
    }
    const field = /^- \*\*(背景|候选|所选|依据|弃因|回滚)\*\*：(.*)$/.exec(line);
    if (field !== null && current !== null) {
      current.fields.set(field[1]!, field[2]!.trim());
    }
  }

  for (const block of blocks) {
    const missing: string[] = [];
    const get = (k: string, required: boolean): string | null => {
      const v = block.fields.get(k) ?? null;
      if (required && (v === null || v.length === 0)) missing.push(k);
      return v;
    };
    const context = get('背景', true)!;
    const options = get('候选', true)!;
    const chosen = get('所选', true)!;
    const rationale = get('依据', false);
    const rejectedReasons = get('弃因', true)!;
    const rollback = get('回滚', true)!;
    if (block.title.length === 0) missing.push('标题');

    if (missing.length > 0) {
      violations.push({ heading: block.headingLine, missingFields: missing });
      continue;
    }
    const parsed = AdrEntrySchema.safeParse({
      id: block.id,
      title: block.title,
      context,
      options,
      chosen,
      rationale,
      rejectedReasons,
      rollback,
    });
    if (parsed.success) entries.push(parsed.data);
    else {
      violations.push({
        heading: block.headingLine,
        missingFields: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
    }
  }
  return { entries, violations };
}
