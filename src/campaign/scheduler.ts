/**
 * campaign/scheduler — 战役问题循环执行器（night-r7 S2 §10）。
 *
 * 持久问题循环：事件台账是唯一事实源，状态永远从台账重放推导（deriveCampaignState），
 * 进程随时可被杀 —— 重启后 runCampaignLoop 从台账继续（crash-resume）。这是把
 * drive-day2.mjs 手工驱动（HEAD 锚定、幂等、fail-visibly）泛化为可恢复执行器。
 *
 * 崩溃恢复协议（replay-recovery，本模块的核心价值）：
 *   启动时发现 status='running' 的问题（上次进程在问题执行中途死亡 —— 台账有
 *   question_started 无 terminal 事件）→ 先补记 question_failed
 *   {errorKind:'unknown', detail:'crash-recovered: process interrupted mid-question'}
 *   （诚实记录中断，不假装它完成），再把它列入重试集合，走完整的
 *   question_started → runQuestion → terminal 流程（底层研究管线有自己的
 *   checkpoint，重跑从头安全）。每个崩溃问题在一次 runCampaignLoop 调用内只
 *   自动重试一次（防 unknown 错误无限失败循环）；live 失败（非崩溃残留）不自动重试。
 *
 * 契约修订（CONTRACT AMENDMENT — 需与 S1 的 deriveCampaignState 对齐）：
 *   deriveCampaignState 必须允许 failed→running 的转移（同一 index 在 failed 后
 *   再收到 question_started = 重试）。合法状态机：
 *     pending → running → (OK | failed) → running(重试) → (OK | failed)
 *   OK 之后不允许再 started（终态不可重试）。
 *
 * 停机语义（诚实停止，不静默；任何退出路径都在循环外统一记账）：
 *   - rate_limited：某问题遇 429/限流 → 记 question_failed(errorKind='rate_limited')
 *     后立即停止循环。限流不是预算问题，不记 budget_breaker_tripped；剩余 pending
 *     保持 pending，重启循环后从 pending 继续（由操作者择机重启）。
 *   - 预算熔断：shouldContinue 拒绝（guardian 唯一的停机条件是预算估算熔断）且
 *     仍有未终态问题 → 记 budget_breaker_tripped {cumulativeTokens, remainingQuestions}
 *     （幂等：台账已有熔断事件则不重复记 —— 重启已熔断的战役不再追加）。
 *   - 全部终态 → campaign_completed（幂等：台账已有则跳过）。
 *   停止原因查询：lastStopReason(events) 从台账尾事件推导。
 *
 * 单写者假设：一个战役目录同一时刻只允许一个 runCampaignLoop 进程（同 store.ts）。
 *
 * Cannot-prove（本机制不能证明什么）：
 *   - 台账哈希链证明事件流完整性，不证明 tokens 计量与真实 API 计费一致；
 *   - errorKind 分类是对错误消息的启发式匹配（'429'/词边界 'rate'、'not valid JSON'/
 *     'schema validation'），措辞不同可能落到 'unknown'（保守诚实，不猜）；
 *   - 熔断基于 guardian 的 ESTIMATED_PER_QUESTION_TOKENS 估算，不是真实预算
 *     执行的保证 —— 超支可能先于熔断发生。
 */

import { shouldContinue } from './guardian.ts';
import { appendEvent, loadCampaign } from './store.ts';
import type { CampaignEvent, CampaignState } from './types.ts';

/** 单问题执行结果（runQuestion 成功时）。tokens = 该题真实消耗（执行器如实上报）。 */
export interface RunQuestionOutcome {
  readonly runId: string;
  readonly tokens: number;
  readonly status: 'OK';
}

/** 注入的执行器：跑一个研究问题（底层管线自带 checkpoint；抛错 = 该题失败）。 */
export type RunQuestion = (question: string) => Promise<RunQuestionOutcome>;

/** 台账尾事件推导的停机原因。 */
export type CampaignStopReason = 'completed' | 'budget' | 'rate_limit' | 'in_progress';

/**
 * 错误分类（启发式，大小写不敏感）：
 *   - 含 '429' 或词边界 'rate'（'rate limit' / 'rate_limited' / 'Rate limited'）
 *     → rate_limited。词边界是刻意收紧：'generate failed' 里的 'rate' 不是限流。
 *   - 含 'not valid json' 或 'schema validation' → model_output_invalid。
 *   - 其余 → unknown（保守诚实）。
 */
export function classifyErrorKind(
  message: string,
): 'rate_limited' | 'model_output_invalid' | 'unknown' {
  const m = message.toLowerCase();
  if (m.includes('429') || /\brate/.test(m)) return 'rate_limited';
  if (m.includes('not valid json') || m.includes('schema validation')) {
    return 'model_output_invalid';
  }
  return 'unknown';
}

/** 崩溃恢复补记事件的 detail 固定文案（测试与审计据此识别 replay-recovery）。 */
export const CRASH_RECOVERY_DETAIL = 'crash-recovered: process interrupted mid-question';

function terminal(q: { status: string }): boolean {
  return q.status === 'OK' || q.status === 'failed';
}

export interface RunCampaignLoopInput {
  readonly dir: string;
  readonly runQuestion: RunQuestion;
  /** 注入时钟（测试确定性）；默认真实时刻。 */
  readonly now?: () => Date;
  /**
   * 预留注入睡眠（前向兼容）。v1 在 rate_limited 时诚实停机而非退避重试，
   * 故当前未使用 —— 接受该参数是为了让未来加退避不破坏调用方签名。
   */
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * 可恢复的战役问题循环：
 *   1. loadCampaign（坏链 → CorruptCampaignLedgerError，fail-closed）
 *   2. 崩溃恢复：running 残留 → 补记 question_failed(unknown, crash-recovered) → 入重试集合
 *   3. while shouldContinue(state).continue：
 *      取最低 index 的（pending ∪ 重试集合内 failed）问题 → question_started →
 *      await runQuestion → question_completed(tokens) / question_failed(classify)
 *      —— 单题失败不杀循环（隔离）；rate_limited 则诚实停机
 *      每题后从台账重放推导状态（crash-resume 的状态基线）
 *   4. 停机记账：熔断（幂等）→ budget_breaker_tripped；全部终态（幂等）→ campaign_completed
 * 返回最终重放推导的 CampaignState。
 */
export async function runCampaignLoop(input: RunCampaignLoopInput): Promise<CampaignState> {
  const now = input.now ?? (() => new Date());
  let { events, state } = loadCampaign(input.dir); // fail-closed：坏链在此抛出

  // --- 崩溃恢复：running 残留 → 补记失败（诚实中断）→ 重试集合 ---
  const crashed = state.questions.filter((q) => q.status === 'running');
  for (const q of crashed) {
    appendEvent(
      input.dir,
      {
        type: 'question_failed',
        index: q.index,
        question: q.question,
        errorKind: 'unknown',
        detail: CRASH_RECOVERY_DETAIL,
      },
      now,
    );
  }
  if (crashed.length > 0) {
    ({ events, state } = loadCampaign(input.dir));
  }
  const retry = new Set(crashed.map((q) => q.index));

  // --- 主循环 ---
  let rateLimitedStop = false;
  while (!rateLimitedStop) {
    if (!shouldContinue(state).continue) break; // guardian 停机（预算熔断）→ 循环外记账
    const next = state.questions
      .filter((q) => q.status === 'pending' || (q.status === 'failed' && retry.has(q.index)))
      .sort((a, b) => a.index - b.index)
      .at(0);
    if (next === undefined) break; // 无可执行问题（全部终态 / 仅剩不可重试 failed）→ 自然结束
    retry.delete(next.index); // 每个崩溃问题只自动重试一次

    appendEvent(
      input.dir,
      { type: 'question_started', index: next.index, question: next.question },
      now,
    );

    try {
      const outcome = await input.runQuestion(next.question);
      appendEvent(
        input.dir,
        {
          type: 'question_completed',
          index: next.index,
          question: next.question,
          runId: outcome.runId,
          tokens: outcome.tokens,
          status: 'OK',
        },
        now,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const errorKind = classifyErrorKind(detail);
      appendEvent(
        input.dir,
        {
          type: 'question_failed',
          index: next.index,
          question: next.question,
          errorKind,
          detail,
        },
        now,
      );
      if (errorKind === 'rate_limited') {
        rateLimitedStop = true; // 诚实停机：限流不是预算，剩余 pending 留待操作者重启
      }
    }
    ({ events, state } = loadCampaign(input.dir)); // 每题后重放（状态永远源于台账）
  }

  // --- 停机记账（统一在循环外，覆盖所有退出路径）---
  const nonTerminalCount = state.questions.filter((q) => !terminal(q)).length;
  const breakerAlreadyRecorded = events.some((e) => e.payload.type === 'budget_breaker_tripped');
  if (
    nonTerminalCount > 0 &&
    !breakerAlreadyRecorded &&
    !shouldContinue(state).continue
  ) {
    appendEvent(
      input.dir,
      {
        type: 'budget_breaker_tripped',
        cumulativeTokens: state.cumulativeTokens,
        remainingQuestions: nonTerminalCount,
      },
      now,
    );
    ({ events, state } = loadCampaign(input.dir));
  }

  const allTerminal = state.questions.every(terminal);
  const completedAlreadyRecorded = events.some((e) => e.payload.type === 'campaign_completed');
  if (allTerminal && !completedAlreadyRecorded) {
    appendEvent(
      input.dir,
      {
        type: 'campaign_completed',
        completedCount: state.questions.filter((q) => q.status === 'OK').length,
        failedCount: state.questions.filter((q) => q.status === 'failed').length,
        totalTokens: state.cumulativeTokens,
      },
      now,
    );
    state = loadCampaign(input.dir).state; // events 不再被读取 —— 只重载返回值所需的 state
  }

  return state;
}

/**
 * 从台账尾事件推导停机原因（纯函数，读尾不扫描全链 —— 最近一次决定生效）：
 *   campaign_completed → 'completed'；budget_breaker_tripped → 'budget'；
 *   尾事件是 rate_limited 失败 → 'rate_limit'；其余（含空台账）→ 'in_progress'。
 */
export function lastStopReason(events: readonly CampaignEvent[]): CampaignStopReason {
  const tail = events.at(-1);
  if (tail === undefined) return 'in_progress';
  const payload = tail.payload;
  switch (payload.type) {
    case 'campaign_completed':
      return 'completed';
    case 'budget_breaker_tripped':
      return 'budget';
    case 'question_failed':
      return payload.errorKind === 'rate_limited' ? 'rate_limit' : 'in_progress';
    default:
      return 'in_progress';
  }
}
