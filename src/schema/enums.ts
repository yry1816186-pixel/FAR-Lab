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

export const MAIN_RING_PURPOSES = [
  'hypothesis',
  'narrative',
  'viz_select',
  'code_gen',
  'dialogue',
] as const;

export const EVAL_RING_PURPOSES = ['eval', 'scoring', 'gt_read'] as const;
export const BASELINE_EXEMPT_PURPOSES = ['baseline_exempt'] as const;

export const PURPOSE_TAGS = [
  ...MAIN_RING_PURPOSES,
  ...EVAL_RING_PURPOSES,
  ...BASELINE_EXEMPT_PURPOSES,
] as const;

export const FINISH_REASONS = [
  'stop',
  'length',
  'tool_calls',
  'function_call',
  'content_filter',
] as const;

export const VERDICTS = [
  'CONFIRMED',
  'REFUTED',
  'INCONCLUSIVE',
  'DEGRADED_SCOPE',
  'UNTESTED',
] as const;

export const VERDICT_NODE_KINDS = [
  'hypothesis',
  'evidence',
  'method',
  'plan',
  'feedback',
  'root',
] as const;

export const EDGE_KINDS = [
  'supports',
  'refutes',
  'derives_from',
  'tests',
  'iterates',
] as const;

export const REPRO_RUN_STATUSES = [
  'success',
  'hash_mismatch',
  'env_drift',
  'aborted',
] as const;

export type PayloadKind = (typeof PAYLOAD_KINDS)[number];
export type MainRingPurpose = (typeof MAIN_RING_PURPOSES)[number];
export type EvalRingPurpose = (typeof EVAL_RING_PURPOSES)[number];
export type BaselineExemptPurpose = (typeof BASELINE_EXEMPT_PURPOSES)[number];
export type PurposeTag = (typeof PURPOSE_TAGS)[number];
export type FinishReason = (typeof FINISH_REASONS)[number];
export type Verdict = (typeof VERDICTS)[number];
export type VerdictNodeKind = (typeof VERDICT_NODE_KINDS)[number];
export type EdgeKind = (typeof EDGE_KINDS)[number];
export type ReproRunStatus = (typeof REPRO_RUN_STATUSES)[number];

export function isMainRingPurpose(value: string): value is MainRingPurpose {
  return (MAIN_RING_PURPOSES as readonly string[]).includes(value);
}

export function isEvalRingPurpose(value: string): value is EvalRingPurpose {
  return (EVAL_RING_PURPOSES as readonly string[]).includes(value);
}

// ----- V2 共享 enum（APPENDIX_A_TYPES.md §49-96 DESIGN_LOCKED 权威·多子系统复用）-----
// 注：science_harness/types.ts 的 ScienceCheckOutcome 字面量与本处 ProofCheckOutcome 一致；
// 未来统一时以 ProofCheckOutcome（APPENDIX_A 权威名）为准，本次不重构 science_harness（功能保留）。

/** 单个可证伪检验项的判定结果（APPENDIX_A §49-53）。 */
export const PROOF_CHECK_OUTCOMES = ['PASS', 'FAIL', 'WARN', 'SKIP'] as const;
export type ProofCheckOutcome = (typeof PROOF_CHECK_OUTCOMES)[number];

/** 单条统计/测量结果相对 claim 的方向（APPENDIX_A §63-67）。 */
export const EVIDENCE_DIRECTIONS = ['supports', 'refutes', 'neutral', 'not_applicable'] as const;
export type EvidenceDirection = (typeof EVIDENCE_DIRECTIONS)[number];

/** FEC 声明 effect 与 threshold 的比较关系（APPENDIX_A §78-83·03 FecContract.direction）。 */
export const EFFECT_COMPARATORS = ['greater', 'less', 'equal', 'within', 'noninferior'] as const;
export type EffectComparator = (typeof EFFECT_COMPARATORS)[number];

/** WorkflowBinding 网络策略（APPENDIX_A §93-96·Production 默认 off/allowlist）。 */
export const NETWORK_POLICIES = ['off', 'allowlist', 'unrestricted-with-warning'] as const;
export type NetworkPolicy = (typeof NETWORK_POLICIES)[number];
