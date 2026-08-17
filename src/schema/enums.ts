/** Canonical payload kinds for agent-loop messages (hypothesis, experiment, observation, citation, plan, feedback, understanding, integration, meta). */
export const PAYLOAD_KINDS = [
  'hypothesis',
  'experiment',
  'observation',
  'citation',
  'plan',
  'feedback',
  'understanding',
  'integration',
  'meta',
] as const;

/** Purposes allowed in the main reasoning ring (hypothesis, narrative, viz_select, code_gen, dialogue). */
export const MAIN_RING_PURPOSES = [
  'hypothesis',
  'narrative',
  'viz_select',
  'code_gen',
  'dialogue',
] as const;

/** Purposes allowed in the evaluation ring (eval, scoring, gt_read). */
export const EVAL_RING_PURPOSES = ['eval', 'scoring', 'gt_read'] as const;
/** Purposes that are exempt from baseline comparison (baseline_exempt). */
export const BASELINE_EXEMPT_PURPOSES = ['baseline_exempt'] as const;

/** Union of all allowed purpose tags (main ring + eval ring + baseline exempt). */
export const PURPOSE_TAGS = [
  ...MAIN_RING_PURPOSES,
  ...EVAL_RING_PURPOSES,
  ...BASELINE_EXEMPT_PURPOSES,
] as const;

/** Reasons an agent-loop stage may finish (stop, length, tool_calls, function_call, content_filter). */
export const FINISH_REASONS = [
  'stop',
  'length',
  'tool_calls',
  'function_call',
  'content_filter',
] as const;

/** The five canonical verdict values produced by the deterministic verdict kernel. */
export const VERDICTS = [
  'CONFIRMED',
  'REFUTED',
  'INCONCLUSIVE',
  'DEGRADED_SCOPE',
  'UNTESTED',
] as const;

// DEBT-12：阈值语义单源（3 值）。精确等值 eq/ne 已移除——无可证伪语义（Popper），
// science_check_to_fec.ts 对 '==' fail-closed 拒绝。fec_contract FecThresholdSpec.thresholdSemantics、
// falsifiability/types.ts ThresholdSemantics、contracts.ts ComparatorKind 均派生自本常量（FF-16 守单一源）。
/** Single source of truth for threshold comparison semantics (gt, lt, range). The eq/ne values were removed — exact equality has no falsifiable semantics (Popper, DEBT-12). fec_contract FecThresholdSpec.thresholdSemantics, falsifiability/types.ts ThresholdSemantics, and contracts.ts ComparatorKind all derive from this constant (FF-16 single-source guard). */
export const THRESHOLD_SEMANTICS = [
  'gt',
  'lt',
  'range',
] as const;

/** Kinds of nodes in the claim-verdict graph (hypothesis, evidence, method, plan, feedback, root). */
export const VERDICT_NODE_KINDS = [
  'hypothesis',
  'evidence',
  'method',
  'plan',
  'feedback',
  'root',
] as const;

/** Kinds of edges in the claim-verdict graph (supports, refutes, derives_from, tests, iterates). */
export const EDGE_KINDS = [
  'supports',
  'refutes',
  'derives_from',
  'tests',
  'iterates',
] as const;

/** Status values for reproducibility verification runs (success, hash_mismatch, env_drift, aborted). */
export const REPRO_RUN_STATUSES = [
  'success',
  'hash_mismatch',
  'env_drift',
  'aborted',
] as const;

/** Type alias for a canonical payload kind. @see PAYLOAD_KINDS */
export type PayloadKind = (typeof PAYLOAD_KINDS)[number];
/** Type alias for a main-ring purpose. @see MAIN_RING_PURPOSES */
export type MainRingPurpose = (typeof MAIN_RING_PURPOSES)[number];
/** Type alias for an eval-ring purpose. @see EVAL_RING_PURPOSES */
export type EvalRingPurpose = (typeof EVAL_RING_PURPOSES)[number];
/** Type alias for any allowed purpose tag. @see PURPOSE_TAGS */
export type PurposeTag = (typeof PURPOSE_TAGS)[number];
/** Type alias for an agent-loop finish reason. @see FINISH_REASONS */
export type FinishReason = (typeof FINISH_REASONS)[number];
/** Type alias for a canonical verdict value. @see VERDICTS */
export type Verdict = (typeof VERDICTS)[number];
/** Type alias for a claim-verdict graph node kind. @see VERDICT_NODE_KINDS */
export type VerdictNodeKind = (typeof VERDICT_NODE_KINDS)[number];
/** Type alias for a claim-verdict graph edge kind. @see EDGE_KINDS */
export type EdgeKind = (typeof EDGE_KINDS)[number];
/** Type alias for a threshold comparison semantic. @see THRESHOLD_SEMANTICS */
export type ThresholdSemantic = (typeof THRESHOLD_SEMANTICS)[number];

// ----- V2 共享 enum（APPENDIX_A_TYPES.md §49-96 DESIGN_LOCKED 权威·多子系统复用）-----
// 注：science_harness/types.ts 的 ScienceCheckOutcome 字面量与本处 ProofCheckOutcome 一致；
// 未来统一时以 ProofCheckOutcome（APPENDIX_A 权威名）为准，本次不重构 science_harness（功能保留）。

/** 单个可证伪检验项的判定结果（APPENDIX_A §49-53）。 */
export const PROOF_CHECK_OUTCOMES = ['PASS', 'FAIL', 'WARN', 'SKIP'] as const;
/** Type alias: proof check outcome. */
export type ProofCheckOutcome = (typeof PROOF_CHECK_OUTCOMES)[number];

/** 单条统计/测量结果相对 claim 的方向（APPENDIX_A §63-67）。 */
export const EVIDENCE_DIRECTIONS = ['supports', 'refutes', 'neutral', 'not_applicable'] as const;
/** Type alias: evidence direction. */
export type EvidenceDirection = (typeof EVIDENCE_DIRECTIONS)[number];

/** FEC 声明 effect 与 threshold 的比较关系（APPENDIX_A §78-83·03 FecContract.direction）。 */
export const EFFECT_COMPARATORS = ['greater', 'less', 'equal', 'within', 'noninferior'] as const;
/** Type alias: effect comparator. */
export type EffectComparator = (typeof EFFECT_COMPARATORS)[number];

/** WorkflowBinding 网络策略（APPENDIX_A §93-96·Production 默认 off/allowlist）。 */
export const NETWORK_POLICIES = ['off', 'allowlist', 'unrestricted-with-warning'] as const;
/** Type alias: network policy. */
export type NetworkPolicy = (typeof NETWORK_POLICIES)[number];

/** Allowed source types for a source card (official_doc, paper, github_repo, dataset, news, benchmark, other). */
export const SOURCE_CARD_SOURCE_TYPES = [
  'official_doc',
  'paper',
  'github_repo',
  'dataset',
  'news',
  'benchmark',
  'other',
] as const;

/** Evidence levels for a source card (primary, secondary, tertiary). */
export const SOURCE_CARD_EVIDENCE_LEVELS = ['primary', 'secondary', 'tertiary'] as const;

/** Stability classifications for a source card (stable, versioned, time_sensitive). */
export const SOURCE_CARD_STABILITY = ['stable', 'versioned', 'time_sensitive'] as const;

/** Usage categories for a source card (design_benchmark, api_contract, scientific_evidence, scoring_context). */
export const SOURCE_CARD_USED_FOR = [
  'design_benchmark',
  'api_contract',
  'scientific_evidence',
  'scoring_context',
] as const;

/** Type alias for a source card source type. @see SOURCE_CARD_SOURCE_TYPES */
export type SourceCardSourceType = (typeof SOURCE_CARD_SOURCE_TYPES)[number];
/** Type alias for a source card evidence level. @see SOURCE_CARD_EVIDENCE_LEVELS */
export type SourceCardEvidenceLevel = (typeof SOURCE_CARD_EVIDENCE_LEVELS)[number];
/** Type alias for a source card stability classification. @see SOURCE_CARD_STABILITY */
export type SourceCardStability = (typeof SOURCE_CARD_STABILITY)[number];
/** Type alias for a source card usage category. @see SOURCE_CARD_USED_FOR */
export type SourceCardUsedFor = (typeof SOURCE_CARD_USED_FOR)[number];

/**
 * A structured "source card" describing a referenced external source: its URL, title,
 * publisher, evidence level, and stability. Used to annotate evidence provenance
 * with human-readable source metadata.
 */
export interface SourceCard {
  readonly sourceId: string;
  readonly url: string;
  readonly title: string;
  readonly sourceType: SourceCardSourceType;
  readonly publisher: string;
  readonly fetchedAt: string;
  readonly claim: string;
  readonly evidenceLevel: SourceCardEvidenceLevel;
  readonly stability: SourceCardStability;
  readonly usedFor: SourceCardUsedFor;
  readonly verifiedFactId?: string;
  readonly notes?: string;
}

/**
 * CORE-REPORT-001 · 报告段落声明分类：报告必须区分事实、推断和未完成。
 * FACT=已验证的结构化记录；INFERENCE=由记录推出的聚合/审计判断；UNCOMPLETED=边界/未完成声明。
 */
export const REPORT_CLAIM_CATEGORIES = ['FACT', 'INFERENCE', 'UNCOMPLETED'] as const;
export type ReportClaimCategory = (typeof REPORT_CLAIM_CATEGORIES)[number];

/**
 * CORE-EPISTEMIC-001 · 关键判断认知类型标签（宪法 §科学输出 九值字母表）。
 * 与 REPORT_CLAIM_CATEGORIES 正交：报告段落分类是「完成度」维度（FACT/INFERENCE/UNCOMPLETED），
 * 本表是「认知来源」维度——同一句判断两者兼备（例：INFERENCE 段落里的 HYPOTHESIS 判断）。
 * 约束（宪法原文）：UNKNOWN 不得在后续步骤无证据消失；置信度必须与证据质量/校准状态匹配。
 */
export const EPISTEMIC_TAGS = [
  'FACT',
  'OBSERVATION',
  'EVIDENCE',
  'ASSUMPTION',
  'HYPOTHESIS',
  'INFERENCE',
  'UNKNOWN',
  'RISK',
  'DECISION',
] as const;
export type EpistemicTag = (typeof EPISTEMIC_TAGS)[number];
