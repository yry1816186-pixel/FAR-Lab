import type { StageContext, StageHandler, StageOutcome } from '../types.js';
import { ExperimentSpec } from '../../domain/index.js';
import { draftSpecFromPlan, draftMetaSpecFromPlan } from '../../experiment/spec-from-plan.js';
import { executeExperiment } from '../../experiment/executor.js';
import { executeMetaAnalysis } from '../../experiment/executor-meta.js';
import { RunBudgetExhaustedError } from '../../app/run-budget.js';
import type { ModelPlaneDeps } from '../llm.js';

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
    //    happens inside executeExperiment before any resource is spent). The plane
    //    carries the run's budget + lease-aware receipt sink so drafting is governed
    //    exactly like every other stage model call.
    const plane: ModelPlaneDeps = {
      provider: ctx.provider,
      budget: ctx.budget,
      recordReceipt: ctx.recordReceipt,
      runId: ctx.run.id,
    };
    const draft = await draftSpecFromPlan(plan, question.text, plane);
    if (draft.kind === 'skip') {
      // W-F M4: literature-type plans fall through to the statistical_meta path —
      // pooling published effect estimates is their honest experiment, closing the
      // falsification loop for medicine-style questions that map to no dataset.
      const metaDraft = await draftMetaSpecFromPlan(plan, question.text, plane);
      if (metaDraft.kind === 'meta') {
        try {
          const executed = await executeMetaAnalysis(ctx.store, ctx.artifacts, metaDraft.spec, {
            provider: ctx.provider,
            budget: ctx.budget,
            recordReceipt: ctx.recordReceipt,
            shouldCancel: () => ctx.cancelled() || ctx.disowned(),
          });
          const rep = executed.statReports[0];
          const verdictNote = rep !== undefined
            ? ` (k=${rep.meta?.k ?? 0} admitted studies, verdict=${rep.verdict ?? 'exploratory'})`
            : '';
          return {
            kind: 'done',
            summary:
              `meta experiment ${executed.run.id}: pooled ${metaDraft.spec.effectMeasure}${verdictNote}` +
              ' — plan-drafted, exploratory (null-boundary threshold; binding needs operator approval)',
          };
        } catch (e) {
          // Budget exhaustion is operational (the orchestrator re-marks the stage and
          // re-opens it on resume with a raised cap) — never an enrichment skip.
          if (e instanceof RunBudgetExhaustedError) throw e;
          const msg = e instanceof Error ? e.message : String(e);
          return { kind: 'skipped', reason: `meta experiment execution failed (run continues): ${msg.slice(0, 240)}` };
        }
      }
      return { kind: 'skipped', reason: `tabular: ${draft.reason}; literature-pool: ${metaDraft.reason}` };
    }

    // 2. Execute on the local executor (real path only). Existing completed
    //    runs for this spec hash make this a no-op report (idempotency).
    const runOnce = async (): ReturnType<typeof executeExperiment> =>
      executeExperiment(ctx.store, ctx.artifacts, draft.spec, {
        shouldCancel: () => ctx.cancelled() || ctx.disowned(),
        allowLocalDatasets: false, // plan-drafted specs use public OpenML only
      });
    try {
      let executed: Awaited<ReturnType<typeof runOnce>>;
      try {
        executed = await runOnce();
      } catch (first) {
        // Deterministic single retry for target-column drift (live-observed on
        // openml 426: the draft declared 'Diagnosis', the catalog default is
        // 'oz10'): re-drafting the spec with the CATALOG's fact — the error
        // message itself carries the true column — is a correction from
        // authoritative data, never a fabrication.
        const msg = first instanceof Error ? first.message : String(first);
        const m = /default target is '([^']+)'/.exec(msg);
        if (m === null) throw first;
        ctx.log(`execute: target-column drift detected — retrying with catalog default '${m[1]}'`);
        draft.spec = ExperimentSpec.parse({
          ...draft.spec,
          datasets: [{ ...draft.spec.datasets[0]!, targetColumn: m[1]! }],
        });
        executed = await runOnce();
      }
      const verdicts = executed.statReports.map((r) => r.verdict).join(', ');
      const feedbackNote = executed.feedback.length > 0 ? `; ${executed.feedback.length} feedback signal(s) queued for revise` : '';
      return {
        kind: 'done',
        summary: `experiment ${executed.run.id}: result set persisted, ${executed.statReports.length} stat report(s) (verdicts: ${verdicts || 'none'})${feedbackNote} — plan-drafted, exploratory (thresholds model-stipulated)`,
      };
    } catch (e) {
      // Enrichment semantics: an experiment that cannot run (dataset gone,
      // sidecar missing, validation gap) skips visibly without failing the run.
      // Budget exhaustion stays operational (see meta path above).
      if (e instanceof RunBudgetExhaustedError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      return { kind: 'skipped', reason: `experiment execution failed (run continues): ${msg.slice(0, 240)}` };
    }
  },
};
