/**
 * fsm_runner —— agent_loop 主循环（runAgentLoop + assertTerminated）。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/06_agent_loop.md §7.1（assertTerminated）+ §8（runAgentLoop）.
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
 * 终止条件（§7.1）：
 *   1. feedback_converged — stage6 产 FeedbackSignal.continueIteration === false
 *   2. max_iterations — iteration > termination.maxIterations
 *   3. max_tokens — tokensConsumed >= termination.maxTokensPerRun（算力预算闸）
 *   4. max_duration — wallClock >= termination.maxDurationMs
 *   5. error — 任意阶段抛 AgentLoopError
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import type { Database } from 'better-sqlite3';

import type { AppendRecordOptions } from '../evidence_log/types.ts';
import type { LlmGateway } from '../llm_gateway/gateway.ts';
import type {
  LlmResponse,
  ProviderProfile,
} from '../llm_gateway/types.ts';
import type {
  FeedbackPayload,
  FeedbackSignal,
  FinishReasonExtractor,
  LoopState,
  ReproHashProvider,
  StageArtifact,
  StageContext,
  TerminationCriteria,
} from './types.ts';
import { runStage1 } from './stages/stage1_understanding.ts';
import { runStage2 } from './stages/stage2_integration.ts';
import { runStage3 } from './stages/stage3_hypothesis.ts';
import { runStage4 } from './stages/stage4_evidence.ts';
import { runStage5 } from './stages/stage5_plan.ts';
import { runStage6 } from './stages/stage6_feedback.ts';
import { runVerdictStage } from './verdict_stage.ts';


// ---------- 默认终止条件 ----------

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
}


// ---------- runAgentLoop 主循环 ----------

/**
 * runAgentLoop — FAR-Chain 科研循环主入口。
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
  const startTime: number = Date.now();
  const artifacts: StageArtifact[] = [];
  let feedbackSignal: FeedbackSignal | null = null;
  let tokensConsumed = 0;
  let iteration = 1;

  // baseCtx 是循环外不变的 StageContext 部分（循环内部状态字段在每轮重新构造）
  const baseCtx: Omit<StageContext,
    'iteration' | 'prevArtifacts' | 'feedbackSignal' | 'tokensConsumed'
  > = {
    runId: args.runId,
    researchInput: args.researchInput,
    gateway: args.gateway,
    profile: args.profile,
    finishReasonExtractor: args.finishReasonExtractor,
    reproHashProvider: args.reproHashProvider,
    gitCommitSha: args.gitCommitSha,
    appendOptions: args.appendOptions,
    evidenceLogDb: args.evidenceLogDb,
    termination,
  };

  try {
    while (true) {
      // 顺序执行六阶段（每轮）
      // 注意：stage1/2/4/5 不消费 feedbackSignal（传 null）；仅 stage3 消费 [6]→[3] 回灌

      const stage1 = await runStage1({
        ...baseCtx,
        iteration,
        prevArtifacts: artifacts,
        feedbackSignal: null,
        tokensConsumed,
      });
      artifacts.push(stage1);
      tokensConsumed += extractTotalTokens(stage1.callResult);

      const stage2 = await runStage2({
        ...baseCtx,
        iteration,
        prevArtifacts: artifacts,
        feedbackSignal: null,
        tokensConsumed,
      });
      artifacts.push(stage2);
      tokensConsumed += extractTotalTokens(stage2.callResult);

      // stage3：消费 feedbackSignal（[6]→[3] 回灌·首轮为 null）+ falsifiability_gate 硬阻断
      const stage3 = await runStage3({
        ...baseCtx,
        iteration,
        prevArtifacts: artifacts,
        feedbackSignal,
        tokensConsumed,
      });
      artifacts.push(stage3);
      tokensConsumed += extractTotalTokens(stage3.callResult);

      const stage4 = await runStage4({
        ...baseCtx,
        iteration,
        prevArtifacts: artifacts,
        feedbackSignal: null,
        tokensConsumed,
      });
      artifacts.push(stage4);
      tokensConsumed += extractTotalTokens(stage4.callResult);

      const stage5 = await runStage5({
        ...baseCtx,
        iteration,
        prevArtifacts: artifacts,
        feedbackSignal: null,
        tokensConsumed,
      });
      artifacts.push(stage5);
      tokensConsumed += extractTotalTokens(stage5.callResult);

      const stage6 = await runStage6({
        ...baseCtx,
        iteration,
        prevArtifacts: artifacts,
        feedbackSignal: null,
        tokensConsumed,
      });
      artifacts.push(stage6);
      tokensConsumed += extractTotalTokens(stage6.callResult);

      // 取 stage6 的 FeedbackSignal（用 discriminatedUnion narrow·禁 as 强转）
      const feedbackPayload = narrowFeedback(stage6);
      feedbackSignal = feedbackPayload.feedbackSignal;

      // 终止判定（§7.1）
      const ctx: StageContext = {
        ...baseCtx,
        iteration,
        prevArtifacts: artifacts,
        feedbackSignal,
        tokensConsumed,
      };
      const { terminated, reason } = assertTerminated(ctx, feedbackSignal, startTime);
      if (terminated) {
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
        });
        return {
          runId: args.runId,
          iterationsCompleted: iteration,
          terminated: true,
          terminationReason: reason,
          artifacts,
          verdictNode,
          error: null,
        };
      }

      // 未终止：iteration++ + 下一轮 stage3 会消费 feedbackSignal（[6]→[3] 回灌）
      iteration++;
    }
  } catch (err) {
    // 任意阶段抛 AgentLoopError → 终止循环（reason='error'）
    // 错误恢复策略（§7.2 表）部分由 stage 执行器内部实现（retry_policy / stage3 gate）；
    // fsm_runner 层只负责捕获 + 落 LoopState.error。
    return {
      runId: args.runId,
      iterationsCompleted: iteration,
      terminated: true,
      terminationReason: 'error',
      artifacts,
      verdictNode: null,
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
    'RETRY_EXHAUSTED',
  ];
  return validCodes.includes(code);
}
