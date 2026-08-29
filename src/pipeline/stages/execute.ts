import type { StageContext, StageHandler, StageOutcome } from '../types.js';
import { ExperimentSpec, newId, newProtocolExecution, ProtocolSpec } from '../../domain/index.js';
import type { ResearchPlan } from '../../domain/plan.js';
import { draftSpecFromPlan, draftMetaSpecFromPlan } from '../../experiment/spec-from-plan.js';
import { draftTheorySpecFromPlan, draftFemSpecFromPlan } from '../../experiment/spec-from-plan.js';
import { draftProtocolFromPlan, planHashOf, protocolForPlan } from '../../experiment/protocol-from-plan.js';
import { executeExperiment } from '../../experiment/executor.js';
import { executeMetaAnalysis } from '../../experiment/executor-meta.js';
import { executeTheoryAnalysis } from '../../experiment/executor-theory.js';
import { executeFemAnalysis } from '../../experiment/executor-fem.js';
import { RunBudgetExhaustedError } from '../../app/run-budget.js';
import { experimentLegStatus } from '../../app/iteration.js';
import { TemplateModeRefusal, refuseTemplateMode } from './shared.js';
import { canonicalJson, canonicalSha256 } from '../../shared/crypto.js';
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
 *
 * Convergence 2026-08-29 — protocol fallback (paradigm-honest execution): when
 * neither the tabular nor the literature-pool leg can run, the plan's physical /
 * human / field / engineering / theory legs get their executable artifact: a
 * FROZEN protocol (checklist + committed randomization + collection form + QC
 * + ethics gates) and an empty human-attested ledger. The software NEVER claims
 * execution — the ledger advances only on human records, and outcomes later
 * re-enter feedback -> revise as experiment feedback.
 */

class ProtocolDraftSkipped extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'ProtocolDraftSkipped';
  }
}

/** Inputs-fingerprint for the protocol-draft checkpoint family (code/prompt drift invalidates). */
const protocolDraftFingerprint = (plan: ResearchPlan, questionText: string): string =>
  canonicalSha256(canonicalJson({
    planId: plan.id,
    planHash: planHashOf(plan),
    objective: plan.objective,
    question: questionText,
  }));

export const executeStage: StageHandler = {
  stage: 'execute',

  /**
   * Applicable when the plan leg has executable unexecuted work (research-loop lane):
   * no plan-drafted experiment completed yet, OR the plan was causally revised (re-frozen)
   * after the last one — a new registration deserves its own experiment. Semantics
   * owned by experimentLegStatus (src/app/iteration.ts), shared with the iteration
   * controller so the stage gate and the loop controller can never disagree.
   */
  async applicable(ctx) {
    const leg = experimentLegStatus(ctx.store, ctx.run.id);
    return leg.kind === 'unexecuted' || leg.kind === 'plan_revised_since_experiment';
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

      // Slice-5 theory leg: plans whose falsifiable content is a claimed
      // closed-form identity get a NUMERICAL verification experiment on a
      // preregistered grid (spec -> hash binding -> sidecar identity_check ->
      // mechanical verdict), instead of falling straight to the human protocol.
      // Honestly disclosed as a numerical spot-check, never a symbolic proof.
      const theoryDraft = await draftTheorySpecFromPlan(plan, question.text, plane);
      if (theoryDraft.kind === 'theory') {
        try {
          refuseTemplateMode(ctx, theoryDraft.executionMode, 'theory draft');
          const executed = await executeTheoryAnalysis(ctx.store, ctx.artifacts, theoryDraft.spec, {
            shouldCancel: () => ctx.cancelled() || ctx.disowned(),
          });
          const verdicts = executed.statReports.map((r) => r.verdict ?? 'exploratory').join(', ');
          return {
            kind: 'done',
            summary:
              `theory identity experiment ${executed.run.id}: ${executed.statReports.length} claim(s) checked on the preregistered grid ` +
              `(residual verdicts: ${verdicts || 'none'}) — numerical spot-check, not a symbolic proof — ` +
              'plan-drafted, exploratory (tolerance model-stipulated; binding needs operator approval)',
          };
        } catch (e) {
          if (e instanceof RunBudgetExhaustedError) throw e;
          if (e instanceof TemplateModeRefusal) return { kind: 'skipped', reason: e.message };
          const msg = e instanceof Error ? e.message : String(e);
          return { kind: 'skipped', reason: `theory identity execution failed (run continues): ${msg.slice(0, 240)}` };
        }
      }

      // Slice-6 numerical-PDE leg: plans whose discriminating content is an
      // elliptic boundary-value verification get a FEM convergence experiment
      // (manufactured solution -> sympy-exact forcing -> P1 mixed-boundary
      // assembly -> refinement ladder -> mechanical order verdict), instead of
      // falling straight to the human protocol. Honestly scoped: uniform P1
      // refinement on the unit square, not a solver certification.
      const femDraft = await draftFemSpecFromPlan(plan, question.text, plane);
      if (femDraft.kind === 'fem' && femDraft.spec !== undefined) {
        try {
          refuseTemplateMode(ctx, femDraft.executionMode ?? 'test', 'fem draft');
          const executed = await executeFemAnalysis(ctx.store, ctx.artifacts, femDraft.spec, {
            shouldCancel: () => ctx.cancelled() || ctx.disowned(),
          });
          const rep = executed.statReports[0];
          const m = executed.measurement;
          const lastL2 = m.l2Orders[m.l2Orders.length - 1];
          const lastH1 = m.h1Orders[m.h1Orders.length - 1];
          return {
            kind: 'done',
            summary:
              'numerical PDE experiment ' + executed.run.id + ': P1 FEM convergence verified for u=' +
              m.manufactured.slice(0, 60) +
              ' (L2 order ' + (lastL2 !== undefined ? lastL2.toFixed(3) : '?') +
              ', H1 order ' + (lastH1 !== undefined ? lastH1.toFixed(3) : '?') +
              ', verdict=' + (rep?.verdict ?? 'exploratory') +
              ') - uniform refinement on the unit square - ' +
              'plan-drafted, exploratory (theory-fixed rates; binding needs operator approval)',
          };
        } catch (e) {
          if (e instanceof RunBudgetExhaustedError) throw e;
          if (e instanceof TemplateModeRefusal) return { kind: 'skipped', reason: e.message };
          const msg = e instanceof Error ? e.message : String(e);
          return { kind: 'skipped', reason: 'numerical PDE execution failed (run continues): ' + msg.slice(0, 240) };
        }
      }

      // Protocol fallback (paradigm-honest execution): the computational legs are
      // unavailable, so the real-world legs get their frozen preregistration.
      const existing = protocolForPlan(ctx.store, ctx.run.id, plan);
      if (existing !== null) {
        return {
          kind: 'done',
          summary: `protocol ${existing.id} already registered for plan ${plan.id} (${existing.steps.length} steps, paradigm ${existing.paradigm}) — awaiting human execution`,
        };
      }
      let protoDraft: Awaited<ReturnType<typeof draftProtocolFromPlan>>;
      try {
        protoDraft = await ctx.checkpointed('execute', 'protocol-draft', plan.id, protocolDraftFingerprint(plan, question.text), async () => {
          const d = await draftProtocolFromPlan(plan, question.text, plane);
          if (d.kind === 'skip') throw new ProtocolDraftSkipped(d.reason);
          // Real-content discipline: a template protocol from the deterministic
          // development wire must never become preregistered science in a product run
          // (thrown INSIDE the checkpointed fn so a refusal is never cached).
          refuseTemplateMode(ctx, d.executionMode, 'protocol draft');
          return d;
        });
      } catch (e) {
        if (e instanceof TemplateModeRefusal) return { kind: 'skipped', reason: e.message };
        if (e instanceof ProtocolDraftSkipped) {
          return { kind: 'skipped', reason: `tabular: ${draft.reason}; literature-pool: ${metaDraft.reason}; theory: ${theoryDraft.reason}; protocol: ${e.reason}` };
        }
        if (e instanceof RunBudgetExhaustedError) throw e;
        return {
          kind: 'skipped',
          reason: `tabular: ${draft.reason}; literature-pool: ${metaDraft.reason}; theory: ${theoryDraft.reason}; protocol: drafting failed (${(e instanceof Error ? e.message : String(e)).slice(0, 180)})`,
        };
      }
      const registered = ProtocolSpec.parse({
        ...protoDraft.spec,
        status: 'registered',
        frozenAt: new Date().toISOString(),
      });
      ctx.store.putObject('protocol', registered);
      ctx.store.putObject('protocol_execution', newProtocolExecution(registered, newId('pex'), new Date().toISOString()));
      return {
        kind: 'done',
        summary:
          `protocol ${registered.id} registered for human execution (${registered.steps.length} steps, ${registered.arms.length} arms, ` +
          `${registered.variables.length} measured variables, paradigm ${registered.paradigm}) — no machine execution claimed; ` +
          'the ledger advances only on human-attested records, and recorded outcomes re-enter feedback -> revise',
      };
    }

    // 2. Execute on the local executor (real path only). Existing completed
    //    runs for this spec hash make this a no-op report (idempotency).
    const runOnce = async (): Promise<Awaited<ReturnType<typeof executeExperiment>>> =>
      executeExperiment(ctx.store, ctx.artifacts, draft.spec, {
        shouldCancel: () => ctx.cancelled() || ctx.disowned(),
        allowLocalDatasets: false, // plan-drafted specs use public OpenML only
      });
    try {
      let executed: Awaited<ReturnType<typeof executeExperiment>>;
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

