import { notFound, readJsonObject, sendJson, validation, type RouteCtx, type RouteFamily } from '../http-kit.js';

/** Automations family (BC-002): the resident-agent automation records surface. */

export function registerAutomationsRoutes(ctx: RouteCtx): RouteFamily {
  const app = ctx.app;

  return async (req, res, url, segments) => {
    const method = req.method ?? 'GET';

    if (segments[2] !== 'automations') return false;
    if (segments.length === 3) {
      if (method === 'GET') {
        const automations = app.store.listObjects('automation', '__none__')
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
        sendJson(res, 200, { automations });
        return true;
      }
      throw notFound(`method ${method} not allowed for ${url.pathname}`);
    }
    const automationId = segments[3]!;
    if (automationId === undefined || !/^auto_[a-z0-9]+$/.test(automationId)) throw validation('invalid automation id');
    if (segments.length === 4 && method === 'GET') {
      const automation = app.store.getObject('automation', automationId);
      if (automation === null) throw notFound(`automation not found: ${automationId}`);
      sendJson(res, 200, { automation });
      return true;
    }
    if (segments.length === 4 && method === 'PATCH') {
      const automation = app.store.getObject('automation', automationId);
      if (automation === null) throw notFound(`automation not found: ${automationId}`);
      const body = await readJsonObject(req);
      if (typeof body.enabled !== 'boolean') throw validation('field "enabled" must be a boolean');
      app.store.putObject('automation', { ...automation, enabled: body.enabled, updatedAt: new Date().toISOString() });
      sendJson(res, 200, { automation: app.store.getObject('automation', automationId) });
      return true;
    }
    if (segments.length === 4 && method === 'DELETE') {
      if (app.store.getObject('automation', automationId) === null) throw notFound(`automation not found: ${automationId}`);
      app.store.deleteObject('automation', automationId);
      sendJson(res, 200, { deleted: automationId });
      return true;
    }
    return false; // family fallthrough: the composer 404s with the identical envelope
  };
}
