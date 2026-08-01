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
} from './verdict_kernel_v2.ts';

// DEBT-12 单源化：派生自 schema/enums.ts THRESHOLD_SEMANTICS（3 值·与 fec_contract/contracts 同源）。
export type ThresholdSemantics = ThresholdSemantic;

export interface FalsificationSpec {
  readonly prediction: string;
  readonly metric: string;
  readonly falsificationThreshold: number;
  readonly thresholdSemantics: ThresholdSemantics;
}

export interface ThresholdSpec {
  readonly semantics: ThresholdSemantics;
  readonly value?: number;
  readonly lower?: number;
  readonly upper?: number;
}

export interface EvidenceRecord {
  readonly claim: string;
  readonly metricValue?: number;
  readonly supportsClaim: boolean;
  readonly refutesClaim: boolean;
  readonly scopeNarrowerThanClaim: boolean;
  readonly sourceAnchor: SourceAnchor;
  /**
   * T-003 · Evidence provenance binding（2026-07-24 评委逼问第 1 轮 F-2-005 修复）。
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

export interface VerdictDecision {
  readonly verdict: Verdict;
  readonly scopeSlipText: string | null;
  readonly untestedReason: string | null;
  readonly conflictingEvidenceCount: number;
}

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
}

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
