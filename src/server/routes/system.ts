import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyBundle } from '../../app/verify.js';
import { listProviders } from '../../providers/index.js';
import { ACTIVE_MODEL_CONFIG_META_KEY } from '../../app/provider-resolver.js';
import { maskApiKey } from '../../domain/index.js';
import { sendJson, validation, type RouteCtx, type RouteFamily } from '../http-kit.js';

/** System family (BC-002): health / meta / search / verify — the honest-status surface. */

export function registerSystemRoutes(ctx: RouteCtx): RouteFamily {
  const app = ctx.app;

  // Re-audit fix (final blind-spot #4): the audit chain was write-only —
  // verifyEventChain had no production caller. Verified lazily ONCE per server
  // process (O(total events), sub-second at workspace scale) and surfaced in /health.
  let auditChainCache: { ok: boolean; brokenRuns: string[]; verifiedAt: string } | null = null;
  const auditChainStatus = (): { ok: boolean; brokenRuns: string[]; verifiedAt: string } => {
    if (auditChainCache === null) {
      const broken: string[] = [];
      for (const r of app.store.listRuns(500)) {
        const v = app.store.verifyEventChain(r.id);
        if (!v.ok) broken.push(r.id);
      }
      auditChainCache = { ok: broken.length === 0, brokenRuns: broken, verifiedAt: new Date().toISOString() };
    }
    return auditChainCache;
  };

  const health = (res: http.ServerResponse): void => {
    const providers = listProviders().map((p) => ({ name: p.name, kind: p.kind, liveReady: p.liveReady }));
    // B12-G1: the health strip must reflect the ACTIVE route — when the user's
    // active default is a CUSTOM config, the env-route list alone misrepresents
    // readiness. Project the active route (masked key, never the value).
    const activeConfigId = app.store.getMeta(ACTIVE_MODEL_CONFIG_META_KEY);
    let activeRoute: Record<string, unknown> | null = null;
    if (typeof activeConfigId === 'string' && activeConfigId.length > 0) {
      const cfg = app.store.getObject('model_config', activeConfigId);
      if (cfg !== null) {
        activeRoute = {
          id: cfg.id, label: cfg.label, wire: cfg.wire, baseUrl: cfg.baseUrl,
          modelId: cfg.modelId, apiKeySet: cfg.apiKey.length > 0, apiKeyMasked: maskApiKey(cfg.apiKey),
        };
      }
    }
    const watchdog = ctx.consecutiveSweepFailures() === 0
      ? 'ok'
      : `degraded (${ctx.consecutiveSweepFailures()} consecutive sweep failures — frozen-run adoption stalled)`;
    try {
      app.store.listRuns();
      sendJson(res, 200, {
        status: 'ok',
        db: 'ok',
        auditChain: auditChainStatus(),
        watchdog,
        providers,
        ...(activeRoute !== null ? { activeRoute } : {}),
        gitCommit: process.env.FARLAB_GIT_COMMIT ?? null,
        time: new Date().toISOString(),
      });
    } catch (e) {
      sendJson(res, 503, {
        status: 'degraded',
        db: 'error',
        watchdog,
        detail: e instanceof Error ? e.message : String(e),
        providers,
        ...(activeRoute !== null ? { activeRoute } : {}),
        gitCommit: process.env.FARLAB_GIT_COMMIT ?? null,
        time: new Date().toISOString(),
      });
    }
  };

  /** B2 universal search: cross-run lookup by researcher-meaningful text (question/hypothesis/claim). */
  const search = (res: http.ServerResponse, url: URL): void => {
    const q = (url.searchParams.get('q') ?? '').trim();
    if (q.length < 2 || q.length > 200) {
      throw validation(`query length must be 2-200 chars (got ${q.length})`);
    }
    const clamp = (raw: string | null, dflt: number, max: number): number => {
      const n = Number.parseInt(raw ?? '', 10);
      return Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : dflt;
    };
    const result = app.store.searchText(q, {
      questions: clamp(url.searchParams.get('questions'), 8, 25),
      hypotheses: clamp(url.searchParams.get('hypotheses'), 8, 25),
      claims: clamp(url.searchParams.get('claims'), 8, 25),
      conversations: clamp(url.searchParams.get('conversations'), 5, 25),
    });
    sendJson(res, 200, { query: q, ...result });
  };

  const verify = async (res: http.ServerResponse, bundleId: string): Promise<void> => {
    // verifyBundle is fail-closed by design: a missing bundle yields a report with
    // verdict 'failed' (all checks passed=false) — the report itself is the answer.
    const report = await verifyBundle(bundleId, { store: app.store, artifacts: app.artifacts });
    // Trust surface (S2b): the bundle's own declared reproduction limits ride with
    // the report — "what this bundle cannot reproduce" is part of the verdict.
    const bundle = app.store.getObject('bundle', bundleId);
    const limitations = bundle?.limitations.filter((l) => l.trim().length > 0) ?? [];
    sendJson(res, 200, { ...report, ...(limitations.length > 0 ? { limitations } : {}) });
  };

  return async (_req, res, url, segments) => {
    const method = _req.method ?? 'GET';

    if (segments[2] === 'health' && segments.length === 3 && method === 'GET') {
      health(res);
      return true;
    }

    if (segments[2] === 'meta' && segments.length === 3 && method === 'GET') {
      // Server/workspace facts for the settings About section: version + data
      // location. Env var NAMES and paths only — secret values never leave.
      let version = 'unknown';
      try {
        const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'package.json');
        version = String(JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version ?? 'unknown');
      } catch {
        // honest unknown — never fabricate a version
      }
      sendJson(res, 200, { version, dataDir: app.dataDir });
      return true;
    }

    if (segments[2] === 'search' && segments.length === 3 && method === 'GET') {
      search(res, url);
      return true;
    }

    if (segments[2] === 'verify' && segments.length === 4 && method === 'GET') {
      await verify(res, segments[3]!);
      return true;
    }

    return false; // family fallthrough: the composer 404s with the identical envelope
  };
}
