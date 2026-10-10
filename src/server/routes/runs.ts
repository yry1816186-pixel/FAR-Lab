import http from 'node:http';
import { ResearchQuestion, ScientificGoalType, runProgress } from '../../domain/index.js';
import { ConstraintSet } from '../../domain/question.js';
import { aggregateRunUsage } from '../../app/usage-ledger.js';
import { detachRunFromAllConversations } from '../conversations.js';
import {
  HttpError, assertRunId, notFound, readJsonObject, runEventStream, sendJson, validation,
  type RouteCtx, type RouteFamily,
} from '../http-kit.js';

/** Runs family, core (BC-002): collection, detail, fork, state-at time travel,
 *  the event plane (list + SSE) and the editable pre-launch question. */

export function registerRunsRoutes(ctx: RouteCtx): RouteFamily {
  const app = ctx.app;
  const mustGetRun = ctx.mustGetRun;
  const createRunWithSeeds = ctx.createRunWithSeeds;

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

  return async (req, res, url, segments) => {
    const method = req.method ?? 'GET';

    if (segments[2] !== 'runs') return false;
    if (segments.length === 3) {
      if (method === 'GET') { listRuns(res); return true; }
      if (method === 'POST') {
        await createRun(req, res);
        return true;
      }
      throw notFound(`method ${method} not allowed for ${url.pathname}`);
    }
    const runId = segments[3];
    if (runId === undefined) throw notFound(`no route: ${method} ${url.pathname}`);
    assertRunId(runId); // format gate before any store-layer use (WP2 F-003)
    if (segments.length === 6 && segments[4] === 'events' && segments[5] === 'stream') {
      if (method === 'GET') {
        runEventStream(req, res, runId, url, ctx);
        return true;
      }
      throw notFound(`method ${method} not allowed for ${url.pathname}`);
    }
    if (segments.length === 4) {
      if (method === 'GET') { runDetail(res, runId); return true; }
      if (method === 'DELETE') {
        // Researcher lifecycle (gap R1): delete a run and everything it owns.
        // Guarded against live execution — one execution per run, one deletion per run.
        const run = mustGetRun(runId);
        if (run.status === 'running' || ctx.executing.has(runId)) {
          throw new HttpError(409, {
            code: 'run_active',
            message: `run ${runId} is ${ctx.executing.has(runId) ? 'executing in this server' : `in status '${run.status}'`} — cancel it before deleting`,
            retryable: false,
            runId,
          });
        }
        const deleted = app.store.deleteRunCascade(runId);
        if (deleted === null) throw notFound(`run not found: ${runId}`, runId);
        const conversationsUpdated = detachRunFromAllConversations(app, runId);
        sendJson(res, 200, { ok: true, runId, deleted: { ...deleted, conversationsUpdated } });
        return true;
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
      return true;
    }
    if (segments.length === 5) {
      const leaf = segments[4]!;
      if (leaf === 'events' && method === 'GET') { runEvents(res, runId, url); return true; }
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
        return true;
      }
      if (leaf === 'question' && method === 'GET') { runQuestion(res, runId); return true; }
      if (leaf === 'question' && method === 'PATCH') { await editRunQuestion(req, res, runId); return true; }
    }
    return false; // family fallthrough: the composer 404s with the identical envelope
  };
}
