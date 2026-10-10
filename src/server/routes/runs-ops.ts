import { runCounterSearch, CounterSearchError } from '../counter-search.js';
import { runResearchAction, ActionError } from '../actions.js';
import { getProtocolState, recordProtocolEvent, ProtocolOpError } from '../protocol-ops.js';
import { connectClaim, editHypothesis, forkHypothesis, promoteHypothesis, rejectHypothesis, HypothesisOpError } from '../hypothesis-ops.js';
import { MethodOpError, overrideMethodSelection } from '../method-ops.js';
import { annotateClaim, ClaimOpError, excludeClaim, pinClaim, reclassifyClaim, reinstateClaim } from '../claim-ops.js';
import {
  buildScreeningView,
  getOrCreateScreeningSession,
  recordScreeningDecision,
  ScreeningError,
  stopScreeningSession,
} from '../screening.js';
import type { App } from '../../app/composition.js';
import { HttpError, notFound, readJsonObject, sendJson, validation, type RouteCtx, type RouteFamily } from '../http-kit.js';

/** Runs family, researcher ops (BC-002): screening, method overrides, hypothesis
 *  and claim lifecycle, the protocol plane, counter-search and AI research
 *  actions — all dispatch-only; semantics live in their *-ops owners. */

export function registerRunsOpsRoutes(ctx: RouteCtx): RouteFamily {
  const app: App = ctx.app;
  const mustGetRun = ctx.mustGetRun;

  return async (req, res, url, segments) => {
    const method = req.method ?? 'GET';

    if (segments[2] !== 'runs' || segments.length < 5) return false;
    const runId = segments[3]!;
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
      return true;
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
      return true;
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
      return true;
    }
    // FA-HCI-02: researcher method-family override feeds the causal revision chain
    // (feedback -> scope-modify Revision -> VersionDiff, selection replaced in place).
    if (segments.length === 7 && segments[4] === 'method-selections' && segments[6] === 'override' && method === 'POST') {
      const body = await readJsonObject(req);
      try {
        const result = await overrideMethodSelection(app, runId, segments[5] ?? '', body);
        sendJson(res, 200, result);
        return true;
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
          return true;
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
          return true;
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
    if (segments.length === 5 && segments[4] === 'protocol' && method === 'GET') {
      // Protocol plane (convergence 2026-08-29): the frozen preregistration +
      // human-attested ledger for the plan's real-world legs (bench/field/human/
      // engineering/archive/theory). Read-only projection; the deterministic
      // state machine lives in protocol-ops/domain — never in the router.
      mustGetRun(runId);
      try {
        sendJson(res, 200, getProtocolState(app, runId));
        return true;
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
        return true;
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
        sendJson(res, 201, await runCounterSearch(app, runId, body, ctx.counterSearchSourceFor));
        return true;
      } catch (e) {
        if (e instanceof CounterSearchError) {
          throw new HttpError(e.status, { code: e.code, message: e.message, retryable: false, runId });
        }
        throw e;
      }
    }
    if (segments.length === 5 && segments[4] === 'actions' && method === 'POST') {
      // B4 object-level AI research actions: grounded adversarial analysis
      // (store facts only; receipts + audit events like any pipeline call).
      const body = await readJsonObject(req);
      try {
        const result = await runResearchAction(app, runId, body);
        sendJson(res, 200, result);
        return true;
      } catch (e) {
        if (e instanceof ActionError) {
          throw new HttpError(e.status, { code: e.code, message: e.message, retryable: e.status >= 500 });
        }
        throw e;
      }
    }
    return false; // family fallthrough: the composer 404s with the identical envelope
  };
}
