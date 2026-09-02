import { z } from 'zod';
import { STAGE_ORDER, RunStageName } from './run.js';

/**
 * Workflow-as-data (Ω-ULTRA ADR D4): the research control flow is a typed, persisted
 * domain object instead of the STAGE_ORDER array constant. The 12 canonical stages
 * become PRIMITIVES the plan sequences; `defaultWorkflow()` reproduces today's exact
 * linear order, so the plan executor is behaviorally equivalent to the array loop
 * (proven by the full suite + the omega-baseline-w0 pin comparison).
 *
 * Slice 1 scope (honest): steps are `kind: 'stage'` only, completion is
 * `stage_terminal` only. The executor REJECTS any other combination visibly instead
 * of silently ignoring it; `agent` / `experiment` / `human` steps arrive with the
 * capability plane (ADR D5) and must bring their own completion predicates.
 */

const ISO_STRING = z.string().min(1);

/** How a step is considered finished. `stage_terminal` = the stage record reaches a terminal state (done/skipped/failed). */
export const StepCompletionSchema = z.object({
  kind: z.literal('stage_terminal'),
});
export type StepCompletion = z.infer<typeof StepCompletionSchema>;

export const WorkflowStepSchema = z.object({
  /** Stable within one plan; deps reference it. */
  id: z.string().min(1),
  /** Slice 1: `stage` only. The executor fails closed on any other kind. */
  kind: z.literal('stage'),
  /** Target stage primitive. */
  target: RunStageName,
  /** Step ids that must reach a terminal state before this step may start. */
  after: z.array(z.string().min(1)),
  completion: StepCompletionSchema,
  /** Upper bound on stage attempts (matches the persisted attempt accounting; informational at slice 1 — enforcement stays with the stage machine). */
  attemptCap: z.number().int().positive(),
});
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const WorkflowPlanSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  /** Monotone per run; revisions append a new plan object with version+1 and revisedFrom. */
  version: z.number().int().positive(),
  origin: z.enum(['default', 'kernel', 'revision']),
  createdAt: ISO_STRING,
  steps: z.array(WorkflowStepSchema).min(1),
  /** Set on revision plans; the audit event carries the revision reason. */
  revisedFrom: z.string().min(1).optional(),
});
export type WorkflowPlan = z.infer<typeof WorkflowPlanSchema>;

/** Step ids for the default linear plan (s1..sN over STAGE_ORDER, each after the previous). */
const defaultStepId = (index: number): string => `s${index + 1}`;

/** The canonical linear plan — exactly today's STAGE_ORDER walk, as data. */
export function defaultWorkflow(runId: string, at = new Date().toISOString()): WorkflowPlan {
  return WorkflowPlanSchema.parse({
    id: `wfp_${runId}`,
    runId,
    version: 1,
    origin: 'default',
    createdAt: at,
    steps: STAGE_ORDER.map((target, i) => ({
      id: defaultStepId(i),
      kind: 'stage' as const,
      target,
      after: i === 0 ? [] : [defaultStepId(i - 1)],
      completion: { kind: 'stage_terminal' as const },
      attemptCap: 3,
    })),
  });
}

/**
 * First runnable step in PLAN ORDER whose stage record is not done/skipped and whose
 * `after` deps are all terminal — the plan-order equivalent of the array cursor.
 * A missing stage record counts as pending (matches the array loop: only done/skipped
 * are skipped). `skipWithoutHandler` excludes steps whose handler is absent in this
 * build (the plan-loop equivalent of `cursor += 1`).
 */
export function nextWorkflowStage(
  plan: WorkflowPlan,
  stageState: (target: RunStageName) => { state: string } | undefined,
  skipTargets: ReadonlySet<string>,
): RunStageName | undefined {
  // A dependency is satisfied when its stage record reached a terminal state, or when
  // the executor passed over it for a missing handler this pass (the record stays
  // pending-but-visible; blocking the chain would diverge from the array loop's
  // `cursor += 1` behavior). A FAILED dependency does not gate downstream steps —
  // the stage machine stops at failures itself (resume retries the failed stage first).
  const depSatisfied = (t: RunStageName): boolean => {
    if (skipTargets.has(t)) return true;
    const rec = stageState(t);
    return rec !== undefined && (rec.state === 'done' || rec.state === 'skipped');
  };
  for (const step of plan.steps) {
    if (skipTargets.has(step.target)) continue;
    const rec = stageState(step.target);
    if (rec !== undefined && (rec.state === 'done' || rec.state === 'skipped')) continue;
    if (step.after.length > 0 && !step.after.every((depId) => {
      const dep = plan.steps.find((s) => s.id === depId);
      return dep !== undefined && depSatisfied(dep.target);
    })) continue;
    return step.target;
  }
  return undefined;
}
