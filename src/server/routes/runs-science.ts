import http from 'node:http';
import { analyzeTrajectory } from '../../app/supervisor.js';
import { runTruthProfile } from '../../app/truth-profile.js';
import { buildLineageGraph } from '../../app/lineage.js';
import { runEvaluators } from '../../app/evaluators.js';
import { experimentLegStatus } from '../../app/iteration.js';
import { checkPlanExecutability } from '../../pipeline/stages/plan.js';
import { newId } from '../../domain/index.js';
import {
  deriveNextActions, projectScientificState, deriveScientificWorldModel,
} from '../../domain/index.js';
import type { ScientificWorldModel } from '../../domain/index.js';
import type { ScientificClaim, HypothesisCandidate, Revision, ExperimentRun, StatReport } from '../../domain/index.js';
import type { EvidenceRelation } from '../../domain/evidence.js';
import { projectStateDeltas } from '../../domain/state-delta.js';
import { alreadyRunning, readJsonObject, sendJson, validation, type RouteCtx, type RouteFamily } from '../http-kit.js';

/** Runs family, science plane (BC-002): the Product Spine projections (science
 *  state + next actions + deltas), action dispatch, corpus transparency and the
 *  AVO fusion read surfaces (evaluations / lineage / supervision / truth). */

export function registerRunsScienceRoutes(ctx: RouteCtx): RouteFamily {
  const app = ctx.app;
  const mustGetRun = ctx.mustGetRun;

  const refreshWorldModel = (runId: string, input: {
    claims: ScientificClaim[];
    hypotheses: HypothesisCandidate[];
    relations: EvidenceRelation[];
    revisions: Revision[];
    experiments: ExperimentRun[];
    statReports: StatReport[];
  }): ScientificWorldModel => {
    const sourceObjects = [...input.claims, ...input.hypotheses, ...input.relations, ...input.revisions, ...input.experiments, ...input.statReports];
    const sourceIds = sourceObjects.map((o) => o.id).sort();
    const latest = app.store.listObjects('scientific_world_model', runId).at(-1) as ScientificWorldModel | undefined;
    const latestIds = latest?.provenance.sourceObjectIds.slice().sort() ?? [];
    if (latest !== undefined && JSON.stringify(sourceIds) === JSON.stringify(latestIds)) return latest;
    const worldModel = deriveScientificWorldModel({
      id: newId('wm') as ScientificWorldModel['id'], runId,
      version: (latest?.version ?? 0) + 1, computedAt: new Date().toISOString(),
      claims: input.claims, hypotheses: input.hypotheses, relations: input.relations,
      revisions: input.revisions, experiments: input.experiments, statReports: input.statReports,
      sourceEventCount: app.store.listEvents(runId).length,
    });
    app.store.putObjectEvented('scientific_world_model', worldModel, {
      type: 'note', detail: { reason: 'scientific_world_model_updated', version: worldModel.version, sourceObjects: sourceIds.length },
    });
    return worldModel;
  };

  /**
   * Product Spine (2026-08-28): the CURRENT SCIENTIFIC STATE + NEXT RESEARCH
   * ACTIONS + STATE DELTAS — one deterministic projection over the run's own
   * objects. No LLM, no persisted second truth: every field is derived at read
   * time from schema-validated store objects (same discipline as
   * achResearcherAdjusted above).
   */
  const runScience = (res: http.ServerResponse, runId: string): void => {
    // AOSSA pre-hypothesis layer (product visibility): the run's Scientific Problem
    // Model + method selections, projected whole — the UI renders, never re-derives.
    const run = mustGetRun(runId);
    const question = app.store.getObject('question', run.questionId);
    const problemModel = app.store.listObjects('problem_model', runId).at(-1) ?? null;
    const methodSelections = app.store.listObjects('method_selection', runId);
    const claims = app.store.listObjects('claim', runId);
    const relations = app.store.listObjects('evidence_relation', runId);
    const hypotheses = app.store.listObjects('hypothesis', runId);
    const scorecards = app.store.listObjects('scorecard', runId);
    const corpus = app.store.listObjects('corpus_snapshot', runId).at(-1) ?? null;
    const state = projectScientificState({
      runId,
      runStatus: run.status,
      questionDomain: question?.scope.domain,
      claims,
      relations,
      hypotheses,
      scorecards,
      evidenceBodies: app.store.listObjects('evidence_body', runId),
      tournament: app.store.listObjects('tournament', runId).at(-1) ?? null,
      counterQueriesAttempted: corpus?.queries.filter((q) => q.purpose === 'counter_evidence').length ?? 0,
      hypothesesStageConcluded: run.stages.some(
        (st) => st.stage === 'generate_hypotheses' && st.state !== 'pending' && st.state !== 'running',
      ),
    });

    const plan = app.store.listObjects('plan', runId).at(-1) ?? null;
    const leg = experimentLegStatus(app.store, runId);
    const hypothesisIds = new Set(hypotheses.map((h) => h.id));
    const executabilityPassed = plan !== null && checkPlanExecutability(plan, hypothesisIds).passed
      // Structural executability is NOT enough for an actionable EXECUTE: the honest
      // executor also requires a resolvable path (public dataset, or a literature/meta
      // mapping). A wet-lab/private-data plan must not promise a runnable experiment.
      && plan.dataRequirements.some((d) => d.availability === 'public');
    const revisions = app.store.listObjects('revision', runId);
    const experiments = app.store.listObjects('experiment_run', runId);
    const statReports = app.store.listObjects('stat_report', runId);
    const consumed = new Set(revisions.map((r) => r.triggerFeedbackId));
    const unconsumedFeedbackCount = app.store
      .listObjects('feedback', runId)
      .filter((s) => !consumed.has(s.id)).length;
    const nextActions = deriveNextActions({
      runId,
      runStatus: run.status,
      state,
      leg: {
        kind: leg.kind,
        executabilityPassed,
        ...(leg.kind === 'unexecutable' ? { unexecutableReason: leg.reason } : {}),
      },
      unconsumedFeedbackCount,
      hasEvidenceDebt: app.store.listObjects('source_document', runId).some((d) => d.verification === undefined),
      planDatasets: plan?.dataRequirements.map((d) => ({ name: d.name, availability: d.availability })) ?? [],
      achTopClaimIds: (app.store.listObjects('ach_analysis', runId).at(-1)?.diagnosticity ?? [])
        .slice()
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((d) => d.claimId),
    });

    const deltas = projectStateDeltas({
      runId,
      revisions,
      feedbacks: app.store.listObjects('feedback', runId),
      versionDiffs: app.store.listObjects('version_diff', runId),
    });

    // Persist the deterministic world-model snapshot when its source object set
    // changes. The snapshot is a durable projection over SQLite, never a second
    // authority; repeated GETs are idempotent and do not append duplicate events.
    const worldModel = refreshWorldModel(runId, { claims, hypotheses, relations, revisions, experiments, statReports });

    sendJson(res, 200, {
      state,
      worldModel,
      nextActions,
      deltas,
      experimentLeg: {
        kind: leg.kind,
        executabilityPassed,
        ...(leg.kind === 'unexecutable' ? { reason: leg.reason } : {}),
      },
      unconsumedFeedbackCount,
      problemModel: problemModel === null ? null : { model: problemModel, methodSelections },
    });
  };

  /**
   * Product Spine action dispatch (2026-08-28): POST /runs/:id/dispatch maps a
   * NextResearchAction onto a REAL orchestrator operation — targeted stage
   * reopen + immediate execution. Only actions with genuine machinery are
   * dispatchable (loop-unblocking legs); science actions with no automated
   * affordance are REJECTED honestly (422) — never a fake resume button.
   */
  const dispatchAction = async (req: http.IncomingMessage, res: http.ServerResponse, runId: string): Promise<void> => {
    const run = mustGetRun(runId);
    if (ctx.executing.has(runId)) throw alreadyRunning(runId);
    const body = await readJsonObject(req);
    let actionType = typeof body['actionType'] === 'string' ? body['actionType'] : '';
    let selectedActionId: string | undefined;
    let selectedWorldModelVersion: number | undefined;
    const DISPATCHABLE = new Set([
      'NEXT_BEST_ACTION', 'EXECUTE_PLANNED_EXPERIMENT', 'CONSUME_FEEDBACK_INTO_REVISION', 'RESUME_EVIDENCE_DEBT',
    ]);
    if (!DISPATCHABLE.has(actionType)) {
      throw validation(
          `actionType '${actionType}' has no automated dispatch path — ` +
          'loop-unblocking actions only (NEXT_BEST_ACTION / EXECUTE_PLANNED_EXPERIMENT / CONSUME_FEEDBACK_INTO_REVISION / RESUME_EVIDENCE_DEBT); ' +
          'RERUN_WITH_LIVE_ROUTE goes through POST /runs with the same question',
      );
    }
    if (run.status === 'running') throw alreadyRunning(runId);

    // The science surface is an action selector, not merely a report. Resolve the
    // first currently actionable action from the same deterministic projection used
    // by GET /science, then dispatch it through the exact existing reopen machinery.
    if (actionType === 'NEXT_BEST_ACTION') {
      const question = app.store.getObject('question', run.questionId);
      const claims = app.store.listObjects('claim', runId);
      const relations = app.store.listObjects('evidence_relation', runId);
      const hypotheses = app.store.listObjects('hypothesis', runId);
      const scorecards = app.store.listObjects('scorecard', runId);
      const corpus = app.store.listObjects('corpus_snapshot', runId).at(-1) ?? null;
      const state = projectScientificState({
        runId,
        runStatus: run.status,
        questionDomain: question?.scope.domain,
        claims,
        relations,
        hypotheses,
        scorecards,
        evidenceBodies: app.store.listObjects('evidence_body', runId),
        tournament: app.store.listObjects('tournament', runId).at(-1) ?? null,
        counterQueriesAttempted: corpus?.queries.filter((q) => q.purpose === 'counter_evidence').length ?? 0,
        hypothesesStageConcluded: run.stages.some((st) => st.stage === 'generate_hypotheses' && st.state !== 'pending' && st.state !== 'running'),
      });
      const plan = app.store.listObjects('plan', runId).at(-1) ?? null;
      const leg = experimentLegStatus(app.store, runId);
      const hypothesisIds = new Set(hypotheses.map((h) => h.id));
      const executabilityPassed = plan !== null && checkPlanExecutability(plan, hypothesisIds).passed
        && plan.dataRequirements.some((d) => d.availability === 'public');
      const revisions = app.store.listObjects('revision', runId);
      const experiments = app.store.listObjects('experiment_run', runId);
      const statReports = app.store.listObjects('stat_report', runId);
      const refreshedWorldModel = refreshWorldModel(runId, { claims, hypotheses, relations, revisions, experiments, statReports });
      const consumed = new Set(revisions.map((r) => r.triggerFeedbackId));
      const unconsumedFeedbackCount = app.store.listObjects('feedback', runId).filter((s) => !consumed.has(s.id)).length;
      const actions = deriveNextActions({
        runId,
        runStatus: run.status,
        state,
        leg: { kind: leg.kind, executabilityPassed, ...(leg.kind === 'unexecutable' ? { unexecutableReason: leg.reason } : {}) },
        unconsumedFeedbackCount,
        hasEvidenceDebt: app.store.listObjects('source_document', runId).some((d) => d.verification === undefined),
        planDatasets: plan?.dataRequirements.map((d) => ({ name: d.name, availability: d.availability })) ?? [],
        achTopClaimIds: (app.store.listObjects('ach_analysis', runId).at(-1)?.diagnosticity ?? [])
          .slice().sort((a, b) => b.score - a.score).slice(0, 3).map((d) => d.claimId),
      });
      const requestedId = typeof body['actionId'] === 'string' ? body['actionId'] : undefined;
      const selected = requestedId === undefined ? actions.find((a) => a.actionable) : actions.find((a) => a.id === requestedId);
      if (selected === undefined || !selected.actionable) {
        throw validation(requestedId === undefined
          ? 'no actionable next-best research action is currently available'
          : `actionId '${requestedId}' is stale or not actionable`);
      }
      actionType = selected.actionType;
      selectedActionId = selected.id;
      selectedWorldModelVersion = refreshedWorldModel.version;
      app.store.appendEvent(runId, {
        type: 'note',
        detail: {
          reason: 'next_best_action_selected', actionId: selected.id, actionType: selected.actionType,
          worldModelVersion: selectedWorldModelVersion ?? null, actionable: true,
        },
      });
    }

    if (actionType === 'EXECUTE_PLANNED_EXPERIMENT') {
      const plan = app.store.listObjects('plan', runId).at(-1) ?? null;
      const hypothesisIds = new Set(app.store.listObjects('hypothesis', runId).map((h) => h.id));
      const executabilityPassed = plan !== null && checkPlanExecutability(plan, hypothesisIds).passed;
      const leg = experimentLegStatus(app.store, runId);
      if (!(leg.kind === 'unexecuted' || leg.kind === 'plan_revised_since_experiment') || !executabilityPassed) {
        throw validation(
          `cannot dispatch EXECUTE_PLANNED_EXPERIMENT: leg=${leg.kind}, executabilityPassed=${executabilityPassed} — the plan must be executable and unexecuted (or revised since the last experiment)`,
        );
      }
      await app.orchestrator.reopenStages(runId, ['execute', 'feedback', 'revise', 'export'], `action:${actionType}`);
    } else if (actionType === 'CONSUME_FEEDBACK_INTO_REVISION') {
      const revisions = app.store.listObjects('revision', runId);
      const consumed = new Set(revisions.map((r) => r.triggerFeedbackId));
      const unconsumed = app.store.listObjects('feedback', runId).filter((s) => !consumed.has(s.id)).length;
      if (unconsumed === 0) throw validation('cannot dispatch CONSUME_FEEDBACK_INTO_REVISION: no unconsumed feedback signals');
      await app.orchestrator.reopenStages(runId, ['feedback', 'revise', 'export'], `action:${actionType}`);
    } else {
      const hasDebt = app.store.listObjects('source_document', runId).some((d) => d.verification === undefined);
      if (!hasDebt) throw validation('cannot dispatch RESUME_EVIDENCE_DEBT: every source document is already verified');
      await app.orchestrator.reopenStages(runId, ['verify_sources', 'build_evidence', 'export'], `action:${actionType}`);
    }

    if (!ctx.startRun(runId)) {
      // Lost the single-execution slot between the check above and now — the reopen
      // already happened, so resume semantics still own the continuation. Truthful 409.
      throw alreadyRunning(runId);
    }
    sendJson(res, 202, {
      runId,
      actionType: selectedActionId === undefined ? actionType : 'NEXT_BEST_ACTION',
      dispatchedActionType: actionType,
      dispatched: true,
      ...(selectedActionId !== undefined ? { selectedActionId, worldModelVersion: selectedWorldModelVersion ?? null } : {}),
    });
  };

  /**
   * Retrieval transparency (D-060 phase-1): the executed query plan with purposes
   * (incl. the two structurally-guaranteed counter-evidence queries), per-family
   * failures and fusion stats — the retrieve stage stops being a black box.
   */
  const runCorpus = (res: http.ServerResponse, runId: string): void => {
    mustGetRun(runId);
    const corpus = app.store.listObjects('corpus_snapshot', runId).at(-1) ?? null;
    sendJson(res, 200, { corpus });
  };

  return async (req, res, _url, segments) => {
    const method = req.method ?? 'GET';

    if (segments[2] !== 'runs') return false;
    const runId = segments[3]!;
    // (POST /runs/:id/experiments/:specId/approve removed 2026-08-29: zero
    // product callers — approval goes through `far experiment approve` /
    // experiment-ops directly; the route's untested HTTP surface carried
    // validation risk with no user.)
    if (segments.length === 5 && segments[4] === 'evaluations' && method === 'GET') {
      // AVO fusion G8 projection: the deterministic evaluator family over this
      // run's scientific state (multi-dimensional, no invented single score).
      mustGetRun(runId);
      sendJson(res, 200, { runId, evaluations: runEvaluators({ store: app.store, runId, now: new Date().toISOString() }) });
      return true;
    }
    if (segments.length === 5 && segments[4] === 'lineage' && method === 'GET') {
      // AVO fusion G3 projection: the queryable research trajectory graph
      // (run revision family + hypotheses + evidence + causal revisions).
      // Read-only over the store; 404s honestly when the run does not exist.
      mustGetRun(runId);
      sendJson(res, 200, buildLineageGraph({ store: app.store, rootRunId: runId }));
      return true;
    }
    if (segments.length === 5 && segments[4] === 'supervision' && method === 'GET') {
      // AVO fusion G2 projection: current supervisor analysis (fresh, not a
      // stored snapshot) so UX shows the live trajectory health. Read-only.
      mustGetRun(runId);
      sendJson(res, 200, analyzeTrajectory({ store: app.store, runId }));
      return true;
    }
    if (segments.length === 5 && segments[4] === 'truth' && method === 'GET') {
      // Execution-truth projection (goal §5.5): deterministic receipt-derived
      // view of HOW this run executed (live / mixed / synthetic / recorded_replay),
      // incl. retrieval cache/replay composition. Read-only; receipts stay authoritative.
      mustGetRun(runId);
      sendJson(res, 200, runTruthProfile(app.store, runId));
      return true;
    }
    if (segments.length === 5) {
      const leaf = segments[4]!;
      if (leaf === 'corpus' && method === 'GET') { runCorpus(res, runId); return true; }
      if (leaf === 'science' && method === 'GET') { runScience(res, runId); return true; }
      if (leaf === 'dispatch' && method === 'POST') { await dispatchAction(req, res, runId); return true; }
    }
    return false; // family fallthrough: the composer 404s with the identical envelope
  };
}
