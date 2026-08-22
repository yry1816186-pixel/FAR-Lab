import type { StageContext, StageHandler, StageOutcome } from '../types.js';
import { draftSpecFromPlan } from '../../experiment/spec-from-plan.js';
import { executeExperiment } from '../../experiment/executor.js';

/**
 * B8: experiments inside the run lifecycle. After `plan`, the run tries ONE
 * plan-drafted experiment on the local executor; the mechanical verdict and
 * result sets land in far.db (same objects the CLI path writes), feeding the
 * feedback/revise loop with executed evidence.
 *
 * Truth rules:
 *  - A plan that cannot map to a public tabular dataset SKIPS the stage with
 *    the reason (experiments enrich; they never gate completion).
 *  - Execution failure is a SKIPPED-with-error stage, not a failed run — same
 *    enrichment semantics as drafting.
 *  - The stage is idempotent: an existing experiment_run for this plan (same
 *    spec hash) means the work is done; the stage reports and returns.
 *  - Lease discipline: executeExperiment checkpoints via receipts/objects
 *    which are lease heartbeats in the orchestrator — long training keeps the
 *    lease warm; shouldCancel is checked by the executor between models.
 */

export const executeStage: StageHandler = {
  stage: 'execute',

  /** Applicable when a plan exists and no executed experiment is recorded for it yet. */
  async applicable(ctx) {
    const plan = ctx.store.listObjects('plan', ctx.run.id).at(-1);
    if (plan === undefined) return false;
    const runs = ctx.store.listObjects('experiment_run', ctx.run.id);
    return !runs.some((r) => r.specId.startsWith('xsp_') && r.status === 'completed');
  },

  async execute(ctx: StageContext): Promise<StageOutcome> {
    const plan = ctx.store.listObjects('plan', ctx.run.id).at(-1);
    if (plan === undefined) {
      return { kind: 'skipped', reason: 'no research plan to draft an experiment from' };
    }
    const question = ctx.store.getObject('question', ctx.run.questionId);
    if (question === null) {
      return { kind: 'skipped', reason: 'question object missing — cannot draft an experiment spec' };
    }

    // 1. Draft (LLM proposes inside a closed space; deterministic validation
    //    happens inside executeExperiment before any resource is spent).
    const draft = await draftSpecFromPlan(plan, question.text, ctx.provider);
    if (draft.kind === 'skip') {
      return { kind: 'skipped', reason: draft.reason };
    }

    // 2. Execute on the local executor (real path only). Existing completed
    //    runs for this spec hash make this a no-op report (idempotency).
    try {
      const executed = await executeExperiment(ctx.store, ctx.artifacts, draft.spec, {
        shouldCancel: () => ctx.cancelled() || ctx.disowned(),
        allowLocalDatasets: false, // plan-drafted specs use public OpenML only
      });
      const verdicts = executed.statReports.map((r) => r.verdict).join(', ');
      const feedbackNote = executed.feedback.length > 0 ? `; ${executed.feedback.length} feedback signal(s) queued for revise` : '';
      return {
        kind: 'done',
        summary: `experiment ${executed.run.id}: result set persisted, ${executed.statReports.length} stat report(s) (verdicts: ${verdicts || 'none'})${feedbackNote} — plan-drafted, exploratory (thresholds model-stipulated)`,
      };
    } catch (e) {
      // Enrichment semantics: an experiment that cannot run (dataset gone,
      // sidecar missing, validation gap) skips visibly without failing the run.
      const msg = e instanceof Error ? e.message : String(e);
      return { kind: 'skipped', reason: `experiment execution failed (run continues): ${msg.slice(0, 240)}` };
    }
  },
};
