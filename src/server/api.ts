import http from 'node:http';
import path from 'node:path';
import type { App } from '../app/composition.js';
import { RunLeaseHeldError } from '../app/orchestrator.js';
import { pruneAdoptionBackoff } from './adoption-backoff.js';
import type { ConversationDeps } from './conversations.js';
import { startAutomationEngine, type AutomationEngine } from './automations.js';
import { ConversationTurnHub } from './conversation-stream.js';
import { TerminalManager } from './terminal.js';
import type { RunStageName } from '../domain/run.js';
import {
  HttpError,
  decodeSegments,
  internal,
  notFound,
  sendError,
  validation,
  type RouteCtx,
  type RouteFamily,
} from './http-kit.js';
import { serveStatic } from './static-files.js';
import { createRunWithSeeds as createRunWithSeedsCore } from './run-launch.js';
import { registerIngestRoutes } from './routes/ingest.js';
import { registerLibraryRoutes } from './routes/library.js';
import { registerScienceRoutes } from './routes/science.js';
import { registerTerminalRoutes } from './routes/terminal.js';
import { registerToolsRoutes } from './routes/tools.js';
import { registerBuiltinRoutesRoutes } from './routes/builtin-routes.js';
import { registerModelConfigsRoutes } from './routes/model-configs.js';
import { registerRunsRoutes } from './routes/runs.js';
import { registerRunsLifecycleRoutes } from './routes/runs-lifecycle.js';
import { registerRunsOpsRoutes } from './routes/runs-ops.js';
import { registerRunsScienceRoutes } from './routes/runs-science.js';
import { registerRunsExportRoutes } from './routes/runs-export.js';
import { registerConversationsRoutes } from './routes/conversations.js';
import { registerZoteroRoutes } from './routes/zotero.js';
import { registerAutomationsRoutes } from './routes/automations.js';
import { registerAgentPolicyRoutes } from './routes/agent-policy.js';
import { registerCompetitionRouteRoutes } from './routes/competition-route.js';
import { registerSystemRoutes } from './routes/system.js';
import { registerMemoryRoutes } from './routes/memory.js';

/**
 * Versioned HTTP API over the single application kernel (zero framework: native http +
 * hand-rolled routing, matching the workspace's zero-dependency style). Long-running runs
 * follow the create-and-poll model: POST returns 202 immediately, progress is observable
 * via GET /runs/:id and the append-only event stream — no fake progress, no SSE.
 *
 * Semantics mirror the CLI exactly (src/cli/main.ts is the behavioral reference):
 * feedback validation, cancel, resume and report retrieval use the same domain rules.
 * Errors always use the shared envelope: {error:{code, message, retryable, runId?}}.
 */

export type { ApiServerError } from './http-kit.js';

export interface ApiServerOptions {
  port?: number;
  host?: string;
  /**
   * Test seam (NOT a product mock): injected run execution. Product default is
   * orchestrator.execute; tests inject an immediately-resolving executor so the
   * HTTP layer is exercised without live model/source routes. opts carries the
   * §8.2 draft journey's stopAfter (scope-proposal runs scope only).
   */
  executor?: (runId: string, opts?: { stopAfter?: RunStageName }) => Promise<unknown>;
  /**
   * Test seam (NOT a product mock): per-family source-adapter resolver for the
   * counter-search route. Product default is the canonical sourceAdapterFor;
   * tests inject fakes so the HTTP layer is exercised without live source routes.
   */
  counterSearchSourceFor?: (family: import('../domain/source.js').SourceFamily) => import('../shared/ports.js').SourceAdapter;
  /** Static root served when present (SPA fallback to index.html). Default: <cwd>/web/dist. */
  staticRoot?: string;
  /**
   * W8 S1 frozen-run watchdog: poll interval (ms) for runs stuck status='running' with
   * an expired lease; detected runs are adopted (re-executed — resume semantics skip
   * done stages and checkpointed subtasks). Default 30_000; 0 disables. Runs inside
   * this server process (no new service).
   */
  watchdogIntervalMs?: number;
  /**
   * Resident-agent automations (R3): when enabled, the in-process engine fires
   * approved agent tasks on schedule / on run completion into their
   * conversations. Default off (tests drive the engine directly); the
   * production entrypoint enables it.
   */
  automations?: { enabled?: boolean; tickMs?: number };
}

export interface ApiServer {
  server: http.Server;
  start(): Promise<number>;
  stop(): Promise<void>;
}

export function createApiServer(app: App, opts: ApiServerOptions = {}): ApiServer {
  const executor = opts.executor ?? ((runId: string, execOpts?: { stopAfter?: RunStageName }) => app.orchestrator.execute(runId, execOpts));
  const staticRoot = path.resolve(opts.staticRoot ?? path.join(process.cwd(), 'web', 'dist'));

  /** One in-flight execution per run id; a second request fails with 409 semantics. */
  const executing = new Map<string, Promise<unknown>>();

  const startRun = (runId: string, execOpts?: { stopAfter?: RunStageName }): boolean => {
    if (executing.has(runId)) return false;
    const run = Promise.resolve()
      .then(() => executor(runId, execOpts))
      .catch((e: unknown) => {
        // Stage failures are persisted by the orchestrator into run state (visible via
        // GET /runs/:id). A throw here means the execution itself never ran — log it,
        // and for the lease-held case also persist a run event: the 202 already went
        // out, so the run timeline is the only place this refusal is observable.
        const msg = e instanceof Error ? e.message : String(e);
        process.stderr.write(`far-api: execution of run ${runId} failed: ${msg}\n`);
        if (e instanceof RunLeaseHeldError) {
          app.store.appendEvent(runId, { type: 'note', detail: { reason: 'execution_refused_lease_held', error: msg } });
        }
        return undefined;
      })
      .finally(() => {
        executing.delete(runId);
      });
    executing.set(runId, run);
    return true;
  };

  // W8 S1 watchdog: frozen runs (status='running', lease expired) are detected within one
  // poll cycle and adopted — execute() reclaims the expired lease and resume semantics
  // (stage skip + step checkpoints) continue the run instead of abandoning paid work.
  // An in-memory per-run backoff prevents a hot adoption loop when an adopted run keeps
  // failing fast (dbos recovery_attempts pattern, embedded form).
  const watchdogIntervalMs = opts.watchdogIntervalMs ?? 30_000;
  const adoptionBackoffMs = Math.max(watchdogIntervalMs * 10, 60_000);
  const lastAdoptedAt = new Map<string, number>();
  let watchdogTimer: NodeJS.Timeout | null = null;
  let automationEngine: AutomationEngine | null = null;
  // Terminal sessions (extensibility lane): persistent login shells behind
  // /api/v1/terminal/* — loopback workbench surface, FARLAB_TERMINAL=off kills it.
  const terminals = new TerminalManager();
  // Conversation generation outlives any one browser connection. The hub keeps
  // a bounded seq replay so refresh/reconnect resumes the real provider stream;
  // disconnect alone never cancels paid work.
  const conversationTurns = new ConversationTurnHub(
    (conversationId) => app.store.getObject('conversation', conversationId),
  );
  // Sweep-health visibility (WP2 F-007): a persistent store error would otherwise
  // silently stop adoptions forever with only a stderr line — /health reports it.
  let consecutiveSweepFailures = 0;
  const sweepExpiredLeases = (): void => {
    try {
      const now = Date.now();
      const stales = app.store.listExpiredLeaseRuns(new Date().toISOString());
      // LOG-004: backoff entries for runs that left the expired-lease set are
      // stale (terminal state or restore) — prune them so the map stays bounded
      // by the live expired-run population, not the server's lifetime.
      pruneAdoptionBackoff(lastAdoptedAt, new Set(stales.map((s) => s.id)), now, adoptionBackoffMs);
      for (const stale of stales) {
        if (executing.has(stale.id)) continue;
        // Parking-intent guard: a run tagged 'parking:*' is a deliberately-stopped
        // draft (scope proposal / CLI --stop-after) whose worker died before parking.
        // Adoption would run the FULL pipeline behind the user's back — the exact
        // harm the park-on-stopAfter fix closes for the non-crash path. The tag is
        // cleared by the park transition or by a user-initiated resume.
        if (stale.tags.some((t) => t.startsWith('parking:'))) continue;
        const last = lastAdoptedAt.get(stale.id) ?? 0;
        if (now - last < adoptionBackoffMs) continue;
        lastAdoptedAt.set(stale.id, now);
        app.store.appendEvent(stale.id, {
          type: 'note',
          detail: { reason: 'watchdog_adoption', holder: stale.leaseHolder ?? null, stage: stale.currentStage },
        });
        startRun(stale.id);
      }
      consecutiveSweepFailures = 0; // reset only AFTER a fully successful sweep
    } catch (e) {
      // The watchdog must never take the server down (audit P2-2): a transient store
      // error (e.g. SQLITE_BUSY beyond busy_timeout) is logged and retried next cycle.
      consecutiveSweepFailures += 1;
      if (consecutiveSweepFailures >= 3) {
        process.stderr.write(`far-api: lease sweep DEGRADED (${consecutiveSweepFailures} consecutive failures) — frozen-run adoption is stalled\n`);
      } else {
        process.stderr.write(`far-api: lease sweep failed: ${e instanceof Error ? e.message : String(e)}\n`);
      }
    }
  };
  if (watchdogIntervalMs > 0) {
    watchdogTimer = setInterval(sweepExpiredLeases, watchdogIntervalMs);
    watchdogTimer.unref();
  }

  // ---- run lookups ----

  const mustGetRun = (runId: string) => {
    const run = app.store.getRun(runId);
    if (!run) throw notFound(`run not found: ${runId}`, runId);
    return run;
  };

  // Shared run-creation core moved to run-launch.ts (BC-002 single owner).
  const createRunWithSeeds = (body: Record<string, unknown>): Promise<string> =>
    createRunWithSeedsCore(app, startRun, body);

  // Resident-agent action bridge: approved conversation proposals launch runs
  // through the SAME creation path as POST /runs and the manual launch route.
  const conversationDeps: ConversationDeps = {
    createRun: (input) => createRunWithSeeds({
      text: input.text,
      ...(input.providerConfigId !== undefined ? { providerConfigId: input.providerConfigId } : {}),
      seeds: input.seeds,
    }),
  };

  // Automations engine starts here (after its createRun bridge exists). Tests
  // leave it off and drive the engine directly; the production entry enables it.
  if (opts.automations?.enabled === true && conversationDeps.createRun !== undefined) {
    automationEngine = startAutomationEngine(app, {
      createRun: conversationDeps.createRun,
      ...(opts.automations.tickMs !== undefined ? { tickMs: opts.automations.tickMs } : {}),
    });
  }

  // Shared per-server context for every route family (BC-002): the composer in
  // route() hands each registrar this object; families never reach back into
  // private server state.
  const ctx: RouteCtx = {
    app,
    executor,
    executing,
    startRun,
    mustGetRun,
    terminals,
    conversationTurns,
    conversationDeps,
    createRunWithSeeds,
    consecutiveSweepFailures: () => consecutiveSweepFailures,
    ...(opts.counterSearchSourceFor !== undefined ? { counterSearchSourceFor: opts.counterSearchSourceFor } : {}),
  };

  const families: RouteFamily[] = [
    registerIngestRoutes(ctx),
    registerLibraryRoutes(ctx),
    registerScienceRoutes(ctx),
    registerTerminalRoutes(ctx),
    registerToolsRoutes(ctx),
    // Same-prefix pair: builtin-routes must be tried before the generic
    // model-configs /:id branch (see its module doc).
    registerBuiltinRoutesRoutes(ctx),
    registerModelConfigsRoutes(ctx),
    registerRunsRoutes(ctx),
    registerRunsLifecycleRoutes(ctx),
    registerRunsOpsRoutes(ctx),
    registerRunsScienceRoutes(ctx),
    registerRunsExportRoutes(ctx),
    registerConversationsRoutes(ctx),
    registerZoteroRoutes(ctx),
    registerAutomationsRoutes(ctx),
    registerAgentPolicyRoutes(ctx),
    registerCompetitionRouteRoutes(ctx),
    registerSystemRoutes(ctx),
    registerMemoryRoutes(ctx),
  ];
  // ---- router ----

  const route = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
    segments: string[],
  ): Promise<void> => {
    const method = req.method ?? 'GET';

    // static / hint surface (non-/api paths)
    if (segments[0] !== 'api') {
      if (method === 'GET' || method === 'HEAD') {
        serveStatic(req, res, staticRoot, method, url.pathname, method === 'HEAD');
        return;
      }
      throw notFound(`no route: ${method} ${url.pathname}`);
    }
    if (segments[1] !== 'v1') throw notFound(`no route: ${method} ${url.pathname}`);
    // Route families (BC-002): composed in registration order; a family returns
    // false when the path is not its own, and the composer owns the fallthrough
    // 404 with the shared envelope. Family order is behavior-neutral: every
    // family guards on a distinct segments[2] prefix (the sole same-prefix pair,
    // builtin-routes under model-configs, keeps its registration order).
    for (const family of families) {
      if (await family(req, res, url, segments)) return;
    }
    throw notFound(`no route: ${method} ${url.pathname}`);
  };

  const effectivePort = opts.port ?? Number(process.env.PORT ?? 8787);
  // Actual bound port (differs from effectivePort when ephemeral port 0 is used, e.g. tests).
  let boundPort: number | null = null;
  const effectiveHost = String(opts.host ?? process.env.HOST ?? '127.0.0.1');
  const server = http.createServer((req, res) => {
    void (async () => {
      try {
        const parsed = new URL(req.url ?? '/', 'http://localhost');
        // F-1 guard (security audit): reject cross-origin/DNS-rebinding requests.
        // This is a local single-user tool: only the loopback origin may drive it.
        const host = String(req.headers.host ?? '').toLowerCase();
        const okPort = boundPort ?? effectivePort;
        const hostOk = host === `127.0.0.1:${okPort}` || host === `localhost:${okPort}` || host === `[::1]:${okPort}`;
        if (!hostOk) throw validation(`unrecognized Host header: only loopback origins may use this API`);
        const origin = req.headers.origin;
        if (origin !== undefined && !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(String(origin))) {
          throw validation(`cross-origin request rejected`);
        }
        // State-changing verbs WITH A BODY must be JSON — blocks HTML/form-content CSRF
        // even without CORS preflight. Bodyless requests fall through to normal routing
        // (404 for unknown routes stays a 404, not a 400).
        const hasBody = (Number(req.headers['content-length'] ?? 0) > 0) || req.headers['transfer-encoding'] !== undefined;
        if (hasBody && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method ?? '') && !(req.headers['content-type'] ?? '').toLowerCase().includes('application/json')) {
          throw validation(`content-type must be application/json for ${req.method}`);
        }
        const segments = decodeSegments(parsed.pathname);
        if (segments === null) throw validation(`malformed path encoding: ${parsed.pathname}`);
        await route(req, res, parsed, segments);
      } catch (e) {
        const err =
          e instanceof HttpError
            ? e
            : internal(`unexpected server error: ${e instanceof Error ? e.message : String(e)}`);
        if (!res.headersSent) {
          sendError(res, err);
        } else {
          res.end();
        }
      }
    })().catch((err: unknown) => {
      // Last-resort rejection handler (WP2 F-002): the catch above covers route errors,
      // but a failure inside the error path itself (sendError after a socket reset)
      // would otherwise surface as an unhandled rejection and crash the process.
      process.stderr.write(`far-api: unhandled rejection in request handler: ${err instanceof Error ? err.message : String(err)}\n`);
      try {
        if (!res.writableEnded) res.end();
      } catch {
        /* socket already destroyed */
      }
    });
  });
  server.on('clientError', (_err, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });

  const start = (): Promise<number> =>
    new Promise((resolve, reject) => {
      const port = effectivePort;
      const host = effectiveHost;
      const onError = (e: NodeJS.ErrnoException) => reject(e);
      server.once('error', onError);
      server.listen(port, host, () => {
        server.off('error', onError);
        const addr = server.address();
        const actual = typeof addr === 'object' && addr !== null ? addr.port : port;
        boundPort = actual;
        resolve(actual);
      });
    });

  const stop = (): Promise<void> =>
    new Promise((resolve) => {
      if (watchdogTimer !== null) clearInterval(watchdogTimer);
      automationEngine?.stop();
      conversationTurns.close();
      terminals.closeAll();
      server.close(() => resolve());
      server.closeIdleConnections();
      server.closeAllConnections();
    });

  return { server, start, stop };
}
