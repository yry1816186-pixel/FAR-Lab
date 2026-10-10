import http from 'node:http';
import { createCustomProvider } from '../../providers/custom.js';
import { discoverModels } from '../../providers/discovery.js';
import { listProviders } from '../../providers/index.js';
import { builtinDefaultName, builtinModelIdFor } from '../../providers/builtin-overrides.js';
import { ACTIVE_MODEL_CONFIG_META_KEY } from '../../app/provider-resolver.js';
import { aggregateWorkspaceUsage } from '../../app/usage-ledger.js';
import { workspaceSpendStatus, writeSpendLimit } from '../../app/spend-limit.js';
import { ModelProviderConfig, ProviderWireProtocol, maskApiKey, newId } from '../../domain/index.js';
import { PROVIDER_TEMPLATES } from '../../providers/catalog.js';
import {
  HttpError, assertModelConfigId, notFound, readJsonObject, sendJson, validation,
  type RouteCtx, type RouteFamily,
} from '../http-kit.js';

/** Model-configs family (BC-002): user-defined model routes (workspace-global,
 *  '__none__' run bucket) + the spend-limit and discovery leaves. */

export function registerModelConfigsRoutes(ctx: RouteCtx): RouteFamily {
  const app = ctx.app;

  /** Model configs are workspace-global: stored under the '__none__' run bucket (like questions). */
  const listModelConfigsAll = () => app.store.listObjects('model_config', '__none__');

  const mustGetModelConfig = (id: string) => {
    const cfg = app.store.getObject('model_config', id);
    if (cfg === null) throw notFound(`model config not found: ${id}`);
    return cfg;
  };

  /** Response projection — the plaintext key NEVER leaves the server. */
  const modelConfigSummary = (cfg: ModelProviderConfig, activeId: string | null) => ({
    id: cfg.id,
    label: cfg.label,
    wire: cfg.wire,
    baseUrl: cfg.baseUrl,
    modelId: cfg.modelId,
    apiKeySet: cfg.apiKey.length > 0,
    apiKeyMasked: maskApiKey(cfg.apiKey),
    active: activeId === cfg.id,
    fallbackConfigIds: cfg.fallbackConfigIds,
    pricing: cfg.pricing,
    createdAt: cfg.createdAt,
    updatedAt: cfg.updatedAt,
  });

  const listModelConfigs = (res: http.ServerResponse): void => {
    // Test-double configs (wire 'offline') are test fixtures, not product routes:
    // the settings surface never lists them unless this server IS a test harness.
    const testDouble = process.env.FARLAB_TEST_DOUBLE === '1';
    // A leftover test-double default must not survive the filter as a dangling
    // pointer: report it as "no product default" so the env chain (a real route)
    // serves instead of a fixture the researcher can no longer see.
    const storedActive = app.store.getMeta(ACTIVE_MODEL_CONFIG_META_KEY);
    const activeHidden = storedActive !== null && !testDouble
      && (app.store.getObject('model_config', storedActive)?.wire ?? null) === 'offline';
    const activeId = activeHidden ? null : storedActive;
    const configs = listModelConfigsAll()
      .filter((c) => c.wire !== 'offline' || testDouble)
      .map((c) => modelConfigSummary(c, activeId));
    // Effective product-plane default: UI default switch > env chain, with the UI
    // modelId override applied — the panel shows what a call would actually use.
    const envDefaultView = (): { name: string; modelId: string; liveReady: boolean; defaultSource: 'ui' | 'env' } | null => {
      try {
        const { name, source } = builtinDefaultName(app.store);
        const info = listProviders().find((p) => p.name === name);
        return {
          name,
          modelId: builtinModelIdFor(app.store, name) ?? info?.modelId ?? '(unknown)',
          liveReady: info?.liveReady ?? false,
          defaultSource: source,
        };
      } catch {
        return null; // env names an unknown provider — health owns that failure story
      }
    };
    sendJson(res, 200, { configs, activeModelConfigId: activeId, envDefault: envDefaultView() });
  };

  /** Preset provider templates (catalog.ts) — one-click prefills, not a whitelist. */
  const listProviderTemplates = (res: http.ServerResponse): void => {
    sendJson(res, 200, { templates: PROVIDER_TEMPLATES });
  };

  const getModelConfig = (res: http.ServerResponse, id: string): void => {
    assertModelConfigId(id);
    const cfg = mustGetModelConfig(id);
    sendJson(res, 200, { config: modelConfigSummary(cfg, app.store.getMeta(ACTIVE_MODEL_CONFIG_META_KEY)) });
  };

  const invalidConfigMessage = (issues: { path: (string | number)[]; message: string }[]): string =>
    `invalid model config: ${issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`;

  /**
   * wire 'offline' is the IN-PROCESS TEST DOUBLE (providers/test-double.ts): an
   * isolated test fixture that lets automated tests and the browser E2E suite
   * drive the real pipeline without model quota. It is NOT a product route and
   * serves no demonstration or acceptance purpose — a server not started with
   * FARLAB_TEST_DOUBLE=1 (only scripts/serve-e2e.mjs sets it) refuses to create,
   * edit, activate or probe such a config.
   */
  const assertTestDoubleAllowed = (wire: unknown): void => {
    if (wire !== 'offline') return;
    if (process.env.FARLAB_TEST_DOUBLE === '1') return;
    throw validation(
      'wire "offline" is the in-process test double, not a product route: it exists only for automated tests and the browser E2E suite and can be used on a server started with FARLAB_TEST_DOUBLE=1',
    );
  };

  const createModelConfig = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const body = await readJsonObject(req);
    assertTestDoubleAllowed(body.wire);
    const now = new Date().toISOString();
    const parsed = ModelProviderConfig.safeParse({
      id: newId('mcfg'),
      label: body.label,
      wire: body.wire,
      baseUrl: body.baseUrl,
      modelId: body.modelId,
      apiKey: body.apiKey ?? '',
      ...(Array.isArray(body.fallbackConfigIds) ? { fallbackConfigIds: body.fallbackConfigIds } : {}),
      ...(body.pricing !== undefined ? { pricing: body.pricing } : {}),
      ...(body.reasoning !== undefined ? { reasoning: body.reasoning } : {}),
      createdAt: now,
      updatedAt: now,
    });
    if (!parsed.success) throw validation(invalidConfigMessage(parsed.error.issues));
    app.store.putObject('model_config', parsed.data);
    sendJson(res, 201, { config: modelConfigSummary(parsed.data, app.store.getMeta(ACTIVE_MODEL_CONFIG_META_KEY)) });
  };

  const updateModelConfig = async (req: http.IncomingMessage, res: http.ServerResponse, id: string): Promise<void> => {
    assertModelConfigId(id);
    const existing = mustGetModelConfig(id);
    const body = await readJsonObject(req);
    // A test-double config is untouchable off a test-double server — editing is
    // the same product surface as creating it (and is how the double would leak
    // into a researcher's workspace).
    assertTestDoubleAllowed(body.wire ?? existing.wire);
    // apiKey semantics: absent field = keep stored value; present string (even empty) = replace.
    let apiKey: string;
    if (body.apiKey === undefined) {
      apiKey = existing.apiKey;
    } else {
      if (typeof body.apiKey !== 'string') throw validation('field "apiKey" must be a string when present');
      apiKey = body.apiKey;
    }
    const parsed = ModelProviderConfig.safeParse({
      ...existing,
      ...(typeof body.label === 'string' ? { label: body.label } : {}),
      ...(body.wire !== undefined ? { wire: body.wire } : {}),
      ...(typeof body.baseUrl === 'string' ? { baseUrl: body.baseUrl } : {}),
      ...(typeof body.modelId === 'string' ? { modelId: body.modelId } : {}),
      ...(Array.isArray(body.fallbackConfigIds) ? { fallbackConfigIds: body.fallbackConfigIds } : {}),
      ...(body.pricing !== undefined ? { pricing: body.pricing } : {}),
      // Reasoning declaration semantics follow pricing: present = replace (schema
      // validates style/wire compatibility), absent = keep the stored one.
      ...(body.reasoning !== undefined ? { reasoning: body.reasoning } : {}),
      apiKey,
      updatedAt: new Date().toISOString(),
    });
    if (!parsed.success) throw validation(invalidConfigMessage(parsed.error.issues));
    if (parsed.data.fallbackConfigIds.includes(parsed.data.id)) {
      throw validation('a config cannot list itself as its own fallback (direct cycle)');
    }
    app.store.putObject('model_config', parsed.data);
    sendJson(res, 200, { config: modelConfigSummary(parsed.data, app.store.getMeta(ACTIVE_MODEL_CONFIG_META_KEY)) });
  };

  const deleteModelConfig = (res: http.ServerResponse, id: string): void => {
    assertModelConfigId(id);
    const existed = app.store.deleteObject('model_config', id);
    if (!existed) throw notFound(`model config not found: ${id}`);
    // Deleting the active default clears it (falls back to the env chain); runs that
    // reference the deleted config keep their reference and fail closed at call time.
    if (app.store.getMeta(ACTIVE_MODEL_CONFIG_META_KEY) === id) {
      app.store.deleteMeta(ACTIVE_MODEL_CONFIG_META_KEY);
    }
    sendJson(res, 200, { deleted: id });
  };

  const setActiveModelConfig = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const body = await readJsonObject(req);
    if (!('id' in body)) throw validation('field "id" is required (a model config id, or null to clear the default)');
    const id = body.id;
    if (id === null) {
      app.store.deleteMeta(ACTIVE_MODEL_CONFIG_META_KEY);
      sendJson(res, 200, { activeModelConfigId: null });
      return;
    }
    if (typeof id !== 'string') throw validation('field "id" must be a model config id string or null');
    assertModelConfigId(id);
    const cfg = mustGetModelConfig(id);
    assertTestDoubleAllowed(cfg.wire);
    app.store.setMeta(ACTIVE_MODEL_CONFIG_META_KEY, id);
    sendJson(res, 200, { activeModelConfigId: id });
  };

  /** BP-4 usage ledger: workspace-wide receipt-derived usage (tokens; cost only when user-priced). */
  const listWorkspaceUsage = (res: http.ServerResponse): void => {
    sendJson(res, 200, { aggregates: aggregateWorkspaceUsage(app.store) });
  };

  /**
   * BP-4 model discovery: list the models an endpoint serves (GET {base}/models or
   * /v1/models per wire). Accepts a stored configId or a draft {wire, baseUrl, apiKey?}.
   * Failures are honest 502s, never an empty-catalog success.
   */
  const discoverFromModelConfig = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const body = await readJsonObject(req);
    let wire: ProviderWireProtocol;
    let baseUrl: string;
    let apiKey: string;
    if (typeof body.configId === 'string') {
      const stored = mustGetModelConfig(body.configId);
      wire = stored.wire;
      baseUrl = stored.baseUrl;
      apiKey = typeof body.apiKey === 'string' && body.apiKey.length > 0 ? body.apiKey : stored.apiKey;
    } else {
      const parsedWire = ProviderWireProtocol.safeParse(body.wire);
      if (!parsedWire.success || parsedWire.data === 'offline') throw validation('discovery requires a supported model wire and baseUrl, or a stored configId');
      if (typeof body.baseUrl !== 'string' || body.baseUrl.length === 0) throw validation('discovery requires baseUrl');
      wire = parsedWire.data;
      baseUrl = body.baseUrl;
      apiKey = typeof body.apiKey === 'string' ? body.apiKey : '';
    }
    const controller = new AbortController();
    const onClose = (): void => {
      if (!res.writableEnded) controller.abort();
    };
    res.once('close', onClose);
    try {
      const result = await discoverModels({ wire, baseUrl, apiKey, signal: controller.signal }, fetch);
      sendJson(res, 200, result);
    } catch (e) {
      throw new HttpError(502, {
        code: 'provider_unreachable',
        message: `model discovery failed: ${e instanceof Error ? e.message : String(e)}`,
        retryable: true,
      });
    } finally {
      res.off('close', onClose);
    }
  };

  /**
   * Connectivity probe: ONE tiny live call (maxTokens 16) against the given route.
   * Accepts a stored config id (server supplies its key) or an unsaved draft with
   * the key in the body — the form can test before saving.
   */
  const testModelConfig = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const body = await readJsonObject(req);
    let cfg: ModelProviderConfig;
    if (typeof body.configId === 'string') {
      const stored = mustGetModelConfig(body.configId);
      assertTestDoubleAllowed(stored.wire);
      cfg = typeof body.apiKey === 'string' && body.apiKey.length > 0 ? { ...stored, apiKey: body.apiKey } : stored;
    } else {
      assertTestDoubleAllowed(body.wire);
      const now = new Date().toISOString();
      const parsed = ModelProviderConfig.safeParse({
        id: newId('mcfg'), // throwaway identity for this probe only; nothing is persisted
        label: typeof body.label === 'string' && body.label.trim().length > 0 ? body.label : '(draft)',
        wire: body.wire,
        baseUrl: body.baseUrl,
        modelId: body.modelId,
        apiKey: body.apiKey ?? '',
        createdAt: now,
        updatedAt: now,
      });
      if (!parsed.success) throw validation(invalidConfigMessage(parsed.error.issues));
      cfg = parsed.data;
    }
    const provider = createCustomProvider(cfg);
    const result = await provider.structuredCall(
      {
        task: 'model config connectivity test',
        userPayload: { instruction: 'Reply with exactly the JSON object {"ok":true} and nothing else.' },
        outputKind: 'json',
        maxTokens: 16,
        purpose: 'model-config-test',
      },
      (raw) => raw,
    );
    sendJson(res, 200, {
      ok: result.ok,
      modelId: cfg.modelId,
      latencyMs: result.receipt.latencyMs,
      ...(result.ok && result.data !== undefined ? { sample: result.data } : {}),
      ...(!result.ok && result.error !== undefined ? { error: result.error } : {}),
    });
  };

  return async (req, res, url, segments) => {
    const method = req.method ?? 'GET';

    if (segments[2] !== 'model-configs') return false;
    if (segments.length === 3) {
      if (method === 'GET') { listModelConfigs(res); return true; }
      if (method === 'POST') {
        await createModelConfig(req, res);
        return true;
      }
      throw notFound(`method ${method} not allowed for ${url.pathname}`);
    }
    const leaf = segments[3]!;
    if (leaf === 'active' && segments.length === 4 && method === 'PUT') {
      await setActiveModelConfig(req, res);
      return true;
    }
    if (leaf === 'test' && segments.length === 4 && method === 'POST') {
      await testModelConfig(req, res);
      return true;
    }
    if (leaf === 'usage' && segments.length === 4 && method === 'GET') {
      listWorkspaceUsage(res);
      return true;
    }
    if (leaf === 'templates' && segments.length === 4 && method === 'GET') {
      listProviderTemplates(res);
      return true;
    }
    if (leaf === 'spend-limit' && segments.length === 4) {
      if (method === 'GET') {
        sendJson(res, 200, workspaceSpendStatus(app.store));
        return true;
      }
      if (method === 'PUT') {
        const body = await readJsonObject(req);
        const limitUsd = body.limitUsd;
        if (limitUsd !== null && (typeof limitUsd !== 'number' || !Number.isFinite(limitUsd) || limitUsd <= 0)) {
          throw new HttpError(400, { code: 'validation', message: 'field "limitUsd" must be a positive number or null', retryable: false });
        }
        writeSpendLimit(app.store, limitUsd);
        sendJson(res, 200, { ok: true, ...workspaceSpendStatus(app.store) });
        return true;
      }
      throw notFound(`method ${method} not allowed for ${url.pathname}`);
    }
    if (leaf === 'discover' && segments.length === 4 && method === 'POST') {
      await discoverFromModelConfig(req, res);
      return true;
    }
    if (leaf === 'builtin-routes') {
      return false; // owned by routes/builtin-routes.ts (registered before this family)
    }
    if (segments.length === 4) {
      if (method === 'GET') { getModelConfig(res, leaf); return true; }
      if (method === 'PUT') {
        await updateModelConfig(req, res, leaf);
        return true;
      }
      if (method === 'DELETE') { deleteModelConfig(res, leaf); return true; }
    }
    return false; // family fallthrough: the composer 404s with the identical envelope
  };
}
