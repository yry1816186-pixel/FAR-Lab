/**
 * entities/run — research-mission lifecycle vocabulary.
 *
 * Authorities:
 *   - src/research/run_lifecycle.ts  ResearchLifecycleState (9 states)
 *   - src/research/orchestrator.ts   RESEARCH_STAGE_IDS (8 stages, ordered)
 *   - src/research/types.ts          RunMode / ComponentMode (§3.2 honesty)
 *
 * A run is LIVE only when every science-affecting component is LIVE; the UI
 * surfaces the aggregate mode on every mission and never upgrades a replay
 * into "live" wording.
 */

export const RUN_LIFECYCLE_STATES = [
  'CREATED',
  'VALIDATING',
  'RETRIEVING',
  'GENERATING_HYPOTHESES',
  'REVIEWING',
  'PLANNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;

export type RunLifecycleState = (typeof RUN_LIFECYCLE_STATES)[number];

export function isTerminalState(state: string): boolean {
  return state === 'COMPLETED' || state === 'FAILED' || state === 'CANCELLED';
}

/** Pipeline stage ids in execution order (checkpoint granularity). */
export const RESEARCH_STAGE_IDS = [
  'researchability_gate',
  'grounding',
  'hypothesis_generation',
  'citation_binding',
  'falsifiability_gate',
  'critique',
  'scoring',
  'plan',
] as const;

export type ResearchStageId = (typeof RESEARCH_STAGE_IDS)[number];

/** Aggregate run mode (§3.2). */
export const RUN_MODES = [
  'LIVE',
  'MIXED',
  'RECORDED_REPLAY',
  'SYNTHETIC_TEST',
  'OFFLINE_DEVELOPMENT',
] as const;

export type RunModeValue = (typeof RUN_MODES)[number];

/**
 * Honesty mapping: which modes may be described as live computation.
 * Anything else must read as replay/synthetic — never "live".
 */
export function isLiveRunMode(mode: string): boolean {
  return mode === 'LIVE';
}

/** Generic tone for a lifecycle state (paired with the state text itself). */
export function lifecycleTone(state: string): 'ok' | 'danger' | 'info' | 'muted' {
  if (state === 'COMPLETED') return 'ok';
  if (state === 'FAILED') return 'danger';
  if (state === 'CANCELLED') return 'muted';
  return 'info';
}
