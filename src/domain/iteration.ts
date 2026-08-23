import { z } from 'zod';
import { IterationId, RunId } from './ids.js';
import { RunStageName } from './run.js';

/**
 * Research iteration records (research-loop lane): ONE decision per completed
 * pass of the stage machine — continue with a named actionable trigger, or stop
 * with a machine-readable reason. The controller is fully deterministic
 * (research/oss-capability-diff-2026-08-23.md: unbounded tree search was
 * evaluated and rejected as data-dredging; iteration proceeds only on explicit
 * falsification-loop legs and is bounded by round cap, run budget and a
 * no-material-delta fingerprint guard).
 */
export const ITERATION_TRIGGER_KINDS = [
  'unconsumed_feedback',
  'executable_plan_unexecuted',
] as const;
export type IterationTriggerKind = (typeof ITERATION_TRIGGER_KINDS)[number];

export const ITERATION_STOP_KINDS = [
  'round_cap',
  'budget_exhausted',
  'no_material_delta',
  'no_actionable_work',
] as const;
export type IterationStopKind = (typeof ITERATION_STOP_KINDS)[number];

const IterationTrigger = z.discriminatedUnion('kind', [
  /** Feedback signals no Revision has consumed yet — feedback -> revise -> export reopens. */
  z.object({
    kind: z.literal('unconsumed_feedback'),
    signalIds: z.array(z.string().min(1)).min(1),
  }),
  /** A latest plan that passes the deterministic executability check while no
   * experiment_run has completed for this run — execute -> feedback -> revise -> export reopens. */
  z.object({
    kind: z.literal('executable_plan_unexecuted'),
    planId: z.string().min(1),
  }),
]);
export type IterationTrigger = z.infer<typeof IterationTrigger>;

const IterationStop = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('round_cap'), rounds: z.number().int().min(1) }),
  z.object({ kind: z.literal('budget_exhausted'), spent: z.number(), cap: z.number() }),
  z.object({ kind: z.literal('no_material_delta') }),
  z.object({ kind: z.literal('no_actionable_work') }),
]);
export type IterationStop = z.infer<typeof IterationStop>;

/** Material domain counts of one completed pass — the no-delta fingerprint input. */
export const IterationSnapshot = z.object({
  round: z.number().int().min(1),
  claims: z.number().int(),
  verifiedClaims: z.number().int(),
  hypotheses: z.number().int(),
  /** Sum of hypothesis versions — a causal revision bumps the revised hypothesis. */
  hypothesisVersionSum: z.number().int(),
  scorecards: z.number().int(),
  plans: z.number().int(),
  revisions: z.number().int(),
  experimentRunsCompleted: z.number().int(),
  feedbackSignals: z.number().int(),
  feedbackConsumed: z.number().int(),
  effectEstimates: z.number().int(),
  /** sha256 over canonical material counts — identical fingerprint = no material delta. */
  fingerprint: z.string().min(8),
});
export type IterationSnapshot = z.infer<typeof IterationSnapshot>;

export const IterationRecord = z.object({
  id: IterationId,
  runId: RunId,
  /** The pass that JUST finished when this decision was made (1 = initial pass). */
  round: z.number().int().min(1),
  decidedAt: z.string().datetime(),
  decision: z.enum(['continue', 'stop']),
  continueTrigger: IterationTrigger.optional(),
  stopReason: IterationStop.optional(),
  /** Stages reopened for the next round (empty on stop). */
  reopenStages: z.array(RunStageName).default([]),
  /** Human-readable rationale (also evented; the record is the structured truth). */
  rationale: z.string().min(1),
  snapshot: IterationSnapshot,
  /** What would unblock another round — surfaced verbatim to the researcher. */
  unblockHints: z.array(z.string().min(1)).default([]),
});
export type IterationRecord = z.infer<typeof IterationRecord>;
