import type {
  SourceAnchor,
  ReplayProver,
} from '../evidence_log/types.ts';
import type {
  Verdict,
  VerdictNodeKind,
} from '../schema/enums.ts';
import type {
  EvidenceSufficiencyReport,
  VerdictRuleTrace,
} from './verdict_kernel_v2.ts';

export type ThresholdSemantics = 'gt' | 'lt' | 'range';

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
