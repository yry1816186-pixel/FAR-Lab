import { z } from 'zod';
import { RunId, QuestionId, ReceiptId, ModelConfigId } from './ids.js';

/** Run lifecycle — INTERFACES.md §1. No invented percentage progress. */
export const RunStatus = z.enum([
  'created', 'queued', 'running', 'paused', 'partial', 'completed', 'failed', 'cancelled',
]);
export type RunStatus = z.infer<typeof RunStatus>;

/** Canonical Direction-A stages — ARCHITECTURE.md §7. `execute` (B8) runs the
 *  plan-drafted enrichment experiment after `plan`; it SKIPS honestly when the
 *  plan maps to no public tabular dataset, so it never gates completion. */
export const RunStageName = z.enum([
  'scope', 'retrieve', 'verify_sources', 'build_evidence', 'generate_hypotheses',
  'critique_falsify', 'rank', 'plan', 'execute', 'feedback', 'revise', 'export',
]);
export type RunStageName = z.infer<typeof RunStageName>;

export const StageState = z.enum(['pending', 'running', 'done', 'failed', 'skipped']);
export type StageState = z.infer<typeof StageState>;

export const StageRecord = z.object({
  stage: RunStageName,
  state: StageState,
  attempt: z.number().int().nonnegative().default(1),
  startedAt: z.string().datetime().optional(),
  endedAt: z.string().datetime().optional(),
  error: z.string().optional(),
  /** Determinate subtask counts ONLY when the runtime truly knows them. */
  subtasks: z.object({ known: z.boolean(), done: z.number().int(), total: z.number().int() }).optional(),
  /** Handle of the persisted checkpoint to resume from (never a fabricated offset). */
  checkpointRef: z.string().optional(),
});
export type StageRecord = z.infer<typeof StageRecord>;

/** Append-only run event — the audit spine. State transitions MUST emit one of these. */
export const RunEvent = z.object({
  seq: z.number().int().positive(),
  runId: RunId,
  at: z.string().datetime(),
  type: z.enum([
    'run_created', 'stage_started', 'stage_done', 'stage_failed', 'stage_skipped',
    'run_status_changed', 'checkpoint_saved', 'run_resumed', 'run_cancelled',
    'feedback_received', 'revision_created', 'receipt_recorded', 'note',
    'experiment_queued', 'experiment_started', 'experiment_completed', 'experiment_failed', 'experiment_canceled',
    // Agent harness (H1): additive audit types — consumers must tolerate unknown types.
    'agent_started', 'agent_tool_used', 'agent_finished',
  ]),
  status: RunStatus.optional(),
  // Free-form: pipeline stages pass the RunStageName; receipt events also carry
  // non-stage origins ('action:<name>' research actions, 'agent:<capability>' sessions).
  stage: z.string().optional(),
  detail: z.record(z.string(), z.unknown()).default({}),
  receiptId: ReceiptId.optional(),
});
export type RunEvent = z.infer<typeof RunEvent>;

export const ResearchRun = z.object({
  id: RunId,
  questionId: QuestionId,
  status: RunStatus,
  currentStage: RunStageName,
  stages: z.array(StageRecord),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  /** Structured failure summary when status=failed/partial; visible, never swallowed. */
  lastError: z.string().optional(),
  /** Persisted cancellation request — cross-process visible (CLI cancel -> running orchestrator). */
  cancelRequested: z.boolean().default(false),
  parentRunId: RunId.optional(), // revision lineage: a revised run points at its predecessor
  tags: z.array(z.string()).default([]),
  /**
   * Explicit model route for THIS run (user-selected at creation). Resolution order:
   * run.providerConfigId > run.routeOverride > meta activeModelConfigId > env chain
   * (FARLAB_MODEL_PROVIDER). A dangling id fails closed at call time — never a silent
   * fallback to another model (reproducibility over availability).
   */
  providerConfigId: ModelConfigId.optional(),
  /**
   * Built-in registry route pinned to this run (CLI `--route zai|dashscope|deepseek|universal|offline`).
   * Named-route starts MUST persist their route: resume executes in a NEW process where
   * the start-time providerOverride no longer exists, and without this field the run
   * silently falls to the workspace default route — live-observed 2026-08-28: a zai run
   * resumed straight into a dead deepseek default (HTTP 402) despite zai being healthy.
   */
  routeOverride: z.enum(['zai', 'dashscope', 'deepseek', 'universal', 'offline']).optional(),
});
export type ResearchRun = z.infer<typeof ResearchRun>;

/** Legal stage ordering used by the orchestrator (feedback/revise may interleave after plan).
 *  `execute` sits between plan and feedback; skipped-state counts toward progress
 *  (runProgress below) so infeasible plans do not stall the bar. */
export const STAGE_ORDER: readonly RunStageName[] = [
  'scope', 'retrieve', 'verify_sources', 'build_evidence', 'generate_hypotheses',
  'critique_falsify', 'rank', 'plan', 'execute', 'feedback', 'revise', 'export',
] as const;

export const runProgress = (run: ResearchRun): { known: boolean; done: number; total: number } => {
  const core = STAGE_ORDER.filter((s) => s !== 'feedback' && s !== 'revise' && s !== 'execute');
  const done = core.filter((s) => ['done', 'skipped'].includes(String(run.stages.find((r) => r.stage === s)?.state))).length;
  return { known: true, done, total: core.length };
};
