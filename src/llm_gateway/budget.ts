/**
 * budget.ts — G7 成本硬预算断路器(IC-04 · ADR-019)。
 *
 * 语义:软预算无执行力 → 硬断路:
 *   - budget_profile{maxTokens,maxDurationMs,maxLoops}(profile 级配置);
 *   - 计量来自 call_records.usage_tokens_total 真实记录(循环侧 tokensConsumed 同口径);
 *   - 超限必停(fail-closed):CostBudgetExceeded(code=COST_BUDGET_EXCEEDED),不静默继续;
 *   - 不做精确计费对账(厂商账单为准·非目标)。
 *
 * 默认语义:fsm_runner 未显式传 budget 时按 DEFAULT_BUDGET_PROFILE 兜底(默认开启);
 * 显式传 null = 关闭(红线决策,须调用方明示)。
 *
 * 零容忍合规:无 any / @ts-ignore / 空 catch / 双重断言。
 */

import type Database from 'better-sqlite3';

export interface BudgetProfile {
  readonly maxTokens: number | null;
  readonly maxDurationMs: number | null;
  readonly maxLoops: number | null;
}

/** 默认兜底预算(默认开启;宽松防失控,非精确计费) */
export const DEFAULT_BUDGET_PROFILE: BudgetProfile = {
  maxTokens: 1_000_000,
  maxDurationMs: 7_200_000,
  maxLoops: 100,
};

export type BudgetDimension = 'tokens' | 'duration_ms' | 'loops';

export class CostBudgetExceeded extends Error {
  readonly code = 'COST_BUDGET_EXCEEDED' as const;
  readonly dimension: BudgetDimension;
  readonly consumed: number;
  readonly limit: number;
  constructor(dimension: BudgetDimension, consumed: number, limit: number) {
    super(
      `COST_BUDGET_EXCEEDED: ${dimension} consumed=${consumed} exceeded limit=${limit} ` +
        '(G7 硬断路·fail-closed;已耗见计量,预算来自 budget_profile)',
    );
    this.name = 'CostBudgetExceeded';
    this.dimension = dimension;
    this.consumed = consumed;
    this.limit = limit;
  }
}

export interface BudgetUsage {
  readonly tokensConsumed: number;
  readonly elapsedMs: number;
  readonly loopsCompleted: number;
}

/** 硬断路检查:超限即抛 CostBudgetExceeded(确定性,不经 LLM)。 */
export function checkBudget(profile: BudgetProfile, usage: BudgetUsage): void {
  if (profile.maxTokens !== null && usage.tokensConsumed >= profile.maxTokens) {
    throw new CostBudgetExceeded('tokens', usage.tokensConsumed, profile.maxTokens);
  }
  if (profile.maxDurationMs !== null && usage.elapsedMs >= profile.maxDurationMs) {
    throw new CostBudgetExceeded('duration_ms', usage.elapsedMs, profile.maxDurationMs);
  }
  if (profile.maxLoops !== null && usage.loopsCompleted >= profile.maxLoops) {
    throw new CostBudgetExceeded('loops', usage.loopsCompleted, profile.maxLoops);
  }
}

/**
 * V06-F5 修复:预算配置 fail-closed 校验。
 * NaN/undefined/非有限/负值=非法(它们会静默关闭对应维度);显式 null=合法关闭(红线,调用方明示)。
 */
export function validateBudgetProfile(profile: BudgetProfile): void {
  const dims: ReadonlyArray<readonly [string, number | null]> = [
    ['maxTokens', profile.maxTokens],
    ['maxDurationMs', profile.maxDurationMs],
    ['maxLoops', profile.maxLoops],
  ];
  for (const [name, value] of dims) {
    if (value === null) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(
        `budget profile invalid: ${name}=${String(value)}(NaN/undefined/负值会静默关闭该维度;` +
          '合法关闭须显式 null;G7 fail-closed)',
      );
    }
  }
}

export interface StageCostRow {
  readonly stageId: string;
  readonly calls: number;
  readonly tokens: number;
}

/** 分阶段成本计量(call_records 真实记录;usage_tokens_total 为 NULL 的老行计 0)。 */
export function summarizeCostsByStage(db: Database.Database): readonly StageCostRow[] {
  const rows = db
    .prepare(
      `SELECT stage_id AS stageId, COUNT(*) AS calls,
              COALESCE(SUM(usage_tokens_total), 0) AS tokens
       FROM call_records
       GROUP BY stage_id
       ORDER BY tokens DESC, stage_id ASC`,
    )
    .all() as Array<{ stageId: string; calls: number; tokens: number }>;
  return rows;
}

/** 总成本计量(全部 call_records)。 */
export function summarizeTotalCost(db: Database.Database): { calls: number; tokens: number } {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS calls, COALESCE(SUM(usage_tokens_total), 0) AS tokens
       FROM call_records`,
    )
    .get() as { calls: number; tokens: number };
  return row;
}
