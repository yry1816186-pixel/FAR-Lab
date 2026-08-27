import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { App } from '../app/composition.js';
import { verifyBundle } from '../app/verify.js';
import { listProviders, LIVE_PROVIDER_NAMES } from '../providers/index.js';
import { PROVIDER_TEMPLATES } from '../providers/catalog.js';
import {
  BuiltinRoutePrice, builtinDefaultName, builtinModelIdFor, envModelIdFor,
  readBuiltinOverrides, setBuiltinDefaultName, writeBuiltinOverrides,
} from '../providers/builtin-overrides.js';
import { createCustomProvider } from '../providers/custom.js';
import { analyzeTrajectory } from '../app/supervisor.js';
import { runTruthProfile } from '../app/truth-profile.js';
import { runCounterSearch, CounterSearchError } from './counter-search.js';
import { buildZip, type ZipEntry } from './zip.js';
import { buildLineageGraph } from '../app/lineage.js';
import { runEvaluators } from '../app/evaluators.js';
import { runResearchAction, ActionError } from './actions.js';
import { connectClaim, editHypothesis, forkHypothesis, HypothesisOpError, promoteHypothesis, rejectHypothesis } from './hypothesis-ops.js';
import {
  annotateClaim, ClaimOpError, excludeClaim, excludedClaimIdsOf, pinClaim, reclassifyClaim, reinstateClaim,
} from './claim-ops.js';
import { ACTIVE_MODEL_CONFIG_META_KEY, readCompetitionRouteMode, writeCompetitionRouteMode } from '../app/provider-resolver.js';
import { discoverModels } from '../providers/discovery.js';
import { ingestPdfTextPayload, ingestSdm, ingestTextToSdm, ingestBytes, persistDatasetProfile, loadSdmByRef, loadDatasetProfileByRef, ingestSvgPlot, loadPlotPointsByRef, jsonRefusalReason, type IngestOutcome } from '../ingest/service.js';
import type { DatasetProfileDoc } from '../ingest/dataset.js';
import { approveExperiment, ExperimentOpError } from './experiment-ops.js';
import { fetchZoteroAnnotations, fetchZoteroLibrary, ZoteroUnavailableError } from './zotero.js';
import {
  buildScreeningView,
  getOrCreateScreeningSession,
  recordScreeningDecision,
  ScreeningError,
  stopScreeningSession,
} from './screening.js';
import {
  attachRunToConversation, collectConversationSeeds, createConversation, deleteConversation,
  detachRunFromAllConversations, getConversation, listConversations, postConversationMessage,
  resolveConversationProposal, resolveConversationReasoningRoute, retryConversationTurn,
  setConversationReasoningGear, ConversationError, type ConversationDeps,
} from './conversations.js';
import { startAutomationEngine, type AutomationEngine } from './automations.js';
import { aggregateRunUsage, aggregateWorkspaceUsage } from '../app/usage-ledger.js';
import { workspaceSpendStatus, writeSpendLimit } from '../app/spend-limit.js';
import {
  ConversationSchema,
  FeedbackSignal,
  FeedbackSourceKind,
  ModelProviderConfig,
  ObjectRef,
  ProviderWireProtocol,
  ResearchQuestion,
  ScientificGoalType,
  SourceDocument,
  ToolIntegrationSchema,
  calibrationReport,
  integrationSemanticIssues,
  maskApiKey,
  maskIntegrationSecrets,
  newId,
  runProgress,
} from '../domain/index.js';
import { ConstraintSet } from '../domain/question.js';
import type { RunStageName } from '../domain/run.js';
import { McpManager } from '../agent/mcp-manager.js';
import { importPlugin, PluginImportError, PluginImportInputSchema } from '../plugins/import.js';
import type { FeedbackSourceKind as FeedbackSource } from '../domain/index.js';
import { toProvJsonLd } from '../domain/prov-o.js';
import { consolidateConversationProfile } from '../app/memory.js';
import { EvidenceRelation, EvidenceRelationType } from '../domain/evidence.js';
import { diagnosticityScores, removalSensitivity } from '../domain/ach.js';
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
  code: 'not_found' | 'validation' | 'already_running' | 'run_active' | 'not_started' | 'internal' | 'target_not_found' | 'question_required' | 'action_model_failed' | 'action_budget_exhausted' | 'invalid_action_request' | 'invalid_counter_search' | 'provider_unreachable' | 'conversation_model_failed' | 'conversation_full' | 'turn_in_flight' | 'no_corpus' | 'session_stopped' | 'src_not_in_pool' | 'run_not_found' | 'already_launched' | 'scope_proposal_failed';
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
  let automationEngine: AutomationEngine | null = null;
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
      conversations: clamp(url.searchParams.get('conversations'), 5, 25),
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
  // An EMPTY array is legitimate: the conversation launch bridge always passes
  // collectConversationSeeds(conv), and a seedless conversation must be able to
  // launch a run (2026-08-27 journey: rejecting [] broke every seedless launch
  // since the bridge landed). Only a non-array or >50 shape is invalid.
  if (!Array.isArray(raw) || raw.length > 50) {
    return 'field "seeds" must be an array of at most 50 seed sources';
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
    const runId = await createRunWithSeeds(body);
    sendJson(res, 202, { runId, ...(body.draft === true ? { draft: true } : {}) });
  };

  /**
   * Shared run-creation core (POST /runs and conversation launch): question
   * validation, optional model route, seed ingestion and async start. With
   * draft:true (§8.2) the run + seeds persist but execution does NOT start —
   * scope-proposal / PATCH question / resume complete the pre-launch journey.
   */
  const createRunWithSeeds = async (body: Record<string, unknown>): Promise<string> => {
    const { text, domain, goalType } = body as { text?: unknown; domain?: unknown; goalType?: unknown };
    if (body.draft !== undefined && typeof body.draft !== 'boolean') {
      throw validation('field "draft" must be a boolean when given');
    }
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
    if (body.draft === true) {
      // §8.2 draft: persisted, NOT started — the studies index sees status
      // 'created' and the pre-launch journey (proposal/edit/resume) owns it.
      app.store.appendEvent(run.id, {
        type: 'note',
        detail: { reason: 'run_created_draft', actor: 'human' },
      });
      return run.id;
    }
    startRun(run.id); // async execution — the 202 returns immediately; failures land in run state
    return run.id;
  };

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

  const runDetail = (res: http.ServerResponse, runId: string): void => {
    const run = mustGetRun(runId);
    // Lease projection (W8 single-writer semantics) so the UI can surface frozen-run
    // state honestly instead of inferring it from silence. `live` uses the same
    // computation as the CLI status command.
    const lease = app.store.getRunLease(runId);
    const leaseLive = lease.holder !== null && (lease.expiresAt ?? '') > new Date().toISOString();
    // Researcher identity projection (same semantics as listRuns): the detail
    // endpoint feeds the research page header, which leads with the question
    // the researcher actually asked — not the machine id.
    const question = app.store.getObject('question', run.questionId);
    const questionText = question !== null && question.text.trim().length > 0 ? question.text : undefined;
    const domain = question !== null && question.scope.domain.trim().length > 0 ? question.scope.domain : undefined;
    sendJson(res, 200, {
      ...run,
      ...(questionText !== undefined ? { questionText } : {}),
      ...(domain !== undefined ? { domain } : {}),
      leaseInfo: { holder: lease.holder, expiresAt: lease.expiresAt ?? null, live: leaseLive },
      // Research iteration rounds (research-loop lane): the bounded-loop decision
      // history — every continue trigger / stop reason, in order, from the records.
      iterations: app.store.listObjects('iteration', runId).map((it) => ({
        id: it.id,
        round: it.round,
        decidedAt: it.decidedAt,
        decision: it.decision,
        trigger: it.continueTrigger ?? null,
        stopReason: it.stopReason ?? null,
        rationale: it.rationale,
        unblockHints: it.unblockHints,
      })),
      // §5.2 evidence debt: unverified sources exist (counter-search / seeds landed
      // after completion) — resume reopens verify_sources+build_evidence for them.
      hasEvidenceDebt: app.store
        .listObjects('source_document', runId)
        .some((d) => d.verification === undefined),
      // BP-4 usage ledger: receipt-derived tokens/cost for THIS run (pricing only
      // when user-declared; unknown stays unknown — no invented price tables).
      usage: aggregateRunUsage(app.store, runId),
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
    const watchdog = consecutiveSweepFailures === 0
      ? 'ok'
      : `degraded (${consecutiveSweepFailures} consecutive sweep failures — frozen-run adoption stalled)`;
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
    // RU-2 G6 tag query plane: ?tag=kind:x&tag=stage:y (repeatable, ANY-of) routes
    // through the indexed event_tags spine instead of the full linear scan.
    const tags = url.searchParams.getAll('tag');
    if (tags.length > 0) {
      for (const t of tags) {
        if (!/^[a-z0-9_]+:[a-z0-9_-]+$/.test(t)) throw validation(`query "tag" malformed: '${t}' (expected kind:*|stage:*)`);
      }
      const limitRaw = url.searchParams.get('limit');
      const limit = limitRaw === null ? 200 : (/^\d+$/.test(limitRaw) ? Math.min(Number(limitRaw), 200) : (() => { throw validation('query "limit" must be a positive integer'); })());
      const events = app.store.queryEvents({ tags, runId, afterSeq: afterSeq > 0 ? afterSeq : undefined, limit });
      sendJson(res, 200, { events, query: { tags, runId, afterSeq } });
      return;
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

  /**
   * BP-3 research-product artifact: the deterministic IMRaD paper markdown. Mirrors
   * runReport's artifact-lookup pattern, but resolves the bundle's paperOutlineRef —
   * absent on pre-BP3 bundles, which 404 honestly instead of serving the wrong artifact.
   */
  const runPaper = async (res: http.ServerResponse, runId: string): Promise<void> => {
    mustGetRun(runId);
    const latestBundle = app.store.listObjects('bundle', runId).at(-1);
    if (!latestBundle) {
      throw notFound(`no bundle stored for run ${runId} — the export stage has not produced one yet`, runId);
    }
    const paperRef = latestBundle.paperOutlineRef;
    if (paperRef === undefined) {
      throw notFound(`latest bundle ${latestBundle.id} carries no paper-outline artifact (pre-BP3 export)`, runId);
    }
    const content = await app.artifacts.get(paperRef);
    if (content === null) {
      throw notFound(`paper artifact missing in artifact store (${paperRef.slice(0, 16)}…)`, runId);
    }
    sendText(res, 200, 'text/markdown; charset=utf-8', content);
  };

  /**
   * CPS-7 full-package download: builds the lane-07 reproducibility package into a
   * temp dir (same engine as `far research export --format package`) and streams it
   * as a single ZIP. One-request convenience for reviewers; the CLI/dir path stays
   * authoritative (nothing is re-derived — the package is the deterministic
   * projection of stored export artifacts).
   *
   * Known limitation (audit P2-3, accepted for the single-user local product):
   * pandoc renders run spawnSync (up to 60s/format) and the zip is assembled
   * in-memory — a package request can block this single-threaded server for
   * seconds-to-minutes. MB-scale packages are fine; revisit (worker/queue) if a
   * multi-user/remote deployment mode ever lands.
   */
  const runPackageZip = async (res: http.ServerResponse, runId: string): Promise<void> => {
    mustGetRun(runId);
    const latestBundle = app.store.listObjects('bundle', runId).at(-1);
    if (!latestBundle) {
      throw notFound(`no bundle stored for run ${runId} — the export stage has not produced one yet`, runId);
    }
    const { buildReproducibilityPackage } = await import('../report/package.js');
    const tmp = await import('node:fs/promises').then((fsp) => fsp.mkdtemp(path.join(os.tmpdir(), 'farlab-pkg-')));
    try {
      const result = await buildReproducibilityPackage({ store: app.store, artifacts: app.artifacts }, runId, { outDir: tmp });
      const fsp = await import('node:fs/promises');
      const walk = async (dir: string, prefix: string): Promise<ZipEntry[]> => {
        const out: ZipEntry[] = [];
        for (const ent of await fsp.readdir(dir, { withFileTypes: true })) {
          const rel = prefix === '' ? ent.name : `${prefix}/${ent.name}`;
          if (ent.isDirectory()) out.push(...await walk(path.join(dir, ent.name), rel));
          else out.push({ name: rel, content: await fsp.readFile(path.join(dir, ent.name)) });
        }
        return out;
      };
      const zip = buildZip(await walk(tmp, ''));
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': String(zip.length),
        'Content-Disposition': `attachment; filename="${runId}-farlab-package.zip"`,
        'X-Bundle-Id': result.bundleId,
      });
      res.end(zip);
    } finally {
      await import('node:fs/promises').then((fsp) => fsp.rm(tmp, { recursive: true, force: true }));
    }
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

  /**
   * §8.2 pre-launch scope proposal: runs ONLY the scope stage (stopAfter
   * breaks before retrieve) on a draft run, then parks it at 'paused' so the
   * researcher sees and edits the refined scope BEFORE committing to the full
   * journey. The refined question (with its receipt-backed provenance) is the
   * response; POST /runs/:id/resume launches the remainder. 'paused' (not
   * 'running') is load-bearing: the lease watchdog adopts only 'running' runs,
   * so a parked draft can never be auto-continued behind the user's back.
   */
  const scopeProposal = async (res: http.ServerResponse, runId: string): Promise<void> => {
    const run = mustGetRun(runId);
    if (run.status !== 'created' && run.status !== 'paused') {
      throw new HttpError(409, {
        code: 'already_launched',
        message: `scope proposal requires a not-yet-launched run (status 'created' or 'paused'; got '${run.status}') — POST /runs with draft:true creates one`,
        retryable: false,
        runId,
      });
    }
    if (executing.has(runId)) throw alreadyRunning(runId);
    const execution = Promise.resolve()
      .then(() => executor(runId, { stopAfter: 'retrieve' }))
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        process.stderr.write(`far-api: scope-proposal execution of run ${runId} failed: ${msg}\n`);
        return undefined;
      })
      .finally(() => { executing.delete(runId); });
    executing.set(runId, execution);
    await execution;

    const after = app.store.getRun(runId);
    if (after === null) throw notFound(`run ${runId} vanished during scope proposal`, runId);
    const scopeRec = after.stages.find((s) => s.stage === 'scope');
    if (scopeRec?.state === 'failed') {
      throw new HttpError(502, {
        code: 'scope_proposal_failed',
        message: `scope refinement failed: ${scopeRec.error ?? 'unknown error'}`,
        retryable: true,
        runId,
      });
    }
    if (scopeRec?.state !== 'done') {
      throw new HttpError(502, {
        code: 'scope_proposal_failed',
        message: `scope stage state '${scopeRec?.state ?? 'missing'}' after proposal execution — refusing to fabricate a proposal`,
        retryable: true,
        runId,
      });
    }
    after.status = 'paused';
    app.store.updateRun(after);
    app.store.appendEvent(runId, {
      type: 'note',
      status: 'paused',
      detail: { reason: 'scope_proposal_ready', actor: 'human' },
    });
    const question = app.store.getObject('question', after.questionId);
    if (question === null) throw notFound(`question not found for run ${runId}: ${after.questionId}`, runId);
    sendJson(res, 200, { runId, question, next: { edit: 'PATCH /runs/:id/question', launch: 'POST /runs/:id/resume' } });
  };

  /**
   * §8.2/§15 editable ResearchQuestion/Scope/Constraint: researcher edits the
   * draft's question BEFORE launch. Allowed only pre-launch ('created' before
   * any proposal, 'paused' after one) — once the journey runs, corrections go
   * through the causal revision chain, never a silent question rewrite. The
   * merge is validated through the domain schema (single owner) and audited.
   */
  const editRunQuestion = async (req: http.IncomingMessage, res: http.ServerResponse, runId: string): Promise<void> => {
    const run = mustGetRun(runId);
    if (run.status !== 'created' && run.status !== 'paused') {
      throw new HttpError(409, {
        code: 'already_launched',
        message: `the question is editable only before launch (status 'created' or 'paused'; got '${run.status}') — running/closed runs revise via the feedback chain`,
        retryable: false,
        runId,
      });
    }
    const question = app.store.getObject('question', run.questionId);
    if (question === null) throw notFound(`question not found for run ${runId}: ${run.questionId}`, runId);
    const body = await readJsonObject(req);

    const changedFields: string[] = [];
    const next: Record<string, unknown> = { ...question };

    if (body.text !== undefined) {
      if (typeof body.text !== 'string' || body.text.trim().length === 0) {
        throw validation('field "text" must be a non-empty string');
      }
      if (body.text !== question.text) changedFields.push('text');
      next.text = body.text;
    }
    if (body.goalType !== undefined) {
      const parsedGoal = ScientificGoalType.safeParse(body.goalType);
      if (!parsedGoal.success) {
        throw validation(`invalid goalType "${String(body.goalType)}" — must be one of: ${ScientificGoalType.options.join(', ')}`);
      }
      if (parsedGoal.data !== question.goalType) changedFields.push('goalType');
      next.goalType = parsedGoal.data;
    }
    if (body.scope !== undefined) {
      const s = body.scope as Record<string, unknown>;
      const scopeNext = { ...question.scope };
      for (const key of ['domain', 'phenomena', 'inScope', 'outOfScope'] as const) {
        if (s[key] === undefined) continue;
        if (key === 'domain') {
          if (typeof s.domain !== 'string' || s.domain.trim().length === 0) throw validation('scope.domain must be a non-empty string');
          scopeNext.domain = s.domain;
        } else {
          if (!Array.isArray(s[key]) || s[key].length === 0 || (s[key] as unknown[]).some((x) => typeof x !== 'string' || x.trim().length === 0)) {
            throw validation(`scope.${key} must be a non-empty array of non-empty strings`);
          }
          scopeNext[key] = s[key];
        }
        if (JSON.stringify(scopeNext[key]) !== JSON.stringify((question.scope as Record<string, unknown>)[key])) {
          const label = `scope.${key}`;
          if (!changedFields.includes(label)) changedFields.push(label);
        }
      }
      next.scope = scopeNext;
    }
    if (body.constraints !== undefined) {
      const parsedConstraints = ConstraintSet.safeParse(body.constraints);
      if (!parsedConstraints.success) {
        throw validation(`invalid constraints: ${parsedConstraints.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      }
      if (JSON.stringify(parsedConstraints.data) !== JSON.stringify(question.constraints)) changedFields.push('constraints');
      next.constraints = parsedConstraints.data;
    }
    if (changedFields.length === 0) {
      throw validation('nothing to edit — provide at least one of: text, goalType, scope.{domain,phenomena,inScope,outOfScope}, constraints');
    }
    const edited = ResearchQuestion.parse(next);
    app.store.putObject('question', edited);
    app.store.appendEvent(runId, {
      type: 'note',
      detail: { reason: 'question_edited_human', questionId: edited.id, changedFields, actor: 'human' },
    });
    sendJson(res, 200, { questionId: edited.id, changedFields, question: edited });
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

  // ---- MULTIMODAL ingest (2026-08-24): deterministic artifact understanding ----
  // POST /api/v1/ingest — one endpoint, two producer shapes:
  //   { kind: 'pdf_text', fileName, payload }  ← web pdfjs collector output
  //   { kind: 'text', fileName, text }         ← server-side parse by extension
  // Returns the SDM (or dataset profile), its immutable artifact ref, and the
  // seeds-pipeline text projection. Failures are 422 with precise field errors.

  const ingestRoute = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const body = await readJsonObject(req);
    const kind = body['kind'];
    const fileName = typeof body['fileName'] === 'string' ? body['fileName'] : '';
    if (typeof fileName !== 'string' || fileName.length === 0 || fileName.length > 300 || fileName.includes('/') || fileName.includes('\\') || fileName.includes('\0')) {
      throw validation('ingest: fileName must be a 1-300 char basename (no path separators)');
    }
    // Shared response for both producers of dataset profiles (text/csv|tsv and bytes/xlsx).
    const sendDatasetProfile = async (profile: DatasetProfileDoc): Promise<void> => {
      const artifactRef = await persistDatasetProfile(app.artifacts, profile);
      sendJson(res, 200, {
        artifactRef,
        type: 'dataset_profile',
        profile: {
          schemaVersion: profile.schemaVersion,
          format: profile.format,
          rowCount: profile.rowCount,
          columnCount: profile.columnCount,
          columns: profile.columns.map((c) => ({ name: c.name, inferredType: c.inferredType, missingCount: c.missingCount, ...(c.unitHint !== undefined ? { unitHint: c.unitHint } : {}), significanceNotation: c.significanceNotation })),
          quality: profile.quality,
          diagnostics: profile.diagnostics,
        },
      });
    };
    if (kind === 'pdf_text') {
      const r = ingestPdfTextPayload(body['payload'], fileName);
      if (!r.ok) throw validation(`ingest pdf_text payload rejected: ${r.errors.slice(0, 5).join('; ')}`);
      const out = await ingestSdm(app.artifacts, r.sdm);
      sendJson(res, 200, ingestSummary(out));
      return;
    }
    if (kind === 'text') {
      const text = body['text'];
      if (typeof text !== 'string' || text.length === 0) throw validation('ingest: text must be a non-empty string');
      if (text.length > 10 * 1024 * 1024) throw validation('ingest: text exceeds 10MB');
      if (/\.svg$/i.test(fileName)) {
        const r = await ingestSvgPlot(app.artifacts, fileName, text);
        if (!r.ok) throw validation(`ingest: ${r.reason}`);
        sendJson(res, 200, { ...ingestSummary(r.outcome), ...(r.pointsRef !== undefined ? { pointsRef: r.pointsRef, seriesCount: r.points.series.length } : {}) });
        return;
      }
      const routed = ingestTextToSdm(fileName, text);
      if (routed === null) {
        const detail = /\.json$/i.test(fileName) ? ` — ${jsonRefusalReason(text)}` : ' — see MULTIMODAL.md for the format matrix';
        throw validation(`ingest: unsupported file kind for ${fileName}${detail}`);
      }
      if (routed.type === 'dataset') {
        await sendDatasetProfile(routed.profile);
        return;
      }
      const out = await ingestSdm(app.artifacts, routed.doc);
      sendJson(res, 200, ingestSummary(out));
      return;
    }
    if (kind === 'bytes') {
      // Binary supplements (xlsx): base64 body, binary router by extension.
      const base64 = body['base64'];
      if (typeof base64 !== 'string' || base64.length === 0) throw validation('ingest: base64 must be a non-empty string');
      const bytes = Buffer.from(base64, 'base64');
      if (bytes.length === 0) throw validation('ingest: base64 did not decode to any bytes');
      if (bytes.length > 15 * 1024 * 1024) throw validation('ingest: bytes exceed 15MB');
      const routed = ingestBytes(fileName, bytes);
      if (routed.type === 'refused') throw validation(`ingest: ${routed.reason}`);
      if (routed.type === 'sdm') {
        const out = await ingestSdm(app.artifacts, routed.doc);
        sendJson(res, 200, ingestSummary(out));
        return;
      }
      await sendDatasetProfile(routed.profile);
      return;
    }
    throw validation('ingest: kind must be "pdf_text", "text" or "bytes"');
  };

  const ingestSummary = (out: IngestOutcome): Record<string, unknown> => ({
    artifactRef: out.artifactRef,
    seedTextTruncated: out.seedTextTruncated,
    type: 'sdm',
    sdm: {
      schemaVersion: out.sdm.schemaVersion,
      extractor: out.sdm.extractor,
      meta: out.sdm.meta,
      counts: {
        blocks: out.sdm.blocks.length,
        figures: out.sdm.figures.length,
        tables: out.sdm.tables.length,
        equations: out.sdm.equations.length,
        citations: out.sdm.citations.length,
        xrefs: out.sdm.xrefs.length,
        xrefsResolved: out.sdm.xrefs.filter((x) => x.status === 'resolved').length,
      },
      diagnostics: out.sdm.diagnostics,
    },
  });

  // GET /api/v1/ingest/:ref — fetch a stored ingest artifact back (HCI renders
  // from the immutable store instead of caching payloads in client state).
  // Serves sdm-1 and dsdp-1; any other ref under this namespace is an honest 404.
  const ingestGetByRef = async (res: http.ServerResponse, ref: string): Promise<void> => {
    if (!/^sha256:[0-9a-f]{64}$/.test(ref)) throw validation('ingest: ref must be a sha256:<64 hex> artifact ref');
    const sdm = await loadSdmByRef(app.artifacts, ref);
    if (sdm.ok) {
      sendJson(res, 200, { kind: 'sdm', sdm: sdm.doc });
      return;
    }
    const profile = await loadDatasetProfileByRef(app.artifacts, ref);
    if (profile.ok) {
      sendJson(res, 200, { kind: 'dataset_profile', profile: profile.doc });
      return;
    }
    const plotPoints = await loadPlotPointsByRef(app.artifacts, ref);
    if (plotPoints.ok) {
      sendJson(res, 200, { kind: 'plot_points', points: plotPoints.doc });
      return;
    }
    throw notFound(`ingest artifact not found: ${ref}`);
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
    // The workbench is hash-routed (useHashRoute: "hash routes need no server
    // support"), so only '/' needs index.html. Any other extension-less path
    // (e.g. a missing /models/* asset probe) 404s honestly — a 200 HTML body
    // here once made the ASR worker treat a missing model as present.
    if (target === null && pathname === '/') {
      const index = path.join(staticRoot, 'index.html');
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
    fallbackConfigIds: cfg.fallbackConfigIds,
    pricing: cfg.pricing,
    createdAt: cfg.createdAt,
    updatedAt: cfg.updatedAt,
  });

  const listModelConfigs = (res: http.ServerResponse): void => {
    const activeId = app.store.getMeta(ACTIVE_MODEL_CONFIG_META_KEY);
    const configs = listModelConfigsAll().map((c) => modelConfigSummary(c, activeId));
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

  // ---- tool integrations (TIS: researcher-wired external tools) ----

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

  /** BP-4 usage ledger: workspace-wide receipt-derived usage (tokens; cost only when user-priced). */
  const listWorkspaceUsage = (res: http.ServerResponse): void => {
    sendJson(res, 200, { aggregates: aggregateWorkspaceUsage(app.store) });
  };

  /**
   * BP-4 model discovery: list the models an endpoint serves (GET {base}/models or
   * /v1/models per wire). Accepts a stored configId or a draft {wire, baseUrl, apiKey?}.
   * Live discovery needs real credentials (BLOCKED-live under the no-live-API
   * directive); failures are honest 502s, never an empty-catalog success.
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
      if (body.wire !== 'openai' && body.wire !== 'anthropic' && body.wire !== 'gemini') throw validation('discovery requires wire ("openai"|"anthropic"|"gemini") and baseUrl, or a stored configId');
      if (typeof body.baseUrl !== 'string' || body.baseUrl.length === 0) throw validation('discovery requires baseUrl');
      wire = body.wire;
      baseUrl = body.baseUrl;
      apiKey = typeof body.apiKey === 'string' ? body.apiKey : '';
    }
    try {
      const result = await discoverModels({ wire, baseUrl, apiKey }, fetch as unknown as Parameters<typeof discoverModels>[1]);
      sendJson(res, 200, result);
    } catch (e) {
      throw new HttpError(502, {
        code: 'provider_unreachable',
        message: `model discovery failed: ${e instanceof Error ? e.message : String(e)}`,
        retryable: true,
      });
    }
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

  // ---- built-in env routes (zai/dashscope): product-layer overrides ----
  // The env chain itself stays untouched; these endpoints manage the UI-declared
  // modelId override, list pricing and the default-route switch on top of it.

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

  const listBuiltinRoutes = (res: http.ServerResponse): void => {
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

  const updateBuiltinRoute = async (req: http.IncomingMessage, res: http.ServerResponse, name: string): Promise<void> => {
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

  const setBuiltinDefaultRoute = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
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

    // MULTIMODAL ingest: deterministic artifact understanding (SDM contract).
    if (segments[2] === 'ingest') {
      if (segments.length === 3 && method === 'POST') {
        return ingestRoute(req, res);
      }
      if (segments.length === 4 && method === 'GET') {
        const ref = segments[3];
        if (ref === undefined) throw notFound(`no route: ${method} ${url.pathname}`);
        return ingestGetByRef(res, ref);
      }
      throw notFound(`no route: ${method} ${url.pathname}`);
    }

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
      // B5 hypothesis lifecycle (R3) + BP-2 direct edit: POST /runs/:id/hypotheses/:hypId/<op>.
      // Ownership (run owns the hypothesis / the linked claim) is guarded inside
      // hypothesis-ops; this branch only dispatches the known verbs.
      if (segments[4] === 'screening' && segments.length === 5 && method === 'GET') {
        // Active-learning screening loop (ASReview-pattern): session view with
        // the ranked queue and the honest WSS@95-style stop estimate.
        try {
          sendJson(res, 200, buildScreeningView(app, getOrCreateScreeningSession(app, runId)));
        } catch (e) {
          if (e instanceof ScreeningError) {
            throw new HttpError(e.status, { code: e.code, message: e.message, retryable: false, runId });
          }
          throw e;
        }
        return;
      }
      if (segments[4] === 'screening' && segments[5] === 'decisions' && segments.length === 6 && method === 'POST') {
        const body = await readJsonObject(req);
        const srcId = typeof body.srcId === 'string' ? body.srcId : undefined;
        const verdict = body.verdict;
        if (srcId === undefined || (verdict !== 'include' && verdict !== 'exclude')) {
          throw validation('screening decision requires { srcId, verdict: include|exclude }');
        }
        const reason = typeof body.reason === 'string' && body.reason.length > 0 ? body.reason.slice(0, 2000) : undefined;
        try {
          const { session, duplicate } = recordScreeningDecision(app, runId, { srcId, verdict, ...(reason !== undefined ? { reason } : {}) });
          sendJson(res, duplicate ? 200 : 201, {
            duplicate,
            view: buildScreeningView(app, session),
          });
        } catch (e) {
          if (e instanceof ScreeningError) {
            throw new HttpError(e.status, { code: e.code, message: e.message, retryable: false, runId });
          }
          throw e;
        }
        return;
      }
      if (segments[4] === 'screening' && segments[5] === 'stop' && segments.length === 6 && method === 'POST') {
        try {
          const { session, feedbackId } = stopScreeningSession(app, runId);
          sendJson(res, 200, {
            view: buildScreeningView(app, session),
            ...(feedbackId !== undefined ? { feedbackId } : {}),
          });
        } catch (e) {
          if (e instanceof ScreeningError) {
            throw new HttpError(e.status, { code: e.code, message: e.message, retryable: false, runId });
          }
          throw e;
        }
        return;
      }
      if (segments.length === 7 && segments[4] === 'hypotheses') {
        const hypId = segments[5]!;
        const op = segments[6]!;
        if (method === 'POST' && (op === 'promote' || op === 'reject' || op === 'fork' || op === 'connect' || op === 'edit')) {
          const body = await readJsonObject(req);
          try {
            const result = op === 'promote' ? promoteHypothesis(app, runId, hypId, body)
              : op === 'reject' ? rejectHypothesis(app, runId, hypId, body)
              : op === 'fork' ? forkHypothesis(app, runId, hypId, body)
              : op === 'edit' ? await editHypothesis(app, runId, hypId, body)
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

      // HX §15 evidence annotation/classification — researcher judgement ops on
      // claims, same ownership/audit discipline as hypothesis-ops above.
      if (segments.length === 7 && segments[4] === 'claims') {
        const claimId = segments[5]!;
        const op = segments[6]!;
        const claimOps: Record<string, (a: App, r: string, c: string, b: unknown) => unknown> = {
          annotate: annotateClaim,
          pin: (a, r, c, b) => pinClaim(a, r, c, true, b),
          unpin: (a, r, c, b) => pinClaim(a, r, c, false, b),
          exclude: excludeClaim,
          reinstate: reinstateClaim,
          reclassify: reclassifyClaim,
        };
        const handler = claimOps[op];
        if (method === 'POST' && handler !== undefined) {
          const body = await readJsonObject(req);
          try {
            const result = handler(app, runId, claimId, body);
            sendJson(res, 200, result);
            return;
          } catch (e) {
            if (e instanceof ClaimOpError) {
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
        if (segments.length === 7 && segments[4] === 'experiments' && segments[6] === 'approve' && method === 'POST') {
          // BP-5 confirmatory binding approval (hypothesis-bound comparisons).
          const body = await readJsonObject(req);
          try {
            const result = approveExperiment(app, runId, segments[5]!, body);
            sendJson(res, 200, result);
            return;
          } catch (e) {
            if (e instanceof ExperimentOpError) {
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
      if (segments.length === 5 && segments[4] === 'evaluations' && method === 'GET') {
        // AVO fusion G8 projection: the deterministic evaluator family over this
        // run's scientific state (multi-dimensional, no invented single score).
        mustGetRun(runId);
        sendJson(res, 200, { runId, evaluations: runEvaluators({ store: app.store, runId, now: new Date().toISOString() }) });
        return;
      }
      if (segments.length === 5 && segments[4] === 'lineage' && method === 'GET') {
        // AVO fusion G3 projection: the queryable research trajectory graph
        // (run revision family + hypotheses + evidence + causal revisions).
        // Read-only over the store; 404s honestly when the run does not exist.
        mustGetRun(runId);
        sendJson(res, 200, buildLineageGraph({ store: app.store, rootRunId: runId }));
        return;
      }
      if (segments.length === 5 && segments[4] === 'supervision' && method === 'GET') {
        // AVO fusion G2 projection: current supervisor analysis (fresh, not a
        // stored snapshot) so UX shows the live trajectory health. Read-only.
        mustGetRun(runId);
        sendJson(res, 200, analyzeTrajectory({ store: app.store, runId }));
        return;
      }
      if (segments.length === 5 && segments[4] === 'truth' && method === 'GET') {
        // Execution-truth projection (goal §5.5): deterministic receipt-derived
        // view of HOW this run executed (live / mixed / synthetic / recorded_replay),
        // incl. retrieval cache/replay composition. Read-only; receipts stay authoritative.
        mustGetRun(runId);
        sendJson(res, 200, runTruthProfile(app.store, runId));
        return;
      }
      if (segments.length === 5 && segments[4] === 'counter-search' && method === 'POST') {
        // §5.2 counter-evidence loop closure: execute ONE researcher-directed
        // counter-evidence search against the live source plane and grow the run
        // corpus (append-only snapshot versioning; receipts + events; lease-guarded).
        const body = await readJsonObject(req);
        try {
          sendJson(res, 201, await runCounterSearch(app, runId, body, opts.counterSearchSourceFor));
        } catch (e) {
          if (e instanceof CounterSearchError) {
            throw new HttpError(e.status, { code: e.code, message: e.message, retryable: false, runId });
          }
          throw e;
        }
        return;
      }
      if (segments.length === 4) {
        if (method === 'GET') return runDetail(res, runId);
        if (method === 'DELETE') {
          // Researcher lifecycle (gap R1): delete a run and everything it owns.
          // Guarded against live execution — one execution per run, one deletion per run.
          const run = mustGetRun(runId);
          if (run.status === 'running' || executing.has(runId)) {
            throw new HttpError(409, {
              code: 'run_active',
              message: `run ${runId} is ${executing.has(runId) ? 'executing in this server' : `in status '${run.status}'`} — cancel it before deleting`,
              retryable: false,
              runId,
            });
          }
          const deleted = app.store.deleteRunCascade(runId);
          if (deleted === null) throw notFound(`run not found: ${runId}`, runId);
          const conversationsUpdated = detachRunFromAllConversations(app, runId);
          sendJson(res, 200, { ok: true, runId, deleted: { ...deleted, conversationsUpdated } });
          return;
        }
        throw notFound(`method ${method} not allowed for ${url.pathname}`);
      }

      // RU-12 GO-2 time travel: project the run's object-space AS OF an event seq.
      if (segments.length === 6 && segments[4] === 'state-at' && method === 'GET') {
        const runId2 = segments[3]!;
        assertRunId(runId2);
        mustGetRun(runId2);
        const raw = segments[5]!;
        if (!/^\d+$/.test(raw)) throw validation('seq must be a non-negative integer');
        const seq = Number(raw);
        const state = app.store.stateAtSeq(runId2, seq);
        sendJson(res, 200, {
          runId: runId2,
          seq: state.seq,
          stage: state.stage,
          questionId: state.questionId,
          objectIdsByKind: state.objectIdsByKind,
          eventCount: state.events.length,
          lastEvents: state.events.slice(-8).map((e) => ({ seq: e.seq, type: e.type, stage: e.stage ?? null })),
        });
        return;
      }
      if (segments.length === 5) {
        const leaf = segments[4]!;
        if (leaf === 'events' && method === 'GET') return runEvents(res, runId, url);
        // RU-2 branch writer: fork a settled run (question referenced, never
        // copied; forked_from lineage edge; step cache seeded for replay).
        if (leaf === 'fork' && method === 'POST') {
          const source = mustGetRun(runId);
          if (source.status === 'running' || source.status === 'queued') {
            throw validation(`run ${runId} is ${source.status} — fork from a settled run`);
          }
          const body = await readJsonObject(req);
          const reason = typeof body.reason === 'string' && body.reason.trim().length > 0
            ? body.reason.trim()
            : 'forked from researcher UI';
          const fork = app.store.forkRun(runId, { reason });
          sendJson(res, 201, { run: { id: fork.id, parentRunId: fork.parentRunId, status: fork.status } });
          return;
        }
        // RU-2 interop: PROV-O JSON-LD export from the lineage_edges single source.
        if (leaf === 'prov' && method === 'GET') {
          mustGetRun(runId);
          const edges = app.store.listLineageEdges({ runId });
          // RU-6: enrich evidence edges with their original relation type so the
          // CiTO IRI is exact (lineage edges carry the collapsed counter/support kind).
          const relationTypes: Record<string, EvidenceRelationType> = {};
          for (const rel of app.store.listObjects('evidence_relation', runId) as unknown as Array<{ id: string; relation: string }>) {
            const parsedRel = EvidenceRelationType.safeParse(rel.relation);
            if (parsedRel.success) relationTypes[rel.id] = parsedRel.data;
          }
          const graph = toProvJsonLd({ rootRunId: runId, runs: [{ id: runId }], edges, relationTypes });
          sendJson(res, 200, graph);
          return;
        }
        if (leaf === 'question' && method === 'GET') return runQuestion(res, runId);
        if (leaf === 'question' && method === 'PATCH') return await editRunQuestion(req, res, runId);
        if (leaf === 'scope-proposal' && method === 'POST') return await scopeProposal(res, runId);
        if (leaf === 'report' && method === 'GET') return runReport(res, runId);
        if (leaf === 'paper' && method === 'GET') return runPaper(res, runId);
        if (leaf === 'package' && method === 'GET') return runPackageZip(res, runId);
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
          const achAnalysis = app.store.listObjects('ach_analysis', runId).at(-1) ?? null;
          // HX §15 downstream semantics of claim exclusion: a read-time
          // researcher-adjusted PROJECTION recomputed with the same pure
          // functions the pipeline used (stored AchAnalysis stays untouched;
          // both views are disclosed — the exclusion is a judgement, not an
          // erasure). Null when nothing is excluded.
          let achResearcherAdjusted: {
            excludedClaimIds: string[];
            diagnosticity: ReturnType<typeof diagnosticityScores>;
            removalSensitivity: ReturnType<typeof removalSensitivity>;
            method: string;
          } | null = null;
          const excludedClaimIds = excludedClaimIdsOf(app.store.listObjects('claim', runId));
          if (achAnalysis !== null && excludedClaimIds.length > 0) {
            // Stored relations re-validated through the domain schema (honest
            // narrowing, no blind cast), then the excluded claims' rows drop.
            const keptRelations = app.store.listObjects('evidence_relation', runId)
              .flatMap((r) => {
                const parsed = EvidenceRelation.safeParse(r);
                return parsed.success ? [parsed.data] : [];
              })
              .filter((r) => r.claimId === undefined || !excludedClaimIds.includes(r.claimId));
            achResearcherAdjusted = {
              excludedClaimIds,
              diagnosticity: diagnosticityScores(keptRelations),
              removalSensitivity: removalSensitivity(keptRelations, achAnalysis.hypothesisIds),
              method: 'heuer-diagnosticity-v1-researcher-adjusted',
            };
          }
          return sendJson(res, 200, {
            hypotheses: app.store.listObjects('hypothesis', runId),
            scorecards: app.store.listObjects('scorecard', runId),
            // D-016: pairwise tournament evidence behind the final ordering (uncertainty included)
            tournament: app.store.listObjects('tournament', runId).at(-1) ?? null,
            // Wave-S g8/g9: hypothesis-level evidence bodies (floor certainty, independent
            // sources, Σlog-LR band, QBAF+Carneades, orthogonal promotion) + ACH audit
            evidenceBodies: app.store.listObjects('evidence_body', runId),
            achAnalysis,
            achResearcherAdjusted,
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
            experimentSpecs: app.store.listObjects('experiment_spec', runId),
          });
        }
        if (leaf === 'receipts' && method === 'GET') {
          mustGetRun(runId);
          return sendJson(res, 200, { receipts: app.store.listObjects('receipt', runId) });
        }
        if (leaf === 'calibration' && method === 'GET') {
          // Wave-S L4 self-calibration surface: the system's own forward predictions,
          // settlement state, and the pooled proper-score report (RPS vs the ignorance
          // baseline; n<30 strata honestly say "insufficient evidence").
          mustGetRun(runId);
          const entries = app.store.listObjects('prediction', runId);
          return sendJson(res, 200, { entries, report: calibrationReport(entries) });
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

    if (segments[2] === 'tools') {
      if (segments.length === 3) {
        if (method === 'GET') return sendJson(res, 200, { integrations: listToolIntegrationsAll().map(toolIntegrationView) });
        if (method === 'POST') return createToolIntegration(req, res);
        throw notFound(`method ${method} not allowed for ${url.pathname}`);
      }
      if (segments[3] === 'import-plugin' && segments.length === 4 && method === 'POST') return importPluginRoute(req, res);
      const leaf = segments[3]!;
      if (segments[4] === 'test' && segments.length === 5 && method === 'POST') return testToolIntegration(req, res, leaf);
      if (segments.length === 4) {
        if (method === 'GET') {
          assertToolIntegrationId(leaf);
          return sendJson(res, 200, { integration: toolIntegrationView(mustGetToolIntegration(leaf)) });
        }
        if (method === 'PUT') return updateToolIntegration(req, res, leaf);
        if (method === 'DELETE') {
          assertToolIntegrationId(leaf);
          mustGetToolIntegration(leaf);
          app.store.deleteObject('tool_integration', leaf);
          return sendJson(res, 200, { deleted: leaf });
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
      if (leaf === 'usage' && segments.length === 4 && method === 'GET') return listWorkspaceUsage(res);
      if (leaf === 'templates' && segments.length === 4 && method === 'GET') return listProviderTemplates(res);
      if (leaf === 'spend-limit' && segments.length === 4) {
        if (method === 'GET') {
          sendJson(res, 200, workspaceSpendStatus(app.store));
          return;
        }
        if (method === 'PUT') {
          const body = await readJsonObject(req);
          const limitUsd = body.limitUsd;
          if (limitUsd !== null && (typeof limitUsd !== 'number' || !Number.isFinite(limitUsd) || limitUsd <= 0)) {
            throw new HttpError(400, { code: 'validation', message: 'field "limitUsd" must be a positive number or null', retryable: false });
          }
          writeSpendLimit(app.store, limitUsd);
          sendJson(res, 200, { ok: true, ...workspaceSpendStatus(app.store) });
          return;
        }
        throw notFound(`method ${method} not allowed for ${url.pathname}`);
      }
      if (leaf === 'discover' && segments.length === 4 && method === 'POST') return discoverFromModelConfig(req, res);
      if (leaf === 'builtin-routes') {
        if (segments.length === 4) {
          if (method === 'GET') return listBuiltinRoutes(res);
          if (method === 'PUT') return setBuiltinDefaultRoute(req, res);
          throw notFound(`method ${method} not allowed for ${url.pathname}`);
        }
        if (segments.length === 5 && method === 'PUT') return updateBuiltinRoute(req, res, segments[4]!);
        throw notFound(`no route: ${method} ${url.pathname}`);
      }
      if (segments.length === 4) {
        if (method === 'GET') return getModelConfig(res, leaf);
        if (method === 'PUT') return updateModelConfig(req, res, leaf);
        if (method === 'DELETE') return deleteModelConfig(res, leaf);
      }
      throw notFound(`no route: ${method} ${url.pathname}`);
    }

    if (segments[2] === 'zotero') {
      // Local-library bridge: the page cannot fetch Zotero directly (no CORS
      // headers on 127.0.0.1:23119), so the server proxies the full snapshot.
      if (segments[3] === 'library' && segments.length === 4 && method === 'GET') {
        try {
          sendJson(res, 200, await fetchZoteroLibrary());
        } catch (e) {
          if (e instanceof ZoteroUnavailableError) {
            throw new HttpError(503, { code: 'provider_unreachable', message: e.message, retryable: true });
          }
          throw e;
        }
        return;
      }
      if (segments[3] === 'annotations' && segments.length === 4 && method === 'GET') {
        // Researcher annotations (highlights/notes) — seed material for studies.
        try {
          sendJson(res, 200, await fetchZoteroAnnotations());
        } catch (e) {
          if (e instanceof ZoteroUnavailableError) {
            throw new HttpError(503, { code: 'provider_unreachable', message: e.message, retryable: true });
          }
          throw e;
        }
        return;
      }
      throw notFound(`no route: ${method} ${url.pathname}`);
    }

    if (segments[2] === 'conversations') {
      const convRoute = async (fn: () => Promise<void> | void): Promise<void> => {
        try {
          await fn();
        } catch (e) {
          if (e instanceof ConversationError) {
            throw new HttpError(e.status, { code: e.code, message: e.message, retryable: e.code === 'conversation_model_failed' });
          }
          throw e;
        }
      };
      if (segments.length === 3) {
        if (method === 'GET') return convRoute(() => sendJson(res, 200, { conversations: listConversations(app) }));
        if (method === 'POST') {
          return convRoute(async () => {
            const body = await readJsonObject(req);
            sendJson(res, 201, { conversation: createConversation(app, body) });
          });
        }
        throw notFound(`method ${method} not allowed for ${url.pathname}`);
      }
      const convId = segments[3]!;
      if (convId === undefined) throw notFound(`no route: ${method} ${url.pathname}`);
      if (segments.length === 4) {
        if (method === 'GET') return convRoute(() => sendJson(res, 200, { conversation: getConversation(app, convId) }));
        if (method === 'DELETE') return convRoute(() => { deleteConversation(app, convId); sendJson(res, 200, { ok: true }); });
        throw notFound(`method ${method} not allowed for ${url.pathname}`);
      }
      if (segments[4] === 'messages' && segments.length === 5 && method === 'POST') {
        return convRoute(async () => {
          const body = await readJsonObject(req);
          sendJson(res, 200, { conversation: await postConversationMessage(app, convId, body, conversationDeps) });
        });
      }
      // retry re-runs the agent reply for the last (unanswered) researcher message
      if (segments[4] === 'messages' && segments.length === 7 && segments[6] === 'retry' && method === 'POST') {
        return convRoute(async () => {
          sendJson(res, 200, { conversation: await retryConversationTurn(app, convId, segments[5]!, conversationDeps) });
        });
      }
      if (segments[4] === 'reasoning-gear' && segments.length === 5 && method === 'PUT') {
        return convRoute(async () => {
          const body = await readJsonObject(req);
          const updated = setConversationReasoningGear(app, convId, body.gear);
          sendJson(res, 200, { reasoningGear: updated.reasoningGear ?? null });
        });
      }
      if (segments[4] === 'reasoning-gear' && segments.length === 5 && method === 'GET') {
        return convRoute(() => {
          const conv = getConversation(app, convId);
          const route = resolveConversationReasoningRoute(app, conv);
          if (route === null) return sendJson(res, 200, { supported: false });
          return sendJson(res, 200, {
            supported: true,
            style: route.style,
            defaultGear: route.defaultGear,
            gear: conv.reasoningGear ?? null,
            effectiveGear: conv.reasoningGear ?? route.defaultGear,
          });
        });
      }
      if (segments[4] === 'launch' && segments.length === 5 && method === 'POST') {
        return convRoute(async () => {
          const body = await readJsonObject(req);
          const text = typeof body.text === 'string' ? body.text.trim() : '';
          if (text.length === 0) throw validation('field "text" is required (the crystallized research question)');
          // All researcher materials from the conversation travel with the run.
          const conv = getConversation(app, convId);
          const runId = await createRunWithSeeds({
            text,
            ...(typeof body.providerConfigId === 'string' ? { providerConfigId: body.providerConfigId } : {}),
            seeds: collectConversationSeeds(conv),
          });
          attachRunToConversation(app, convId, runId);
          sendJson(res, 202, { runId });
        });
      }
      if (segments[4] === 'proposals' && segments.length === 6 && method === 'POST') {
        return convRoute(async () => {
          const proposalId = segments[5]!;
          if (!/^act_[a-z0-9]+$/.test(proposalId)) throw validation('invalid proposal id');
          const body = await readJsonObject(req);
          if (typeof body.approve !== 'boolean') throw validation('field "approve" must be a boolean');
          const conversation = await resolveConversationProposal(
            app, convId, proposalId,
            { approve: body.approve, remember: body.remember === true },
            conversationDeps,
          );
          // RU-1 profile writer: researcher preferences derive deterministically
          // from the (now updated) proposal resolutions. Non-fatal by design — a
          // memory hiccup must never invalidate an approval; visible in server logs.
          try {
            consolidateConversationProfile(app.store, conversation as unknown as Parameters<typeof consolidateConversationProfile>[1]);
          } catch (e) {
            process.stderr.write(`far-server: profile consolidation failed after proposal ${proposalId}: ${e instanceof Error ? e.message : String(e)}\n`);
          }
          sendJson(res, 200, { conversation });
        });
      }
      if (segments[4] === 'automations' && segments.length === 5 && method === 'GET') {
        return convRoute(() => {
          getConversation(app, convId); // 404 when the conversation does not exist
          const automations = app.store.listObjects('automation', '__none__')
            .filter((a) => a.conversationId === convId)
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
          return sendJson(res, 200, { automations });
        });
      }
      throw notFound(`no route: ${method} ${url.pathname}`);
    }

    if (segments[2] === 'automations') {
      if (segments.length === 3) {
        if (method === 'GET') {
          const automations = app.store.listObjects('automation', '__none__')
            .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
          return sendJson(res, 200, { automations });
        }
        throw notFound(`method ${method} not allowed for ${url.pathname}`);
      }
      const automationId = segments[3]!;
      if (automationId === undefined || !/^auto_[a-z0-9]+$/.test(automationId)) throw validation('invalid automation id');
      if (segments.length === 4 && method === 'GET') {
        const automation = app.store.getObject('automation', automationId);
        if (automation === null) throw notFound(`automation not found: ${automationId}`);
        return sendJson(res, 200, { automation });
      }
      if (segments.length === 4 && method === 'PATCH') {
        const automation = app.store.getObject('automation', automationId);
        if (automation === null) throw notFound(`automation not found: ${automationId}`);
        const body = await readJsonObject(req);
        if (typeof body.enabled !== 'boolean') throw validation('field "enabled" must be a boolean');
        app.store.putObject('automation', { ...automation, enabled: body.enabled, updatedAt: new Date().toISOString() });
        return sendJson(res, 200, { automation: app.store.getObject('automation', automationId) });
      }
      if (segments.length === 4 && method === 'DELETE') {
        if (app.store.getObject('automation', automationId) === null) throw notFound(`automation not found: ${automationId}`);
        app.store.deleteObject('automation', automationId);
        return sendJson(res, 200, { deleted: automationId });
      }
      throw notFound(`no route: ${method} ${url.pathname}`);
    }

    if (segments[2] === 'agent-policy') {
      // Resident-agent approval posture (settings surface): the engine is
      // fail-closed by design — every tool-class action asks once per
      // conversation, and "remember" adds that action KIND to that one
      // conversation's autoApprove (bounded at 10). This endpoint makes the
      // posture visible and lets the researcher revoke remembered kinds.
      const policyRoute = (fn: () => void): void => {
        try {
          fn();
        } catch (e) {
          if (e instanceof ConversationError) {
            throw new HttpError(e.status, { code: e.code, message: e.message, retryable: false });
          }
          throw e;
        }
      };
      if (segments.length === 3 && method === 'GET') {
        return policyRoute(() => {
          const remembered = listConversations(app)
            .filter((c) => c.autoApprove.length > 0)
            .map((c) => ({ conversationId: c.id, conversationTitle: c.title, kinds: c.autoApprove }));
          sendJson(res, 200, { defaultPolicy: 'ask_per_conversation', remembered });
        });
      }
      if (segments[3] === 'remember' && segments.length === 5 && method === 'DELETE') {
        const convId = segments[4]!;
        return policyRoute(() => {
          const conv = getConversation(app, convId); // 404 when unknown
          if (conv.autoApprove.length === 0) {
            sendJson(res, 200, { conversationId: convId, kinds: [] });
            return;
          }
          const updated = ConversationSchema.parse({ ...conv, autoApprove: [], updatedAt: new Date().toISOString() });
          app.store.putObject('conversation', updated);
          sendJson(res, 200, { conversationId: convId, kinds: [] });
        });
      }
      throw notFound(`no route: ${method} ${url.pathname}`);
    }

    if (segments[2] === 'competition-route' && segments.length === 3) {
      // 11→12 handoff 2026-08-25: competition route gate switch (settings surface).
      // GET → current mode; PUT {on:boolean} → idempotent write. Semantics live in
      // provider-resolver (ON holds every resolved route to the official Qwen-via-Bailian
      // rule, fail-closed on violation; re-read per resolution so edits hit live runs).
      if (method === 'GET') {
        return sendJson(res, 200, { competitionRouteMode: readCompetitionRouteMode(app.store) ? 'on' : 'off' });
      }
      if (method === 'PUT') {
        const raw = (await readBody(req)).toString('utf8');
        let body: unknown;
        try { body = JSON.parse(raw); } catch { body = undefined; }
        if (typeof body !== 'object' || body === null || typeof (body as { on?: unknown }).on !== 'boolean') {
          throw new HttpError(400, { code: 'validation', message: 'PUT /api/v1/competition-route expects {"on": boolean}', retryable: false });
        }
        writeCompetitionRouteMode(app.store, (body as { on: boolean }).on);
        return sendJson(res, 200, { competitionRouteMode: (body as { on: boolean }).on ? 'on' : 'off' });
      }
      throw notFound(`no route: ${method} ${url.pathname}`);
    }

        if (segments[2] === 'health' && segments.length === 3 && method === 'GET') {
      return health(res);
    }

    if (segments[2] === 'meta' && segments.length === 3 && method === 'GET') {
      // Server/workspace facts for the settings About section: version + data
      // location. Env var NAMES and paths only — secret values never leave.
      let version = 'unknown';
      try {
        const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
        version = String(JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version ?? 'unknown');
      } catch {
        // honest unknown — never fabricate a version
      }
      return sendJson(res, 200, { version, dataDir: app.dataDir });
    }

    if (segments[2] === 'search' && segments.length === 3 && method === 'GET') {
      return search(res, url);
    }

    // RU-1 cross-run research memory: list + deterministic-ranked search.
    if (segments[2] === 'memory' && segments.length === 3 && method === 'GET') {
      const q = url.searchParams.get('q');
      const kind = url.searchParams.get('kind');
      if (kind !== null && !/^(episodic|semantic|experiment_outcome|profile)$/.test(kind)) {
        throw validation('query "kind" must be a memory kind');
      }
      if (q !== null && q.trim().length > 0) {
        const items = app.store.searchMemory({
          query: q.trim(),
          ...(kind !== null ? { kinds: [kind as 'episodic' | 'semantic' | 'experiment_outcome' | 'profile'] } : {}),
        });
        return sendJson(res, 200, { query: q.trim(), items });
      }
      const items = app.store.listMemory(kind !== null ? { kind: kind as 'episodic' } : {});
      return sendJson(res, 200, { items });
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
      automationEngine?.stop();
      server.close(() => resolve());
      server.closeIdleConnections();
      server.closeAllConnections();
    });

  return { server, start, stop };
}
