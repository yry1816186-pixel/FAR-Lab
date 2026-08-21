import { z } from 'zod';
import { RunId, QuestionId, ReceiptId } from './ids.js';
import { ObjectRef } from './ids.js';

/** Run lifecycle — INTERFACES.md §1. No invented percentage progress. */
export const RunStatus = z.enum([
  'created', 'queued', 'running', 'paused', 'partial', 'completed', 'failed', 'cancelled',
]);
export type RunStatus = z.infer<typeof RunStatus>;

/** Canonical Direction-A stages — ARCHITECTURE.md §7. */
export const RunStageName = z.enum([
  'scope', 'retrieve', 'verify_sources', 'build_evidence', 'generate_hypotheses',
  'critique_falsify', 'rank', 'plan', 'feedback', 'revise', 'export',
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
  ]),
  status: RunStatus.optional(),
  stage: RunStageName.optional(),
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
});
export type ResearchRun = z.infer<typeof ResearchRun>;

/** Legal stage ordering used by the orchestrator (feedback/revise may interleave after plan). */
export const STAGE_ORDER: readonly RunStageName[] = [
  'scope', 'retrieve', 'verify_sources', 'build_evidence', 'generate_hypotheses',
  'critique_falsify', 'rank', 'plan', 'feedback', 'revise', 'export',
] as const;

export const runProgress = (run: ResearchRun): { known: boolean; done: number; total: number } => {
  const core = STAGE_ORDER.filter((s) => s !== 'feedback' && s !== 'revise');
  const done = core.filter((s) => ['done', 'skipped'].includes(String(run.stages.find((r) => r.stage === s)?.state))).length;
  return { known: true, done, total: core.length };
};

export const objectRefFor = (kind: z.infer<typeof ObjectRef.shape.kind>, id: string): ObjectRef => ({ kind, id });
