/**
 * campaign/guardian — 战役预算守门人（night-r7 S1）。纯函数，无 IO、无时钟。
 *
 * 在「启动下一个问题之前」做诚实的前置检查：若累计 token + 单题估计将超出
 * 预算，立即建议停（前置跳闸比跑到一半再跳便宜——中途中断浪费已投入的编排，
 * 且留下半途问题）。停机判据恰好三条（不多判，不发明停机理由）：
 *   1. breakerTripped（事件台账已记录跳闸）；
 *   2. completed（战役已收尾，拒绝僵尸调度）；
 *   3. 存在下一个 pending 问题且 cumulativeTokens + ESTIMATED_PER_QUESTION_TOKENS
 *           > budgetTokens（预算前置超限）。
 * 无 pending 问题但未收尾时返回 continue=true / 'no_pending_questions'——收尾
 * （campaign_completed）是调度器的职责，守门人只看预算与旗标。
 *
 * reason 是稳定机器可 grep 的词元（兄弟模块 scheduler/report 按此对齐）：
 *   'breaker_tripped' | 'campaign_completed' | 'budget_precheck_over_budget'
 *   | 'no_pending_questions' | 'ok'
 *
 * Cannot-prove（不可隐藏）：前置检查用的是估计值，不是保证——单题实际消耗可能
 * 超过估计（此时仍会中途中断，调度器侧的运行中跳闸防线仍然承重）；本守门人
 * 对问题质量、战役科学价值不作任何判断。
 */

import type { CampaignState } from './types.ts';

/**
 * 单题 token 消耗估计（预算前置检查用）。
 * 校准依据：a2/d9 实测战役单题消耗 225k–315k tokens；300k 取中心估计并留
 * ≈20% 余量（高于 ~250k 中位）。高估 → 前置跳闸偏早（安全：不会中途超支）；
 * 低估 → 中途跳闸（更贵）。偏早停优于超支后停。
 */
export const ESTIMATED_PER_QUESTION_TOKENS = 300_000;

export interface ContinueDecision {
  readonly continue: boolean;
  readonly reason: string;
}

/** 是否继续调度下一个问题（纯函数；停机判据见模块文档，恰好三条）。 */
export function shouldContinue(state: CampaignState): ContinueDecision {
  if (state.breakerTripped) {
    return { continue: false, reason: 'breaker_tripped' };
  }
  if (state.completed) {
    return { continue: false, reason: 'campaign_completed' };
  }
  const nextPending = state.questions.find((q) => q.status === 'pending');
  if (nextPending === undefined) {
    return { continue: true, reason: 'no_pending_questions' };
  }
  const projected = state.cumulativeTokens + ESTIMATED_PER_QUESTION_TOKENS;
  if (projected > state.budgetTokens) {
    return { continue: false, reason: 'budget_precheck_over_budget' };
  }
  return { continue: true, reason: 'ok' };
}
