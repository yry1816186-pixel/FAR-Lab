import http from 'node:http';
import { FeedbackSignal, FeedbackSourceKind, ObjectRef, newId } from '../../domain/index.js';
import type { FeedbackSourceKind as FeedbackSource } from '../../domain/index.js';
import { latestBundleTemplateTainted } from '../../pipeline/stages/export.js';
import { alreadyRunning, notFound, readJsonObject, sendJson, validation, type RouteCtx, type RouteFamily } from '../http-kit.js';
import { HttpError } from '../http-kit.js';

/** Runs family, lifecycle verbs (BC-002): the §8.2 pre-launch journey
 *  (scope-proposal), cancel/resume/reexport, and human feedback intake. */

/** Kinds that a feedback target may reference AND that we can existence-check in the store. */
const TARGET_STORE_KINDS = {
  hypothesis: 'hypothesis',
  plan: 'plan',
  claim: 'claim',
  question: 'question',
  evidence_relation: 'evidence_relation',
} as const;

export function registerRunsLifecycleRoutes(ctx: RouteCtx): RouteFamily {
  const app = ctx.app;
  const mustGetRun = ctx.mustGetRun;
  const executing = ctx.executing;
  const startRun = ctx.startRun;
  const executor = ctx.executor;

  /** Whether a revision landed after the newest bundle (the export stage's own re-export rule). */
  const revisionNewerThanBundle = (runId: string, latestBundle: { createdAt: string } | undefined): boolean => {
    if (!latestBundle) return false;
    return app.store.listObjects('revision', runId).some((r) => r.createdAt > latestBundle.createdAt);
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

  return async (req, res, _url, segments) => {
    const method = req.method ?? 'GET';

    if (!(segments[2] === 'runs' && segments.length === 5)) return false;
    const runId = segments[3]!;
    const leaf = segments[4]!;
    if (leaf === 'scope-proposal' && method === 'POST') {
      await scopeProposal(res, runId);
      return true;
    }
    if (leaf === 'cancel' && method === 'POST') {
      cancelRun(res, runId);
      return true;
    }
    if (leaf === 'resume' && method === 'POST') {
      resumeRun(res, runId);
      return true;
    }
    if (leaf === 'feedback' && method === 'POST') {
      await receiveFeedback(req, res, runId);
      return true;
    }
    if (leaf === 'reexport' && method === 'POST') {
      await reexport(res, runId);
      return true;
    }
    return false; // family fallthrough: the composer 404s with the identical envelope
  };
}
