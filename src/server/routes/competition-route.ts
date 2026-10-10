import { HttpError, notFound, readBody, sendJson, type RouteCtx, type RouteFamily } from '../http-kit.js';
import { readCompetitionRouteMode, writeCompetitionRouteMode } from '../../app/provider-resolver.js';

/** Competition-route family (BC-002): the competition route gate switch (settings surface). */

export function registerCompetitionRouteRoutes(ctx: RouteCtx): RouteFamily {
  const app = ctx.app;

  return async (req, res, url, segments) => {
    const method = req.method ?? 'GET';

    if (!(segments[2] === 'competition-route' && segments.length === 3)) return false;
    // 11→12 handoff 2026-08-25: competition route gate switch (settings surface).
    // GET → current mode; PUT {on:boolean} → idempotent write. Semantics live in
    // provider-resolver (ON holds every resolved route to the official Qwen-via-Bailian
    // rule, fail-closed on violation; re-read per resolution so edits hit live runs).
    if (method === 'GET') {
      sendJson(res, 200, { competitionRouteMode: readCompetitionRouteMode(app.store) ? 'on' : 'off' });
      return true;
    }
    if (method === 'PUT') {
      const raw = (await readBody(req)).toString('utf8');
      let body: unknown;
      try { body = JSON.parse(raw); } catch { body = undefined; }
      if (typeof body !== 'object' || body === null || typeof (body as { on?: unknown }).on !== 'boolean') {
        throw new HttpError(400, { code: 'validation', message: 'PUT /api/v1/competition-route expects {"on": boolean}', retryable: false });
      }
      writeCompetitionRouteMode(app.store, (body as { on: boolean }).on);
      sendJson(res, 200, { competitionRouteMode: (body as { on: boolean }).on ? 'on' : 'off' });
      return true;
    }
    throw notFound(`no route: ${method} ${url.pathname}`);
  };
}
