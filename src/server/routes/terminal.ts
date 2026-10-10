import { resolveInsideRoot } from '../../agent/capabilities/workspace-tools.js';
import { HttpError, notFound, readJsonObject, sendJson, terminalEventStream, validation, type RouteCtx, type RouteFamily } from '../http-kit.js';

/** Terminal family (BC-002): persistent login shells behind /api/v1/terminal/* —
 *  loopback workbench surface, FARLAB_TERMINAL=off kills it. */

export function registerTerminalRoutes(ctx: RouteCtx): RouteFamily {
  const terminals = ctx.terminals;

  return async (req, res, url, segments) => {
    const method = req.method ?? 'GET';

    // ---- terminal sessions (extensibility lane): persistent login shells ----
    if (!(segments[2] === 'terminal' && segments[3] === 'sessions')) return false;
    if (!terminals.enabled()) {
      throw new HttpError(403, { code: 'feature_disabled', message: 'terminal disabled: FARLAB_TERMINAL=off', retryable: false });
    }
    if (segments.length === 4) {
      if (method === 'GET') { sendJson(res, 200, { sessions: terminals.list(), maxSessions: terminals.maxSessions() }); return true; }
      if (method === 'POST') {
        // Empty POST body is legal here (no cwd = workspace root) — only read
        // JSON when a body is actually present.
        const hasBody = (Number(req.headers['content-length'] ?? 0) > 0) || req.headers['transfer-encoding'] !== undefined;
        const body = hasBody ? await readJsonObject(req) : {};
        const rawCwd = typeof body.cwd === 'string' ? body.cwd : '.';
        const cwd = resolveInsideRoot(process.cwd(), rawCwd);
        if (cwd === null) throw validation(`cwd escapes the workspace root: ${rawCwd}`);
        try {
          sendJson(res, 201, terminals.create(cwd));
        } catch (e) {
          throw new HttpError(409, { code: 'terminal_limit', message: e instanceof Error ? e.message : String(e), retryable: false });
        }
        return true;
      }
      throw notFound(`method ${method} not allowed for ${url.pathname}`);
    }
    const id = segments[4];
    if (id === undefined) throw notFound(`no route: ${method} ${url.pathname}`);
    if (segments.length === 5) {
      if (method === 'GET') { sendJson(res, 200, terminals.get(id)); return true; }
      if (method === 'DELETE') { sendJson(res, 200, { killed: terminals.kill(id) }); return true; }
      throw notFound(`method ${method} not allowed for ${url.pathname}`);
    }
    if (segments.length === 6 && segments[5] === 'input' && method === 'POST') {
      const body = await readJsonObject(req);
      if (typeof body.text !== 'string' || body.text.length === 0) {
        throw validation('field "text" must be a non-empty string');
      }
      try {
        terminals.write(id, body.text);
        sendJson(res, 200, { ok: true });
      } catch (e) {
        throw new HttpError(409, { code: 'terminal_not_writable', message: e instanceof Error ? e.message : String(e), retryable: false });
      }
      return true;
    }
    if (segments.length === 6 && segments[5] === 'events' && method === 'GET') {
      terminalEventStream(req, res, id, ctx);
      return true;
    }
    return false; // family fallthrough: the composer 404s with the identical envelope
  };
}
