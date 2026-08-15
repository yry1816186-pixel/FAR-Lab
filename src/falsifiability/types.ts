import type {
  SourceAnchor,
  ReplayProver,
} from '../evidence_log/types.ts';
import type {
  ThresholdSemantic,
  Verdict,
  VerdictNodeKind,
} from '../schema/enums.ts';
import type {
  EvidenceSufficiencyReport,
  VerdictRuleTrace,
  DecisionTrace,
} from './verdict_kernel_v2.ts';
import type { EvidenceTier } from '../evidence_quality/types.ts';

/**
 * How a falsification threshold should be interpreted (single value, range,
 * or less-than). Single-sourced from `schema/enums.ts THRESHOLD_SEMANTICS`
 * (DEBT-12) to keep FEC contracts and falsifiability specs aligned.
 */
export type ThresholdSemantics = ThresholdSemantic;

/**
 * A falsifiable scientific prediction: the claim text, the metric to measure,
 * the threshold value that would falsify it, and how that threshold is
 * interpreted. This is the input the verdict kernel evaluates.
 */
export interface FalsificationSpec {
  readonly prediction: string;
  readonly metric: string;
  readonly falsificationThreshold: number;
  readonly thresholdSemantics: ThresholdSemantics;
}

/**
 * A structured threshold specification supporting three semantics: a single
 * point value, a lower/upper range, or a range-less semantic. Only the fields
 * relevant to the chosen `semantics` need to be populated.
 */
export interface ThresholdSpec {
  readonly semantics: ThresholdSemantics;
  readonly value?: number;
  readonly lower?: number;
  readonly upper?: number;
}

/**
 * A single piece of evidence evaluated against a claim. Records whether the
 * metric value supports, refutes, or only partially covers the claim's scope,
 * along with the provenance anchor that binds it to a verifiable source.
 */
export interface EvidenceRecord {
  readonly claim: string;
  readonly metricValue?: number;
  readonly supportsClaim: boolean;
  readonly refutesClaim: boolean;
  readonly scopeNarrowerThanClaim: boolean;
  readonly sourceAnchor: SourceAnchor;
  /**
   * T-003 · Evidence provenance binding（2026-07-24 F-2-005 修复）。
   *
   * 可选字段（V1 向后兼容·demo seed 可缺）：当 metricValue 来自真实 sandbox 执行时，
   * 此字段须绑定 `sandbox_runner.computeSandboxRunResult` 产出的 `stdoutHash` 或
   * `artifactTreeHash`（sha256 64-hex）。第三方独立复算时可重算 sandbox 输出 hash 比对，
   * 证明 metricValue 不是手工注入的 fixture 冒充值。
   *
   * 缺失语义：当 FEC 要求 `requireExecutionProvenance: true` 时，primary 证据
   * （supportsClaim=true 且 refutesClaim=false）缺失此字段 → fail-closed 拒绝裁决
   * （`assertPrimaryEvidenceProvenanceBound` 抛错 → kernel UNTESTED + EVIDENCE_PROVENANCE_UNBOUND）。
   *
   * V1 边界（诚实登记）：
   *   - 现有 demo seed 均未设置此字段（metricValue 为文献估计值或 fixture 注入值）；
   *   - 默认 `requireExecutionProvenance: false` → 不强制 → demo seed 不受影响；
   *   - V2 计划：所有真实研究路径 FEC 强制 `requireExecutionProvenance: true`，
   *     届时无 provenance hash 的 metricValue 一律 fail-closed。
   */
  readonly executionProvenanceHash?: string;
}

/**
 * The verdict kernel's decision on a claim: the canonical verdict label plus
 * mandatory context for non-COMPLETE verdicts (scope-slip text, untested
 * reason) and the count of conflicting evidence pieces encountered.
 */
export interface VerdictDecision {
  readonly verdict: Verdict;
  readonly scopeSlipText: string | null;
  readonly untestedReason: string | null;
  readonly conflictingEvidenceCount: number;
}

/**
 * Extends {@link VerdictDecision} with the measured metric value (or null when
 * the metric was not computed). This is the top-level verdict result consumed
 * by the persistence layer and API.
 */
export interface VerdictResult extends VerdictDecision {
  readonly metricValue: number | null;
}

/**
 * 裁决内核结构化输出（P0-2-EXT）：持久化进 verdict_nodes 的 4 个 verdict-critical 字段。
 *
 * 来源：decideFiveValueVerdict 的 VerdictKernelOutput（verdict_kernel_v2.ts:176）经
 *       extractVerdictTrace 投影——修复「verdictResultFromKernelOutput 丢弃 4 字段」的缺口
 *       （legacy_kernel_adapter.ts:299 仍只投影 5 个标量进 VerdictResult，本类型走另一条投影线落库）。
 * 持久化：repository.ts recordVerdict 写 verdict_trace_json（canonical 全文）+ verdict_trace_hash
 *        （sha256(json)）两列，后者纳入 current_hash 白名单——篡改任一字段 → current_hash 失配
 *        → verifyVerdictNodes 捕获（falsifiability/verifier.ts）。
 */
export interface VerdictTracePersisted {
  readonly reasonCodes: readonly string[];
  readonly ruleTrace: readonly VerdictRuleTrace[];
  readonly decisiveRuleId: string;
  readonly evidenceSufficiency: EvidenceSufficiencyReport;
  /**
   * A1 决策路径追踪（B3·可选·透明度层）。
   *
   * 与 4 个 verdict-critical 字段不同，decisionTrace 是**事后解释**（firedRuleId / r7Gate /
   * metrics / totalRulesInTree / cannotProveStatement·verdict_kernel_v2.ts DecisionTrace），
   * 不参与裁决判定（buildDecisionTrace 不改 R0-R9 逻辑）。可选字段：
   *   - 新写入：extractVerdictTrace 透传 kernel output.decisionTrace → verdict_trace_json 全文含之
   *     → verdict_trace_hash 自动绑定（canonical 全文·篡改被 verifyVerdictNodes 捕获·信任链增强）。
   *   - 旧 DB 行（A1 前写入）：verdict_trace_json 无此字段 → 解析时 undefined（零回归）。
   *   - 宽容解析（非 fail-closed）：decisionTrace 是透明度元数据非 verdict-critical，形状不校验
   *     （4 个 critical 字段仍严格校验·parseVerdictTrace）。
   */
  readonly decisionTrace?: DecisionTrace;
  /**
   * GRADE 证据质量元数据（P0-11 接线·可选·透明度层）。
   *
   * 与 decisionTrace 同设计：不进 verdict 判定（R0-R9 不变）、不进 proofHash（VC 白名单不变）。
   * 仅当调用方提供 studyDesign（或chestrator/verdict_stage 透传）时 kernel 产出
   * evidenceQualityTier/evidenceQualityNote → extractVerdictTrace 条件透传 →
   * verdict_trace_json 全文含之（verdict_trace_hash 自动绑定·篡改可检）。
   * 未提供 studyDesign 的行无此字段（零回归·宽容解析同 decisionTrace）。
   */
  readonly evidenceQualityTier?: EvidenceTier;
  readonly evidenceQualityNote?: string;
}

/**
 * A persisted verdict node in the claim-verdict hash chain. Immutable once
 * written: the `currentHash` binds all verdict-critical fields and links to
 * `parentVerdictId` via `prevHash`, so any tampering breaks the chain and is
 * detected by {@link verifyVerdictNodes}.
 */
export interface VerdictNode {
  readonly verdictId: string;
  readonly evidenceId: string;
  readonly parentVerdictId: string | null;
  readonly nodeKind: VerdictNodeKind;
  readonly verdict: Verdict;
  readonly falsificationSpec: FalsificationSpec;
  readonly thresholdSpec: ThresholdSpec | null;
  readonly metricValue: number | null;
  readonly conflictingEvidenceCount: number;
  readonly scopeSlipText: string | null;
  readonly untestedReason: string | null;
  readonly sourceAnchor: SourceAnchor;
  readonly replayProver: ReplayProver | null;
  /** P0-2-EXT：裁决内核结构化输出（4 字段全文·可查可审）。 */
  readonly verdictTrace: VerdictTracePersisted;
  /** P0-2-EXT：verdict_trace_json 的 sha256，进 current_hash 白名单（绑定证据）。 */
  readonly verdictTraceHash: string;
  readonly prevHash: string;
  readonly currentHash: string;
  /** FUSION-OS-12：被取代指针。null=当前活跃；非空=被该 verdict_id 取代（元数据·不进 current_hash 白名单）。 */
  readonly supersededBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Arguments for {@link recordVerdict} — the sole entry point for persisting a
 * verdict node. All verdict-critical fields must be supplied so the resulting
 * hash-chain node is complete and tamper-detectable.
 */
export interface RecordVerdictArgs {
  readonly evidenceId: string;
  readonly parentVerdictId: string | null;
  readonly nodeKind: VerdictNodeKind;
  readonly verdict: Verdict;
  readonly falsificationSpec: FalsificationSpec;
  readonly thresholdSpec: ThresholdSpec | null;
  readonly metricValue: number | null;
  readonly conflictingEvidenceCount: number;
  readonly scopeSlipText: string | null;
  readonly untestedReason: string | null;
  readonly sourceAnchor: SourceAnchor;
  readonly replayProver: ReplayProver | null;
  /**
   * P0-2-EXT：裁决内核结构化输出。必填——recordVerdict 是 verdict 落库的唯一咽喉，
   * 缺 trace 即缺绑定（decideFiveValueVerdict 恒产 4 字段，任何真实裁决路径都应提供）。
   */
  readonly verdictTrace: VerdictTracePersisted;
}

export type {
  ReplayProver,
  SourceAnchor,
} from '../evidence_log/types.ts';
export type {
  Verdict,
  VerdictNodeKind,
} from '../schema/enums.ts';
