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
import { createLlmEnvironmentAnchorProvider } from '../../llm_gateway/repro_anchor.ts';
import type { LlmGateway } from '../../llm_gateway/gateway.ts';
import type { ProviderProfile } from '../../llm_gateway/types.ts';
import type { AppendRecordOptions } from '../../evidence_log/types.ts';
import { ulid } from 'ulid';
import { groundResearchQuestion, type GroundingOptions } from '../../retrieval/index.ts';

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
  /** IC-06:stage_receipt 恢复存储路径(可选;kill 后从最近有效收据续跑) */
  readonly resumeStorePath?: string;
  /**
   * reproHash 注入策略（生产路径必须显式提供·接 03 calc_bridge compute_repro_hash）。
   *
   * 未提供时的回退（resolveReproHashProvider）：
   *   - offline_replay profile → 确定性占位 hash（测试/demo 语义·非生产数据）
   *   - production profile（competition_aliyun_qwen）→ 需 modelSnapshot 显式注入；
   *     未注入则抛 REPRO_BRIDGE_NOT_CONFIGURED（禁伪造 hash 进生产 evidence_log）
   */
  readonly reproHashProvider?: ReproHashProvider;
  /**
   * G3 闭合（2026-08-06）：production profile 的 LLM 调用环境锚分量——
   * 模型快照（snapshot.ts 常量·由模型特定调用方注入·本文件模型中立禁字面量）。
   * 注入后 executeLoop 用 createLlmEnvironmentAnchorProvider 构造环境锚 provider
   * （非占位·确定性环境指纹·详见 repro_anchor.ts 文档化裁决）。
   * 缺省 undefined → production 路径仍抛 REPRO_BRIDGE_NOT_CONFIGURED（fail-closed）。
   */
  readonly modelSnapshot?: string;
  /** 可选：每阶段 artifact 入链后回调（透传 runAgentLoop.onArtifact·流式输出用）。 */
  readonly onArtifact?: (artifact: import('../../agent_loop/types.ts').StageArtifact) => void;
  /**
   * P0-3 运行时事件流回调（透传 runAgentLoop.onEvent·SSE/CLI/前端实时显示）。
   * 缺省 undefined → 零行为（回归兼容）。
   */
  readonly onEvent?: (evt: import('../../agent_loop/events.ts').AgentLoopEvent) => void;
  /**
   * V2 裁决驱动反馈边（透传 runAgentLoop.verdictDrivenFeedback·缺省关闭=LLM 自评反馈边）。
   * 开启后：循环内中间裁决 CONFIRMED 立即终止 / 重复输入指纹防 p-hacking 终止 /
   * 中间裁决 kind 软建议注入下一轮 stage3 regen。
   */
  readonly verdictDrivenFeedback?: boolean;
  /**
   * Phase 4b grounded mode (directive §9/§16). When provided, the loop FIRST
   * grounds the research question in REAL retrieved literature + adversarial
   * counter-evidence (groundResearchQuestion), and attaches a GroundingReport to
   * the result. When undefined (default) → behavior is byte-identical (zero
   * regression for the 200+ existing agent_loop tests). Fail-closed: a grounding
   * retrieval error rejects the whole run (no partial corpus).
   */
  readonly grounding?: GroundingOptions;
}

/**
 * GroundingReport —— serializable subset of a GroundedCorpus, attached to
 * LoopRunnerResult when grounded mode is opted in. Surfaces the corpus identity
 * (snapshotId = which papers; rootHash = exact content, tamper-evident) so a
 * downstream consumer (API / CLI / future stage wiring) knows exactly which
 * evidence set grounded this run.
 */
export interface GroundingReport {
  readonly supportingQuery: string;
  readonly counterEvidenceStrategies: readonly string[];
  readonly corpusSnapshotId: string;
  readonly corpusRootHash: string;
  readonly documentCount: number;
  readonly perQueryCounts: ReadonlyArray<{ readonly query: string; readonly count: number }>;
  readonly fetchMode: 'live' | 'replay';
  readonly groundedAt: string;
}

/**
 * LoopRunnerResult —— runAgentLoop 执行结果 + reproHash。
 */
export interface LoopRunnerResult {
  readonly loopState: LoopState;
  readonly reproHash: string;
  readonly runId: string;
  readonly traceGrade: TraceGrade;
  /** Present only when grounded mode (args.grounding) was opted in. */
  readonly grounding?: GroundingReport;
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
 * 解析 reproHashProvider 注入策略（offline 占位 / 生产环境锚 / fail-fast）。
 *
 *   1. 调用方显式传入 args.reproHashProvider → 信任调用方（生产路径接 calc_bridge）。
 *   2. 未传入 + offline_replay profile → 确定性占位（测试/demo 语义）。
 *   3. 未传入 + 非 offline_replay profile（生产）：
 *      - args.modelSnapshot 已注入 → LLM 调用环境锚 provider（G3 闭合·2026-08-06·
 *        真实环境指纹·非占位非伪造·见 repro_anchor.ts 文档化裁决）
 *      - 未注入 modelSnapshot → fail-fast（禁无声伪造·红线不变）
 *
 * @throws {code: 'REPRO_BRIDGE_NOT_CONFIGURED'} 生产 profile 未注入 reproHashProvider/modelSnapshot
 */
function resolveReproHashProvider(
  args: LoopRunnerArgs,
  profile: ProviderProfile,
  gateway: LlmGateway,
): ReproHashProvider {
  if (args.reproHashProvider !== undefined) {
    return args.reproHashProvider;
  }
  if (profile === 'offline_replay') {
    return OFFLINE_REPLAY_REPRO_HASH_PROVIDER;
  }
  if (args.modelSnapshot !== undefined) {
    // G3 闭合：LLM 调用环境锚（模型快照 + 活跃模型 + node 版本 + git sha·确定性·可审计）
    return createLlmEnvironmentAnchorProvider({
      modelSnapshot: args.modelSnapshot,
      activeModelIds: gateway.registeredProfiles(),
      nodeVersion: process.version,
      gitCommitSha: args.gitCommitSha,
    });
  }
  throw Object.assign(
    new Error(
      `executeLoop: profile "${profile}" requires explicit reproHashProvider or modelSnapshot (offline placeholder forbidden in production evidence_log · connect 03 calc_bridge compute_repro_hash or inject modelSnapshot for the LLM environment anchor)`,
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
  // G3 闭合：modelSnapshot 注入时 appendOptions 自动带 competitionModelSnapshot（repository.ts:325
  // 反 theater 校验——competition 凭证须显式快照·与环境锚同源同值）。
  const appendOptions: AppendRecordOptions =
    args.appendOptions ??
    {
      providerProfile: profile,
      ...(args.modelSnapshot !== undefined
        ? { competitionModelSnapshot: args.modelSnapshot }
        : {}),
    };
  const gateway: LlmGateway = args.gateway ?? createLlmGateway([createOfflineReplayAdapter()]);
  const reproHashProvider = resolveReproHashProvider(args, profile, gateway);
  const runId = ulid();

  // Phase 4b grounded mode: when opted in, FIRST ground the research question in
  // real retrieved literature + counter-evidence. Fail-closed (a retrieval error
  // rejects the whole run — no partial corpus masquerading as complete). The
  // corpus snapshot is attached to the result; deep stage-wiring (Qwen proposing
  // from the corpus, CitationResolver rejecting unbound stage4 citations) builds
  // on this additive foundation. Default (no grounding) → byte-identical.
  let groundingReport: GroundingReport | undefined;
  if (args.grounding !== undefined) {
    const grounded = await groundResearchQuestion(args.grounding);
    groundingReport = {
      supportingQuery: grounded.supportingQuery,
      counterEvidenceStrategies: grounded.counterEvidenceQueries.map((c) => c.strategy),
      corpusSnapshotId: grounded.corpus.snapshotId,
      corpusRootHash: grounded.corpus.rootHash,
      documentCount: grounded.corpus.documentCount,
      perQueryCounts: grounded.perQueryCounts,
      fetchMode: grounded.fetchMode,
      groundedAt: grounded.groundedAt,
    };
  }

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
    ...(args.resumeStorePath === undefined ? {} : { resumeStorePath: args.resumeStorePath }),
    ...(args.onArtifact === undefined ? {} : { onArtifact: args.onArtifact }),
    ...(args.onEvent === undefined ? {} : { onEvent: args.onEvent }),
    ...(args.verdictDrivenFeedback === undefined
      ? {}
      : { verdictDrivenFeedback: args.verdictDrivenFeedback }),
  });

  const reproHash = resolveReproHash(args.evidenceLogDb);
  const traceGrade = gradeRunIntegrity(loopState, args.evidenceLogDb);

  return { loopState, reproHash, runId, traceGrade, ...(groundingReport === undefined ? {} : { grounding: groundingReport }) };
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
