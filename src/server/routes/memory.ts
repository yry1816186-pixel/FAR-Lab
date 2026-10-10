import { HttpError, notFound, readJsonObject, sendJson, validation, type RouteCtx, type RouteFamily } from '../http-kit.js';
import { archiveMemory, editMemory, MemoryOpError } from '../memory-ops.js';

/** Memory family (BC-002): the researcher memory-management surface (web #memory).
 *  Reads are projections over the store; edit/archive go through memory-ops.ts
 *  (audited, append-only, trust-fenced). `far memory` CLI search keeps its own
 *  path unchanged. */

export function registerMemoryRoutes(ctx: RouteCtx): RouteFamily {
  const app = ctx.app;

  return async (req, res, url, segments) => {
    const method = req.method ?? 'GET';

    if (segments[2] !== 'memory') return false;
    if (segments.length === 3 && method === 'GET') {
      const kind = url.searchParams.get('kind');
      const status = url.searchParams.get('status');
      const runId = url.searchParams.get('runId');
      const kindValues = ['episodic', 'semantic', 'experiment_outcome', 'profile'] as const;
      const statusValues = ['active', 'superseded', 'archived'] as const;
      let parsedKind: (typeof kindValues)[number] | undefined;
      if (kind !== null) {
        if (!(kindValues as readonly string[]).includes(kind)) throw validation(`kind must be one of ${kindValues.join('|')} (got ${kind})`);
        parsedKind = kind as (typeof kindValues)[number];
      }
      let parsedStatus: (typeof statusValues)[number] | undefined;
      if (status !== null) {
        if (!(statusValues as readonly string[]).includes(status)) throw validation(`status must be one of ${statusValues.join('|')} (got ${status})`);
        parsedStatus = status as (typeof statusValues)[number];
      }
      // Same honest-cap contract as /export below: the list enumerates up to
      // 500 items and says so in the payload — `total: items.length` would
      // dress a capped subset up as the workspace total.
      const items = app.store.listMemory({
        ...(parsedKind !== undefined ? { kind: parsedKind } : {}),
        ...(parsedStatus !== undefined ? { status: parsedStatus } : {}),
        ...(runId !== null ? { runId } : {}),
        limit: 500,
      });
      sendJson(res, 200, { items, count: items.length, cap: 500, complete: items.length < 500 });
      return true;
    }
    if (segments.length === 4 && segments[3] === 'export' && method === 'GET') {
      // Honest enumeration cap (listMemory clamps at 500) is disclosed in the
      // payload itself — an export never pretends to be exhaustive silently.
      const items = app.store.listMemory({ limit: 500 });
      const body = Buffer.from(JSON.stringify({
        exportedAt: new Date().toISOString(),
        count: items.length,
        cap: 500,
        complete: items.length < 500,
        items,
      }, null, 2), 'utf8');
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': String(body.length),
        'Content-Disposition': 'attachment; filename="farlab-memory.json"',
      });
      res.end(body);
      return true;
    }
    if (segments.length === 4 && method === 'GET') {
      const id = segments[3]!;
      if (!/^mem_[a-z0-9]+$/.test(id)) throw validation(`malformed memory id: ${id}`);
      const item = app.store.getMemory(id);
      if (item === null) throw notFound(`memory item ${id} not found`);
      sendJson(res, 200, { item });
      return true;
    }
    if (segments.length === 5 && method === 'POST' && (segments[4] === 'edit' || segments[4] === 'archive')) {
      const body = await readJsonObject(req);
      try {
        const result = segments[4] === 'edit'
          ? editMemory(app, segments[3]!, body)
          : archiveMemory(app, segments[3]!, body);
        sendJson(res, 200, result);
        return true;
      } catch (e) {
        if (e instanceof MemoryOpError) {
          throw new HttpError(e.status, { code: e.code, message: e.message, retryable: false });
        }
        throw e;
      }
    }
    return false; // family fallthrough: the composer 404s with the identical envelope
  };
}
