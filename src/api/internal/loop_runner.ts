/**
 * loop_runner —— runAgentLoop 适配层。
 *
 * 设计理由（AGENTS §6 关键实现细节）：
 *   - runAgentLoop 签名复杂（gateway + profile + extractors + providers + appendOptions）。
 *   - API 层用 LoopRunnerArgs 简化入参：只需 researchInput + 模式 + DB + 可选 termination。
 *   - 本文件内部组装 RunAgentLoopArgs，注入 offline_replay profile（模型中立·无真实调用）+
 *     fixture finishReasonExtractor + 占位 reproHashProvider（测试用·生产路径须接 03 calc_bridge）。
 *
 * 模型中立（24§0.1 红线）：
 *   - 本文件不出现 Qwen / 百炼 / DashScope 字面量。
 *   - 默认 profile = 'offline_replay'（Core 模型中立·无真实 LLM 调用）。
 *   - 竞赛 profile 由调用方显式传入（competition_aliyun_qwen adapter 在 llm_gateway 层注入）。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import type { Database } from 'better-sqlite3';

import { runAgentLoop } from '../../agent_loop/fsm_runner.ts';
import type { LoopState, ReproHashProvider, TerminationCriteria } from '../../agent_loop/types.ts';
import { gradeRunIntegrity } from './run_grade.ts';
import type { TraceGrade } from '../../trace/agent_run_event.ts';
import { extractFinishReasonForOfflineReplay } from '../../agent_loop/run_stage.ts';
import { createLlmGateway } from '../../llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../llm_gateway/adapters/offline_replay/client.ts';
import type { LlmGateway } from '../../llm_gateway/gateway.ts';
import type { ProviderProfile } from '../../llm_gateway/types.ts';
import type { AppendRecordOptions } from '../../evidence_log/types.ts';
import { ulid } from 'ulid';

/**
 * LoopRunnerArgs —— API 层调用 runAgentLoop 的简化入参。
 *
 * mode:
 *   - 'full'：完整六阶段（DEFAULT_TERMINATION·maxIterations=3）
 *   - 'quick'：快速模式（maxIterations=1·单轮即终止）
 *
 * dialogueMode（06 add-research-dialogue-layer）：
 *   - 'disabled'：禁用对话层（默认·向后兼容）
 *   - 'enabled'：启用对话层（需 stage0_dialogue 已实现·当前 offline 路径忽略此标志）
 */
export interface LoopRunnerArgs {
  readonly researchInput: string;
  readonly mode?: 'full' | 'quick';
  readonly dialogueMode?: 'disabled' | 'enabled';
  readonly evidenceLogDb: Database;
  readonly gitCommitSha: string;
  readonly gateway?: LlmGateway;
  readonly profile?: ProviderProfile;
  readonly appendOptions?: AppendRecordOptions;
  readonly termination?: TerminationCriteria;
  /**
   * reproHash 注入策略（生产路径必须显式提供·接 03 calc_bridge compute_repro_hash）。
   *
   * 未提供时的回退（resolveReproHashProvider）：
   *   - offline_replay profile → 确定性占位 hash（测试/demo 语义·非生产数据）
   *   - 其余 profile（competition 等）→ 抛 REPRO_BRIDGE_NOT_CONFIGURED（禁伪造 hash 进生产 evidence_log）
   */
  readonly reproHashProvider?: ReproHashProvider;
  /** 可选：每阶段 artifact 入链后回调（透传 runAgentLoop.onArtifact·流式输出用）。 */
  readonly onArtifact?: (artifact: import('../../agent_loop/types.ts').StageArtifact) => void;
}

/**
 * LoopRunnerResult —— runAgentLoop 执行结果 + reproHash。
 */
export interface LoopRunnerResult {
  readonly loopState: LoopState;
  readonly reproHash: string;
  readonly runId: string;
  readonly traceGrade: TraceGrade;
}

/**
 * QUICK_TERMINATION —— 快速模式终止条件（单轮即终止）。
 */
const QUICK_TERMINATION: TerminationCriteria = {
  maxIterations: 1,
  maxTokensPerRun: 50000,
  maxDurationMs: 10 * 60 * 1000,
};

/**
 * offline_replay 占位 reproHashProvider（测试/demo 语义·非生产数据）。
 *
 * 设计理由：offline_replay profile 无真实 LLM 调用·无 Python 计算环境（depVersions /
 * blasThreadpoolInfo / pythonVersion 等七分量无法在 TS 侧采集）——用确定性占位 hash
 * 满足 cred.reproHash 的 64-hex 结构约束（链式 currentHash 仍可验证·确定性不变）。
 *
 * 红线（types.ts ReproHashProvider 注释第 3 条·03 §10）：
 *   - 此 provider 仅限 offline_replay profile（测试/demo·非生产 evidence_log）。
 *   - 生产 profile（competition_aliyun_qwen 等）必须显式注入 reproHashProvider（接 03 calc_bridge
 *     compute_repro_hash·七分量 sha256），否则 resolveReproHashProvider 抛 REPRO_BRIDGE_NOT_CONFIGURED。
 *   - 禁伪造 hash 进生产 evidence_log（红线 #6 CONFIRMED 需真实证据 + 检查点）。
 */
const OFFLINE_REPLAY_REPRO_HASH_PROVIDER: ReproHashProvider = () => '0'.repeat(64);

/**
 * 解析 reproHashProvider 注入策略（offline 占位 vs 生产显式注入）。
 *
 *   1. 调用方显式传入 args.reproHashProvider → 信任调用方（生产路径接 calc_bridge）。
 *   2. 未传入 + offline_replay profile → 确定性占位（测试/demo 语义）。
 *   3. 未传入 + 非 offline_replay profile（生产）→ fail-fast（禁无声伪造）。
 *
 * @throws {code: 'REPRO_BRIDGE_NOT_CONFIGURED'} 生产 profile 未注入 reproHashProvider
 */
function resolveReproHashProvider(args: LoopRunnerArgs, profile: ProviderProfile): ReproHashProvider {
  if (args.reproHashProvider !== undefined) {
    return args.reproHashProvider;
  }
  if (profile === 'offline_replay') {
    return OFFLINE_REPLAY_REPRO_HASH_PROVIDER;
  }
  throw Object.assign(
    new Error(
      `executeLoop: profile "${profile}" requires explicit reproHashProvider (offline placeholder forbidden in production evidence_log · connect 03 calc_bridge compute_repro_hash)`,
    ),
    { code: 'REPRO_BRIDGE_NOT_CONFIGURED', profile },
  );
}

/**
 * 执行 runAgentLoop 并返回 LoopState + reproHash。
 *
 * reproHash 取证据链头 currentHash（信任根锚点·用于复现验证）。
 * 若循环未落任何 call_record（异常路径·不应发生），回退 GENESIS_PREV_HASH。
 *
 * @throws Error 若 researchInput 为空
 */
export async function executeLoop(args: LoopRunnerArgs): Promise<LoopRunnerResult> {
  if (args.researchInput.trim().length === 0) {
    throw new Error('executeLoop: researchInput must be non-empty');
  }

  const mode = args.mode ?? 'full';
  const termination = args.termination ?? (mode === 'quick' ? QUICK_TERMINATION : undefined);
  const profile: ProviderProfile = args.profile ?? 'offline_replay';
  const appendOptions: AppendRecordOptions = args.appendOptions ?? { providerProfile: profile };
  const gateway: LlmGateway = args.gateway ?? createLlmGateway([createOfflineReplayAdapter()]);
  const reproHashProvider = resolveReproHashProvider(args, profile);
  const runId = ulid();

  const loopState = await runAgentLoop({
    runId,
    researchInput: args.researchInput,
    gateway,
    profile,
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider,
    gitCommitSha: args.gitCommitSha,
    appendOptions,
    evidenceLogDb: args.evidenceLogDb,
    ...(termination === undefined ? {} : { termination }),
    ...(args.onArtifact === undefined ? {} : { onArtifact: args.onArtifact }),
  });

  const reproHash = resolveReproHash(args.evidenceLogDb);
  const traceGrade = gradeRunIntegrity(loopState, args.evidenceLogDb);

  return { loopState, reproHash, runId, traceGrade };
}

/**
 * 从证据链头取 reproHash（currentHash·信任根锚点）。
 */
function resolveReproHash(db: Database): string {
  const row = db
    .prepare('SELECT current_hash FROM call_records ORDER BY seq DESC LIMIT 1')
    .get() as { current_hash?: string } | undefined;
  if (row === undefined || typeof row.current_hash !== 'string') {
    return '0'.repeat(64);
  }
  return row.current_hash;
}
