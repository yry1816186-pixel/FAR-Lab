import http from 'node:http';
import { McpManager } from '../../agent/mcp-manager.js';
import { importPlugin, PluginImportError, PluginImportInputSchema } from '../../plugins/import.js';
import { ToolIntegrationSchema, integrationSemanticIssues, maskIntegrationSecrets, newId } from '../../domain/index.js';
import { notFound, readJsonObject, sendJson, validation, type RouteCtx, type RouteFamily } from '../http-kit.js';

/** Tool-integrations family (BC-002): researcher-wired external tools (TIS). */

export function registerToolsRoutes(ctx: RouteCtx): RouteFamily {
  const app = ctx.app;

  /** Tool integrations are workspace-global, like model configs ('__none__' run bucket). */
  const listToolIntegrationsAll = () => app.store.listObjects('tool_integration', '__none__');

  const TOOL_INTEGRATION_ID_RE = /^tint_[0-9a-z]{20,32}$/;
  const assertToolIntegrationId = (id: string): void => {
    if (!TOOL_INTEGRATION_ID_RE.test(id)) throw validation(`invalid tool integration id format: ${id}`);
  };

  const mustGetToolIntegration = (id: string) => {
    const integration = app.store.getObject('tool_integration', id);
    if (integration === null) throw notFound(`tool integration not found: ${id}`);
    return integration;
  };

  /** Response projection — secret env/header values NEVER leave the server verbatim. */
  const toolIntegrationView = (integration: ReturnType<typeof listToolIntegrationsAll>[number]) => ({
    ...maskIntegrationSecrets(integration),
    envSet: integration.kind === 'mcp_server' ? Object.keys(integration.env) : [],
    headersSet: integration.kind === 'mcp_server' ? Object.keys(integration.headers) : [],
  });

  const invalidIntegrationMessage = (issues: { path: (string | number)[]; message: string }[]): string =>
    `invalid tool integration: ${issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`;

  const createToolIntegration = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const body = await readJsonObject(req);
    const now = new Date().toISOString();
    const parsed = ToolIntegrationSchema.safeParse({
      ...body,
      id: newId('tint'),
      enabled: typeof body.enabled === 'boolean' ? body.enabled : true,
      createdBy: 'researcher',
      createdAt: now,
      updatedAt: now,
    });
    if (!parsed.success) throw validation(invalidIntegrationMessage(parsed.error.issues));
    const semantic = integrationSemanticIssues(parsed.data);
    if (semantic.length > 0) throw validation(`invalid tool integration: ${semantic.join('; ')}`);
    app.store.putObject('tool_integration', parsed.data);
    sendJson(res, 201, { integration: toolIntegrationView(parsed.data) });
  };

  /**
   * Secret-preserving update semantics (apiKey lineage): an absent env/headers field keeps
   * the stored map; a present map keeps keys it omits (masked round-trip) and replaces
   * keys it names with the given string values.
   */
  const mergeSecretMap = (stored: Record<string, string>, incoming: unknown): Record<string, string> => {
    if (incoming === undefined) return stored;
    if (typeof incoming !== 'object' || incoming === null || Array.isArray(incoming)) {
      throw validation('env/headers must be an object of string values when present');
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(incoming as Record<string, unknown>)) {
      if (typeof v !== 'string') throw validation(`env/headers value for '${k}' must be a string`);
      out[k] = v;
    }
    return { ...stored, ...out };
  };

  const updateToolIntegration = async (req: http.IncomingMessage, res: http.ServerResponse, id: string): Promise<void> => {
    assertToolIntegrationId(id);
    const existing = mustGetToolIntegration(id);
    const body = await readJsonObject(req);
    const merged = {
      ...existing,
      ...(typeof body.label === 'string' ? { label: body.label } : {}),
      ...(typeof body.enabled === 'boolean' ? { enabled: body.enabled } : {}),
      ...(body.kind === existing.kind ? body : {}),
      env: existing.kind === 'mcp_server' ? mergeSecretMap(existing.env, body.env) : undefined,
      headers: existing.kind === 'mcp_server' ? mergeSecretMap(existing.headers, body.headers) : undefined,
      updatedAt: new Date().toISOString(),
    };
    const parsed = ToolIntegrationSchema.safeParse(merged);
    if (!parsed.success) throw validation(invalidIntegrationMessage(parsed.error.issues));
    const semantic = integrationSemanticIssues(parsed.data);
    if (semantic.length > 0) throw validation(`invalid tool integration: ${semantic.join('; ')}`);
    app.store.putObject('tool_integration', parsed.data);
    sendJson(res, 200, { integration: toolIntegrationView(parsed.data) });
  };

  /**
   * Real connectivity test for mcp_server integrations: initialize + tools/list round
   * trip through the same clients sessions use, persisted as the integration's honest
   * lastTest. Non-MCP kinds get a truthful 400 — there is nothing to dial.
   */
  const testToolIntegration = async (req: http.IncomingMessage, res: http.ServerResponse, id: string): Promise<void> => {
    assertToolIntegrationId(id);
    const integration = mustGetToolIntegration(id);
    if (integration.kind !== 'mcp_server') {
      throw validation(`test is only meaningful for mcp_server integrations (kind: ${integration.kind})`);
    }
    const manager = new McpManager({ listServers: () => [integration] });
    try {
      const record = await manager.testIntegration(integration);
      const updated = ToolIntegrationSchema.parse({ ...integration, lastTest: record, updatedAt: new Date().toISOString() });
      app.store.putObject('tool_integration', updated);
      sendJson(res, 200, { test: record });
    } finally {
      await manager.close();
    }
  };

  /**
   * Plugin import (TIS T5): expand a reviewed local plugin directory into
   * DISABLED tool integrations (the researcher activates after review). The
   * request must carry reviewed:true — an honesty gate recording that the
   * plugin files were reviewed before staging, not a sandbox claim.
   */
  const importPluginRoute = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const body = await readJsonObject(req);
    const parsedInput = PluginImportInputSchema.safeParse(body);
    if (!parsedInput.success) {
      throw validation(`plugin import requires { dir, reviewed: true } — staging unreviewed plugins is refused: ${parsedInput.error.issues[0]?.message}`);
    }
    let result;
    try {
      result = importPlugin(parsedInput.data);
    } catch (e) {
      if (e instanceof PluginImportError) throw validation(e.message);
      throw e;
    }
    for (const integration of result.integrations) app.store.putObject('tool_integration', integration);
    sendJson(res, 201, {
      plugin: { name: result.manifest.name, version: result.manifest.version, license: result.manifest.license },
      integrations: result.integrations.map(toolIntegrationView),
      warnings: result.warnings,
    });
  };

  return async (req, res, url, segments) => {
    const method = req.method ?? 'GET';

    if (segments[2] !== 'tools') return false;
    if (segments.length === 3) {
      if (method === 'GET') { sendJson(res, 200, { integrations: listToolIntegrationsAll().map(toolIntegrationView) }); return true; }
      if (method === 'POST') {
        await createToolIntegration(req, res);
        return true;
      }
      throw notFound(`method ${method} not allowed for ${url.pathname}`);
    }
    if (segments[3] === 'import-plugin' && segments.length === 4 && method === 'POST') {
      await importPluginRoute(req, res);
      return true;
    }
    const leaf = segments[3]!;
    if (segments[4] === 'test' && segments.length === 5 && method === 'POST') {
      await testToolIntegration(req, res, leaf);
      return true;
    }
    if (segments.length === 4) {
      if (method === 'GET') {
        assertToolIntegrationId(leaf);
        sendJson(res, 200, { integration: toolIntegrationView(mustGetToolIntegration(leaf)) });
        return true;
      }
      if (method === 'PUT') {
        await updateToolIntegration(req, res, leaf);
        return true;
      }
      if (method === 'DELETE') {
        assertToolIntegrationId(leaf);
        mustGetToolIntegration(leaf);
        app.store.deleteObject('tool_integration', leaf);
        sendJson(res, 200, { deleted: leaf });
        return true;
      }
    }
    return false; // family fallthrough: the composer 404s with the identical envelope
  };
}
