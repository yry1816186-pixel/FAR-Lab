import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { App } from '../app/composition.js';
import { analyzeTrajectory } from '../app/supervisor.js';
import { runTruthProfile } from '../app/truth-profile.js';
import { RunLeaseHeldError } from '../app/orchestrator.js';
import { runCounterSearch, CounterSearchError } from './counter-search.js';
import { pruneAdoptionBackoff } from './adoption-backoff.js';
import { buildZip, type ZipEntry } from './zip.js';
import { buildLineageGraph } from '../app/lineage.js';
import { runEvaluators } from '../app/evaluators.js';
import { runResearchAction, ActionError } from './actions.js';
import { getProtocolState, recordProtocolEvent, ProtocolOpError } from './protocol-ops.js';
import { connectClaim, editHypothesis, forkHypothesis, HypothesisOpError, promoteHypothesis, rejectHypothesis } from './hypothesis-ops.js';
import { MethodOpError, overrideMethodSelection } from './method-ops.js';
import {
  annotateClaim, ClaimOpError, excludeClaim, excludedClaimIdsOf, pinClaim, reclassifyClaim, reinstateClaim,
} from './claim-ops.js';
import {
  buildScreeningView,
  getOrCreateScreeningSession,
  recordScreeningDecision,
  ScreeningError,
  stopScreeningSession,
} from './screening.js';
import {
  attachRunToConversation, collectConversationSeeds, createConversation, deleteConversation,
  detachRunFromAllConversations, getConversation, listConversations, postConversationMessage,
  renameConversation, resolveConversationProposal, resolveConversationReasoningRoute, retryConversationTurn,
  setConversationReasoningGear, ConversationError, type ConversationDeps,
} from './conversations.js';
import { startAutomationEngine, type AutomationEngine } from './automations.js';
import { ConversationTurnHub } from './conversation-stream.js';
import { TerminalManager } from './terminal.js';
import { aggregateRunUsage } from '../app/usage-ledger.js';
import {
  FeedbackSignal,
  FeedbackSourceKind,
  ObjectRef,
  ResearchQuestion,
  ScientificGoalType,
  calibrationReport,
  newId,
  runProgress,
} from '../domain/index.js';
import { isTemplateHypothesis } from '../domain/scientific-state.js';
import { latestBundleTemplateTainted } from '../pipeline/stages/export.js';
import { ConstraintSet } from '../domain/question.js';
import type { RunStageName } from '../domain/run.js';
import type { FeedbackSourceKind as FeedbackSource } from '../domain/index.js';
import { toProvJsonLd } from '../domain/prov-o.js';
import { consolidateConversationProfile } from '../app/memory.js';
import { EvidenceRelation, EvidenceRelationType } from '../domain/evidence.js';
import { diagnosticityScores, removalSensitivity } from '../domain/ach.js';
import {
  HttpError,
  alreadyRunning,
  assertRunId,
  conversationTurnStream,
  decodeSegments,
  internal,
  notFound,
  readJsonObject,
  runEventStream,
  sendError,
  sendJson,
  sendText,
  validation,
  type RouteCtx,
  type RouteFamily,
} from './http-kit.js';
import { serveStatic } from './static-files.js';
import { createRunWithSeeds as createRunWithSeedsCore } from './run-launch.js';
import { registerIngestRoutes } from './routes/ingest.js';
import { registerLibraryRoutes } from './routes/library.js';
import { registerScienceRoutes } from './routes/science.js';
import { registerTerminalRoutes } from './routes/terminal.js';
import { registerToolsRoutes } from './routes/tools.js';
import { registerZoteroRoutes } from './routes/zotero.js';
import { registerAutomationsRoutes } from './routes/automations.js';
import { registerAgentPolicyRoutes } from './routes/agent-policy.js';
import { registerCompetitionRouteRoutes } from './routes/competition-route.js';
import { registerSystemRoutes } from './routes/system.js';
import { registerMemoryRoutes } from './routes/memory.js';
import { registerBuiltinRoutesRoutes } from './routes/builtin-routes.js';
import { registerModelConfigsRoutes } from './routes/model-configs.js';
import { deriveNextActions, projectScientificState, deriveScientificWorldModel } from '../domain/index.js';
import type { ScientificWorldModel } from '../domain/index.js';
import type { ScientificClaim, HypothesisCandidate, Revision, ExperimentRun, StatReport } from '../domain/index.js';
import { projectStateDeltas } from '../domain/state-delta.js';
import { experimentLegStatus } from '../app/iteration.js';
import { checkPlanExecutability } from '../pipeline/stages/plan.js';

/**
 * Versioned HTTP API over the single application kernel (zero framework: native http +
 * hand-rolled routing, matching the workspace's zero-dependency style). Long-running runs
 * follow the create-and-poll model: POST returns 202 immediately, progress is observable
 * via GET /runs/:id and the append-only event stream — no fake progress, no SSE.
 *
 * Semantics mirror the CLI exactly (src/cli/main.ts is the behavioral reference):
 * feedback validation, cancel, resume and report retrieval use the same domain rules.
 * Errors always use the shared envelope: {error:{code, message, retryable, runId?}}.
 */

export type { ApiServerError } from './http-kit.js';

export interface ApiServerOptions {
  port?: number;
  host?: string;
  /**
   * Test seam (NOT a product mock): injected run execution. Product default is
   * orchestrator.execute; tests inject an immediately-resolving executor so the
   * HTTP layer is exercised without live model/source routes. opts carries the
   * §8.2 draft journey's stopAfter (scope-proposal runs scope only).
   */
  executor?: (runId: string, opts?: { stopAfter?: RunStageName }) => Promise<unknown>;
  /**
   * Test seam (NOT a product mock): per-family source-adapter resolver for the
   * counter-search route. Product default is the canonical sourceAdapterFor;
   * tests inject fakes so the HTTP layer is exercised without live source routes.
   */
  counterSearchSourceFor?: (family: import('../domain/source.js').SourceFamily) => import('../shared/ports.js').SourceAdapter;
  /** Static root served when present (SPA fallback to index.html). Default: <cwd>/web/dist. */
  staticRoot?: string;
  /**
   * W8 S1 frozen-run watchdog: poll interval (ms) for runs stuck status='running' with
   * an expired lease; detected runs are adopted (re-executed — resume semantics skip
   * done stages and checkpointed subtasks). Default 30_000; 0 disables. Runs inside
   * this server process (no new service).
   */
  watchdogIntervalMs?: number;
  /**
   * Resident-agent automations (R3): when enabled, the in-process engine fires
   * approved agent tasks on schedule / on run completion into their
   * conversations. Default off (tests drive the engine directly); the
   * production entrypoint enables it.
   */
  automations?: { enabled?: boolean; tickMs?: number };
}

export interface ApiServer {
  server: http.Server;
  start(): Promise<number>;
  stop(): Promise<void>;
}

/** Kinds that a feedback target may reference AND that we can existence-check in the store. */
const TARGET_STORE_KINDS = {
  hypothesis: 'hypothesis',
  plan: 'plan',
  claim: 'claim',
  question: 'question',
  evidence_relation: 'evidence_relation',
} as const;

export function createApiServer(app: App, opts: ApiServerOptions = {}): ApiServer {
  const executor = opts.executor ?? ((runId: string, execOpts?: { stopAfter?: RunStageName }) => app.orchestrator.execute(runId, execOpts));
  const staticRoot = path.resolve(opts.staticRoot ?? path.join(process.cwd(), 'web', 'dist'));

  /** One in-flight execution per run id; a second request fails with 409 semantics. */
  const executing = new Map<string, Promise<unknown>>();

  const startRun = (runId: string, execOpts?: { stopAfter?: RunStageName }): boolean => {
    if (executing.has(runId)) return false;
    const run = Promise.resolve()
      .then(() => executor(runId, execOpts))
      .catch((e: unknown) => {
        // Stage failures are persisted by the orchestrator into run state (visible via
        // GET /runs/:id). A throw here means the execution itself never ran — log it,
        // and for the lease-held case also persist a run event: the 202 already went
        // out, so the run timeline is the only place this refusal is observable.
        const msg = e instanceof Error ? e.message : String(e);
        process.stderr.write(`far-api: execution of run ${runId} failed: ${msg}\n`);
        if (e instanceof RunLeaseHeldError) {
          app.store.appendEvent(runId, { type: 'note', detail: { reason: 'execution_refused_lease_held', error: msg } });
        }
        return undefined;
      })
      .finally(() => {
        executing.delete(runId);
      });
    executing.set(runId, run);
    return true;
  };

  // W8 S1 watchdog: frozen runs (status='running', lease expired) are detected within one
  // poll cycle and adopted — execute() reclaims the expired lease and resume semantics
  // (stage skip + step checkpoints) continue the run instead of abandoning paid work.
  // An in-memory per-run backoff prevents a hot adoption loop when an adopted run keeps
  // failing fast (dbos recovery_attempts pattern, embedded form).
  const watchdogIntervalMs = opts.watchdogIntervalMs ?? 30_000;
  const adoptionBackoffMs = Math.max(watchdogIntervalMs * 10, 60_000);
  const lastAdoptedAt = new Map<string, number>();
  let watchdogTimer: NodeJS.Timeout | null = null;
  let automationEngine: AutomationEngine | null = null;
  // Terminal sessions (extensibility lane): persistent login shells behind
  // /api/v1/terminal/* — loopback workbench surface, FARLAB_TERMINAL=off kills it.
  const terminals = new TerminalManager();
  // Conversation generation outlives any one browser connection. The hub keeps
  // a bounded seq replay so refresh/reconnect resumes the real provider stream;
  // disconnect alone never cancels paid work.
  const conversationTurns = new ConversationTurnHub(
    (conversationId) => app.store.getObject('conversation', conversationId),
  );
  // Sweep-health visibility (WP2 F-007): a persistent store error would otherwise
  // silently stop adoptions forever with only a stderr line — /health reports it.
  let consecutiveSweepFailures = 0;
  const sweepExpiredLeases = (): void => {
    try {
      const now = Date.now();
      const stales = app.store.listExpiredLeaseRuns(new Date().toISOString());
      // LOG-004: backoff entries for runs that left the expired-lease set are
      // stale (terminal state or restore) — prune them so the map stays bounded
      // by the live expired-run population, not the server's lifetime.
      pruneAdoptionBackoff(lastAdoptedAt, new Set(stales.map((s) => s.id)), now, adoptionBackoffMs);
      for (const stale of stales) {
        if (executing.has(stale.id)) continue;
        // Parking-intent guard: a run tagged 'parking:*' is a deliberately-stopped
        // draft (scope proposal / CLI --stop-after) whose worker died before parking.
        // Adoption would run the FULL pipeline behind the user's back — the exact
        // harm the park-on-stopAfter fix closes for the non-crash path. The tag is
        // cleared by the park transition or by a user-initiated resume.
        if (stale.tags.some((t) => t.startsWith('parking:'))) continue;
        const last = lastAdoptedAt.get(stale.id) ?? 0;
        if (now - last < adoptionBackoffMs) continue;
        lastAdoptedAt.set(stale.id, now);
        app.store.appendEvent(stale.id, {
          type: 'note',
          detail: { reason: 'watchdog_adoption', holder: stale.leaseHolder ?? null, stage: stale.currentStage },
        });
        startRun(stale.id);
      }
      consecutiveSweepFailures = 0; // reset only AFTER a fully successful sweep
    } catch (e) {
      // The watchdog must never take the server down (audit P2-2): a transient store
      // error (e.g. SQLITE_BUSY beyond busy_timeout) is logged and retried next cycle.
      consecutiveSweepFailures += 1;
      if (consecutiveSweepFailures >= 3) {
        process.stderr.write(`far-api: lease sweep DEGRADED (${consecutiveSweepFailures} consecutive failures) — frozen-run adoption is stalled\n`);
      } else {
        process.stderr.write(`far-api: lease sweep failed: ${e instanceof Error ? e.message : String(e)}\n`);
      }
    }
  };
  if (watchdogIntervalMs > 0) {
    watchdogTimer = setInterval(sweepExpiredLeases, watchdogIntervalMs);
    watchdogTimer.unref();
  }

  // ---- run lookups ----

  const mustGetRun = (runId: string) => {
    const run = app.store.getRun(runId);
    if (!run) throw notFound(`run not found: ${runId}`, runId);
    return run;
  };

  /** Whether a revision landed after the newest bundle (the export stage's own re-export rule). */
  const revisionNewerThanBundle = (runId: string, latestBundle: { createdAt: string } | undefined): boolean => {
    if (!latestBundle) return false;
    return app.store.listObjects('revision', runId).some((r) => r.createdAt > latestBundle.createdAt);
  };

  // ---- API route handlers ----

  const listRuns = (res: http.ServerResponse): void => {
    const runs = app.store.listRuns().map((row) => {
      const run = app.store.getRun(row.id);
      const p = run ? runProgress(run) : null;
      // Researcher-facing projection (CPP-2): the question text IS the run's identity
      // for the person who wrote it — machine ids stay available but never primary.
      // getObject is schema-validated on read, so the zod types are authoritative here.
      const question = run ? app.store.getObject('question', run.questionId) : null;
      const questionText = question !== null && question.text.trim().length > 0 ? question.text : undefined;
      const domain = question !== null && question.scope.domain.trim().length > 0 ? question.scope.domain : undefined;
      return {
        id: row.id,
        status: row.status,
        currentStage: row.currentStage,
        createdAt: row.createdAt,
        ...(questionText !== undefined ? { questionText } : {}),
        ...(domain !== undefined ? { domain } : {}),
        ...(run?.lastError !== undefined ? { lastError: run.lastError } : {}),
        ...(p?.known ? { progress: { done: p.done, total: p.total } } : {}),
      };
    });
    sendJson(res, 200, { runs });
  };

  const createRun = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const body = await readJsonObject(req);
    const runId = await createRunWithSeeds(body);
    sendJson(res, 202, { runId, ...(body.draft === true ? { draft: true } : {}) });
  };

  // Shared run-creation core moved to run-launch.ts (BC-002 single owner).
  const createRunWithSeeds = (body: Record<string, unknown>): Promise<string> =>
    createRunWithSeedsCore(app, startRun, body);

  // Resident-agent action bridge: approved conversation proposals launch runs
  // through the SAME creation path as POST /runs and the manual launch route.
  const conversationDeps: ConversationDeps = {
    createRun: (input) => createRunWithSeeds({
      text: input.text,
      ...(input.providerConfigId !== undefined ? { providerConfigId: input.providerConfigId } : {}),
      seeds: input.seeds,
    }),
  };

  // Automations engine starts here (after its createRun bridge exists). Tests
  // leave it off and drive the engine directly; the production entry enables it.
  if (opts.automations?.enabled === true && conversationDeps.createRun !== undefined) {
    automationEngine = startAutomationEngine(app, {
      createRun: conversationDeps.createRun,
      ...(opts.automations.tickMs !== undefined ? { tickMs: opts.automations.tickMs } : {}),
    });
  }

  // Shared per-server context for every route family (BC-002): the composer in
  // route() hands each registrar this object; families never reach back into
  // private server state.
  const ctx: RouteCtx = {
    app,
    executor,
    executing,
    startRun,
    mustGetRun,
    terminals,
    conversationTurns,
    conversationDeps,
    createRunWithSeeds,
    consecutiveSweepFailures: () => consecutiveSweepFailures,
    ...(opts.counterSearchSourceFor !== undefined ? { counterSearchSourceFor: opts.counterSearchSourceFor } : {}),
  };

  // Extracted route families (BC-002), composed below in registration order.
  // The runs / model-configs / conversations families are still inline in
  // route() pending their own extraction commits.
  const families: RouteFamily[] = [
    registerIngestRoutes(ctx),
    registerLibraryRoutes(ctx),
    registerScienceRoutes(ctx),
    registerTerminalRoutes(ctx),
    registerToolsRoutes(ctx),
    // Same-prefix pair: builtin-routes must be tried before the generic
    // model-configs /:id branch (see its module doc).
    registerBuiltinRoutesRoutes(ctx),
    registerModelConfigsRoutes(ctx),
    registerZoteroRoutes(ctx),
    registerAutomationsRoutes(ctx),
    registerAgentPolicyRoutes(ctx),
    registerCompetitionRouteRoutes(ctx),
    registerSystemRoutes(ctx),
    registerMemoryRoutes(ctx),
  ];

  const runDetail = (res: http.ServerResponse, runId: string): void => {
    const run = mustGetRun(runId);
    // Lease projection (W8 single-writer semantics) so the UI can surface frozen-run
    // state honestly instead of inferring it from silence. `live` uses the same
    // computation as the CLI status command.
    const lease = app.store.getRunLease(runId);
    const leaseLive = lease.holder !== null && (lease.expiresAt ?? '') > new Date().toISOString();
    // Researcher identity projection (same semantics as listRuns): the detail
    // endpoint feeds the research page header, which leads with the question
    // the researcher actually asked — not the machine id.
    const question = app.store.getObject('question', run.questionId);
    const questionText = question !== null && question.text.trim().length > 0 ? question.text : undefined;
    const domain = question !== null && question.scope.domain.trim().length > 0 ? question.scope.domain : undefined;
    sendJson(res, 200, {
      ...run,
      ...(questionText !== undefined ? { questionText } : {}),
      ...(domain !== undefined ? { domain } : {}),
      leaseInfo: { holder: lease.holder, expiresAt: lease.expiresAt ?? null, live: leaseLive },
      // Research iteration rounds (research-loop lane): the bounded-loop decision
      // history — every continue trigger / stop reason, in order, from the records.
      iterations: app.store.listObjects('iteration', runId).map((it) => ({
        id: it.id,
        round: it.round,
        decidedAt: it.decidedAt,
        decision: it.decision,
        trigger: it.continueTrigger ?? null,
        stopReason: it.stopReason ?? null,
        rationale: it.rationale,
        unblockHints: it.unblockHints,
      })),
      // §5.2 evidence debt: unverified sources exist (counter-search / seeds landed
      // after completion) — resume reopens verify_sources+build_evidence for them.
      hasEvidenceDebt: app.store
        .listObjects('source_document', runId)
        .some((d) => d.verification === undefined),
      // BP-4 usage ledger: receipt-derived tokens/cost for THIS run (pricing only
      // when user-declared; unknown stays unknown — no invented price tables).
      usage: aggregateRunUsage(app.store, runId),
    });
  };

  /** First-class bundle discovery (D-060: replaces the client-side event-regex scan). */
  const runBundles = (res: http.ServerResponse, runId: string): void => {
    mustGetRun(runId);
    const bundles = app.store.listObjects('bundle', runId).map((b) => ({
      id: b.id,
      createdAt: b.createdAt,
      evidenceLevel: b.declaredEvidenceLevel,
    }));
    sendJson(res, 200, { bundles });
  };

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
    if (executing.has(runId)) throw alreadyRunning(runId);
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

    if (!startRun(runId)) {
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


  const runEvents = (res: http.ServerResponse, runId: string, url: URL): void => {
    mustGetRun(runId);
    const raw = url.searchParams.get('afterSeq');
    let afterSeq = 0;
    if (raw !== null) {
      if (!/^\d+$/.test(raw) || Number(raw) > Number.MAX_SAFE_INTEGER) {
        throw validation('query "afterSeq" must be a non-negative integer');
      }
      afterSeq = Number(raw);
    }
    // RU-2 G6 tag query plane: ?tag=kind:x&tag=stage:y (repeatable, ANY-of) routes
    // through the indexed event_tags spine instead of the full linear scan.
    const tags = url.searchParams.getAll('tag');
    if (tags.length > 0) {
      for (const t of tags) {
        if (!/^[a-z0-9_]+:[a-z0-9_-]+$/.test(t)) throw validation(`query "tag" malformed: '${t}' (expected kind:*|stage:*)`);
      }
      const limitRaw = url.searchParams.get('limit');
      const limit = limitRaw === null ? 200 : (/^\d+$/.test(limitRaw) ? Math.min(Number(limitRaw), 200) : (() => { throw validation('query "limit" must be a positive integer'); })());
      const events = app.store.queryEvents({ tags, runId, afterSeq: afterSeq > 0 ? afterSeq : undefined, limit });
      sendJson(res, 200, { events, query: { tags, runId, afterSeq } });
      return;
    }
    const events = app.store.listEvents(runId).filter((e) => e.seq > afterSeq);
    sendJson(res, 200, { events });
  };

  const runQuestion = (res: http.ServerResponse, runId: string): void => {
    const run = mustGetRun(runId);
    const question = app.store.getObject('question', run.questionId);
    if (!question) throw notFound(`question not found for run ${runId}: ${run.questionId}`, runId);
    sendJson(res, 200, question);
  };

  const runReport = async (res: http.ServerResponse, runId: string): Promise<void> => {
    mustGetRun(runId);
    const latestBundle = app.store.listObjects('bundle', runId).at(-1);
    if (!latestBundle) {
      throw notFound(`no bundle stored for run ${runId} — the export stage has not produced one yet`, runId);
    }
    const reportHash = latestBundle.finalArtifactHashes[0];
    if (!reportHash) {
      throw notFound(`latest bundle ${latestBundle.id} has no report artifact hash`, runId);
    }
    const content = await app.artifacts.get(reportHash);
    if (content === null) {
      throw notFound(`report artifact missing in artifact store (${reportHash.slice(0, 16)}…)`, runId);
    }
    sendText(res, 200, 'text/markdown; charset=utf-8', content);
  };

  /**
   * BP-3 research-product artifact: the deterministic IMRaD paper markdown. Mirrors
   * runReport's artifact-lookup pattern, but resolves the bundle's paperOutlineRef —
   * absent on pre-BP3 bundles, which 404 honestly instead of serving the wrong artifact.
   */
  const runPaper = async (res: http.ServerResponse, runId: string): Promise<void> => {
    mustGetRun(runId);
    const latestBundle = app.store.listObjects('bundle', runId).at(-1);
    if (!latestBundle) {
      throw notFound(`no bundle stored for run ${runId} — the export stage has not produced one yet`, runId);
    }
    const paperRef = latestBundle.paperOutlineRef;
    if (paperRef === undefined) {
      throw notFound(`latest bundle ${latestBundle.id} carries no paper-outline artifact (pre-BP3 export)`, runId);
    }
    const content = await app.artifacts.get(paperRef);
    if (content === null) {
      throw notFound(`paper artifact missing in artifact store (${paperRef.slice(0, 16)}…)`, runId);
    }
    sendText(res, 200, 'text/markdown; charset=utf-8', content);
  };

  /**
   * CPS-7 full-package download: builds the lane-07 reproducibility package into a
   * temp dir (same engine as `far research export --format package`) and streams it
   * as a single ZIP. One-request convenience for reviewers; the CLI/dir path stays
   * authoritative (nothing is re-derived — the package is the deterministic
   * projection of stored export artifacts).
   *
   * Known limitation (audit P2-3, accepted for the single-user local product):
   * pandoc renders run spawnSync (up to 60s/format) and the zip is assembled
   * in-memory — a package request can block this single-threaded server for
   * seconds-to-minutes. MB-scale packages are fine; revisit (worker/queue) if a
   * multi-user/remote deployment mode ever lands.
   */
  const runPackageZip = async (res: http.ServerResponse, runId: string): Promise<void> => {
    mustGetRun(runId);
    const latestBundle = app.store.listObjects('bundle', runId).at(-1);
    if (!latestBundle) {
      throw notFound(`no bundle stored for run ${runId} — the export stage has not produced one yet`, runId);
    }
    const { buildReproducibilityPackage } = await import('../report/package.js');
    const tmp = await import('node:fs/promises').then((fsp) => fsp.mkdtemp(path.join(os.tmpdir(), 'farlab-pkg-')));
    try {
      const result = await buildReproducibilityPackage({ store: app.store, artifacts: app.artifacts }, runId, { outDir: tmp });
      const fsp = await import('node:fs/promises');
      const walk = async (dir: string, prefix: string): Promise<ZipEntry[]> => {
        const out: ZipEntry[] = [];
        for (const ent of await fsp.readdir(dir, { withFileTypes: true })) {
          const rel = prefix === '' ? ent.name : `${prefix}/${ent.name}`;
          if (ent.isDirectory()) out.push(...await walk(path.join(dir, ent.name), rel));
          else out.push({ name: rel, content: await fsp.readFile(path.join(dir, ent.name)) });
        }
        return out;
      };
      const zip = buildZip(await walk(tmp, ''));
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': String(zip.length),
        'Content-Disposition': `attachment; filename="${runId}-farlab-package.zip"`,
        'X-Bundle-Id': result.bundleId,
      });
      res.end(zip);
    } finally {
      await import('node:fs/promises').then((fsp) => fsp.rm(tmp, { recursive: true, force: true }));
    }
  };

  const cancelRun = (res: http.ServerResponse, runId: string): void => {
    const run = mustGetRun(runId);
    const ok = app.orchestrator.cancel(runId, 'http');
    if (ok) {
      sendJson(res, 202, { requested: true });
    } else {
      // orchestrator.cancel refuses completed/cancelled runs — report that truthfully.
      sendJson(res, 202, { requested: false, reason: `run is ${run.status} — nothing active to cancel` });
    }
  };

  const resumeRun = (res: http.ServerResponse, runId: string): void => {
    mustGetRun(runId);
    if (executing.has(runId)) throw alreadyRunning(runId);
    // Cross-process single-writer truth: a live lease in ANOTHER process used to be
    // discovered only inside the async execution AFTER this 202 — the resume was a
    // silent no-op (stderr only, run never advances here, client never told). Refuse
    // up front with the expiry so the caller knows when a retry becomes reclaimable.
    const lease = app.store.getRunLease(runId);
    if (lease.holder !== null && lease.expiresAt !== null && lease.expiresAt > new Date().toISOString()) {
      throw new HttpError(409, {
        code: 'lease_held',
        message: `run is owned by executor ${lease.holder} until ${lease.expiresAt} — the lease becomes reclaimable after expiry; retry then`,
        retryable: true,
        runId,
      });
    }
    if (!startRun(runId)) throw alreadyRunning(runId); // race backstop
    sendJson(res, 202, { runId });
  };

  /**
   * §8.2 pre-launch scope proposal: runs ONLY the scope stage (stopAfter
   * breaks before retrieve) on a draft run, then parks it at 'paused' so the
   * researcher sees and edits the refined scope BEFORE committing to the full
   * journey. The refined question (with its receipt-backed provenance) is the
   * response; POST /runs/:id/resume launches the remainder. 'paused' (not
   * 'running') is load-bearing: the lease watchdog adopts only 'running' runs,
   * so a parked draft can never be auto-continued behind the user's back.
   */
  const scopeProposal = async (res: http.ServerResponse, runId: string): Promise<void> => {
    const run = mustGetRun(runId);
    if (run.status !== 'created' && run.status !== 'paused') {
      throw new HttpError(409, {
        code: 'already_launched',
        message: `scope proposal requires a not-yet-launched run (status 'created' or 'paused'; got '${run.status}') — POST /runs with draft:true creates one`,
        retryable: false,
        runId,
      });
    }
    if (executing.has(runId)) throw alreadyRunning(runId);
    // Crash guard: tag the draft as deliberately-parked-intent BEFORE execution.
    // If the worker dies mid-scope-proposal (before the park transition), the
    // watchdog must not adopt this 'running' run and run the full pipeline —
    // it skips 'parking:*' runs; the park clears the tag, a resume strips it.
    if (!run.tags.includes('parking:scope-proposal')) {
      app.store.updateRun({ ...run, tags: [...run.tags, 'parking:scope-proposal'] });
    }
    const execution = Promise.resolve()
      .then(() => executor(runId, { stopAfter: 'retrieve' }))
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        process.stderr.write(`far-api: scope-proposal execution of run ${runId} failed: ${msg}\n`);
        return undefined;
      })
      .finally(() => { executing.delete(runId); });
    executing.set(runId, execution);
    await execution;

    const after = app.store.getRun(runId);
    if (after === null) throw notFound(`run ${runId} vanished during scope proposal`, runId);
    const scopeRec = after.stages.find((s) => s.stage === 'scope');
    if (scopeRec?.state === 'failed') {
      throw new HttpError(502, {
        code: 'scope_proposal_failed',
        message: `scope refinement failed: ${scopeRec.error ?? 'unknown error'}`,
        retryable: true,
        runId,
      });
    }
    if (scopeRec?.state === 'skipped') {
      // Honest refusal (e.g. the in-process test double: filler scope is not
      // analysis of the user's question) — the reason rides the stage record;
      // the researcher is told WHY no proposal exists, not a 502.
      throw new HttpError(422, {
        code: 'scope_proposal_unavailable',
        message: `no scope proposal from this route: ${scopeRec.error ?? 'stage skipped'}`,
        retryable: false,
        runId,
      });
    }
    if (scopeRec?.state !== 'done') {
      throw new HttpError(502, {
        code: 'scope_proposal_failed',
        message: `scope stage state '${scopeRec?.state ?? 'missing'}' after proposal execution — refusing to fabricate a proposal`,
        retryable: true,
        runId,
      });
    }
    after.status = 'paused';
    app.store.updateRun(after);
    app.store.appendEvent(runId, {
      type: 'note',
      status: 'paused',
      detail: { reason: 'scope_proposal_ready', actor: 'human' },
    });
    const question = app.store.getObject('question', after.questionId);
    if (question === null) throw notFound(`question not found for run ${runId}: ${after.questionId}`, runId);
    sendJson(res, 200, { runId, question, next: { edit: 'PATCH /runs/:id/question', launch: 'POST /runs/:id/resume' } });
  };

  /**
   * §8.2/§15 editable ResearchQuestion/Scope/Constraint: researcher edits the
   * draft's question BEFORE launch. Allowed only pre-launch ('created' before
   * any proposal, 'paused' after one) — once the journey runs, corrections go
   * through the causal revision chain, never a silent question rewrite. The
   * merge is validated through the domain schema (single owner) and audited.
   */
  const editRunQuestion = async (req: http.IncomingMessage, res: http.ServerResponse, runId: string): Promise<void> => {
    const run = mustGetRun(runId);
    if (run.status !== 'created' && run.status !== 'paused') {
      throw new HttpError(409, {
        code: 'already_launched',
        message: `the question is editable only before launch (status 'created' or 'paused'; got '${run.status}') — running/closed runs revise via the feedback chain`,
        retryable: false,
        runId,
      });
    }
    const question = app.store.getObject('question', run.questionId);
    if (question === null) throw notFound(`question not found for run ${runId}: ${run.questionId}`, runId);
    const body = await readJsonObject(req);

    const changedFields: string[] = [];
    const next: Record<string, unknown> = { ...question };

    if (body.text !== undefined) {
      if (typeof body.text !== 'string' || body.text.trim().length === 0) {
        throw validation('field "text" must be a non-empty string');
      }
      if (body.text !== question.text) changedFields.push('text');
      next.text = body.text;
    }
    if (body.goalType !== undefined) {
      const parsedGoal = ScientificGoalType.safeParse(body.goalType);
      if (!parsedGoal.success) {
        throw validation(`invalid goalType "${String(body.goalType)}" — must be one of: ${ScientificGoalType.options.join(', ')}`);
      }
      if (parsedGoal.data !== question.goalType) changedFields.push('goalType');
      next.goalType = parsedGoal.data;
    }
    if (body.scope !== undefined) {
      const s = body.scope as Record<string, unknown>;
      const scopeNext = { ...question.scope };
      for (const key of ['domain', 'phenomena', 'inScope', 'outOfScope'] as const) {
        if (s[key] === undefined) continue;
        if (key === 'domain') {
          if (typeof s.domain !== 'string' || s.domain.trim().length === 0) throw validation('scope.domain must be a non-empty string');
          scopeNext.domain = s.domain;
        } else {
          const values = s[key];
          const requiresItem = key === 'phenomena';
          if (!Array.isArray(values) || (requiresItem && values.length === 0) || values.some((x) => typeof x !== 'string' || x.trim().length === 0)) {
            throw validation(
              requiresItem
                ? `scope.${key} must be a non-empty array of non-empty strings`
                : `scope.${key} must be an array of non-empty strings (empty array allowed)`,
            );
          }
          scopeNext[key] = values;
        }
        if (JSON.stringify(scopeNext[key]) !== JSON.stringify((question.scope as Record<string, unknown>)[key])) {
          const label = `scope.${key}`;
          if (!changedFields.includes(label)) changedFields.push(label);
        }
      }
      next.scope = scopeNext;
    }
    if (body.constraints !== undefined) {
      const parsedConstraints = ConstraintSet.safeParse(body.constraints);
      if (!parsedConstraints.success) {
        throw validation(`invalid constraints: ${parsedConstraints.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      }
      if (JSON.stringify(parsedConstraints.data) !== JSON.stringify(question.constraints)) changedFields.push('constraints');
      next.constraints = parsedConstraints.data;
    }
    if (changedFields.length === 0) {
      throw validation('nothing to edit — provide at least one of: text, goalType, scope.{domain,phenomena,inScope,outOfScope}, constraints');
    }
    const edited = ResearchQuestion.parse(next);
    app.store.putObject('question', edited);
    app.store.appendEvent(runId, {
      type: 'note',
      detail: { reason: 'question_edited_human', questionId: edited.id, changedFields, actor: 'human' },
    });
    sendJson(res, 200, { questionId: edited.id, changedFields, question: edited });
  };

  const receiveFeedback = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    runId: string,
  ): Promise<void> => {
    const body = await readJsonObject(req);
    const { source, content, targetKind, targetId } = body as {
      source?: unknown;
      content?: unknown;
      targetKind?: unknown;
      targetId?: unknown;
    };
    if (typeof source !== 'string') {
      throw validation(`field "source" is required — must be one of: ${FeedbackSourceKind.options.join(', ')}`);
    }
    const parsedSource = FeedbackSourceKind.safeParse(source);
    if (!parsedSource.success) {
      throw validation(`invalid source "${source}" — must be one of: ${FeedbackSourceKind.options.join(', ')}`);
    }
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw validation('field "content" is required (non-empty string)');
    }
    if ((targetKind === undefined) !== (targetId === undefined)) {
      throw validation('targetKind and targetId must be given together');
    }
    mustGetRun(runId); // 404 before any persistence — same order as the CLI
    let target: { kind: string; id: string } | undefined;
    if (targetKind !== undefined && targetId !== undefined) {
      const ref = ObjectRef.safeParse({ kind: targetKind, id: targetId });
      if (!ref.success) {
        throw validation(`invalid targetKind "${String(targetKind)}"`);
      }
      // fail-closed: a targeted signal must point at an object that actually exists
      const storeKind = TARGET_STORE_KINDS[ref.data.kind as keyof typeof TARGET_STORE_KINDS];
      if (storeKind !== undefined && app.store.getObject(storeKind, ref.data.id) === null) {
        throw validation(`${ref.data.kind} not found: ${ref.data.id}`);
      }
      target = ref.data;
    }
    const signal = FeedbackSignal.parse({
      id: newId('fbk'),
      runId,
      source: parsedSource.data as FeedbackSource,
      content,
      ...(target ? { target } : {}),
      provenance: `http:POST /api/v1/runs/${runId}/feedback (source=${parsedSource.data}, recorded at http api)`,
      receivedAt: new Date().toISOString(),
    });
    app.store.putObject('feedback', signal);
    app.store.appendEvent(runId, {
      type: 'feedback_received',
      detail: { feedbackId: signal.id, source: signal.source, via: 'http' },
    });
    sendJson(res, 201, { feedbackId: signal.id });
  };

  const reexport = async (res: http.ServerResponse, runId: string): Promise<void> => {
    mustGetRun(runId);
    if (executing.has(runId)) throw alreadyRunning(runId); // busy first: state may still change mid-flight
    const bundles = app.store.listObjects('bundle', runId);
    if (bundles.length === 0) {
      throw validation(`no bundle stored for run ${runId} yet — resume the run to run the export stage`);
    }
    // Anchor ONCE from the same listing the message quotes (WP2 F-006): a second
    // independent listObjects inside the check could observe a different latest bundle
    // than the id we report, or return undefined mid-concurrent-write.
    const latest = bundles.at(-1);
    // Real-content remediation (2026-08-29): a latest bundle that still PROJECTS
    // offline-template hypotheses is re-exportable WITHOUT a new revision — the
    // filtered re-render mints a clean bundle (same predicate as the export stage).
    const templateTainted = latest !== undefined && (await latestBundleTemplateTainted(app.artifacts, latest));
    if (!latest || (!revisionNewerThanBundle(runId, latest) && !templateTainted)) {
      throw validation(
        templateTainted
          ? `latest bundle (${latest?.id ?? 'unknown'}) is template-tainted but re-export was refused — report this`
          : `no revision newer than the latest bundle (${latest?.id ?? 'unknown'}) and it is not template-tainted — nothing to re-export`,
      );
    }
    startRun(runId);
    sendJson(res, 202, { runId });
  };

  // ---- router ----

  const route = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
    segments: string[],
  ): Promise<void> => {
    const method = req.method ?? 'GET';

    // static / hint surface (non-/api paths)
    if (segments[0] !== 'api') {
      if (method === 'GET' || method === 'HEAD') {
        serveStatic(req, res, staticRoot, method, url.pathname, method === 'HEAD');
        return;
      }
      throw notFound(`no route: ${method} ${url.pathname}`);
    }
    if (segments[1] !== 'v1') throw notFound(`no route: ${method} ${url.pathname}`);
    if (segments[2] === 'runs') {
      if (segments.length === 3) {
        if (method === 'GET') return listRuns(res);
        if (method === 'POST') return createRun(req, res);
        throw notFound(`method ${method} not allowed for ${url.pathname}`);
      }
      const runId = segments[3];
      if (runId === undefined) throw notFound(`no route: ${method} ${url.pathname}`);
      assertRunId(runId); // format gate before any store-layer use (WP2 F-003)
      if (segments.length === 6 && segments[4] === 'events' && segments[5] === 'stream') {
        if (method === 'GET') return runEventStream(req, res, runId, url, ctx);
        throw notFound(`method ${method} not allowed for ${url.pathname}`);
      }
      // B5 hypothesis lifecycle (R3) + BP-2 direct edit: POST /runs/:id/hypotheses/:hypId/<op>.
      // Ownership (run owns the hypothesis / the linked claim) is guarded inside
      // hypothesis-ops; this branch only dispatches the known verbs.
      if (segments[4] === 'screening' && segments.length === 5 && method === 'GET') {
        // Active-learning screening loop (ASReview-pattern): session view with
        // the ranked queue and the honest WSS@95-style stop estimate.
        try {
          sendJson(res, 200, buildScreeningView(app, getOrCreateScreeningSession(app, runId)));
        } catch (e) {
          if (e instanceof ScreeningError) {
            throw new HttpError(e.status, { code: e.code, message: e.message, retryable: false, runId });
          }
          throw e;
        }
        return;
      }
      if (segments[4] === 'screening' && segments[5] === 'decisions' && segments.length === 6 && method === 'POST') {
        const body = await readJsonObject(req);
        const srcId = typeof body.srcId === 'string' ? body.srcId : undefined;
        const verdict = body.verdict;
        if (srcId === undefined || (verdict !== 'include' && verdict !== 'exclude')) {
          throw validation('screening decision requires { srcId, verdict: include|exclude }');
        }
        const reason = typeof body.reason === 'string' && body.reason.length > 0 ? body.reason.slice(0, 2000) : undefined;
        try {
          const { session, duplicate } = recordScreeningDecision(app, runId, { srcId, verdict, ...(reason !== undefined ? { reason } : {}) });
          sendJson(res, duplicate ? 200 : 201, {
            duplicate,
            view: buildScreeningView(app, session),
          });
        } catch (e) {
          if (e instanceof ScreeningError) {
            throw new HttpError(e.status, { code: e.code, message: e.message, retryable: false, runId });
          }
          throw e;
        }
        return;
      }
      if (segments[4] === 'screening' && segments[5] === 'stop' && segments.length === 6 && method === 'POST') {
        try {
          const { session, feedbackId } = stopScreeningSession(app, runId);
          sendJson(res, 200, {
            view: buildScreeningView(app, session),
            ...(feedbackId !== undefined ? { feedbackId } : {}),
          });
        } catch (e) {
          if (e instanceof ScreeningError) {
            throw new HttpError(e.status, { code: e.code, message: e.message, retryable: false, runId });
          }
          throw e;
        }
        return;
      }
      // FA-HCI-02: researcher method-family override feeds the causal revision chain
      // (feedback -> scope-modify Revision -> VersionDiff, selection replaced in place).
      if (segments.length === 7 && segments[4] === 'method-selections' && segments[6] === 'override' && method === 'POST') {
        const body = await readJsonObject(req);
        try {
          const result = await overrideMethodSelection(app, runId, segments[5] ?? '', body);
          sendJson(res, 200, result);
          return;
        } catch (e) {
          if (e instanceof MethodOpError) {
            throw new HttpError(e.status, { code: e.code, message: e.message, retryable: false, runId });
          }
          throw e;
        }
      }
      if (segments.length === 7 && segments[4] === 'hypotheses') {
        const hypId = segments[5]!;
        const op = segments[6]!;
        if (method === 'POST' && (op === 'promote' || op === 'reject' || op === 'fork' || op === 'connect' || op === 'edit')) {
          const body = await readJsonObject(req);
          try {
            const result = op === 'promote' ? promoteHypothesis(app, runId, hypId, body)
              : op === 'reject' ? rejectHypothesis(app, runId, hypId, body)
              : op === 'fork' ? forkHypothesis(app, runId, hypId, body)
              : op === 'edit' ? await editHypothesis(app, runId, hypId, body)
              : connectClaim(app, runId, hypId, body);
            sendJson(res, 200, result);
            return;
          } catch (e) {
            if (e instanceof HypothesisOpError) {
              throw new HttpError(e.status, {
                code: e.code,
                message: e.message,
                retryable: false,
                ...(e.code === 'not_found' ? { runId } : {}),
              });
            }
            throw e;
          }
        }
        throw notFound(`no route: ${method} ${url.pathname}`);
      }

      // HX §15 evidence annotation/classification — researcher judgement ops on
      // claims, same ownership/audit discipline as hypothesis-ops above.
      if (segments.length === 7 && segments[4] === 'claims') {
        const claimId = segments[5]!;
        const op = segments[6]!;
        const claimOps: Record<string, (a: App, r: string, c: string, b: unknown) => unknown> = {
          annotate: annotateClaim,
          pin: (a, r, c, b) => pinClaim(a, r, c, true, b),
          unpin: (a, r, c, b) => pinClaim(a, r, c, false, b),
          exclude: excludeClaim,
          reinstate: reinstateClaim,
          reclassify: reclassifyClaim,
        };
        const handler = claimOps[op];
        if (method === 'POST' && handler !== undefined) {
          const body = await readJsonObject(req);
          try {
            const result = handler(app, runId, claimId, body);
            sendJson(res, 200, result);
            return;
          } catch (e) {
            if (e instanceof ClaimOpError) {
              throw new HttpError(e.status, {
                code: e.code,
                message: e.message,
                retryable: false,
                ...(e.code === 'not_found' ? { runId } : {}),
              });
            }
            throw e;
          }
        }
        throw notFound(`no route: ${method} ${url.pathname}`);
      }
      // (POST /runs/:id/experiments/:specId/approve removed 2026-08-29: zero
      // product callers — approval goes through `far experiment approve` /
      // experiment-ops directly; the route's untested HTTP surface carried
      // validation risk with no user.)
      if (segments.length === 5 && segments[4] === 'evaluations' && method === 'GET') {
        // AVO fusion G8 projection: the deterministic evaluator family over this
        // run's scientific state (multi-dimensional, no invented single score).
        mustGetRun(runId);
        sendJson(res, 200, { runId, evaluations: runEvaluators({ store: app.store, runId, now: new Date().toISOString() }) });
        return;
      }
      if (segments.length === 5 && segments[4] === 'lineage' && method === 'GET') {
        // AVO fusion G3 projection: the queryable research trajectory graph
        // (run revision family + hypotheses + evidence + causal revisions).
        // Read-only over the store; 404s honestly when the run does not exist.
        mustGetRun(runId);
        sendJson(res, 200, buildLineageGraph({ store: app.store, rootRunId: runId }));
        return;
      }
      if (segments.length === 5 && segments[4] === 'supervision' && method === 'GET') {
        // AVO fusion G2 projection: current supervisor analysis (fresh, not a
        // stored snapshot) so UX shows the live trajectory health. Read-only.
        mustGetRun(runId);
        sendJson(res, 200, analyzeTrajectory({ store: app.store, runId }));
        return;
      }
      if (segments.length === 5 && segments[4] === 'truth' && method === 'GET') {
        // Execution-truth projection (goal §5.5): deterministic receipt-derived
        // view of HOW this run executed (live / mixed / synthetic / recorded_replay),
        // incl. retrieval cache/replay composition. Read-only; receipts stay authoritative.
        mustGetRun(runId);
        sendJson(res, 200, runTruthProfile(app.store, runId));
        return;
      }
      if (segments.length === 5 && segments[4] === 'protocol' && method === 'GET') {
        // Protocol plane (convergence 2026-08-29): the frozen preregistration +
        // human-attested ledger for the plan's real-world legs (bench/field/human/
        // engineering/archive/theory). Read-only projection; the deterministic
        // state machine lives in protocol-ops/domain — never in the router.
        mustGetRun(runId);
        try {
          sendJson(res, 200, getProtocolState(app, runId));
          return;
        } catch (e) {
          if (e instanceof ProtocolOpError) {
            throw new HttpError(e.status, {
              code: e.code === 'state_conflict' ? 'validation' : e.code,
              message: e.message,
              retryable: false,
              ...(e.code === 'not_found' ? { runId } : {}),
            });
          }
          throw e;
        }
      }
      if (segments.length === 6 && segments[4] === 'protocol' && segments[5] === 'records' && method === 'POST') {
        // One human-attested protocol record: step start/complete, measurement,
        // deviation, approval, block/unblock, abort. Deterministic validation
        // (ethics gate, dependency order, typing, QC); completion publishes the
        // outcome as an experiment FeedbackSignal exactly once.
        mustGetRun(runId);
        const body = await readJsonObject(req);
        try {
          sendJson(res, 200, recordProtocolEvent(app, runId, body));
          return;
        } catch (e) {
          if (e instanceof ProtocolOpError) {
            throw new HttpError(e.status, {
              code: e.code === 'state_conflict' ? 'validation' : e.code,
              message: e.message,
              retryable: false,
              ...(e.code === 'not_found' ? { runId } : {}),
            });
          }
          throw e;
        }
      }
      if (segments.length === 5 && segments[4] === 'counter-search' && method === 'POST') {
        // §5.2 counter-evidence loop closure: execute ONE researcher-directed
        // counter-evidence search against the live source plane and grow the run
        // corpus (append-only snapshot versioning; receipts + events; lease-guarded).
        const body = await readJsonObject(req);
        try {
          sendJson(res, 201, await runCounterSearch(app, runId, body, opts.counterSearchSourceFor));
        } catch (e) {
          if (e instanceof CounterSearchError) {
            throw new HttpError(e.status, { code: e.code, message: e.message, retryable: false, runId });
          }
          throw e;
        }
        return;
      }
      if (segments.length === 4) {
        if (method === 'GET') return runDetail(res, runId);
        if (method === 'DELETE') {
          // Researcher lifecycle (gap R1): delete a run and everything it owns.
          // Guarded against live execution — one execution per run, one deletion per run.
          const run = mustGetRun(runId);
          if (run.status === 'running' || executing.has(runId)) {
            throw new HttpError(409, {
              code: 'run_active',
              message: `run ${runId} is ${executing.has(runId) ? 'executing in this server' : `in status '${run.status}'`} — cancel it before deleting`,
              retryable: false,
              runId,
            });
          }
          const deleted = app.store.deleteRunCascade(runId);
          if (deleted === null) throw notFound(`run not found: ${runId}`, runId);
          const conversationsUpdated = detachRunFromAllConversations(app, runId);
          sendJson(res, 200, { ok: true, runId, deleted: { ...deleted, conversationsUpdated } });
          return;
        }
        throw notFound(`method ${method} not allowed for ${url.pathname}`);
      }

      // RU-12 GO-2 time travel: project the run's object-space AS OF an event seq.
      if (segments.length === 6 && segments[4] === 'state-at' && method === 'GET') {
        const runId2 = segments[3]!;
        assertRunId(runId2);
        mustGetRun(runId2);
        const raw = segments[5]!;
        if (!/^\d+$/.test(raw)) throw validation('seq must be a non-negative integer');
        const seq = Number(raw);
        const state = app.store.stateAtSeq(runId2, seq);
        sendJson(res, 200, {
          runId: runId2,
          seq: state.seq,
          stage: state.stage,
          questionId: state.questionId,
          objectIdsByKind: state.objectIdsByKind,
          eventCount: state.events.length,
          lastEvents: state.events.slice(-8).map((e) => ({ seq: e.seq, type: e.type, stage: e.stage ?? null })),
        });
        return;
      }
      // Raw drilldown (product HCI §7: any visible result drills to raw data):
      // head rows of a dataset_record's CONTENT — csv from the content-addressed
      // artifact (text-safe); binary formats serve an honest notice instead of
      // a fabricated text preview.
      if (segments.length === 7 && segments[4] === 'datasets' && segments[5] !== undefined && segments[6] === 'sample' && method === 'GET') {
        mustGetRun(runId);
        const rec = app.store.getObject('dataset_record', segments[5]!) ?? app.store.listObjects('dataset_record', runId).find((d) => d.id === segments[5]!);
        if (rec === null || rec === undefined) return sendJson(res, 404, { error: { code: 'not_found', message: `dataset_record ${segments[5]} not found` } });
        if (rec.format !== 'csv') {
          return sendJson(res, 200, {
            datasetRecordId: rec.id, format: rec.format, binary: true,
            note: `raw ${rec.format} bytes are content-addressed (${rec.contentRef.slice(0, 19)}…) — profile/QC live in the lineage events; a text preview would be fabricated`,
            lineageKinds: rec.lineage.map((l) => l.kind).join(' -> '),
          });
        }
        const text = await app.artifacts.get(rec.contentRef);
        if (text === null) return sendJson(res, 404, { error: { code: 'artifact_missing', message: `content artifact ${rec.contentRef.slice(0, 19)}… not in store` } });
        const lines = text.split(/\r?\n/);
        return sendJson(res, 200, {
          datasetRecordId: rec.id, format: 'csv', binary: false,
          header: lines[0] ?? '', totalLines: Math.max(0, lines.length - 1 - (text.endsWith('\n') ? 1 : 0)),
          preview: lines.slice(0, 11).join('\n'), contentRef: rec.contentRef,
        });
      }
      if (segments.length === 5) {
        const leaf = segments[4]!;
        if (leaf === 'events' && method === 'GET') return runEvents(res, runId, url);
        // RU-2 branch writer: fork a settled run (question referenced, never
        // copied; forked_from lineage edge; step cache seeded for replay).
        if (leaf === 'fork' && method === 'POST') {
          const source = mustGetRun(runId);
          if (source.status === 'running' || source.status === 'queued') {
            throw validation(`run ${runId} is ${source.status} — fork from a settled run`);
          }
          const body = await readJsonObject(req);
          const reason = typeof body.reason === 'string' && body.reason.trim().length > 0
            ? body.reason.trim()
            : 'forked from researcher UI';
          const fork = app.store.forkRun(runId, { reason });
          sendJson(res, 201, { run: { id: fork.id, parentRunId: fork.parentRunId, status: fork.status } });
          return;
        }
        // RU-2 interop: PROV-O JSON-LD export from the lineage_edges single source.
        if (leaf === 'prov' && method === 'GET') {
          mustGetRun(runId);
          const edges = app.store.listLineageEdges({ runId });
          // RU-6: enrich evidence edges with their original relation type so the
          // CiTO IRI is exact (lineage edges carry the collapsed counter/support kind).
          const relationTypes: Record<string, EvidenceRelationType> = {};
          for (const rel of app.store.listObjects('evidence_relation', runId)) {
            const parsedRel = EvidenceRelationType.safeParse(rel.relation);
            if (parsedRel.success) relationTypes[rel.id] = parsedRel.data;
          }
          const graph = toProvJsonLd({ rootRunId: runId, runs: [{ id: runId }], edges, relationTypes });
          sendJson(res, 200, graph);
          return;
        }
        if (leaf === 'question' && method === 'GET') return runQuestion(res, runId);
        if (leaf === 'question' && method === 'PATCH') return await editRunQuestion(req, res, runId);
        if (leaf === 'scope-proposal' && method === 'POST') return await scopeProposal(res, runId);
        if (leaf === 'report' && method === 'GET') return runReport(res, runId);
        if (leaf === 'paper' && method === 'GET') return runPaper(res, runId);
        if (leaf === 'package' && method === 'GET') return runPackageZip(res, runId);
        if (leaf === 'sources' && method === 'GET') {
          mustGetRun(runId);
          return sendJson(res, 200, { sources: app.store.listObjects('source_document', runId) });
        }
        if (leaf === 'evidence' && method === 'GET') {
          mustGetRun(runId);
          return sendJson(res, 200, {
            claims: app.store.listObjects('claim', runId),
            relations: app.store.listObjects('evidence_relation', runId),
          });
        }
        if (leaf === 'hypotheses' && method === 'GET') {
          mustGetRun(runId);
          const achAnalysisRaw = app.store.listObjects('ach_analysis', runId).at(-1) ?? null;
          // Real-content discipline (owner directive 2026-08-29): template
          // hypotheses minted by legacy offline runs stay in the store (audit
          // truth plane) but are NEVER served as scientific objects. Scorecards,
          // evidence bodies, and tournament standings follow their hypotheses.
          const allHyps = app.store.listObjects('hypothesis', runId);
          const realHyps = allHyps.filter((h) => !isTemplateHypothesis(h));
          const realHypIds = new Set(realHyps.map((h) => h.id));
          // ACH matrices referencing only template hypotheses follow the same
          // exclusion (red-team P2-2): an ACH over hypotheses absent from the
          // served list is not a comparable scientific view.
          const achAnalysis = achAnalysisRaw !== null && achAnalysisRaw.hypothesisIds.some((id) => realHypIds.has(id))
            ? achAnalysisRaw
            : null;
          // HX §15 downstream semantics of claim exclusion: a read-time
          // researcher-adjusted PROJECTION recomputed with the same pure
          // functions the pipeline used (stored AchAnalysis stays untouched;
          // both views are disclosed — the exclusion is a judgement, not an
          // erasure). Null when nothing is excluded.
          let achResearcherAdjusted: {
            excludedClaimIds: string[];
            diagnosticity: ReturnType<typeof diagnosticityScores>;
            removalSensitivity: ReturnType<typeof removalSensitivity>;
            method: string;
          } | null = null;
          const excludedClaimIds = excludedClaimIdsOf(app.store.listObjects('claim', runId));
          if (achAnalysis !== null && excludedClaimIds.length > 0) {
            // Stored relations re-validated through the domain schema (honest
            // narrowing, no blind cast), then the excluded claims' rows drop.
            const keptRelations = app.store.listObjects('evidence_relation', runId)
              .flatMap((r) => {
                const parsed = EvidenceRelation.safeParse(r);
                return parsed.success ? [parsed.data] : [];
              })
              .filter((r) => r.claimId === undefined || !excludedClaimIds.includes(r.claimId));
            achResearcherAdjusted = {
              excludedClaimIds,
              diagnosticity: diagnosticityScores(keptRelations),
              removalSensitivity: removalSensitivity(keptRelations, achAnalysis.hypothesisIds),
              method: 'heuer-diagnosticity-v1-researcher-adjusted',
            };
          }
          return sendJson(res, 200, {
            hypotheses: realHyps,
            scorecards: app.store.listObjects('scorecard', runId).filter((s) => realHypIds.has(s.hypothesisId)),
            // D-016: pairwise tournament evidence behind the final ordering (uncertainty included).
            // Real-content discipline: standings won against template-only participants are
            // not evidence about real ranking — the tournament object serves only when at
            // least one real hypothesis took part (stored object itself stays untouched).
            tournament: (() => {
              const t = app.store.listObjects('tournament', runId).at(-1) ?? null;
              if (t === null) return null;
              return t.standings.some((s) => realHypIds.has(s.hypothesisId)) ? t : null;
            })(),
            // Wave-S g8/g9: hypothesis-level evidence bodies (floor certainty, independent
            // sources, Σlog-LR band, QBAF+Carneades, orthogonal promotion) + ACH audit
            evidenceBodies: app.store.listObjects('evidence_body', runId).filter((b) => realHypIds.has(b.hypothesisId)),
            achAnalysis,
            achResearcherAdjusted,
          });
        }
        if (leaf === 'plan' && method === 'GET') {
          mustGetRun(runId);
          return sendJson(res, 200, { plan: app.store.listObjects('plan', runId).at(-1) ?? null });
        }
        if (leaf === 'revisions' && method === 'GET') {
          mustGetRun(runId);
          return sendJson(res, 200, {
            feedbacks: app.store.listObjects('feedback', runId),
            revisions: app.store.listObjects('revision', runId),
            versionDiffs: app.store.listObjects('version_diff', runId),
          });
        }
        if (leaf === 'experiments' && method === 'GET') {
          // EEL read surface (D-081): far.db projections only — queue-level operational
          // detail (fence tokens, heartbeats) stays with `far experiment status`.
          mustGetRun(runId);
          return sendJson(res, 200, {
            experimentRuns: app.store.listObjects('experiment_run', runId),
            resultSets: app.store.listObjects('result_set', runId),
            statReports: app.store.listObjects('stat_report', runId),
            experimentSpecs: app.store.listObjects('experiment_spec', runId),
            femSpecs: app.store.listObjects('fem_spec', runId),
            datasetRecords: app.store.listObjects('dataset_record', runId),
          });
        }
        if (leaf === 'receipts' && method === 'GET') {
          mustGetRun(runId);
          return sendJson(res, 200, { receipts: app.store.listObjects('receipt', runId) });
        }
        if (leaf === 'calibration' && method === 'GET') {
          // Wave-S L4 self-calibration surface: the system's own forward predictions,
          // settlement state, and the pooled proper-score report (RPS vs the ignorance
          // baseline; n<30 strata honestly say "insufficient evidence").
          mustGetRun(runId);
          const entries = app.store.listObjects('prediction', runId);
          return sendJson(res, 200, { entries, report: calibrationReport(entries) });
        }
        if (leaf === 'bundles' && method === 'GET') return runBundles(res, runId);
        if (leaf === 'corpus' && method === 'GET') return runCorpus(res, runId);
        if (leaf === 'science' && method === 'GET') return runScience(res, runId);
        if (leaf === 'dispatch' && method === 'POST') return dispatchAction(req, res, runId);
        if (leaf === 'cancel' && method === 'POST') return cancelRun(res, runId);
        if (leaf === 'resume' && method === 'POST') return resumeRun(res, runId);
        if (leaf === 'feedback' && method === 'POST') return receiveFeedback(req, res, runId);
        if (leaf === 'reexport' && method === 'POST') return reexport(res, runId);
        if (leaf === 'actions' && method === 'POST') {
          // B4 object-level AI research actions: grounded adversarial analysis
          // (store facts only; receipts + audit events like any pipeline call).
          const body = await readJsonObject(req);
          try {
            const result = await runResearchAction(app, runId, body);
            sendJson(res, 200, result);
          } catch (e) {
            if (e instanceof ActionError) {
              throw new HttpError(e.status, { code: e.code, message: e.message, retryable: e.status >= 500 });
            }
            throw e;
          }
        }
      }
      throw notFound(`no route: ${method} ${url.pathname}`);
    }

    if (segments[2] === 'conversations') {
      const convRoute = async (fn: () => Promise<void> | void): Promise<void> => {
        try {
          await fn();
        } catch (e) {
          if (e instanceof ConversationError) {
            throw new HttpError(e.status, { code: e.code, message: e.message, retryable: e.code === 'conversation_model_failed' || e.code === 'turn_cancelled' });
          }
          throw e;
        }
      };
      if (segments.length === 3) {
        if (method === 'GET') return convRoute(() => sendJson(res, 200, { conversations: listConversations(app) }));
        if (method === 'POST') {
          return convRoute(async () => {
            const body = await readJsonObject(req);
            sendJson(res, 201, { conversation: createConversation(app, body) });
          });
        }
        throw notFound(`method ${method} not allowed for ${url.pathname}`);
      }
      const convId = segments[3]!;
      if (convId === undefined) throw notFound(`no route: ${method} ${url.pathname}`);
      if (segments.length === 4) {
        if (method === 'GET') return convRoute(() => sendJson(res, 200, { conversation: getConversation(app, convId) }));
        if (method === 'PATCH') {
          return convRoute(async () => {
            const body = await readJsonObject(req);
            sendJson(res, 200, { conversation: renameConversation(app, convId, body.title) });
          });
        }
        if (method === 'DELETE') return convRoute(() => { deleteConversation(app, convId); sendJson(res, 200, { ok: true }); });
        throw notFound(`method ${method} not allowed for ${url.pathname}`);
      }
      if (segments[4] === 'turns' && segments[5] === 'active' && segments[6] === 'stream' && segments.length === 7 && method === 'GET') {
        return convRoute(() => {
          getConversation(app, convId);
          conversationTurnStream(res, convId, url, ctx);
        });
      }
      if (segments[4] === 'turns' && segments[5] === 'active' && segments[6] === 'cancel' && segments.length === 7 && method === 'POST') {
        return convRoute(() => {
          getConversation(app, convId);
          sendJson(res, 202, { requested: conversationTurns.cancel(convId) });
        });
      }
      // FA-HAR-05 production steer path: queue a mid-turn redirect for the
      // running turn (consumed by the kernel loop between turns). Posting a
      // NEW message stays 409 turn_in_flight — steering is an explicit act.
      if (segments[4] === 'steer' && segments.length === 5 && method === 'POST') {
        return convRoute(async () => {
          const body = await readJsonObject(req);
          if (typeof body.text !== 'string' || body.text.trim().length === 0) {
            throw new ConversationError(400, 'validation', 'field "text" is required (non-empty)');
          }
          getConversation(app, convId);
          const queued = conversationTurns.steer(convId, body.text.trim().slice(0, 20_000));
          if (!queued) throw new ConversationError(409, 'no_active_turn', 'no turn is running for this conversation — post a message instead');
          sendJson(res, 202, { steered: true });
        });
      }
      if (segments[4] === 'messages' && segments[5] === 'stream' && segments.length === 6 && method === 'POST') {
        return convRoute(async () => {
          const body = await readJsonObject(req);
          if (typeof body.text !== 'string' || body.text.trim().length === 0) {
            throw new ConversationError(400, 'validation', 'field "text" is required (non-empty)');
          }
          getConversation(app, convId);
          conversationTurns.start(
            convId,
            (runtime) => postConversationMessage(app, convId, body, conversationDeps, runtime),
          );
          conversationTurnStream(res, convId, url, ctx);
        });
      }
      if (segments[4] === 'messages' && segments.length === 8 && segments[6] === 'retry' && segments[7] === 'stream' && method === 'POST') {
        return convRoute(async () => {
          // Consume/validate the JSON body before switching protocols; clients
          // send {} so the same CSRF/content-type guard applies as other writes.
          await readJsonObject(req);
          getConversation(app, convId);
          conversationTurns.start(
            convId,
            (runtime) => retryConversationTurn(app, convId, segments[5]!, conversationDeps, runtime),
          );
          conversationTurnStream(res, convId, url, ctx);
        });
      }
      if (segments[4] === 'messages' && segments.length === 5 && method === 'POST') {
        return convRoute(async () => {
          const body = await readJsonObject(req);
          sendJson(res, 200, { conversation: await postConversationMessage(app, convId, body, conversationDeps) });
        });
      }
      // retry re-runs the agent reply for the last (unanswered) researcher message
      if (segments[4] === 'messages' && segments.length === 7 && segments[6] === 'retry' && method === 'POST') {
        return convRoute(async () => {
          sendJson(res, 200, { conversation: await retryConversationTurn(app, convId, segments[5]!, conversationDeps) });
        });
      }
      if (segments[4] === 'reasoning-gear' && segments.length === 5 && method === 'PUT') {
        return convRoute(async () => {
          const body = await readJsonObject(req);
          const updated = setConversationReasoningGear(app, convId, body.gear);
          sendJson(res, 200, { reasoningGear: updated.reasoningGear ?? null });
        });
      }
      if (segments[4] === 'reasoning-gear' && segments.length === 5 && method === 'GET') {
        return convRoute(() => {
          const conv = getConversation(app, convId);
          const route = resolveConversationReasoningRoute(app, conv);
          if (route === null) return sendJson(res, 200, { supported: false });
          return sendJson(res, 200, {
            supported: true,
            style: route.style,
            defaultGear: route.defaultGear,
            gear: conv.reasoningGear ?? null,
            effectiveGear: conv.reasoningGear ?? route.defaultGear,
          });
        });
      }
      if (segments[4] === 'launch' && segments.length === 5 && method === 'POST') {
        return convRoute(async () => {
          const body = await readJsonObject(req);
          const text = typeof body.text === 'string' ? body.text.trim() : '';
          if (text.length === 0) throw validation('field "text" is required (the crystallized research question)');
          // All researcher materials from the conversation travel with the run.
          const conv = getConversation(app, convId);
          const runId = await createRunWithSeeds({
            text,
            ...(typeof body.providerConfigId === 'string' ? { providerConfigId: body.providerConfigId } : {}),
            seeds: collectConversationSeeds(conv),
          });
          attachRunToConversation(app, convId, runId);
          sendJson(res, 202, { runId });
        });
      }
      if (segments[4] === 'proposals' && segments.length === 6 && method === 'POST') {
        return convRoute(async () => {
          const proposalId = segments[5]!;
          if (!/^act_[a-z0-9]+$/.test(proposalId)) throw validation('invalid proposal id');
          const body = await readJsonObject(req);
          if (typeof body.approve !== 'boolean') throw validation('field "approve" must be a boolean');
          const conversation = await resolveConversationProposal(
            app, convId, proposalId,
            { approve: body.approve, remember: body.remember === true },
            conversationDeps,
          );
          // RU-1 profile writer: researcher preferences derive deterministically
          // from the (now updated) proposal resolutions. Non-fatal by design — a
          // memory hiccup must never invalidate an approval; visible in server logs.
          try {
            consolidateConversationProfile(app.store, conversation); // store-typed Conversation satisfies the structural param
          } catch (e) {
            process.stderr.write(`far-server: profile consolidation failed after proposal ${proposalId}: ${e instanceof Error ? e.message : String(e)}\n`);
          }
          sendJson(res, 200, { conversation });
        });
      }
      if (segments[4] === 'automations' && segments.length === 5 && method === 'GET') {
        return convRoute(() => {
          getConversation(app, convId); // 404 when the conversation does not exist
          const automations = app.store.listObjects('automation', '__none__')
            .filter((a) => a.conversationId === convId)
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
          return sendJson(res, 200, { automations });
        });
      }
      throw notFound(`no route: ${method} ${url.pathname}`);
    }

    // Route families (BC-002): composed in registration order; a family returns
    // false when the path is not its own, and the composer owns the fallthrough
    // 404 with the shared envelope. Family order is behavior-neutral: every
    // family guards on a distinct segments[2] prefix (the sole same-prefix pair,
    // builtin-routes under model-configs, keeps its registration order).
    for (const family of families) {
      if (await family(req, res, url, segments)) return;
    }
    throw notFound(`no route: ${method} ${url.pathname}`);
  };

  const effectivePort = opts.port ?? Number(process.env.PORT ?? 8787);
  // Actual bound port (differs from effectivePort when ephemeral port 0 is used, e.g. tests).
  let boundPort: number | null = null;
  const effectiveHost = String(opts.host ?? process.env.HOST ?? '127.0.0.1');
  const server = http.createServer((req, res) => {
    void (async () => {
      try {
        const parsed = new URL(req.url ?? '/', 'http://localhost');
        // F-1 guard (security audit): reject cross-origin/DNS-rebinding requests.
        // This is a local single-user tool: only the loopback origin may drive it.
        const host = String(req.headers.host ?? '').toLowerCase();
        const okPort = boundPort ?? effectivePort;
        const hostOk = host === `127.0.0.1:${okPort}` || host === `localhost:${okPort}` || host === `[::1]:${okPort}`;
        if (!hostOk) throw validation(`unrecognized Host header: only loopback origins may use this API`);
        const origin = req.headers.origin;
        if (origin !== undefined && !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(String(origin))) {
          throw validation(`cross-origin request rejected`);
        }
        // State-changing verbs WITH A BODY must be JSON — blocks HTML/form-content CSRF
        // even without CORS preflight. Bodyless requests fall through to normal routing
        // (404 for unknown routes stays a 404, not a 400).
        const hasBody = (Number(req.headers['content-length'] ?? 0) > 0) || req.headers['transfer-encoding'] !== undefined;
        if (hasBody && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method ?? '') && !(req.headers['content-type'] ?? '').toLowerCase().includes('application/json')) {
          throw validation(`content-type must be application/json for ${req.method}`);
        }
        const segments = decodeSegments(parsed.pathname);
        if (segments === null) throw validation(`malformed path encoding: ${parsed.pathname}`);
        await route(req, res, parsed, segments);
      } catch (e) {
        const err =
          e instanceof HttpError
            ? e
            : internal(`unexpected server error: ${e instanceof Error ? e.message : String(e)}`);
        if (!res.headersSent) {
          sendError(res, err);
        } else {
          res.end();
        }
      }
    })().catch((err: unknown) => {
      // Last-resort rejection handler (WP2 F-002): the catch above covers route errors,
      // but a failure inside the error path itself (sendError after a socket reset)
      // would otherwise surface as an unhandled rejection and crash the process.
      process.stderr.write(`far-api: unhandled rejection in request handler: ${err instanceof Error ? err.message : String(err)}\n`);
      try {
        if (!res.writableEnded) res.end();
      } catch {
        /* socket already destroyed */
      }
    });
  });
  server.on('clientError', (_err, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });

  const start = (): Promise<number> =>
    new Promise((resolve, reject) => {
      const port = effectivePort;
      const host = effectiveHost;
      const onError = (e: NodeJS.ErrnoException) => reject(e);
      server.once('error', onError);
      server.listen(port, host, () => {
        server.off('error', onError);
        const addr = server.address();
        const actual = typeof addr === 'object' && addr !== null ? addr.port : port;
        boundPort = actual;
        resolve(actual);
      });
    });

  const stop = (): Promise<void> =>
    new Promise((resolve) => {
      if (watchdogTimer !== null) clearInterval(watchdogTimer);
      automationEngine?.stop();
      conversationTurns.close();
      terminals.closeAll();
      server.close(() => resolve());
      server.closeIdleConnections();
      server.closeAllConnections();
    });

  return { server, start, stop };
}
