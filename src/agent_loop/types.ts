/**
 * 六阶段 FSM 全部共享类型定义。
 *
 * 适配说明（与 spec §3 的差异·按 AGENTS §1 Authority Order + 项目实际类型优先）：
 *   1. spec §3.5 引用 `../provider/types.BailianCallResult`——项目已迁移到 llm_gateway，
 *      实际类型为 `LlmResponse`（含 credential + content + raw）。LlmResponse 与
 *      BailianCallResult 三字段（data/response/dashscopeRequestId）语义对等：
 *      LlmResponse.raw ↔ BailianCallResult.data；LlmResponse.credential.providerRequestId
 *      ↔ BailianCallResult.dashscopeRequestId；LlmResponse.content 是 data 的文本提取。
 *      Core 模型中立原则下用 LlmResponse（不依赖 Qwen/百炼）。
 *   2. spec §3.5 引用 `../falsifiability/honest_verdict_node.VerdictNode`——项目实际路径
 *      为 `../falsifiability/types.VerdictNode`。
 *   3. spec §3.4 `FalsificationMethod`（prediction/metric/comparator/value/lower/upper）
 *      按 SSOT 实现并用于 HypothesisPayload.falsificationMethod。项目入库/gate 类型为
 *      `FalsificationSpec`（falsifiability/types.ts·prediction/metric/falsificationThreshold/
 *      thresholdSemantics）——stage3 执行器（待建）负责 FalsificationMethod → FalsificationSpec
 *      的转换给 falsifiability_gate。
 *   4. spec §3.5 `VerdictKind` → 项目实际类型 `Verdict`（5 值联合·schema/enums.ts SSOT）。
 *   5. spec §3.5 `bailianClient: import('openai').default` → 改为 `gateway: LlmGateway` +
 *      `profile: ProviderProfile` + `finishReasonExtractor` + `reproHashProvider` +
 *      `gitCommitSha` + `appendOptions`。理由：项目实际 LLM 调用入口是
 *      `evidence_log.callAndRecordLlm(db, gateway, args)`（非 spec §5.1 的
 *      `callBailianStructured`·该函数项目未实现）。callAndRecordLlm 需要 LlmGateway +
 *      ProviderProfile + LlmRecordMetadata（含 finishReason/reproHash/gitCommitSha）
 *      AppendRecordOptions。StageContext 持有这些依赖，stage 执行器才能完成
 *      「调 LLM → 提取 finishReason → 构造 metadata → 落 evidence_log」全流程。
 *      offline_replay profile 时 gateway 用 offline_replay adapter（Core 模型中立·无真实 client）。
 *   6. zod 仅在 stages/* 各阶段 schema_gate 运行时收窄用（待建）·types.ts 本身用纯 TS
 *      interface 表达判别联合（R10：kind 标签 narrow）。
 *   7. PayloadKind / PAYLOAD_KINDS 从 SSOT 源头 schema/enums.ts re-export（evidence_log/
 *      types.ts 未 re-export PAYLOAD_KINDS const·禁修改既有文件·故从源头 re-export·语义等价）。
 */

import type { Database } from 'better-sqlite3';

import type {
  AppendRecordOptions,
} from '../evidence_log/types.ts';
import type { VerdictNode } from '../falsifiability/types.ts';
import type {
  LlmGateway,
} from '../llm_gateway/gateway.ts';
import type {
  LlmResponse,
  ProviderProfile,
} from '../llm_gateway/types.ts';
import type {
  FinishReason,
  PayloadKind,
  Verdict,
} from '../schema/enums.ts';


// ---------- §3.1 StageId（六阶段标识常量） ----------

/**
 * 六阶段执行顺序（OFFICIAL §3.2 逐字对齐）。
 *
 * STAGE_ORDER 仅含主链 6 阶段（执行顺序·stage0_dialogue 是前置旁路不在主链遍历内），
 * 但 STAGE_TO_PURPOSE_TAG（§2）须覆盖全部 7 个 stageId → 故 StageId 用显式 union 含
 * stage0_dialogue，否则 `Record<StageId, PurposeTag>` 的 7 键会触发 TS2322。
 */
export const STAGE_ORDER = [
  'stage1_understanding',
  'stage2_integration',
  'stage3_hypothesis',
  'stage4_evidence',
  'stage5_plan',
  'stage6_feedback',
] as const;

/** Type alias: stage id. */
export type StageId = (typeof STAGE_ORDER)[number] | 'stage0_dialogue';


// ---------- §3.2 PayloadKind / PAYLOAD_KINDS（re-export 不重定义） ----------

export type { PayloadKind } from '../schema/enums.ts';
export { PAYLOAD_KINDS } from '../schema/enums.ts';


// ---------- §3.3 StructuredPayload（判别联合·R10 修复：加 kind tag） ----------

/**
 * 可证伪方法声明（06§3.4 SSOT）。
 *
 * falsifiability_gate 硬阻断字段（假设无此字段 → 降级，不许放行）。
 * 字段语义对齐 07_falsifiability_verdict.md 的 threshold_semantics（gt/lt/range）。
 *
 * 本类型是 stage3 LLM 结构化输出的契约形态；falsifiability_gate 入库形态为
 * `FalsificationSpec`（falsifiability/types.ts）。stage3 执行器（待建）负责本类型 →
 * FalsificationSpec 的转换（comparator↔thresholdSemantics；value/lower/upper↔falsificationThreshold）。
 */
export interface FalsificationMethod {
  readonly prediction: string;                // 可证伪预测
  readonly metric: string;                    // 度量名（如 'macro_f1' / 'rmse'）
  readonly comparator: 'gt' | 'lt' | 'range'; // gt=metric>=value→CONFIRMED；lt=metric<=value→CONFIRMED；range=lower<=metric<=upper→CONFIRMED
  // 注：`| undefined` 是为兼容 zod .optional() 输出类型 + exactOptionalPropertyTypes:true
  readonly value?: number | undefined;        // gt/lt 的阈值
  readonly lower?: number | undefined;        // range 下界
  readonly upper?: number | undefined;        // range 上界
  // b6-S1 结构化可裁决性（加法可选）：旧 run/fixture 无字段照常解析——
  // "未记录" ≠ "没发生"。新生成路径（discovery 策略 fan-out 的 live 产出）在
  // zod 层强制给出（AdjudicableFalsificationMethodZod）；KERNEL_ADJUDICATED
  // 编译门（discovery/adjudication.ts）优先读这两个字段构造 gt/lt 阈值契约，
  // 字段缺失时回退散文关键词推导（b5 LIVE 实测：散文推不出→诚实拒绝）。
  readonly direction?: PredictionDirection | undefined;  // 预测方向承诺；'either'=显式无方向承诺（编译门无法构造阈值契约）
  readonly metricShape?: MetricShape | undefined;        // 预测的度量形状（相关/差值/阈值/比值）
}

/** 预测方向的结构化枚举（b6-S1）。closed alphabet——不得加值除非迁移裁决。 */
export const PREDICTION_DIRECTIONS = ['positive', 'negative', 'either'] as const;
export type PredictionDirection = (typeof PREDICTION_DIRECTIONS)[number];

/**
 * 度量形状的结构化枚举（b6-S1）。编译门当前认 'correlation'（exoplanet 决断观察族）
 * 与 'trend-slope'（climate 决断观察族，2026-08-21 迁移裁决：GISS 年度异常趋势）。
 */
export const METRIC_SHAPES = ['correlation', 'difference', 'threshold', 'ratio', 'trend-slope'] as const;
export type MetricShape = (typeof METRIC_SHAPES)[number];

/**
 * CitationAnchor —— 引用文献锚点。
 *
 * 与 evidence_log EvidenceLogEntry.evidenceId 对应（ULID·社区规范）。
 * source 列表对齐 07_falsifiability_verdict.md SourceAnchor 类型可承载的源类别。
 */
export interface CitationAnchor {
  readonly evidenceId: string;
  readonly source: 'arxiv' | 'ads' | 's2' | 'tns' | 'gcvs' | 'aavso' | 'gaia' | 'doi' | 'other';
  readonly doi: string | null;
  readonly title: string;
}

/**
 * EvidenceRecord —— stage4_evidence 产出的证据记录（06§3.4 SSOT）。
 *
 * 注意：本类型与 falsifiability/types.EvidenceRecord 字段不同（agent_loop 侧聚焦于
 * LLM 提取的 entailmentScore + CitationAnchor；falsifiability 侧聚焦于
 * supportsClaim/refutesClaim/scopeNarrowerThanClaim + SourceAnchor）。
 * stage4_evidence 产出后，进入 falsifiability_gate 时由 stage 执行器转换。
 */
export interface EvidenceRecord {
  readonly evidenceId: string;
  readonly supportsOrRefutes: 'supports' | 'refutes' | 'neutral';
  readonly entailmentScore: number; // bge-reranker 本地推理分数（非 Qwen·禁 Qwen3-Reranker）
  readonly source: CitationAnchor;
}

/** Interface defining executable check. */
export interface ExecutableCheck {
  readonly ref: string; // 引用的数据集/方法/排程 URL 或标识
  readonly exists: boolean; // HTTP HEAD/crossmatch 是否命中
  readonly checkedAt: string; // ISO8601
}

/**
 * [1] 问题理解产物。
 *
 * dialogueContext 字段（add-research-dialogue-layer spec·可选）：当 dialogueMode=enabled
 * 且 stage0_dialogue 已产出 ResearchThoughtFramework 时，由此传递。缺省 undefined 时
 * stage1_understanding 行为与未引入对话层时完全一致（向后兼容）。
 *
 * primaryIntent 用 string（dialogue/types.ts 的 IntentLabel 8 值联合未建·
 * [已实证: dialogue 模块已建立，IntentLabel 已就位]）。
 */
export interface UnderstandingPayload {
  readonly kind: 'understanding';
  readonly problemStatement: string;
  readonly scope: string;
  readonly keyTerms: readonly string[];
  readonly falsifiableAngle: string | null;
  // 注：`| undefined` 是为兼容 zod .optional() 输出类型 + exactOptionalPropertyTypes:true
  readonly dialogueContext?: {
    readonly frameworkId: string;
    readonly primaryIntent: string;
    readonly openIssues: readonly string[];
  } | undefined;
}

/** Interface defining integration payload. */
export interface IntegrationPayload {
  readonly kind: 'integration';
  readonly citations: readonly CitationAnchor[];
  readonly knowledgeGraphSummary: string;
  readonly gaps: readonly string[];
}

/** Interface defining hypothesis payload. */
export interface HypothesisPayload {
  readonly kind: 'hypothesis';
  readonly claim: string;
  readonly falsificationMethod: FalsificationMethod; // 06§3.4 SSOT·LLM 结构化输出契约
  readonly supportingCitations: readonly string[]; // 引用文献 evidence_id 列表
  readonly scopeSlipText: string; // scope-slip 降级声明（反 theater）
}

/** Interface defining evidence payload. */
export interface EvidencePayload {
  readonly kind: 'evidence';
  readonly evidenceRecords: readonly EvidenceRecord[];
  readonly conflictingEvidenceCount: number;
}

/** Interface defining plan payload. */
export interface PlanPayload {
  readonly kind: 'plan';
  readonly datasetChoices: readonly string[];
  readonly methodChoices: readonly string[];
  readonly scheduleOrFeedback: string;
  readonly executableChecks: readonly ExecutableCheck[];
}

/** Interface defining feedback payload. */
export interface FeedbackPayload {
  readonly kind: 'feedback';
  readonly feedbackSignal: FeedbackSignal;
  readonly iterationSummary: string;
}

/** Type alias: structured payload. */
export type StructuredPayload =
  | UnderstandingPayload
  | IntegrationPayload
  | HypothesisPayload
  | EvidencePayload
  | PlanPayload
  | FeedbackPayload;




// ---------- §3.4 FeedbackSignal / TerminationCriteria ----------

/**
 * [6]→[3] 反馈回灌信号。回灌路径明文化（反 theater）。
 */
export interface FeedbackSignal {
  readonly continueIteration: boolean; // true=回灌 [3] 再迭代；false=终止
  readonly iterationNumber: number; // 当前迭代轮次（从 1 起）
  readonly maxIterations: number; // 上限（见 TerminationCriteria）
  readonly refinements: readonly string[]; // 需 [3] 修正的点
}

/**
 * 循环终止条件（防无限循环烧配额）。
 */
export interface TerminationCriteria {
  readonly maxIterations: number; // 最大迭代轮次（默认 3）
  readonly maxTokensPerRun: number; // 单轮 token 上限（算力预算闸·宪法 §5.2）
  readonly maxDurationMs: number; // 单轮墙钟上限
}


// ---------- §3.5 StageArtifact / StageContext / LoopState ----------

/**
 * 单阶段执行后的产物（含结构化 payload + 调用凭证 + audit 链）。
 *
 * callResult 类型为 LlmResponse（项目实际·llm_gateway/types.ts），Core 模型中立
 * （不依赖 Qwen/百炼）。LlmResponse 与 06§3.5 BailianCallResult 三字段语义对等。
 */
export interface StageArtifact {
  readonly stageId: StageId;
  readonly payloadKind: PayloadKind;
  readonly structured: StructuredPayload;
  readonly callResult: LlmResponse;
  /** 是否触发降级（theater_flag·诚实标注） */
  readonly degraded: boolean;
  readonly degradationReason: string | null;
}

/**
 * FinishReasonExtractor —— 从 LlmResponse 提取 FinishReason 的策略接口。
 *
 * 不同 adapter 的 LlmResponse.raw 结构不同（aliyun_qwen 是 ChatCompletion·
 * offline_replay 是 {replayed, messageCount}），finishReason 提取逻辑各异。
 * 用策略接口注入，避免在 stage 执行器里写 adapter-specific 分支（开闭原则）。
 *
 * 约束：
 *   - aliyun_qwen: 从 response.raw 提取 choices[0].finish_reason，type guard 收窄。
 *   - offline_replay: 返回 'stop'（fixture 成功语义）。
 *   - 提取失败须 throw（禁 fallback 掩盖·零容忍 #4）。
 */
export type FinishReasonExtractor = (response: LlmResponse) => FinishReason;

/**
 * ReproHashProvider —— 为 LlmRecordMetadata 产出 reproHash 的策略接口。
 *
 * reproHash 由 03 确定性规范模块的 calc_bridge 产出（七分量确定性 hash）。
 * agent_loop 不实现 reproHash 计算（属 repro 模块职责），只持有 provider 接口。
 *
 * 约束：
 *   - 输入：stageId + payloadKind + purposeTag + LlmResponse（含 credential）。
 *   - 输出：64 字符 hex 字符串（sha256）。
 *   - 未接入 repro 模块时，可注入「返回固定占位 hash」的 provider 用于测试
 *     （但生产路径必须接入真实 calc_bridge·禁伪造 hash 进生产 evidence_log）。
 */
export type ReproHashProvider = (input: {
  readonly stageId: StageId;
  readonly payloadKind: PayloadKind;
  readonly response: LlmResponse;
}) => string;

/**
 * 阶段执行上下文（传入每个 stage 执行器）。
 *
 * 持有 stage 执行器完成「调 LLM → 提取 finishReason → 构造 metadata → 落 evidence_log」
 * 全流程所需的全部依赖（gateway + profile + extractors + appendOptions）。
 *
 * offline_replay profile 时 gateway 用 offline_replay adapter（Core 模型中立·无真实 client）。
 */
export interface StageContext {
  readonly runId: string; // 本轮 runAgentLoop 的 ULID
  readonly iteration: number; // 当前迭代轮次
  readonly researchInput: string; // 本轮研究的输入问题原文（stage1 消费·其余 stage 可作背景）
  readonly gateway: LlmGateway; // LLM 网关（competition/offline_replay 等 profile）
  readonly profile: ProviderProfile; // 调用 profile（决定走哪个 adapter）
  readonly finishReasonExtractor: FinishReasonExtractor; // 从 LlmResponse 提取 finishReason
  readonly reproHashProvider: ReproHashProvider; // 产出 reproHash（接 03 calc_bridge）
  readonly gitCommitSha: string; // git commit SHA（落 evidence_log·禁 process.env 直读·显式传入可测）
  readonly appendOptions: AppendRecordOptions; // appendRecord 选项（含 providerProfile + competitionModelSnapshot?）
  readonly evidenceLogDb: Database;
  readonly prevArtifacts: readonly StageArtifact[]; // 前序阶段产物（供本阶段消费）
  readonly feedbackSignal: FeedbackSignal | null; // [6]→[3] 回灌（仅 stage3 消费）
  readonly termination: TerminationCriteria;
  readonly tokensConsumed: number; // 累计已耗 token（算力预算闸）
  /**
   * IC-15 T1'（V2 裁决软建议）：上一次完整 runAgentLoop 调用产出的 verdict kind。
   * 可选；缺省（首轮 / 无先验裁决）= undefined → stage6 prompt 不注入 verdict hint。
   * 遵最小信息原则：仅传 5 值枚举本身，不传 reasonCode/metricValue/threshold
   * （防 LLM 反推裁决逻辑构造"刚好过"假设·security-auditor C2 缓解）。
   * 软建议语义：注入时 prompt 明示"仅供参考，你仍独立判断 continueIteration"。
   */
  readonly priorVerdictKind?: Verdict;
  /**
   * V2 裁决驱动反馈边：上一轮迭代的中间裁决 kind（verdictDrivenFeedback 开启时·循环内）。
   * 可选；缺省 undefined = 无循环内先验裁决 → stage3 prompt 不注入（字节等同基线·回归兼容）。
   * 仅供 stage3_hypothesis 消费（regen 方向软建议）；仅传 5 值枚举本身（防 p-hacking）。
   */
  readonly verdictHint?: Verdict;
}

/**
 * 循环内中间裁决（V2 裁决驱动反馈边·verdictDrivenFeedback 开启时产出）。
 *
 * 无副作用：中间裁决是纯计算（不落 evidence_log / verdict_nodes·不改变链长），
 * 仅随 LoopState 返回 + session JSONL 记录，供审计（输入=当轮 hypothesis+evidence·
 * 可由 evaluateIntermediateVerdict 复算）。
 */
export interface IntermediateVerdict {
  readonly iteration: number; // 产出该裁决的迭代轮次（从 1 起）
  readonly verdict: Verdict; // 5 值裁决（R0-R9 确定性内核·非 LLM）
  readonly decisiveRuleId: string | null; // 裁决决定性规则 ID（审计）
}

/**
 * 终止原因判别联合（P0-3 事件流复用·events.ts 引用）。
 */
export type TerminationReason =
  | 'feedback_converged'
  | 'verdict_confirmed' // V2 裁决驱动：中间裁决 CONFIRMED → 确定性立即终止
  | 'verdict_converged' // V2 裁决驱动：连续两轮裁决输入指纹相同 → 防 p-hacking 空转终止
  | 'max_iterations'
  | 'max_tokens'
  | 'max_duration'
  | 'error';

/**
 * runAgentLoop 的最终状态。
 */
export interface LoopState {
  readonly runId: string;
  readonly iterationsCompleted: number;
  readonly terminated: boolean;
  readonly terminationReason: TerminationReason;
  readonly artifacts: readonly StageArtifact[]; // 全部阶段产物（按顺序）
  /** verdict 阶段产出的 VerdictNode（若到达 [4] 裁决） */
  readonly verdictNode: VerdictNode | null;
  /** 循环内中间裁决序列（verdictDrivenFeedback 关闭时恒为空数组·零回归） */
  readonly intermediateVerdicts: readonly IntermediateVerdict[];
  readonly error: AgentLoopError | null;
}

/** Error type: agent loop error. */
export interface AgentLoopError {
  readonly code:
    | 'FALSIFIABILITY_GATE_BLOCK'
    | 'R1_MUTEX'
    | 'R1_MODEL_UNSAFE'
    | 'BAILIAN_EMPTY_CHOICES'
    | 'BAILIAN_NULL_FINISH_REASON'
    | 'BAILIAN_UNKNOWN_FINISH_REASON'
    | 'DASHSCOPE_REQUEST_ID_NULL_FATAL'
    | 'MAX_TOKENS_EXCEEDED'
    | 'MAX_DURATION_EXCEEDED'
    | 'COST_BUDGET_EXCEEDED'
    | 'STAGE_RECEIPT_FORGED'
    | 'STAGE_SCHEMA_INVALID'
    | 'EXTENSION_STAGE_FAILED'
    | 'RETRY_EXHAUSTED';
  readonly message: string;
  readonly stageId: StageId | null;
  readonly cause?: unknown;
}


// ---------- §3.6 ResearchPaperOutput（10 字段·确定性映射·禁 LLM-as-judge） ----------

/**
 * 研究论文输出——六阶段全部产物汇总后的10 字段结构。
 *
 * 由 paperAssembler 在 runAgentLoop 结束后从 LoopState 聚合而成，
 * 不经 LLM 调用（确定性映射函数·禁 LLM-as-judge）。
 *
 * 字段对齐「生成结果规范」10 字段。
 */
export interface ResearchPaperOutput {
  /** 论文标题（符合学术出版规范） */
  readonly paperTitle: string;
  /** 论文摘要（背景 + 方法 + 预期结果） */
  readonly paperAbstract: string;
  /** 问题陈述——当前领域局限 */
  readonly problemStatement: string;
  /** 推导逻辑链——从已知事实到候选假设的推理链条 */
  readonly rationale: string;
  /** 验证假设所需的技术栈 */
  readonly technicalDetails: string;
  /** 数据源详情（Source=历史数据，Target=拟采集数据特征） */
  readonly datasets: {
    readonly source: readonly string[];
    readonly target: readonly string[];
  };
  /** 具体实施步骤（含模型架构/实验流程） */
  readonly methods: readonly string[];
  /** 实验设计（baselines + metrics + 预期结果） */
  readonly experiments: {
    readonly baselines: readonly string[];
    readonly metrics: readonly string[];
    readonly expectedOutcome: string;
  };
  /** 可执行结论——通过公式推导或实际执行验证可行性 */
  readonly results: string;
  /** 真实文献列表（来自 CitationAnchor[]·禁编造） */
  readonly references: readonly CitationAnchor[];
  /** 迭代元数据 */
  readonly iterationCount: number;
  readonly finalVerdict: Verdict;
}

// 类型 re-export（供 stages/* 与 fsm_runner 引用）
export type { SourceAnchor, VerdictNode } from '../falsifiability/types.ts';
export type { LlmResponse } from '../llm_gateway/types.ts';
// R3：裁决计算观测类型（onComputation 回调载荷）经契约文件导出——
// kernel 侧（proof_envelope/v2/ask_envelope）只经本文件类型引用，R2 合规。
export type { VerdictComputation } from './verdict_stage.ts';
