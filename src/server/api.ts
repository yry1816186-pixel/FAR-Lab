import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { App } from '../app/composition.js';
import { verifyBundle } from '../app/verify.js';
import {
  FeedbackSignal,
  FeedbackSourceKind,
  ObjectRef,
  ResearchQuestion,
  ScientificGoalType,
  newId,
  runProgress,
} from '../domain/index.js';
import type { FeedbackSourceKind as FeedbackSource } from '../domain/index.js';

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

export interface ApiServerError {
  code: 'not_found' | 'validation' | 'already_running' | 'internal';
  message: string;
  retryable: boolean;
  runId?: string;
}

export interface ApiServerOptions {
  port?: number;
  host?: string;
  /**
   * Test seam (NOT a product mock): injected run execution. Product default is
   * orchestrator.execute; tests inject an immediately-resolving executor so the
   * HTTP layer is exercised without live model/source routes.
   */
  executor?: (runId: string) => Promise<unknown>;
  /** Static root served when present (SPA fallback to index.html). Default: <cwd>/web/dist. */
  staticRoot?: string;
}

export interface ApiServer {
  server: http.Server;
  start(): Promise<number>;
  stop(): Promise<void>;
}

const MAX_BODY_BYTES = 1_000_000;

const MIME_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  woff: 'font/woff',
  woff2: 'font/woff2',
  wasm: 'application/wasm',
};

/** Kinds that a feedback target may reference AND that we can existence-check in the store. */
const TARGET_STORE_KINDS = {
  hypothesis: 'hypothesis',
  plan: 'plan',
  claim: 'claim',
  question: 'question',
} as const;

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly payload: ApiServerError,
  ) {
    super(payload.message);
  }
}

const notFound = (message: string, runId?: string): HttpError =>
  new HttpError(404, {
    code: 'not_found',
    message,
    retryable: false,
    ...(runId !== undefined ? { runId } : {}),
  });

const validation = (message: string): HttpError =>
  new HttpError(400, { code: 'validation', message, retryable: false });

const alreadyRunning = (runId: string): HttpError =>
  new HttpError(409, {
    code: 'already_running',
    message: `run ${runId} is already executing in this server — one execution per run; poll GET /api/v1/runs/${runId} instead`,
    retryable: false,
    runId,
  });

const internal = (message: string): HttpError =>
  new HttpError(500, { code: 'internal', message, retryable: true });

/** Split a pathname into decoded segments; null when any segment is malformed. */
const decodeSegments = (pathname: string): string[] | null => {
  const out: string[] = [];
  for (const seg of pathname.split('/')) {
    if (seg === '') continue;
    try {
      out.push(decodeURIComponent(seg));
    } catch {
      return null;
    }
  }
  return out;
};

/**
 * Safe static path resolution. Returns 'unsafe' for traversal/absolute/encoded-separator
 * attempts (must 404, never silently fall back), a resolved absolute path when the target
 * is a file inside the root, or null for a safe path that is not a file (SPA-fallback
 * candidate).
 */
const safeStaticFile = (staticRoot: string, pathname: string): string | 'unsafe' | null => {
  const segments = decodeSegments(pathname);
  if (segments === null) return 'unsafe';
  for (const seg of segments) {
    if (seg === '..' || seg.includes('/') || seg.includes('\\') || seg.includes('\0') || /:/.test(seg)) return 'unsafe';
  }
  const abs = path.resolve(staticRoot, ...segments);
  if (abs !== staticRoot && !abs.startsWith(staticRoot + path.sep)) return 'unsafe';
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  return null;
};

const mimeFor = (file: string): string =>
  MIME_TYPES[path.extname(file).slice(1).toLowerCase()] ?? 'application/octet-stream';

export function createApiServer(app: App, opts: ApiServerOptions = {}): ApiServer {
  const executor = opts.executor ?? ((runId: string) => app.orchestrator.execute(runId));
  const staticRoot = path.resolve(opts.staticRoot ?? path.join(process.cwd(), 'web', 'dist'));

  /** One in-flight execution per run id; a second request fails with 409 semantics. */
  const executing = new Map<string, Promise<unknown>>();

  const startRun = (runId: string): boolean => {
    if (executing.has(runId)) return false;
    const run = Promise.resolve()
      .then(() => executor(runId))
      .catch((e: unknown) => {
        // Stage failures are persisted by the orchestrator into run state (visible via
        // GET /runs/:id). A throw here means the execution itself never ran — log it.
        const msg = e instanceof Error ? e.message : String(e);
        process.stderr.write(`far-api: execution of run ${runId} failed: ${msg}\n`);
        return undefined;
      })
      .finally(() => {
        executing.delete(runId);
      });
    executing.set(runId, run);
    return true;
  };

  // ---- response helpers ----

  const sendJson = (res: http.ServerResponse, status: number, body: unknown): void => {
    if (res.writableEnded) return;
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
  };

  const sendError = (res: http.ServerResponse, err: HttpError): void =>
    sendJson(res, err.status, { error: err.payload });

  const sendText = (res: http.ServerResponse, status: number, contentType: string, body: string): void => {
    if (res.writableEnded) return;
    res.writeHead(status, {
      'Content-Type': contentType,
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  };

  // ---- request body (cap 1MB, drain-and-reject on overflow) ----

  const readBody = (req: http.IncomingMessage): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let received = 0;
      let overflowed = false;
      req.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (received > MAX_BODY_BYTES) {
          overflowed = true;
          chunks.length = 0; // stop buffering but keep draining so the response is deliverable
          return;
        }
        if (!overflowed) chunks.push(chunk);
      });
      req.on('end', () => {
        if (overflowed) {
          reject(validation(`request body exceeds the ${MAX_BODY_BYTES}-byte limit`));
        } else {
          resolve(Buffer.concat(chunks));
        }
      });
      req.on('error', (e: Error) => reject(validation(`request body read failed: ${e.message}`)));
    });

  const readJsonObject = async (req: http.IncomingMessage): Promise<Record<string, unknown>> => {
    const body = (await readBody(req)).toString('utf8');
    if (body.trim().length === 0) throw validation('request body required: a JSON object');
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch (e) {
      throw validation(`request body is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw validation('request body must be a JSON object');
    }
    return parsed as Record<string, unknown>;
  };

  // ---- run lookups ----

  const mustGetRun = (runId: string) => {
    const run = app.store.getRun(runId);
    if (!run) throw notFound(`run not found: ${runId}`, runId);
    return run;
  };

  /** Whether a revision landed after the newest bundle (the export stage's own re-export rule). */
  const revisionNewerThanBundle = (runId: string): boolean => {
    const latestBundle = app.store.listObjects('bundle', runId).at(-1);
    if (!latestBundle) return false;
    return app.store.listObjects('revision', runId).some((r) => r.createdAt > latestBundle.createdAt);
  };

  // ---- API route handlers ----

  const listRuns = (res: http.ServerResponse): void => {
    const runs = app.store.listRuns().map((row) => {
      const run = app.store.getRun(row.id);
      const p = run ? runProgress(run) : null;
      return {
        id: row.id,
        status: row.status,
        currentStage: row.currentStage,
        createdAt: row.createdAt,
        ...(run?.lastError !== undefined ? { lastError: run.lastError } : {}),
        ...(p?.known ? { progress: { done: p.done, total: p.total } } : {}),
      };
    });
    sendJson(res, 200, { runs });
  };

  const createRun = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const body = await readJsonObject(req);
    const { text, domain, goalType } = body as { text?: unknown; domain?: unknown; goalType?: unknown };
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw validation('field "text" is required (non-empty string: the research question)');
    }
    const dom = domain === undefined ? 'unspecified' : domain;
    if (typeof dom !== 'string' || dom.trim().length === 0) {
      throw validation('field "domain" must be a non-empty string when given');
    }
    const goal = goalType === undefined ? 'explanatory' : goalType;
    const parsedGoal = ScientificGoalType.safeParse(goal);
    if (!parsedGoal.success) {
      throw validation(`invalid goalType "${String(goal)}" — must be one of: ${ScientificGoalType.options.join(', ')}`);
    }
    const question = ResearchQuestion.parse({
      id: newId('q'),
      text,
      background: '',
      goalType: parsedGoal.data,
      scope: { domain: dom, phenomena: [text] },
      constraints: {},
      createdAt: new Date().toISOString(),
    });
    const run = app.store.createRun(question);
    startRun(run.id); // async execution — the 202 returns immediately; failures land in run state
    sendJson(res, 202, { runId: run.id });
  };

  const runDetail = (res: http.ServerResponse, runId: string): void => {
    sendJson(res, 200, mustGetRun(runId));
  };

  const runEvents = (res: http.ServerResponse, runId: string, url: URL): void => {
    mustGetRun(runId);
    const raw = url.searchParams.get('afterSeq');
    let afterSeq = 0;
    if (raw !== null) {
      if (!/^\d+$/.test(raw) || Number(raw) > Number.MAX_SAFE_INTEGER) {
        throw validation('query "afterSeq" must be a non-negative integer');
      }
      afterSeq = Number(raw);
    }
    const events = app.store.listEvents(runId).filter((e) => e.seq > afterSeq);
    sendJson(res, 200, { events });
  };

  const runQuestion = (res: http.ServerResponse, runId: string): void => {
    const run = mustGetRun(runId);
    const question = app.store.getObject('question', run.questionId);
    if (!question) throw notFound(`question not found for run ${runId}: ${run.questionId}`, runId);
    sendJson(res, 200, question);
  };

  const runReport = async (res: http.ServerResponse, runId: string): Promise<void> => {
    mustGetRun(runId);
    const latestBundle = app.store.listObjects('bundle', runId).at(-1);
    if (!latestBundle) {
      throw notFound(`no bundle stored for run ${runId} — the export stage has not produced one yet`, runId);
    }
    const reportHash = latestBundle.finalArtifactHashes[0];
    if (!reportHash) {
      throw notFound(`latest bundle ${latestBundle.id} has no report artifact hash`, runId);
    }
    const content = await app.artifacts.get(reportHash);
    if (content === null) {
      throw notFound(`report artifact missing in artifact store (${reportHash.slice(0, 16)}…)`, runId);
    }
    sendText(res, 200, 'text/markdown; charset=utf-8', content);
  };

  const cancelRun = (res: http.ServerResponse, runId: string): void => {
    const run = mustGetRun(runId);
    const ok = app.orchestrator.cancel(runId);
    if (ok) {
      app.store.appendEvent(runId, { type: 'run_cancelled', detail: { via: 'http' } });
      sendJson(res, 202, { requested: true });
    } else {
      // orchestrator.cancel refuses completed/cancelled runs — report that truthfully.
      sendJson(res, 202, { requested: false, reason: `run is ${run.status} — nothing active to cancel` });
    }
  };

  const resumeRun = (res: http.ServerResponse, runId: string): void => {
    mustGetRun(runId);
    if (!startRun(runId)) throw alreadyRunning(runId);
    sendJson(res, 202, { runId });
  };

  const receiveFeedback = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    runId: string,
  ): Promise<void> => {
    const body = await readJsonObject(req);
    const { source, content, targetKind, targetId } = body as {
      source?: unknown;
      content?: unknown;
      targetKind?: unknown;
      targetId?: unknown;
    };
    if (typeof source !== 'string') {
      throw validation(`field "source" is required — must be one of: ${FeedbackSourceKind.options.join(', ')}`);
    }
    const parsedSource = FeedbackSourceKind.safeParse(source);
    if (!parsedSource.success) {
      throw validation(`invalid source "${source}" — must be one of: ${FeedbackSourceKind.options.join(', ')}`);
    }
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw validation('field "content" is required (non-empty string)');
    }
    if ((targetKind === undefined) !== (targetId === undefined)) {
      throw validation('targetKind and targetId must be given together');
    }
    mustGetRun(runId); // 404 before any persistence — same order as the CLI
    let target: { kind: string; id: string } | undefined;
    if (targetKind !== undefined && targetId !== undefined) {
      const ref = ObjectRef.safeParse({ kind: targetKind, id: targetId });
      if (!ref.success) {
        throw validation(`invalid targetKind "${String(targetKind)}"`);
      }
      // fail-closed: a targeted signal must point at an object that actually exists
      const storeKind = TARGET_STORE_KINDS[ref.data.kind as keyof typeof TARGET_STORE_KINDS];
      if (storeKind !== undefined && app.store.getObject(storeKind, ref.data.id) === null) {
        throw validation(`${ref.data.kind} not found: ${ref.data.id}`);
      }
      target = ref.data;
    }
    const signal = FeedbackSignal.parse({
      id: newId('fbk'),
      runId,
      source: parsedSource.data as FeedbackSource,
      content,
      ...(target ? { target } : {}),
      provenance: `http:POST /api/v1/runs/${runId}/feedback (source=${parsedSource.data}, recorded at http api)`,
      receivedAt: new Date().toISOString(),
    });
    app.store.putObject('feedback', signal);
    app.store.appendEvent(runId, {
      type: 'feedback_received',
      detail: { feedbackId: signal.id, source: signal.source, via: 'http' },
    });
    sendJson(res, 201, { feedbackId: signal.id });
  };

  const reexport = (res: http.ServerResponse, runId: string): void => {
    mustGetRun(runId);
    if (executing.has(runId)) throw alreadyRunning(runId); // busy first: state may still change mid-flight
    const bundles = app.store.listObjects('bundle', runId);
    if (bundles.length === 0) {
      throw validation(`no bundle stored for run ${runId} yet — resume the run to run the export stage`);
    }
    if (!revisionNewerThanBundle(runId)) {
      throw validation(`no revision newer than the latest bundle (${bundles.at(-1)!.id}) — nothing to re-export`);
    }
    startRun(runId);
    sendJson(res, 202, { runId });
  };

  const verify = async (res: http.ServerResponse, bundleId: string): Promise<void> => {
    // verifyBundle is fail-closed by design: a missing bundle yields a report with
    // verdict 'failed' (all checks passed=false) — the report itself is the answer.
    const report = await verifyBundle(bundleId, { store: app.store, artifacts: app.artifacts });
    sendJson(res, 200, report);
  };

  // ---- static frontend (only when web/dist exists; never pretend otherwise) ----

  const serveStatic = (res: http.ServerResponse, method: string, pathname: string, headOnly: boolean): void => {
    if (!fs.existsSync(staticRoot)) {
      if (pathname === '/' && (method === 'GET' || method === 'HEAD')) {
        sendJson(res, 200, {
          service: 'far-lab',
          api: '/api/v1',
          frontend: { built: false, reason: `static root not found (${staticRoot}) — build the web workbench first` },
        });
      } else {
        throw notFound(`no route: ${method} ${pathname}`);
      }
      return;
    }
    const resolved = safeStaticFile(staticRoot, pathname);
    if (resolved === 'unsafe') {
      throw notFound(`no route: ${method} ${pathname}`); // traversal/malformed: 404, never a fallback
    }
    let target: string | null = resolved; // non-null only when it is a file inside the root
    if (target === null && path.extname(pathname) === '') {
      const index = path.join(staticRoot, 'index.html'); // SPA fallback for client-side routes
      if (fs.existsSync(index)) target = index;
    }
    if (target === null) throw notFound(`no route: ${method} ${pathname}`);
    const body = fs.readFileSync(target);
    const headers = { 'Content-Type': mimeFor(target), 'Content-Length': body.length };
    if (headOnly) {
      res.writeHead(200, headers);
      res.end();
    } else {
      res.writeHead(200, headers);
      res.end(body);
    }
  };

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
        serveStatic(res, method, url.pathname, method === 'HEAD');
        return;
      }
      throw notFound(`no route: ${method} ${url.pathname}`);
    }
    if (segments[1] !== 'v1') throw notFound(`no route: ${method} ${url.pathname}`);

    if (segments[2] === 'runs') {
      if (segments.length === 3) {
        if (method === 'GET') return listRuns(res);
        if (method === 'POST') return createRun(req, res);
        throw notFound(`method ${method} not allowed for ${url.pathname}`);
      }
      const runId = segments[3];
      if (runId === undefined) throw notFound(`no route: ${method} ${url.pathname}`);
      if (segments.length === 4) {
        if (method === 'GET') return runDetail(res, runId);
        throw notFound(`method ${method} not allowed for ${url.pathname}`);
      }
      if (segments.length === 5) {
        const leaf = segments[4]!;
        if (leaf === 'events' && method === 'GET') return runEvents(res, runId, url);
        if (leaf === 'question' && method === 'GET') return runQuestion(res, runId);
        if (leaf === 'report' && method === 'GET') return runReport(res, runId);
        if (leaf === 'sources' && method === 'GET') {
          mustGetRun(runId);
          return sendJson(res, 200, { sources: app.store.listObjects('source_document', runId) });
        }
        if (leaf === 'evidence' && method === 'GET') {
          mustGetRun(runId);
          return sendJson(res, 200, {
            claims: app.store.listObjects('claim', runId),
            relations: app.store.listObjects('evidence_relation', runId),
          });
        }
        if (leaf === 'hypotheses' && method === 'GET') {
          mustGetRun(runId);
          return sendJson(res, 200, {
            hypotheses: app.store.listObjects('hypothesis', runId),
            scorecards: app.store.listObjects('scorecard', runId),
            // D-016: pairwise tournament evidence behind the final ordering (uncertainty included)
            tournament: app.store.listObjects('tournament', runId).at(-1) ?? null,
          });
        }
        if (leaf === 'plan' && method === 'GET') {
          mustGetRun(runId);
          return sendJson(res, 200, { plan: app.store.listObjects('plan', runId).at(-1) ?? null });
        }
        if (leaf === 'revisions' && method === 'GET') {
          mustGetRun(runId);
          return sendJson(res, 200, {
            feedbacks: app.store.listObjects('feedback', runId),
            revisions: app.store.listObjects('revision', runId),
            versionDiffs: app.store.listObjects('version_diff', runId),
          });
        }
        if (leaf === 'receipts' && method === 'GET') {
          mustGetRun(runId);
          return sendJson(res, 200, { receipts: app.store.listObjects('receipt', runId) });
        }
        if (leaf === 'cancel' && method === 'POST') return cancelRun(res, runId);
        if (leaf === 'resume' && method === 'POST') return resumeRun(res, runId);
        if (leaf === 'feedback' && method === 'POST') return receiveFeedback(req, res, runId);
        if (leaf === 'reexport' && method === 'POST') return reexport(res, runId);
      }
      throw notFound(`no route: ${method} ${url.pathname}`);
    }

    if (segments[2] === 'verify' && segments.length === 4 && method === 'GET') {
      return verify(res, segments[3]!);
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
    })();
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
      server.close(() => resolve());
      server.closeIdleConnections();
      server.closeAllConnections();
    });

  return { server, start, stop };
}
