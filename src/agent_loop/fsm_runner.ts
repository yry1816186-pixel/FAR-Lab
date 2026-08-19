/**
 * fsm_runner —— agent_loop 主循环（runAgentLoop + assertTerminated）。
 *
 * T-016 反馈边状态（2026-07-24 ·F-4-004 澄清）：
 *   ✅ 已有：[6]→[3] 基于 FeedbackSignal 的 hypothesis regen 反馈边
 *      - stage6_feedback 产 FeedbackSignal（LLM 自评 continueIteration + refinements）
 *      - 本 runner 把 feedbackSignal 回灌给下一轮 stage3（L262-269/L308/L352）
 *      - stage3_hypothesis 消费 feedbackSignal.refinements 重新生成假设（stage3_hypothesis.ts:119-128）
 *      - 回归测试：tests/agent_loop/t016_feedback_edge.test.ts（两轮迭代 + maxIter 兜底）
 *   ✅ 裁决驱动反馈边（V2 roadmap 项·2026-08-06 落地·opt-in RunAgentLoopArgs.verdictDrivenFeedback）：
 *      - 循环内每轮跑 evaluateIntermediateVerdict（纯计算·无 DB 副作用·不落库）
 *      - verdict=CONFIRMED → 立即终止（terminationReason='verdict_confirmed'·确定性胜过 LLM 自评）
 *      - 连续两轮裁决输入指纹相同且非 CONFIRMED → 终止（'verdict_converged'·防 p-hacking 空转）
 *      - 中间裁决 kind 作为 verdictHint 注入下一轮 stage3（regen 方向软建议·只传 kind 不传细节）
 *      - 中间裁决序列返回 LoopState.intermediateVerdicts + session JSONL（审计·可复算）
 *      - 测试：tests/agent_loop/t017_verdict_driven_feedback.test.ts
 *      - 缺省关闭（undefined=false）→ 行为字节等同基线（LLM 自评反馈边不变·零回归）
 *   ⚠ 残余说明：verdictHint 是「软建议」注入（LLM 仍独立生成假设）——硬性假设改写（机器改 claim）
 *      不引入（防机器与 LLM 意见冲突 + 保持假设归 LLM 产出的责任边界）。
 *
 * 适配说明（与 spec §8 的差异·按项目实际 API 优先）：
 *   1. spec §8 入参 `bailianClient: OpenAI` → 本文件入参 `gateway + profile +
 *      finishReasonExtractor + reproHashProvider + gitCommitSha + appendOptions +
 *      researchInput`（types.ts StageContext 已适配·见 types.ts 顶部注释第 5 条）。
 *   2. spec §8 `extractTotalTokens(callResult.data)` → 本文件
 *      `extractTotalTokens(callResult)`（从 LlmResponse.credential.tokenUsage.totalTokens
 *      提取·LlmResponse 已含 tokenUsage·非 unknown data 收窄）。
 *   3. spec §8 `feedbackSignal = (stage6.structured as FeedbackPayload).feedbackSignal`
 *      → 本文件用 `narrowFeedback(stage6).feedbackSignal`（discriminatedUnion narrow·禁 as 强转）。
 *   4. spec §8 错误恢复（§7.2 表）部分策略由 stage 执行器内部实现（如 retry_policy）；
 *      fsm_runner 层捕获 AgentLoopError 后终止循环（reason='error'）。
 *      复杂的「FALSIFIABILITY_GATE_BLOCK 降级」策略由 stage3 内部决定是否抛 vs 降级标注，
 *      fsm_runner 只透传。
 *
 * 终止条件（§7.1 + V2 裁决驱动）：
 *   1. feedback_converged — stage6 产 FeedbackSignal.continueIteration === false
 *   2. verdict_confirmed — verdictDrivenFeedback 开启且中间裁决 = CONFIRMED（确定性立即终止）
 *   3. verdict_converged — verdictDrivenFeedback 开启且连续两轮裁决输入指纹相同（防 p-hacking 空转）
 *   4. max_iterations — iteration > termination.maxIterations
 *   5. max_tokens — tokensConsumed >= termination.maxTokensPerRun（算力预算闸）
 *   6. max_duration — wallClock >= termination.maxDurationMs
 *   7. error — 任意阶段抛 AgentLoopError
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import type { Database } from 'better-sqlite3';

import type { AppendRecordOptions } from '../evidence_log/types.ts';
import type { LlmGateway } from '../llm_gateway/gateway.ts';
import { sanitizeExternalContent } from '../llm_gateway/sanitizer.ts';
import {
  DEFAULT_BUDGET_PROFILE,
  checkBudget,
  validateBudgetProfile,
  CostBudgetExceeded,
  type BudgetProfile,
} from '../llm_gateway/budget.ts';
import { getChainHead } from '../evidence_log/repository.ts';
import type {
  LlmResponse,
  ProviderProfile,
} from '../llm_gateway/types.ts';
import type {
  FeedbackPayload,
  FeedbackSignal,
  FinishReasonExtractor,
  IntermediateVerdict,
  LoopState,
  ReproHashProvider,
  StageArtifact,
  StageContext,
  StageId,
  TerminationCriteria,
} from './types.ts';
import { StageReceiptStore, StageReceiptForgedError } from './stage_receipt_store.ts';
import { compactArtifacts } from './compaction.ts';
import { evaluateIntermediateVerdict } from './verdict_stage.ts';
import type { AgentLoopEvent } from './events.ts';
import { ExtensionStageError, listStages } from './stage_registry.ts';
import type { AgentLoopController } from './controller.ts';
import type { Verdict } from '../schema/enums.ts';
import { SessionRecorder } from '../trace/session_recorder.ts';
import { createHash } from 'node:crypto';
import { runStage1 } from './stages/stage1_understanding.ts';
import { runStage2 } from './stages/stage2_integration.ts';
import { runStage3 } from './stages/stage3_hypothesis.ts';
import { runStage4 } from './stages/stage4_evidence.ts';
import { runStage5 } from './stages/stage5_plan.ts';
import { runStage6 } from './stages/stage6_feedback.ts';
import { runVerdictStage } from './verdict_stage.ts';


// ---------- 默认终止条件 ----------

/** 16-hex 内容锚（session 事件 payload 用·审计可溯源）。 */
function shortSha(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

/**
 * 默认终止条件（spec §8 默认值）。
 *
 * - maxIterations=3：防无限循环烧配额（宪法 §5.2）
 * - maxTokensPerRun=50000：单轮 token 上限
 * - maxDurationMs=10*60*1000：单轮墙钟上限 10 分钟
 */
export const DEFAULT_TERMINATION: TerminationCriteria = {
  maxIterations: 3,
  maxTokensPerRun: 50000,
  maxDurationMs: 10 * 60 * 1000,
};


// ---------- runAgentLoop 入参 ----------

/**
 * runAgentLoop 入参（不含循环内部状态）。
 *
 * 循环内部状态（iteration / prevArtifacts / feedbackSignal / tokensConsumed）
 * 由 runAgentLoop 内部维护，不在入参中。
 */
export interface RunAgentLoopArgs {
  readonly runId: string;
  readonly researchInput: string;
  readonly gateway: LlmGateway;
  readonly profile: ProviderProfile;
  readonly finishReasonExtractor: FinishReasonExtractor;
  readonly reproHashProvider: ReproHashProvider;
  readonly gitCommitSha: string;
  readonly appendOptions: AppendRecordOptions;
  readonly evidenceLogDb: Database;
  readonly termination?: TerminationCriteria;
  /**
   * G7(IC-04):成本硬预算断路器。
   * - 缺省:DEFAULT_BUDGET_PROFILE(默认开启,宽松兜底);
   * - 显式 null:关闭(红线决策,须调用方明示);
   * - 显式 profile:超限即停(fail-closed),LoopState.error.code='COST_BUDGET_EXCEEDED'。
   */
  readonly budget?: BudgetProfile | null;
  /**
   * IC-06:stage_receipt 恢复存储路径(可选)。
   * 设置后:每 stage 完成签收据(脱敏)+快照落盘;重启从最近有效收据后续跑(幂等跳过);
   * 输入变化→收据失效全量重跑;收据链伪造→fail-closed。
   */
  readonly resumeStorePath?: string;
  /** 可选：每阶段 artifact 入链后回调（流式输出用·向后兼容·默认不调）。 */
  readonly onArtifact?: (artifact: StageArtifact) => void;
  /**
   * P0-3 运行时事件流（2026-08-07 落地）：订阅 runAgentLoop 生命周期事件
   * （run_started / stage_started / stage_completed / iteration_completed /
   * run_completed / run_error）。供 SSE/CLI/前端实时显示。
   * 缺省 undefined → 零行为（字节等同基线·回归兼容）。
   */
  readonly onEvent?: (evt: AgentLoopEvent) => void;
  /**
   * R3（V2 信封生产者）：裁决计算观测回调（透传 runVerdictStage.onComputation）。
   * 缺省 undefined → 零行为变化（字节等同基线·回归兼容）。
   */
  readonly onComputation?: (computation: import('./verdict_stage.ts').VerdictComputation) => void;
  /**
   * IC-15 T1'（V2 裁决软建议）：上一次完整 runAgentLoop 调用的 verdict kind。
   * 可选；缺省 = undefined → stage6 prompt 不注入 verdict hint（字节等同基线·回归兼容）。
   * 仅传 5 值枚举本身；软建议非硬驱动（不触发自动 regen 循环，防 p-hacking）。
   */
  readonly priorVerdictKind?: import('../schema/enums.ts').Verdict;
  /**
   * E-compaction（session-compaction 语义）：iteration ≥ 2 时对注入
   * stage prompt 的 prevArtifacts 应用上下文压缩（stage3/4 裁决关键产物完整保留·
   * 叙述字段截断 + hash 锚可溯源）。缺省 false → 字节零回归（与历史行为一致）。
   */
  readonly compactArtifacts?: boolean;
  /**
   * E-session（JSONL session format）：可选 session 录制路径。
   * 设置后：run_started/(stage_started→stage_completed)×N/run_completed 实时追加 JSONL（审计观察层·
   * 与 evidence_log 哈希链正交）。缺省 undefined → 零回归。
   */
  readonly sessionPath?: string;
  /**
   * V2 裁决驱动反馈边（T-016 V2 roadmap 项·2026-08-06 落地）：循环内每轮评估中间裁决
   * （纯计算·无 DB 副作用·不落库），verdict=CONFIRMED 立即终止（确定性胜过 LLM 自评），
   * 连续两轮裁决输入指纹相同且非 CONFIRMED → verdict_converged 终止（防 p-hacking 空转），
   * 中间裁决 kind 作为软建议注入下一轮 stage3（regen 方向·只传 kind 不传细节）。
   * 缺省 undefined=false → 行为字节等同基线（LLM 自评反馈边不变·零回归）。
   */
  readonly verdictDrivenFeedback?: boolean;
  /**
   * P0-3 人工接管（2026-08-07 落地）：controller.hold() 后，fsm 在下一阶段开始处
   * 发出 stage_held 事件并异步等待；controller.resume() 发 stage_resumed 后继续。
   * 供 CLI 交互/前端 UI/测试插入人工检查-干预点。缺省 undefined → 零行为
   * （未 hold 时 waitIfHeld 同步返回·字节等同基线）。
   */
  readonly controller?: AgentLoopController;
  /**
   * P0-3 并行扩展阶段（2026-08-07 落地）：主链收敛并产出裁决后，并发执行
   * stage_registry 中注册的带 executor 的扩展阶段（order>6·Promise.all 并行），
   * 产物并入 artifacts（复用证据链/收据/事件语义）。扩展失败显式抛
   * ExtensionStageError → LoopState.error.code='EXTENSION_STAGE_FAILED'
   * （反剧场 F11·绝不静默吞错）。缺省 undefined=false → 零行为（字节等同基线）。
   */
  readonly runParallelExtensionStages?: boolean;
}


// ---------- runAgentLoop 主循环 ----------

/**
 * runAgentLoop — FAR-Lab 科研循环主入口。
 *
 * 六阶段确定性 FSM：
 *   [1] understanding → [2] integration → [3] hypothesis (gate) →
 *   [4] evidence → [5] plan → [6] feedback → (回灌 [3] 或终止)
 *
 * 每阶段产物落 evidence_log（信任根），stage3 过 falsifiability_gate 硬阻断。
 *
 * 终止后返回 LoopState（含全部 artifacts + terminationReason + error?）。
 *
 * @throws 永不抛出（错误捕获后填入 LoopState.error·reason='error'）
 */
export async function runAgentLoop(args: RunAgentLoopArgs): Promise<LoopState> {
  const termination: TerminationCriteria = args.termination ?? DEFAULT_TERMINATION;
  // G7(IC-04):缺省=默认兜底预算(默认开启);显式 null=关闭(红线,调用方明示)
  const budgetProfile: BudgetProfile | null =
    args.budget === undefined ? DEFAULT_BUDGET_PROFILE : args.budget;
  // V06-F5 修复:预算配置校验(NaN/undefined/负值=非法,不再静默关闭维度;显式 null 关闭保留)
  if (budgetProfile !== null) {
    validateBudgetProfile(budgetProfile);
  }
  const startTime: number = Date.now();
  /** F-V07-05:resume 时已被收据覆盖的墙钟(在 open 后校准 startTime) */
  let resumedElapsedMs = 0;
  const artifacts: StageArtifact[] = [];
  // E-session（可选）：运行时 JSONL 录制（审计观察层）
  const session: SessionRecorder | null =
    args.sessionPath !== undefined ? SessionRecorder.open(args.sessionPath) : null;
  if (session !== null) {
    session.record({
      kind: 'run_started',
      runId: args.runId,
      ts: new Date().toISOString(),
      payload: { researchInputHash: shortSha(args.researchInput) },
    });
  }
  if (args.onEvent !== undefined) {
    args.onEvent({
      type: 'run_started',
      runId: args.runId,
      ts: new Date().toISOString(),
      researchInputHash: shortSha(args.researchInput),
      maxIterations: termination.maxIterations,
      verdictDriven: args.verdictDrivenFeedback ?? false,
    });
  }
  const appendArtifact = (a: StageArtifact): void => {
    artifacts.push(a);
    if (session !== null) {
      session.record({
        kind: 'stage_completed',
        runId: args.runId,
        stageId: a.stageId,
        ts: new Date().toISOString(),
        payload: {
          iteration,
          payloadKind: a.payloadKind,
          degraded: a.degraded,
          contentHash: shortSha(JSON.stringify(a.structured)),
        },
      });
    }
    if (args.onEvent !== undefined) {
      args.onEvent({
        type: 'stage_completed',
        runId: args.runId,
        iteration,
        stageId: a.stageId,
        payloadKind: a.payloadKind,
        degraded: a.degraded,
        tokens: tokensConsumed,
        contentHash: shortSha(JSON.stringify(a.structured)),
        ts: new Date().toISOString(),
      });
    }
    if (args.onArtifact !== undefined) args.onArtifact(a);
  };
  // 终止/出错统一收尾：写 run_completed + close（幂等防重入）
  let sessionFinalized = false;
  const finalizeSession = (payload: Record<string, unknown>): void => {
    if (session !== null && !sessionFinalized) {
      sessionFinalized = true;
      session.record({ kind: 'run_completed', runId: args.runId, ts: new Date().toISOString(), payload });
      session.close();
    }
  };
  let feedbackSignal: FeedbackSignal | null = null;
  let tokensConsumed = 0;
  let iteration = 1;
  // V2 裁决驱动反馈边（verdictDrivenFeedback 开启时维护）：
  //   intermediateVerdicts —— 循环内中间裁决序列（审计·随 LoopState 返回）
  //   lastInputHash —— 上一轮裁决输入确定性指纹（防 p-hacking 重复输入检测）
  //   verdictHintForNext —— 本轮中间裁决 kind（注入下一轮 stage3 作 regen 方向软建议）
  const intermediateVerdicts: IntermediateVerdict[] = [];
  let lastInputHash: string | null = null;
  let verdictHintForNext: Verdict | undefined = undefined;

  // baseCtx 是循环外不变的 StageContext 部分（循环内部状态字段在每轮重新构造）
  // G3(IC-02):researchInput 为外部内容,进循环前统一 untrusted 包装+指令剥离(数据≠指令)
  // IC-15 T1':priorVerdictKind 可选透传（undefined 时 stage6 行为字节等同基线）
  const baseCtx: Omit<StageContext,
    'iteration' | 'prevArtifacts' | 'feedbackSignal' | 'tokensConsumed'
  > = {
    runId: args.runId,
    researchInput: sanitizeExternalContent(args.researchInput).text,
    gateway: args.gateway,
    profile: args.profile,
    finishReasonExtractor: args.finishReasonExtractor,
    reproHashProvider: args.reproHashProvider,
    gitCommitSha: args.gitCommitSha,
    appendOptions: args.appendOptions,
    evidenceLogDb: args.evidenceLogDb,
    termination,
    ...(args.priorVerdictKind !== undefined ? { priorVerdictKind: args.priorVerdictKind } : {}),
  };

  try {
    // IC-06:resume 存储(可选;伪造收据链 fail-closed;输入变化自动重置)
    const resumeStore =
      args.resumeStorePath !== undefined
        ? StageReceiptStore.open(args.resumeStorePath, args.researchInput)
        : null;
    if (resumeStore !== null) {
      const last = resumeStore.lastReceipt();
      // F-V07-03 修复:血缘绑定——resume 的 DB 必须包含最后收据签收时的链头
      // (空心裁决攻击:同存储+全新空 DB → 裁决脱离证据基座;此处 fail-closed)。
      if (last?.lineageHead !== undefined && last.lineageHead !== '' && last.lineageCount !== undefined) {
        const row = args.evidenceLogDb
          .prepare(`SELECT COUNT(*) AS c FROM call_records`)
          .get() as { c: number };
        const atSeq = row.c >= last.lineageCount
          ? (args.evidenceLogDb
              .prepare(`SELECT current_hash FROM call_records WHERE seq = ?`)
              .get(last.lineageCount) as { current_hash: string } | undefined)
          : undefined;
        if (atSeq === undefined || atSeq.current_hash !== last.lineageHead) {
          throw new StageReceiptForgedError(
            `血缘不符:收据签收链头(seq=${last.lineageCount})不在当前 DB 链中(换了 DB 或证据被改写;拒绝空心续跑)`,
          );
        }
      }
      // F-V07-05 修复:G7 duration 跨 resume 延续(墙钟不清零)
      if (last?.elapsedMs !== undefined) {
        resumedElapsedMs = last.elapsedMs;
      }
    }
    const runStageWithReceipt = async (
      stageId: StageId,
      execute: () => Promise<StageArtifact>,
    ): Promise<StageArtifact> => {
      const key = `${iteration}:${stageId}`;
      if (resumeStore !== null && resumeStore.hasSnapshot(key)) {
        // 幂等重放:不重复 LLM 调用、不重复落库、不重复副作用
        if (session !== null) {
          session.record({
            kind: 'stage_started',
            runId: args.runId,
            stageId,
            ts: new Date().toISOString(),
            payload: { iteration, replayedFromReceipt: true },
          });
        }
        return resumeStore.snapshot(key);
      }
      const stageStartedAt = new Date().toISOString();
      if (session !== null) {
        session.record({
          kind: 'stage_started',
          runId: args.runId,
          stageId,
          ts: stageStartedAt,
          payload: { iteration },
        });
      }
      if (args.onEvent !== undefined) {
        args.onEvent({
          type: 'stage_started',
          runId: args.runId,
          iteration,
          stageId,
          ts: stageStartedAt,
        });
      }
      // P0-3 人工接管：hold 后暂停在此处（人工检查/干预点·resume 前不执行本阶段）
      if (args.controller !== undefined && args.controller.isHeld()) {
        if (args.onEvent !== undefined) {
          args.onEvent({
            type: 'stage_held',
            runId: args.runId,
            iteration,
            stageId,
            ts: new Date().toISOString(),
          });
        }
        await args.controller.waitIfHeld();
        if (args.onEvent !== undefined) {
          args.onEvent({
            type: 'stage_resumed',
            runId: args.runId,
            iteration,
            stageId,
            ts: new Date().toISOString(),
          });
        }
      }
      const artifact = await execute();
      if (resumeStore !== null) {
        const head = getChainHead(args.evidenceLogDb);
        const countRow = args.evidenceLogDb
          .prepare(`SELECT COUNT(*) AS c FROM call_records`)
          .get() as { c: number };
        resumeStore.record(
          iteration,
          stageId,
          artifact,
          { count: countRow.c, head: head?.currentHash ?? null },
          Date.now() - startTime + resumedElapsedMs,
        );
      }
      return artifact;
    };
    while (true) {
      // E-compaction（可选）：iteration ≥ 2 时注入 stage 的 prevArtifacts 用压缩视图。
      // stage3/4 裁决关键产物完整保留；缺省关闭 → 字节零回归。
      const compactView = (): readonly StageArtifact[] =>
        args.compactArtifacts === true && iteration >= 2 ? compactArtifacts(artifacts) : artifacts;
      // G7(IC-04):成本硬预算断路器(超限即停,fail-closed;计量=tokensConsumed/墙钟/循环数)
      if (budgetProfile !== null) {
        checkBudget(budgetProfile, {
          tokensConsumed,
          elapsedMs: Date.now() - startTime + resumedElapsedMs,
          loopsCompleted: iteration - 1,
        });
      }
      // 顺序执行六阶段（每轮）
      // 注意：stage1/2/4/5 不消费 feedbackSignal（传 null）；仅 stage3 消费 [6]→[3] 回灌

      const stage1 = await runStageWithReceipt('stage1_understanding', () =>
        runStage1({
        ...baseCtx,
        iteration,
        prevArtifacts: compactView(),
        feedbackSignal: null,
        tokensConsumed,
        }));
      appendArtifact(stage1);
      tokensConsumed += extractTotalTokens(stage1.callResult);

      const stage2 = await runStageWithReceipt('stage2_integration', () =>
        runStage2({
        ...baseCtx,
        iteration,
        prevArtifacts: compactView(),
        feedbackSignal: null,
        tokensConsumed,
        }));
      appendArtifact(stage2);
      tokensConsumed += extractTotalTokens(stage2.callResult);

      // stage3：消费 feedbackSignal（[6]→[3] 回灌·首轮为 null）+ verdictHint（V2 裁决驱动·
      // 上一轮中间裁决 kind 软建议·regen 方向指导）+ falsifiability_gate 硬阻断
      const stage3 = await runStageWithReceipt('stage3_hypothesis', () =>
        runStage3({
        ...baseCtx,
        iteration,
        prevArtifacts: compactView(),
        feedbackSignal,
        tokensConsumed,
        ...(verdictHintForNext !== undefined ? { verdictHint: verdictHintForNext } : {}),
        }));
      appendArtifact(stage3);
      tokensConsumed += extractTotalTokens(stage3.callResult);

      const stage4 = await runStageWithReceipt('stage4_evidence', () =>
        runStage4({
        ...baseCtx,
        iteration,
        prevArtifacts: compactView(),
        feedbackSignal: null,
        tokensConsumed,
        }));
      appendArtifact(stage4);
      tokensConsumed += extractTotalTokens(stage4.callResult);

      const stage5 = await runStageWithReceipt('stage5_plan', () =>
        runStage5({
        ...baseCtx,
        iteration,
        prevArtifacts: compactView(),
        feedbackSignal: null,
        tokensConsumed,
        }));
      appendArtifact(stage5);
      tokensConsumed += extractTotalTokens(stage5.callResult);

      const stage6 = await runStageWithReceipt('stage6_feedback', () =>
        runStage6({
        ...baseCtx,
        iteration,
        prevArtifacts: compactView(),
        feedbackSignal: null,
        tokensConsumed,
        }));
      appendArtifact(stage6);
      tokensConsumed += extractTotalTokens(stage6.callResult);

      // 取 stage6 的 FeedbackSignal（用 discriminatedUnion narrow·禁 as 强转）
      const feedbackPayload = narrowFeedback(stage6);
      feedbackSignal = feedbackPayload.feedbackSignal;

      // V2 裁决驱动反馈边（opt-in）：循环内中间裁决评估（纯计算·无 DB 副作用）。
      // 产出顺序：CONFIRMED → 确定性立即终止；重复输入指纹（非 CONFIRMED）→ 防 p-hacking 空转终止；
      // 其余 → 回退 LLM 自评判定（assertTerminated）。
      let verdictDriven: { terminated: boolean; reason: LoopState['terminationReason'] } | null = null;
      if (args.verdictDrivenFeedback === true) {
        const evaluated = evaluateIntermediateVerdict({
          artifacts,
          runId: args.runId,
          gitCommitSha: args.gitCommitSha,
        });
        if (evaluated !== null) {
          const iv: IntermediateVerdict = {
            iteration,
            verdict: evaluated.verdict,
            decisiveRuleId: evaluated.decisiveRuleId,
          };
          intermediateVerdicts.push(iv);
          verdictHintForNext = evaluated.verdict;
          if (evaluated.verdict === 'CONFIRMED') {
            // 确定性裁决确认 → 立即终止（胜过 stage6 LLM 自评 continueIteration=true·
            // 防 LLM 为多烧配额/构造"刚好过"而继续迭代）。
            verdictDriven = { terminated: true, reason: 'verdict_confirmed' };
          } else if (lastInputHash !== null && evaluated.inputHash === lastInputHash) {
            // 连续两轮裁决输入指纹相同（claim+spec+threshold+证据投票全同）→ regen 无意义·
            // 终止（防 LLM 无视裁决软建议重复提交同一假设的 p-hacking 空转）。
            verdictDriven = { terminated: true, reason: 'verdict_converged' };
          }
          lastInputHash = evaluated.inputHash;
        }
      }

      // 终止判定（§7.1 + V2 裁决驱动）
      const ctx: StageContext = {
        ...baseCtx,
        iteration,
        prevArtifacts: compactView(),
        feedbackSignal,
        tokensConsumed,
        ...(verdictHintForNext !== undefined ? { verdictHint: verdictHintForNext } : {}),
      };
      const { terminated, reason } =
        verdictDriven !== null
          ? verdictDriven
          : assertTerminated(ctx, feedbackSignal, startTime);
      if (terminated) {
        // V06-F1 修复:末轮竞态——收敛/终止判定后、裁决产出前复查预算;
        // 只在轮顶检查会让"恰好末轮超限"逃逸并产出裁决(实测 1 tok 预算跑出 14372 tok 的 CONFIRMED)。
        if (budgetProfile !== null) {
          checkBudget(budgetProfile, {
            tokensConsumed,
            elapsedMs: Date.now() - startTime + resumedElapsedMs,
            loopsCompleted: iteration - 1,
          });
        }
        // 第 7 阶段（裁决接通）：六阶段收敛后产真实 VerdictNode（落 verdict_nodes·关联 evidence_log）。
        // 非 error 终止（feedback_converged / max_iterations / max_tokens / max_duration）均尝试裁决——
        // 即便未收敛，已产出的 hypothesis+evidence 仍可被裁决（最大化诚实产出）。
        // 缺前提（无 hypothesis/evidence/空链）→ runVerdictStage 返回 null（文档化降级·不破坏终止语义）。
        // 计算路径真实异常会向上传播被外层 try 捕获→reason='error'（非静默吞错）。
        const verdictNode = runVerdictStage({
          db: ctx.evidenceLogDb,
          artifacts,
          gitCommitSha: args.gitCommitSha,
          runId: args.runId,
          ...(args.onComputation === undefined ? {} : { onComputation: args.onComputation }),
        });
        // P0-3 并行扩展阶段：主链收敛并产出裁决后，并发执行注册的扩展 executor
        // （order>6·独立分支·产物复用证据链/收据/事件语义）。扩展失败显式抛错
        // （ExtensionStageError）→ 外层 catch → LoopState.error.code='EXTENSION_STAGE_FAILED'
        // （反剧场 F11·绝不静默吞错）。
        if (args.runParallelExtensionStages === true) {
          const extensionStages = listStages().filter(
            (s) => s.order > 6 && s.executor !== undefined,
          );
          if (extensionStages.length > 0) {
            const extensionResults: StageArtifact[] = await Promise.all(
              extensionStages.map(async (s) => {
                const executor = s.executor;
                if (executor === undefined) {
                  throw new ExtensionStageError(s.stageId, 'missing executor');
                }
                if (session !== null) {
                  session.record({
                    kind: 'stage_started',
                    runId: args.runId,
                    stageId: s.stageId,
                    ts: new Date().toISOString(),
                    payload: { iteration, extension: true },
                  });
                }
                try {
                  return await executor(ctx);
                } catch (err) {
                  // 包装为 ExtensionStageError：任何 executor 失败都是显式错误
                  // （fail-closed·绝不静默吞错·避免落入 RETRY_EXHAUSTED 兜底）
                  const message = err instanceof Error ? err.message : String(err);
                  throw new ExtensionStageError(s.stageId, message);
                }
              }),
            );
            for (const a of extensionResults) {
              appendArtifact(a);
              tokensConsumed += extractTotalTokens(a.callResult);
            }
          }
        }
        finalizeSession({
          iterations: iteration,
          reason,
          verdict: verdictNode?.verdict ?? null,
          artifactCount: artifacts.length,
          intermediateVerdicts: intermediateVerdicts.map((iv) => `${iv.iteration}:${iv.verdict}`),
        });
        if (args.onEvent !== undefined) {
          args.onEvent({
            type: 'run_completed',
            runId: args.runId,
            reason,
            iterations: iteration,
            artifactCount: artifacts.length,
            verdict: verdictNode?.verdict ?? null,
            decisiveRuleId: intermediateVerdicts.at(-1)?.decisiveRuleId ?? null,
            ts: new Date().toISOString(),
          });
        }
        return {
          runId: args.runId,
          iterationsCompleted: iteration,
          terminated: true,
          terminationReason: reason,
          artifacts,
          verdictNode,
          intermediateVerdicts,
          error: null,
        };
      }

      if (args.onEvent !== undefined) {
        args.onEvent({
          type: 'iteration_completed',
          runId: args.runId,
          iteration,
          tokensConsumed,
          continueIteration: true,
          verdict: intermediateVerdicts.at(-1)?.verdict ?? null,
          decisiveRuleId: intermediateVerdicts.at(-1)?.decisiveRuleId ?? null,
          ts: new Date().toISOString(),
        });
      }
      // 未终止：iteration++ + 下一轮 stage3 会消费 feedbackSignal（[6]→[3] 回灌）
      iteration++;
    }
  } catch (err) {
    // P0-3 事件流：错误终止 → run_error 事件（供 SSE/CLI 实时错误显示）
    if (args.onEvent !== undefined) {
      args.onEvent({
        type: 'run_error',
        runId: args.runId,
        code: err instanceof Error ? err.name : String(err),
        message: err instanceof Error ? err.message : String(err),
        iterations: iteration,
        artifactCount: artifacts.length,
        ts: new Date().toISOString(),
      });
    }
    // E-session：错误终止也落 run_completed（error 标记·审计完整）
    finalizeSession({
      iterations: iteration,
      reason: 'error',
      verdict: null,
      artifactCount: artifacts.length,
      errorCode: err instanceof Error ? err.name : String(err),
    });
    // G7(IC-04):成本断路=清晰错误码(不落入通用 error 语义)
    if (err instanceof CostBudgetExceeded) {
      return {
        runId: args.runId,
        iterationsCompleted: iteration,
        terminated: true,
        terminationReason: 'error',
        artifacts,
        verdictNode: null,
        intermediateVerdicts,
        error: {
          code: 'COST_BUDGET_EXCEEDED',
          message: err.message,
          stageId: null,
          cause: err,
        },
      };
    }
    // 任意阶段抛 AgentLoopError → 终止循环（reason='error'）
    if (err instanceof StageReceiptForgedError) {
      // F-V07-06 修复:收据伪造/血缘不符必须带专属错误码(不再落入 RETRY_EXHAUSTED 兜底)
      return {
        runId: args.runId,
        iterationsCompleted: iteration,
        terminated: true,
        terminationReason: 'error',
        artifacts,
        verdictNode: null,
        intermediateVerdicts,
        error: {
          code: 'STAGE_RECEIPT_FORGED',
          message: err.message,
          stageId: null,
          cause: err,
        },
      };
    }
    if (err instanceof ExtensionStageError) {
      // P0-3 并行扩展阶段失败：显式错误码 + stageId（fail-closed·绝不静默吞错）
      return {
        runId: args.runId,
        iterationsCompleted: iteration,
        terminated: true,
        terminationReason: 'error',
        artifacts,
        verdictNode: null,
        intermediateVerdicts,
        error: {
          code: 'EXTENSION_STAGE_FAILED',
          message: err.message,
          stageId: err.stageId,
          cause: err,
        },
      };
    }
    // 错误恢复策略（§7.2 表）部分由 stage 执行器内部实现（retry_policy / stage3 gate）；
    // fsm_runner 层只负责捕获 + 落 LoopState.error。
    return {
      runId: args.runId,
      iterationsCompleted: iteration,
      terminated: true,
      terminationReason: 'error',
      artifacts,
      verdictNode: null,
      intermediateVerdicts,
      error: toAgentLoopError(err),
    };
  }
}


// ---------- assertTerminated（终止判定） ----------

/**
 * 判定 runAgentLoop 是否终止（§7.1）。
 *
 * 终止条件（任一满足即终止）：
 *   1. feedback_converged — stage6 产 FeedbackSignal.continueIteration === false
 *      （feedbackSignal=null 也视为收敛·首轮无反馈时立即终止）
 *   2. max_iterations — iteration > termination.maxIterations
 *   3. max_tokens — tokensConsumed >= termination.maxTokensPerRun（算力预算闸）
 *   4. max_duration — wallClock >= termination.maxDurationMs
 *
 * 注：error 由 try/catch 处理，不在本函数判定。
 *
 * @returns { terminated, reason } reason 仅在 terminated=true 时有意义
 */
export function assertTerminated(
  ctx: StageContext,
  feedbackSignal: FeedbackSignal | null,
  startTime: number,
): { terminated: boolean; reason: LoopState['terminationReason'] } {
  const { termination, tokensConsumed, iteration } = ctx;

  // 1. feedback_converged（feedbackSignal=null 视为收敛·首轮无反馈即终止）
  if (feedbackSignal === null || !feedbackSignal.continueIteration) {
    return { terminated: true, reason: 'feedback_converged' };
  }
  // 2. max_iterations
  if (iteration > termination.maxIterations) {
    return { terminated: true, reason: 'max_iterations' };
  }
  // 3. max_tokens（算力预算闸·宪法 §5.2）
  if (tokensConsumed >= termination.maxTokensPerRun) {
    return { terminated: true, reason: 'max_tokens' };
  }
  // 4. max_duration
  if (Date.now() - startTime >= termination.maxDurationMs) {
    return { terminated: true, reason: 'max_duration' };
  }
  return { terminated: false, reason: 'feedback_converged' };
}


// ---------- extractTotalTokens（从 LlmResponse 安全提取 token 用量） ----------

/**
 * 从 LlmResponse.credential.tokenUsage.totalTokens 提取 token 用量。
 *
 * LlmResponse 已含 credential.tokenUsage.totalTokens（llm_gateway/types.ts），
 * 非 unknown data 收窄（与 spec §8 不同·spec 是从 BailianCallResult.data 收窄）。
 *
 * 取不到时返回 0（不伪造、不抛）——算力预算闸在 runStage 入口已守 maxTokensPerRun，
 * 此处累计为零不影响阻断语义。
 */
function extractTotalTokens(response: LlmResponse): number {
  const total = response.credential.tokenUsage?.totalTokens;
  if (typeof total === 'number' && Number.isFinite(total) && total >= 0) {
    return total;
  }
  return 0;
}


// ---------- narrowFeedback（discriminatedUnion narrow） ----------

/**
 * 把 StageArtifact.structured 收窄为 FeedbackPayload（R10 discriminatedUnion narrow）。
 *
 * 用于从 stage6 产物提取 feedbackSignal（禁 as 强转）。
 */
function narrowFeedback(artifact: StageArtifact): FeedbackPayload {
  const s = artifact.structured;
  if (s.kind !== 'feedback') {
    throw new Error(
      `fsm_runner.narrowFeedback: expected kind='feedback' but got kind='${s.kind}' ` +
        `(stageId=${artifact.stageId}·stage6 应产 kind='feedback'·检查 stage6_feedback.ts)`,
    );
  }
  return s;
}


// ---------- toAgentLoopError（unknown → AgentLoopError） ----------

/**
 * 把 unknown 错误转换为 AgentLoopError（type guard 收窄·禁 as 强转结构）。
 *
 * 若 err 已是 AgentLoopError 形态（含 code + message + stageId）→ 直接返回。
 * 否则包装为 code='RETRY_EXHAUSTED'（兜底 code·实际错误细节见 cause）。
 */
function toAgentLoopError(err: unknown): import('./types.ts').AgentLoopError {
  if (isAgentLoopErrorLike(err)) {
    return err;
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    code: 'RETRY_EXHAUSTED', // 兜底 code（实际错误类型由 stage 执行器决定）
    message: `runAgentLoop: uncaught error (${message})`,
    stageId: null,
    ...(err instanceof Error ? { cause: err } : {}),
  };
}

/**
 * Type guard：判定 err 是否为 AgentLoopError 形态。
 */
function isAgentLoopErrorLike(err: unknown): err is import('./types.ts').AgentLoopError {
  if (typeof err !== 'object' || err === null) {
    return false;
  }
  if (!('code' in err) || !('message' in err)) {
    return false;
  }
  // code 须为 AgentLoopError.code 联合之一（字符串校验·禁 as 强转）
  const code = (err as { code: unknown }).code;
  if (typeof code !== 'string') {
    return false;
  }
  const validCodes: readonly string[] = [
    'FALSIFIABILITY_GATE_BLOCK',
    'R1_MUTEX',
    'R1_MODEL_UNSAFE',
    'BAILIAN_EMPTY_CHOICES',
    'BAILIAN_NULL_FINISH_REASON',
    'BAILIAN_UNKNOWN_FINISH_REASON',
    'DASHSCOPE_REQUEST_ID_NULL_FATAL',
    'MAX_TOKENS_EXCEEDED',
    'MAX_DURATION_EXCEEDED',
    'STAGE_SCHEMA_INVALID',
    'EXTENSION_STAGE_FAILED',
    'RETRY_EXHAUSTED',
  ];
  return validCodes.includes(code);
}
