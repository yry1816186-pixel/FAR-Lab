/** Constant: AGENT_RUN_EVENT_KINDS. */
export const AGENT_RUN_EVENT_KINDS = [
  'run_started',
  'run_completed',
  'stage_started',
  'stage_completed',
  'tool_call_requested',
  'tool_call_completed',
  'guardrail_blocked',
  'source_card_accepted',
  'human_checkpoint_recorded',
  'verdict_written',
  'fork_created',
  'replay_started',
  'replay_completed',
  'attack_case_started',
  'attack_case_completed',
  'session_started',
  'session_finalized',
  'dialogue_turn_started',
  'dialogue_turn_completed',
  'intent_inferred',
  'clarification_asked',
] as const;

/** Constant: AGENT_RUN_EVENT_DECISIONS. */
export const AGENT_RUN_EVENT_DECISIONS = ['allow', 'ask', 'deny', 'skip', 'record'] as const;

/** Constant: TRACE_FAILURE_CODES. */
export const TRACE_FAILURE_CODES = [
  'schema_invalid',
  'tool_misroute',
  'unsupported_claim',
  'source_mismatch',
  'hidden_scope_slip',
  'over_confirmed',
  'nonreproducible_metric',
  'provider_boundary_leak',
  'guardrail_missing',
  'security_policy_violation',
] as const;

/** Type alias: agent run event kind. */
export type AgentRunEventKind = (typeof AGENT_RUN_EVENT_KINDS)[number];
/** Type alias: agent run event decision. */
export type AgentRunEventDecision = (typeof AGENT_RUN_EVENT_DECISIONS)[number];
/** Type alias: trace failure code. */
export type TraceFailureCode = (typeof TRACE_FAILURE_CODES)[number];

/** Interface defining trace grade. */
export interface TraceGrade {
  readonly traceGradeId: string;
  readonly runId: string;
  readonly graderKind:
    | 'schema_validity'
    | 'tool_routing'
    | 'source_coverage'
    | 'guardrail_effectiveness'
    | 'verdict_honesty'
    | 'reproducibility'
    | 'security_resilience';
  readonly score: number;
  readonly failureCodes: readonly TraceFailureCode[];
  readonly evidenceRefs: readonly string[];
  readonly gradedBy: 'deterministic_script' | 'human_checkpoint' | 'external_oracle';
  readonly isoTimestamp: string;
}
