import { listProviders, LIVE_PROVIDER_NAMES } from '../../providers/index.js';
import {
  BuiltinRoutePrice, builtinDefaultName, envModelIdFor, readBuiltinOverrides, setBuiltinDefaultName, writeBuiltinOverrides,
} from '../../providers/builtin-overrides.js';
import { notFound, readJsonObject, sendJson, validation, type RouteCtx, type RouteFamily } from '../http-kit.js';

/** Built-in env routes family (BC-002): zai/dashscope product-layer overrides.
 *  The env chain itself stays untouched; these endpoints manage the UI-declared
 *  modelId override, list pricing and the default-route switch on top of it.
 *  Registered BEFORE the model-configs family — same segments[2] prefix, and the
 *  builtin-routes leaf must not fall into the generic config-id branch. */

export function registerBuiltinRoutesRoutes(ctx: RouteCtx): RouteFamily {
  const app = ctx.app;

  const builtinRoutesView = () => {
    const overrides = readBuiltinOverrides(app.store);
    const def = builtinDefaultName(app.store);
    return listProviders()
      .filter((p) => p.kind !== 'test') // the scripted stub is not a route
      .map((p) => {
        const override = p.kind === 'live' ? overrides[p.name as keyof typeof overrides] : undefined;
        const envModel = envModelIdFor(p.name);
        return {
          name: p.name,
          kind: p.kind, // 'live' | 'test'
          liveReady: p.liveReady,
          baseUrl: p.baseUrl,
          apiKeyEnvVar: p.apiKeyEnvVar,
          envModelId: envModel,
          effectiveModelId: override?.modelId ?? envModel,
          pricing: override?.pricing,
          isBuiltinDefault: p.name === def.name,
        };
      });
  };

  const listBuiltinRoutes = (res: Parameters<typeof sendJson>[0]): void => {
    sendJson(res, 200, {
      routes: builtinRoutesView(),
      defaultSource: builtinDefaultName(app.store).source,
    });
  };

  const assertLiveBuiltinRoute = (name: string): void => {
    if (!(LIVE_PROVIDER_NAMES as readonly string[]).includes(name)) {
      throw validation(`unknown or non-editable built-in route: ${name} (live routes: ${LIVE_PROVIDER_NAMES.join(', ')})`);
    }
  };

  const updateBuiltinRoute = async (req: Parameters<typeof readJsonObject>[0], res: Parameters<typeof sendJson>[0], name: string): Promise<void> => {
    assertLiveBuiltinRoute(name);
    const body = await readJsonObject(req);
    const overrides = readBuiltinOverrides(app.store);
    const next: Record<string, unknown> = { ...(overrides[name as keyof typeof overrides] ?? {}) };
    // modelId: string = override; null or '' = clear back to env/default selection.
    if (body.modelId !== undefined) {
      if (body.modelId === null || body.modelId === '') delete next.modelId;
      else if (typeof body.modelId === 'string') next.modelId = body.modelId;
      else throw validation('field "modelId" must be a non-empty string or null');
    }
    // pricing: object = declare real list prices; null = clear (cost falls back to unknown).
    if (body.pricing !== undefined) {
      if (body.pricing === null) {
        delete next.pricing;
      } else {
        const parsed = BuiltinRoutePrice.safeParse(body.pricing);
        if (!parsed.success) throw validation(`invalid pricing: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
        next.pricing = parsed.data;
      }
    }
    if (Object.keys(body).some((k) => k !== 'modelId' && k !== 'pricing')) {
      throw validation('only "modelId" and "pricing" are editable on a built-in route (wire/baseUrl/key come from the env layer)');
    }
    try {
      writeBuiltinOverrides(app.store, { ...overrides, [name]: next });
    } catch (e) {
      throw validation(e instanceof Error ? e.message : String(e));
    }
    sendJson(res, 200, { routes: builtinRoutesView(), defaultSource: builtinDefaultName(app.store).source });
  };

  const setBuiltinDefaultRoute = async (req: Parameters<typeof readJsonObject>[0], res: Parameters<typeof sendJson>[0]): Promise<void> => {
    const body = await readJsonObject(req);
    if (body.name === null) {
      setBuiltinDefaultName(app.store, null);
      sendJson(res, 200, { routes: builtinRoutesView(), defaultSource: builtinDefaultName(app.store).source });
      return;
    }
    if (typeof body.name !== 'string' || body.name.length === 0) {
      throw validation('field "name" is required (a live built-in route name, or null to fall back to the env chain)');
    }
    assertLiveBuiltinRoute(body.name);
    setBuiltinDefaultName(app.store, body.name);
    sendJson(res, 200, { routes: builtinRoutesView(), defaultSource: 'ui' });
  };

  return async (req, res, url, segments) => {
    const method = req.method ?? 'GET';

    if (!(segments[2] === 'model-configs' && segments[3] === 'builtin-routes')) return false;
    if (segments.length === 4) {
      if (method === 'GET') { listBuiltinRoutes(res); return true; }
      if (method === 'PUT') {
        await setBuiltinDefaultRoute(req, res);
        return true;
      }
      throw notFound(`method ${method} not allowed for ${url.pathname}`);
    }
    if (segments.length === 5 && method === 'PUT') {
      await updateBuiltinRoute(req, res, segments[4]!);
      return true;
    }
    return false; // family fallthrough: the composer 404s with the identical envelope
  };
}
