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
