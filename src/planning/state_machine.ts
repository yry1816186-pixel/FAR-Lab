// src/planning/state_machine.ts
// 职责：规划状态机（确定性纯函数）。
//
// 阶段链：
//   ANALYZE → PLAN → EXECUTE → VERIFY → REVIEW → REPORT
//
// 规则：
//   1. full 模式：只能推进到相邻阶段；跳跃 = PROTOCOL_DEVIATION（拦截）。
//   2. compressed 模式：允许跳过中间阶段（OpenSpec 法则：阶段可压缩，工件不可缺席），
//      但禁止回退（反向转移一律拦截）。
//   3. REPORT 后可回 ANALYZE（下一轮循环，跨任务边界）。
//   4. 禁止从任意阶段跳回早期阶段（回退 = 重做未声明，拦截）。

import type { PlanningStage, StageTransitionResult, StateMachineMode } from './types.ts';

const STAGE_INDEX: Readonly<Record<PlanningStage, number>> = {
  ANALYZE: 0,
  PLAN: 1,
  EXECUTE: 2,
  VERIFY: 3,
  REVIEW: 4,
  REPORT: 5,
};

function indexOf(stage: PlanningStage): number {
  return STAGE_INDEX[stage];
}

/** 合法的推进（正向）邻接表。 */
const FORWARD_NEXT: Readonly<Record<PlanningStage, readonly PlanningStage[]>> = {
  ANALYZE: ['PLAN', 'EXECUTE', 'REPORT'],
  PLAN: ['EXECUTE', 'VERIFY', 'REPORT'],
  EXECUTE: ['VERIFY', 'REPORT'],
  VERIFY: ['REVIEW', 'REPORT'],
  REVIEW: ['REPORT'],
  REPORT: ['ANALYZE'],
};

/** 相邻推进（full 模式）。 */
const ADJACENT_NEXT: Readonly<Record<PlanningStage, readonly PlanningStage[]>> = {
  ANALYZE: ['PLAN'],
  PLAN: ['EXECUTE'],
  EXECUTE: ['VERIFY'],
  VERIFY: ['REVIEW'],
  REVIEW: ['REPORT'],
  REPORT: ['ANALYZE'],
};

/**
 * 状态转移。返回 ok=false（PROTOCOL_DEVIATION）时给出原因与合法去向。
 *
 * - full（默认）：只允许相邻推进（ANALYZE→PLAN→EXECUTE→VERIFY→REVIEW→REPORT→ANALYZE）。
 * - compressed：允许正向跳跃（压缩生命周期），仍禁止回退。
 */
export function transitionStage(
  from: PlanningStage,
  to: PlanningStage,
  mode: StateMachineMode = 'full',
): StageTransitionResult {
  const allowedNext =
    mode === 'full'
      ? ADJACENT_NEXT[from]
      : FORWARD_NEXT[from];

  if (allowedNext.includes(to)) {
    return { ok: true, from, to, allowedNext };
  }

  // 同阶段转移
  if (from === to) {
    return {
      ok: false,
      from,
      to,
      reason: 'PROTOCOL_DEVIATION: no-op transition to the same stage',
      allowedNext,
    };
  }

  // 回退检测（目标索引 < 当前索引，且非 REPORT→ANALYZE 的循环）
  const backward = indexOf(to) < indexOf(from);
  const reason = backward
    ? `PROTOCOL_DEVIATION: backward transition ${from} → ${to} is forbidden (rework must be declared)`
    : `PROTOCOL_DEVIATION: ${from} → ${to} skipped a stage (${mode} mode)`;

  return { ok: false, from, to, reason, allowedNext };
}

/** 当前阶段的全部合法去向（决策树渲染用）。 */
export function allowedNextStages(stage: PlanningStage, mode: StateMachineMode = 'full'): readonly PlanningStage[] {
  return mode === 'full' ? ADJACENT_NEXT[stage] : FORWARD_NEXT[stage];
}

/** 合法状态链检查：给定阶段序列，全程是否合法（full 模式）。 */
export function isValidStageChain(stages: readonly PlanningStage[]): boolean {
  if (stages.length < 2) return false;
  for (let i = 1; i < stages.length; i += 1) {
    const from = stages[i - 1];
    const to = stages[i];
    if (from === undefined || to === undefined) return false;
    if (!transitionStage(from, to).ok) return false;
  }
  return true;
}
