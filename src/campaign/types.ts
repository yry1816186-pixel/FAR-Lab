/**
 * campaign/types — §10 campaign 基础设施的公共契约类型（night-r7 S1）。
 *
 * 战役（campaign）= 围绕一个 topic 的一组研究问题的长程调度单元：预算护栏、
 * 事件溯源状态、崩溃恢复。事件台账（event_log）是唯一事实源，状态（CampaignState）
 * 是可重建的派生投影——与 research/memory 对 run 文件的关系同构。
 *
 * Cannot-prove（不可隐藏）：
 *   - 事件类型与状态只刻画战役的「调度事实」（何时开始、消耗多少 token、成败计数），
 *     不证明任何被引用 run（runId）本身的科学健全性——那是 run/verify 链的职责；
 *   - `at` 时间戳是本地钟（记事语义，在确定性内核之外）；无外部时间锚定时，
 *     它不构成优先权证据（对照 discovery/registry_anchor 的锚定纪律）。
 */

/** 战役事件负载（判别联合：6 种调度事件 + 8 种 HITL 审计事件，SCI-HITL-001 additive）。 */
export type CampaignEventPayload =
  | { readonly type: 'campaign_started'; readonly topic: string; readonly plannedQuestions: readonly string[]; readonly budgetTokens: number; readonly questionsSource?: 'explicit' | 'llm' }
  | { readonly type: 'question_started'; readonly index: number; readonly question: string }
  | { readonly type: 'question_completed'; readonly index: number; readonly question: string; readonly runId: string; readonly tokens: number; readonly status: 'OK' }
  | { readonly type: 'question_failed'; readonly index: number; readonly question: string; readonly errorKind: 'rate_limited' | 'model_output_invalid' | 'unknown'; readonly detail: string }
  | { readonly type: 'budget_breaker_tripped'; readonly cumulativeTokens: number; readonly remainingQuestions: number }
  | { readonly type: 'campaign_completed'; readonly completedCount: number; readonly failedCount: number; readonly totalTokens: number }
  // ── SCI-HITL-001：人类输入事件（append-only 审计层，随主台账哈希链）───────
  // 分层铁律：human prior 恒带 kind='context'（evidenceAdmissibility 恒拒，
  // 不得进证据聚合）；HITL 事件只入审计链，不改 deriveCampaignState 的机器
  // 调度投影（人类批准不自动提升科学状态）。回滚 = 追加 human_event_reverted
  // 引用被回滚事件的 seq——审计链保留原事件，绝不删除。
  | { readonly type: 'prior_injected'; readonly priorId: string; readonly actor: string; readonly statement: string; readonly kind: 'context' }
  | { readonly type: 'annotation'; readonly targetId: string; readonly actor: string; readonly note: string }
  | { readonly type: 'resource_veto'; readonly actor: string; readonly resource: string; readonly reason: string }
  | { readonly type: 'revision_requested'; readonly targetId: string; readonly actor: string; readonly note: string }
  | { readonly type: 'campaign_paused'; readonly actor: string; readonly reason: string }
  | { readonly type: 'campaign_resumed'; readonly actor: string; readonly reason: string }
  | { readonly type: 'risk_accepted'; readonly actor: string; readonly riskDescription: string; readonly acknowledgement: string }
  | { readonly type: 'human_event_reverted'; readonly revertedSeq: number; readonly actor: string; readonly reason: string };

/** 台账行：eventHash 覆盖 {seq, at, payload, prevEventHash}（自身除外），prevEventHash 指向前一行（创世行为 ''）。 */
export interface CampaignEvent { readonly seq: number; readonly at: string; readonly payload: CampaignEventPayload; readonly prevEventHash: string; readonly eventHash: string }

/** 单个问题的调度状态（pending → running → OK | failed，单向）。 */
export interface CampaignQuestionState { readonly index: number; readonly question: string; readonly status: 'pending' | 'running' | 'OK' | 'failed' }

/** 战役状态：事件台账的纯折叠投影（deriveCampaignState 重建，不落盘）。 */
export interface CampaignState {
  readonly campaignId: string; readonly topic: string; readonly budgetTokens: number;
  readonly questions: readonly CampaignQuestionState[];
  readonly cumulativeTokens: number; readonly breakerTripped: boolean; readonly completed: boolean;
}
