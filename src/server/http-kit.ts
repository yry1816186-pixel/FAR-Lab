import http from 'node:http';
import type { App } from '../app/composition.js';
import type { ResearchRun, RunStageName } from '../domain/run.js';
import type { SourceFamily } from '../domain/source.js';
import type { SourceAdapter } from '../shared/ports.js';
import type { TerminalManager } from './terminal.js';
import type { ConversationTurnHub, SequencedConversationStreamEvent } from './conversation-stream.js';
import type { ConversationDeps } from './conversations.js';

/**
 * HTTP plumbing shared by every route family (BC-002 split): the error
 * envelope + its four constructors, the response writers, the capped body
 * reader, path-segment decoding, path-param id gates and the three SSE
 * channels. Pure extraction from the former api.ts monolith — semantics are
 * frozen by tests/route-table.test.ts and tests/http-kit-contract.test.ts.
 */

export interface ApiServerError {
  code: 'not_found' | 'validation' | 'already_running' | 'run_active' | 'not_started' | 'internal' | 'target_not_found' | 'lifecycle' | 'question_required' | 'action_model_failed' | 'action_budget_exhausted' | 'invalid_action_request' | 'invalid_counter_search' | 'provider_unreachable' | 'conversation_model_failed' | 'conversation_full' | 'turn_in_flight' | 'turn_cancelled' | 'no_active_turn' | 'no_corpus' | 'session_stopped' | 'src_not_in_pool' | 'run_not_found' | 'already_launched' | 'scope_proposal_failed' | 'scope_proposal_unavailable' | 'lease_held' | 'feature_disabled' | 'terminal_limit' | 'terminal_not_writable';
  message: string;
  retryable: boolean;
  runId?: string;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly payload: ApiServerError,
  ) {
    super(payload.message);
  }
}

export const notFound = (message: string, runId?: string): HttpError =>
  new HttpError(404, {
    code: 'not_found',
    message,
    retryable: false,
    ...(runId !== undefined ? { runId } : {}),
  });

export const validation = (message: string): HttpError =>
  new HttpError(400, { code: 'validation', message, retryable: false });

export const alreadyRunning = (runId: string): HttpError =>
  new HttpError(409, {
    code: 'already_running',
    message: `run ${runId} is already executing in this server — one execution per run; poll GET /api/v1/runs/${runId} instead`,
    retryable: false,
    runId,
  });

export const internal = (message: string): HttpError =>
  new HttpError(500, { code: 'internal', message, retryable: true });

/** Split a pathname into decoded segments; null when any segment is malformed. */
export const decodeSegments = (pathname: string): string[] | null => {
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

/** run ids are prefix-branded by construction; reject malformed path params before they cross into the store layer. */
const RUN_ID_RE = /^run_[0-9a-z]{20,32}$/;

export const assertRunId = (runId: string): void => {
  if (!RUN_ID_RE.test(runId)) throw validation(`invalid runId format: ${runId}`);
};

/** Model-config ids are prefix-branded the same way (mcfg_...); shared by run launch and the config routes. */
const MODEL_CONFIG_ID_RE = /^mcfg_[0-9a-z]{20,32}$/;

export const assertModelConfigId = (id: string): void => {
  if (!MODEL_CONFIG_ID_RE.test(id)) throw validation(`invalid model config id format: ${id}`);
};

/** Re-exported so run launch and route families share the single pattern owner. */
export { MODEL_CONFIG_ID_RE };

const MAX_BODY_BYTES = 1_000_000;

export const sendJson = (res: http.ServerResponse, status: number, body: unknown): void => {
  if (res.writableEnded) return;
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
};

export const sendError = (res: http.ServerResponse, err: HttpError): void =>
  sendJson(res, err.status, { error: err.payload });

export const sendText = (res: http.ServerResponse, status: number, contentType: string, body: string): void => {
  if (res.writableEnded) return;
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
};

/** Capped request-body reader (1MB; drain-and-reject on overflow so the response stays deliverable). */
export const readBody = (req: http.IncomingMessage): Promise<Buffer> =>
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

export const readJsonObject = async (req: http.IncomingMessage): Promise<Record<string, unknown>> => {
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

/**
 * Shared per-server context handed to every route-family registrar: the app
 * kernel plus the server-scoped state families need (execution slots, terminal
 * manager, conversation-turn hub, launch bridge, watchdog health).
 */
export interface RouteCtx {
  readonly app: App;
  /** Product/test executor seam (ApiServerOptions.executor) — scope-proposal awaits it directly. */
  readonly executor: (runId: string, opts?: { stopAfter?: RunStageName }) => Promise<unknown>;
  /** One in-flight execution per run id; a second request fails with 409 semantics. */
  readonly executing: Map<string, Promise< unknown>>;
  startRun(runId: string, execOpts?: { stopAfter?: RunStageName }): boolean;
  /** 404-closed run lookup shared by every /runs/:id handler. */
  mustGetRun(runId: string): ResearchRun;
  readonly terminals: TerminalManager;
  readonly conversationTurns: ConversationTurnHub;
  readonly conversationDeps: ConversationDeps;
  /** Shared run-creation core (POST /runs, conversation launch, automations bridge). */
  createRunWithSeeds(body: Record<string, unknown>): Promise<string>;
  /** Watchdog sweep-health counter for GET /health (WP2 F-007). */
  consecutiveSweepFailures(): number;
  /** Test seam for the counter-search route (ApiServerOptions.counterSearchSourceFor). */
  readonly counterSearchSourceFor?: (family: SourceFamily) => SourceAdapter;
}

/**
 * A route family: returns true when the request was handled (response sent or
 * error thrown), false when the path belongs to another family. Families are
 * composed in registration order; a fully-unmatched path 404s in the composer.
 */
export type RouteFamily = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  segments: string[],
) => Promise<boolean>;

/**
 * B3 SSE push channel for run events — Node-native, zero dependencies.
 * Server push replaces the 2s polling cadence; clients keep polling as the
 * fallback for environments where EventSource is unavailable. Cursor comes
 * from Last-Event-ID (reconnects) or ?afterSeq (first open). Bounded
 * lifetime (10 min): EventSource auto-reconnects and resumes from its cursor.
 */
export const runEventStream = (req: http.IncomingMessage, res: http.ServerResponse, runId: string, url: URL, ctx: RouteCtx): void => {
  ctx.mustGetRun(runId);
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
      const fresh = ctx.app.store.listEventsAfter(runId, cursor);
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

/**
 * Terminal SSE (extensibility lane): ring-buffer replay then live shell output.
 * The terminal is a GLOBAL panel, so a stream is a long-lived session view:
 * no hard 30-minute cut (the session's own idle TTL governs lifetime), and
 * every `out` frame carries its stream offset (`pos`) so an EventSource
 * reconnect replays without duplicating the transcript.
 */
export const terminalEventStream = (req: http.IncomingMessage, res: http.ServerResponse, id: string, ctx: RouteCtx): void => {
  const terminals = ctx.terminals;
  const onEvent = (event: { type: 'out'; data: string; pos: number } | { type: 'exit'; code: number | null }): void => {
    if (event.type === 'out') res.write(`event: terminal-out\ndata: ${JSON.stringify({ data: event.data, pos: event.pos })}\n\n`);
    else {
      res.write(`event: terminal-exit\ndata: ${JSON.stringify({ code: event.code })}\n\n`);
      close();
    }
  };
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': stream open\n\n');
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    terminals.unsubscribe(id, onEvent);
    res.end();
  };
  const timer = setInterval(() => { if (!closed) res.write(': ping\n\n'); }, 5_000);
  const sub = terminals.subscribe(id, onEvent);
  if (sub === null) {
    res.write(`event: terminal-exit\ndata: ${JSON.stringify({ code: null, reason: 'session not found (expired or killed)' })}\n\n`);
    close();
    return;
  }
  if (sub.droppedChars > 0) res.write(`: ring evicted ${sub.droppedChars} older chars\n\n`);
  req.on('close', close);
  res.on('error', close);
};

/** Resident-agent stream: seq replay + live public progress. A response
 * socket closing only unsubscribes; explicit /cancel owns cancellation. */
export const conversationTurnStream = (
  res: http.ServerResponse,
  conversationId: string,
  url: URL,
  ctx: RouteCtx,
): void => {
  const conversationTurns = ctx.conversationTurns;
  const headerSeq = Number.parseInt(String(res.req.headers['last-event-id'] ?? ''), 10);
  const querySeq = Number.parseInt(url.searchParams.get('afterSeq') ?? '0', 10);
  const afterSeq = Number.isFinite(headerSeq) && headerSeq > 0
    ? headerSeq
    : Number.isFinite(querySeq) && querySeq > 0 ? querySeq : 0;
  let closed = false;
  let heartbeat: NodeJS.Timeout | null = null;
  let unsubscribe = (): void => {};
  const terminal = (event: SequencedConversationStreamEvent): boolean =>
    event.payload.type === 'completed' || event.payload.type === 'failed' || event.payload.type === 'cancelled';
  const write = (event: SequencedConversationStreamEvent): void => {
    if (closed || res.writableEnded) return;
    res.write(`id: ${event.seq}\nevent: conversation-turn\ndata: ${JSON.stringify(event)}\n\n`);
    if (terminal(event)) queueMicrotask(close);
  };
  const close = (): void => {
    if (closed) return;
    closed = true;
    if (heartbeat !== null) clearInterval(heartbeat);
    unsubscribe();
    if (!res.writableEnded) res.end();
  };
  const sub = conversationTurns.subscribe(conversationId, afterSeq, write);
  if (sub === null) throw notFound(`no active or recently completed conversation turn for ${conversationId}`);
  unsubscribe = sub.unsubscribe;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': conversation stream open\n\n');
  for (const event of sub.replay) write(event);
  if (!sub.running && !sub.replay.some(terminal)) {
    // The caller already consumed the terminal event (afterSeq is current).
    close();
    return;
  }
  heartbeat = setInterval(() => { if (!closed) res.write(': ping\n\n'); }, 10_000);
  res.on('close', close);
  res.on('error', close);
};
