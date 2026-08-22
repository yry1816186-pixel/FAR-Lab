import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { App } from '../app/composition.js';
import { verifyBundle } from '../app/verify.js';
import { listProviders, defaultLiveProvider } from '../providers/index.js';
import { createCustomProvider } from '../providers/custom.js';
import { runResearchAction, ActionError } from './actions.js';
import { connectClaim, forkHypothesis, HypothesisOpError, promoteHypothesis, rejectHypothesis } from './hypothesis-ops.js';
import { ACTIVE_MODEL_CONFIG_META_KEY } from '../app/provider-resolver.js';
import {
  FeedbackSignal,
  FeedbackSourceKind,
  ModelProviderConfig,
  ObjectRef,
  ResearchQuestion,
  ScientificGoalType,
  SourceDocument,
  maskApiKey,
  newId,
  runProgress,
} from '../domain/index.js';
import type { FeedbackSourceKind as FeedbackSource } from '../domain/index.js';
import { canonicalSha256 } from '../shared/crypto.js';

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
  code: 'not_found' | 'validation' | 'already_running' | 'internal' | 'target_not_found' | 'question_required' | 'action_model_failed' | 'invalid_action_request';
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
  /**
   * W8 S1 frozen-run watchdog: poll interval (ms) for runs stuck status='running' with
   * an expired lease; detected runs are adopted (re-executed — resume semantics skip
   * done stages and checkpointed subtasks). Default 30_000; 0 disables. Runs inside
   * this server process (no new service).
   */
  watchdogIntervalMs?: number;
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
  evidence_relation: 'evidence_relation',
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

  // W8 S1 watchdog: frozen runs (status='running', lease expired) are detected within one
  // poll cycle and adopted — execute() reclaims the expired lease and resume semantics
  // (stage skip + step checkpoints) continue the run instead of abandoning paid work.
  // An in-memory per-run backoff prevents a hot adoption loop when an adopted run keeps
  // failing fast (dbos recovery_attempts pattern, embedded form).
  const watchdogIntervalMs = opts.watchdogIntervalMs ?? 30_000;
  const adoptionBackoffMs = Math.max(watchdogIntervalMs * 10, 60_000);
  const lastAdoptedAt = new Map<string, number>();
  let watchdogTimer: NodeJS.Timeout | null = null;
  // Sweep-health visibility (WP2 F-007): a persistent store error would otherwise
  // silently stop adoptions forever with only a stderr line — /health reports it.
  let consecutiveSweepFailures = 0;
  const sweepExpiredLeases = (): void => {
    try {
      const now = Date.now();
      for (const stale of app.store.listExpiredLeaseRuns(new Date().toISOString())) {
        if (executing.has(stale.id)) continue;
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

  /** run ids are prefix-branded by construction; reject malformed path params before they cross into the store layer. */
  const RUN_ID_RE = /^run_[0-9a-z]{20,32}$/;
  const assertRunId = (runId: string): void => {
    if (!RUN_ID_RE.test(runId)) throw validation(`invalid runId format: ${runId}`);
  };

  /**
   * B3 SSE push channel for run events — Node-native, zero dependencies.
   * Server push replaces the 2s polling cadence; clients keep polling as the
   * fallback for environments where EventSource is unavailable. Cursor comes
   * from Last-Event-ID (reconnects) or ?afterSeq (first open). Bounded
   * lifetime (10 min): EventSource auto-reconnects and resumes from its cursor.
   */
  const runEventStream = (req: http.IncomingMessage, res: http.ServerResponse, runId: string, url: URL): void => {
    mustGetRun(runId);
    const fromHeader = Number.parseInt(String(req.headers['last-event-id'] ?? ''), 10);
    const fromQuery = Number.parseInt(url.searchParams.get('afterSeq') ?? '0', 10);
    let cursor = Number.isFinite(fromHeader) && fromHeader > 0
      ? fromHeader
      : Number.isFinite(fromQuery) && fromQuery > 0 ? fromQuery : 0;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      // Reverse proxies must not buffer the stream.
      'X-Accel-Buffering': 'no',
    });
    res.write(': stream open\n\n');
    let closed = false;
    const close = (): void => {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      clearTimeout(lifetime);
      res.end();
    };
    const lifetime = setTimeout(close, 10 * 60_000);
    // close() only ever runs from async events (connection close, stream error,
    // lifetime) — by then both timers below are initialized; no TDZ window.
    const timer = setInterval(() => {
      if (closed) return;
      try {
        const fresh = app.store.listEventsAfter(runId, cursor);
        for (const e of fresh) {
          res.write(`id: ${e.seq}\nevent: run-event\ndata: ${JSON.stringify(e)}\n\n`);
          cursor = e.seq;
        }
        if (fresh.length === 0) res.write(': ping\n\n');
      } catch {
        close();
      }
    }, 1_000);
    req.on('close', close);
    res.on('error', close);
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
    });
    sendJson(res, 200, { query: q, ...result });
  };

  /** Whether a revision landed after the newest bundle (the export stage's own re-export rule). */
  const revisionNewerThanBundle = (runId: string, latestBundle: { createdAt: string } | undefined): boolean => {
    if (!latestBundle) return false;
    return app.store.listObjects('revision', runId).some((r) => r.createdAt > latestBundle.createdAt);
  };

  // ---- API route handlers ----

  const listRuns = (res: http.ServerResponse): void => {
    const runs = app.store.listRuns().map((row) => {
      const run = app.store.getRun(row.id);
      const p = run ? runProgress(run) : null;
      // Researcher-facing projection (CPP-2): the question text IS the run's identity
      // for the person who wrote it — machine ids stay available but never primary.
      // getObject is schema-validated on read, so the zod types are authoritative here.
      const question = run ? app.store.getObject('question', run.questionId) : null;
      const questionText = question !== null && question.text.trim().length > 0 ? question.text : undefined;
      const domain = question !== null && question.scope.domain.trim().length > 0 ? question.scope.domain : undefined;
      return {
        id: row.id,
        status: row.status,
        currentStage: row.currentStage,
        createdAt: row.createdAt,
        ...(questionText !== undefined ? { questionText } : {}),
        ...(domain !== undefined ? { domain } : {}),
        ...(run?.lastError !== undefined ? { lastError: run.lastError } : {}),
        ...(p?.known ? { progress: { done: p.done, total: p.total } } : {}),
      };
    });
    sendJson(res, 200, { runs });
  };


/** R1: validate+normalize the optional `seeds` array (user-provided sources). String return = error. */
const SEED_TEXT_MAX = 50_000;
function parseSeedSources(raw: unknown): string | {
  title: string;
  identifiers: { kind: 'doi' | 'arxiv' | 'url' | 'other'; value: string }[];
  text?: string;
  year?: number;
  authors: string[];
}[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 5) {
    return 'field "seeds" must be an array of 1-5 seed sources';
  }
  const out: {
    title: string; identifiers: { kind: 'doi' | 'arxiv' | 'url' | 'other'; value: string }[];
    text?: string; year?: number; authors: string[];
  }[] = [];
  for (const [i, item] of raw.entries()) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return `seeds[${i}]: must be an object`;
    const rec = item as Record<string, unknown>;
    const title = typeof rec.title === 'string' && rec.title.trim().length > 0
      ? rec.title.trim().slice(0, 500)
      : `User-provided source ${i + 1}`;
    let text: string | undefined;
    if (rec.text !== undefined) {
      if (typeof rec.text !== 'string' || rec.text.trim().length === 0) return `seeds[${i}].text: must be a non-empty string`;
      if (rec.text.length > SEED_TEXT_MAX) return `seeds[${i}].text: exceeds ${SEED_TEXT_MAX} chars`;
      text = rec.text;
    }
    const identifiers: { kind: 'doi' | 'arxiv' | 'url' | 'other'; value: string }[] = [];
    if (rec.identifiers !== undefined) {
      if (!Array.isArray(rec.identifiers)) return `seeds[${i}].identifiers: must be an array`;
      for (const idu of rec.identifiers) {
        if (typeof idu !== 'object' || idu === null) return `seeds[${i}].identifiers: entries must be objects`;
        const { kind, value } = idu as Record<string, unknown>;
        if (kind !== 'doi' && kind !== 'arxiv' && kind !== 'url') return `seeds[${i}].identifiers[].kind: doi|arxiv|url`;
        if (typeof value !== 'string' || value.trim().length === 0 || value.length > 500) return `seeds[${i}].identifiers[].value: 1-500 chars`;
        identifiers.push({ kind, value: value.trim() });
      }
    }
    if (identifiers.length === 0) {
      // SourceDocument requires >=1 identifier; an unidentifiable seed gets an
      // honest synthetic marker (verify_sources will report it unresolvable).
      identifiers.push({ kind: 'other', value: `user-seed:${i + 1}:${title.slice(0, 80)}` });
    }
    let year: number | undefined;
    if (rec.year !== undefined) {
      if (typeof rec.year !== 'number' || !Number.isInteger(rec.year) || rec.year < 1400 || rec.year > 2100) {
        return `seeds[${i}].year: integer 1400-2100`;
      }
      year = rec.year;
    }
    let authors: string[] = [];
    if (rec.authors !== undefined) {
      if (!Array.isArray(rec.authors) || rec.authors.some((a) => typeof a !== 'string')) return `seeds[${i}].authors: string array`;
      authors = (rec.authors as string[]).slice(0, 20).map((a) => a.slice(0, 200));
    }
    out.push({ title, identifiers, ...(text !== undefined ? { text } : {}), ...(year !== undefined ? { year } : {}), authors });
  }
  return out;
}

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
    // Optional user-selected model route for THIS run (resolution: run > active default > env chain).
    const runOpts: { providerConfigId?: string } = {};
    if (body.providerConfigId !== undefined) {
      const providerConfigId = body.providerConfigId;
      if (typeof providerConfigId !== 'string' || !MODEL_CONFIG_ID_RE.test(providerConfigId)) {
        throw validation('field "providerConfigId" must be a model config id (mcfg_...)');
      }
      if (app.store.getObject('model_config', providerConfigId) === null) {
        throw notFound(`model config not found: ${providerConfigId}`);
      }
      runOpts.providerConfigId = providerConfigId;
    }
    const run = app.store.createRun(question, runOpts);
    // R1 entry upgrade: user-provided seed sources (PDF text / a parsed
    // citation / a Zotero item) join the corpus as guaranteed, provenance-
    // marked documents — the retrieve stage never searches for them, it
    // includes them and the verify stage resolves their identifiers honestly.
    const seeds = parseSeedSources(body.seeds);
    if (typeof seeds === 'string') throw validation(seeds);
    for (const seed of seeds) {
      app.store.putObject('source_document', SourceDocument.parse({
        id: newId('src'),
        runId: run.id,
        family: 'user_provided',
        identifiers: seed.identifiers,
        title: seed.title,
        ...(seed.year !== undefined ? { publicationYear: seed.year } : {}),
        ...(seed.authors.length > 0 ? { authors: seed.authors } : {}),
        contentDepth: seed.text !== undefined ? 'abstract' : 'metadata_only',
        accessState: 'unknown',
        contentHash: canonicalSha256({ title: seed.title, text: seed.text, identifiers: seed.identifiers }),
        retrievedAt: new Date().toISOString(),
        parseStatus: 'ok',
        ...(seed.text !== undefined ? { abstractText: seed.text } : {}),
      }));
    }
    startRun(run.id); // async execution — the 202 returns immediately; failures land in run state
    sendJson(res, 202, { runId: run.id });
  };

  const runDetail = (res: http.ServerResponse, runId: string): void => {
    const run = mustGetRun(runId);
    // Lease projection (W8 single-writer semantics) so the UI can surface frozen-run
    // state honestly instead of inferring it from silence. `live` uses the same
    // computation as the CLI status command.
    const lease = app.store.getRunLease(runId);
    const leaseLive = lease.holder !== null && (lease.expiresAt ?? '') > new Date().toISOString();
    sendJson(res, 200, {
      ...run,
      leaseInfo: { holder: lease.holder, expiresAt: lease.expiresAt ?? null, live: leaseLive },
    });
  };

  /** First-class bundle discovery (D-060: replaces the client-side event-regex scan). */
  const runBundles = (res: http.ServerResponse, runId: string): void => {
    mustGetRun(runId);
    const bundles = app.store.listObjects('bundle', runId).map((b) => ({
      id: b.id,
      createdAt: b.createdAt,
      evidenceLevel: b.declaredEvidenceLevel,
    }));
    sendJson(res, 200, { bundles });
  };

  /**
   * Retrieval transparency (D-060 phase-1): the executed query plan with purposes
   * (incl. the two structurally-guaranteed counter-evidence queries), per-family
   * failures and fusion stats — the retrieve stage stops being a black box.
   */
  const runCorpus = (res: http.ServerResponse, runId: string): void => {
    mustGetRun(runId);
    const corpus = app.store.listObjects('corpus_snapshot', runId).at(-1) ?? null;
    sendJson(res, 200, { corpus });
  };

  /**
   * Real health (D-060 phase-3): DB actually readable + model-route readiness
   * (env-presence only — never key values) + build revision. 503 when the DB
   * check fails; never a fake "ok".
   */
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
    const watchdog = consecutiveSweepFailures === 0
      ? 'ok'
      : `degraded (${consecutiveSweepFailures} consecutive sweep failures — frozen-run adoption stalled)`;
    try {
      app.store.listRuns();
      sendJson(res, 200, {
        status: 'ok',
        db: 'ok',
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
    // Anchor ONCE from the same listing the message quotes (WP2 F-006): a second
    // independent listObjects inside the check could observe a different latest bundle
    // than the id we report, or return undefined mid-concurrent-write.
    const latest = bundles.at(-1);
    if (!latest || !revisionNewerThanBundle(runId, latest)) {
      throw validation(`no revision newer than the latest bundle (${latest?.id ?? 'unknown'}) — nothing to re-export`);
    }
    startRun(runId);
    sendJson(res, 202, { runId });
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

  // ---- model configs (user-defined model routes) ----

  /** Model configs are workspace-global: stored under the '__none__' run bucket (like questions). */
  const listModelConfigsAll = () => app.store.listObjects('model_config', '__none__');

  const MODEL_CONFIG_ID_RE = /^mcfg_[0-9a-z]{20,32}$/;
  const assertModelConfigId = (id: string): void => {
    if (!MODEL_CONFIG_ID_RE.test(id)) throw validation(`invalid model config id format: ${id}`);
  };

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
    createdAt: cfg.createdAt,
    updatedAt: cfg.updatedAt,
  });

  const listModelConfigs = (res: http.ServerResponse): void => {
    const activeId = app.store.getMeta(ACTIVE_MODEL_CONFIG_META_KEY);
    const configs = listModelConfigsAll().map((c) => modelConfigSummary(c, activeId));
    // What the env chain (competition/automation layer) would select with no user config.
    const envDefaultView = (): { name: string; modelId: string; liveReady: boolean } | null => {
      try {
        const provider = defaultLiveProvider();
        const info = listProviders().find((p) => p.name === provider.name);
        return { name: provider.name, modelId: info?.modelId ?? '(unknown)', liveReady: info?.liveReady ?? provider.liveReady };
      } catch {
        return null; // env names an unknown/banned provider — health owns that failure story
      }
    };
    sendJson(res, 200, { configs, activeModelConfigId: activeId, envDefault: envDefaultView() });
  };

  const getModelConfig = (res: http.ServerResponse, id: string): void => {
    assertModelConfigId(id);
    const cfg = mustGetModelConfig(id);
    sendJson(res, 200, { config: modelConfigSummary(cfg, app.store.getMeta(ACTIVE_MODEL_CONFIG_META_KEY)) });
  };

  const invalidConfigMessage = (issues: { path: (string | number)[]; message: string }[]): string =>
    `invalid model config: ${issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`;

  const createModelConfig = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const body = await readJsonObject(req);
    const now = new Date().toISOString();
    const parsed = ModelProviderConfig.safeParse({
      id: newId('mcfg'),
      label: body.label,
      wire: body.wire,
      baseUrl: body.baseUrl,
      modelId: body.modelId,
      apiKey: body.apiKey ?? '',
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
      apiKey,
      updatedAt: new Date().toISOString(),
    });
    if (!parsed.success) throw validation(invalidConfigMessage(parsed.error.issues));
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
    mustGetModelConfig(id);
    app.store.setMeta(ACTIVE_MODEL_CONFIG_META_KEY, id);
    sendJson(res, 200, { activeModelConfigId: id });
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
      cfg = typeof body.apiKey === 'string' && body.apiKey.length > 0 ? { ...stored, apiKey: body.apiKey } : stored;
    } else {
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
      assertRunId(runId); // format gate before any store-layer use (WP2 F-003)
      if (segments.length === 6 && segments[4] === 'events' && segments[5] === 'stream') {
        if (method === 'GET') return runEventStream(req, res, runId, url);
        throw notFound(`method ${method} not allowed for ${url.pathname}`);
      }
      // B5 hypothesis lifecycle (R3): POST /runs/:id/hypotheses/:hypId/<op>.
      // Ownership (run owns the hypothesis / the linked claim) is guarded inside
      // hypothesis-ops; this branch only dispatches the four known verbs.
      if (segments.length === 7 && segments[4] === 'hypotheses') {
        const hypId = segments[5]!;
        const op = segments[6]!;
        if (method === 'POST' && (op === 'promote' || op === 'reject' || op === 'fork' || op === 'connect')) {
          const body = await readJsonObject(req);
          try {
            const result = op === 'promote' ? promoteHypothesis(app, runId, hypId, body)
              : op === 'reject' ? rejectHypothesis(app, runId, hypId, body)
              : op === 'fork' ? forkHypothesis(app, runId, hypId, body)
              : connectClaim(app, runId, hypId, body);
            sendJson(res, 200, result);
            return;
          } catch (e) {
            if (e instanceof HypothesisOpError) {
              throw new HttpError(e.status, {
                code: e.code,
                message: e.message,
                retryable: false,
                ...(e.code === 'not_found' ? { runId } : {}),
              });
            }
            throw e;
          }
        }
        throw notFound(`no route: ${method} ${url.pathname}`);
      }
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
        if (leaf === 'experiments' && method === 'GET') {
          // EEL read surface (D-081): far.db projections only — queue-level operational
          // detail (fence tokens, heartbeats) stays with `far experiment status`.
          mustGetRun(runId);
          return sendJson(res, 200, {
            experimentRuns: app.store.listObjects('experiment_run', runId),
            resultSets: app.store.listObjects('result_set', runId),
            statReports: app.store.listObjects('stat_report', runId),
          });
        }
        if (leaf === 'receipts' && method === 'GET') {
          mustGetRun(runId);
          return sendJson(res, 200, { receipts: app.store.listObjects('receipt', runId) });
        }
        if (leaf === 'bundles' && method === 'GET') return runBundles(res, runId);
        if (leaf === 'corpus' && method === 'GET') return runCorpus(res, runId);
        if (leaf === 'cancel' && method === 'POST') return cancelRun(res, runId);
        if (leaf === 'resume' && method === 'POST') return resumeRun(res, runId);
        if (leaf === 'feedback' && method === 'POST') return receiveFeedback(req, res, runId);
        if (leaf === 'reexport' && method === 'POST') return reexport(res, runId);
        if (leaf === 'actions' && method === 'POST') {
          // B4 object-level AI research actions: grounded adversarial analysis
          // (store facts only; receipts + audit events like any pipeline call).
          const body = await readJsonObject(req);
          try {
            const result = await runResearchAction(app, runId, body);
            sendJson(res, 200, result);
          } catch (e) {
            if (e instanceof ActionError) {
              throw new HttpError(e.status, { code: e.code, message: e.message, retryable: e.status >= 500 });
            }
            throw e;
          }
        }
      }
      throw notFound(`no route: ${method} ${url.pathname}`);
    }

    if (segments[2] === 'model-configs') {
      if (segments.length === 3) {
        if (method === 'GET') return listModelConfigs(res);
        if (method === 'POST') return createModelConfig(req, res);
        throw notFound(`method ${method} not allowed for ${url.pathname}`);
      }
      const leaf = segments[3]!;
      if (leaf === 'active' && segments.length === 4 && method === 'PUT') return setActiveModelConfig(req, res);
      if (leaf === 'test' && segments.length === 4 && method === 'POST') return testModelConfig(req, res);
      if (segments.length === 4) {
        if (method === 'GET') return getModelConfig(res, leaf);
        if (method === 'PUT') return updateModelConfig(req, res, leaf);
        if (method === 'DELETE') return deleteModelConfig(res, leaf);
      }
      throw notFound(`no route: ${method} ${url.pathname}`);
    }

    if (segments[2] === 'health' && segments.length === 3 && method === 'GET') {
      return health(res);
    }

    if (segments[2] === 'search' && segments.length === 3 && method === 'GET') {
      return search(res, url);
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
      server.close(() => resolve());
      server.closeIdleConnections();
      server.closeAllConnections();
    });

  return { server, start, stop };
}
