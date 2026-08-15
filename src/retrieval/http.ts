/**
 * retrieval/http — hardened, fail-closed HTTP client for retrieval adapters.
 *
 * Security posture (directive §32 threat model, §54 fail-closed):
 *   - HOST ALLOWLIST: only approved scientific-repository hosts are fetched.
 *     Any other host → throw (no SSRF surface; untrusted query text can never
 *     redirect the system at an attacker-chosen internal URL).
 *   - TIMEOUT: every request has an AbortController deadline; a hung source
 *     fails closed, never silently returns empty.
 *   - PER-HOST SERIAL GATE + MIN INTERVAL: requests to one host are fully
 *     serialized (single connection, arXiv TOU) and spaced by a per-host
 *     minimum interval tracked on the MONOTONIC clock with logical target
 *     times (immune to NTP wall-clock jumps and early-wake drift).
 *   - RATE BUDGET: X-RateLimit-Remaining/-Reset headers (OpenAlex daily
 *     budget model, verified 2026-08-15) are tracked; a host whose reported
 *     budget is at/below the floor is refused locally instead of burning a
 *     doomed request.
 *   - BACKOFF: 429/503/504/network/timeout retry with Retry-After (RFC 9110
 *     dual format) → X-RateLimit-Reset → full-jitter exponential (AWS formula,
 *     base 1s cap 8s), at most 3 retries; server-demanded waits beyond 60s
 *     are surfaced as a structured budget error instead of stalling the run.
 *   - PERSISTENT CACHE: successful responses are stored in
 *     `.far/cache/retrieval/` (content-addressed; see cache.ts) and replayed
 *     verbatim within the per-source TTL — a hit reuses the ORIGINAL
 *     retrievedAt so corpus snapshot ids stay stable across runs.
 *
 * All errors are RetrievalHttpError (structured: kind/status/retryAfterMs) —
 * messages retain the historical substrings ("non-2xx status N", "fetch
 * failed for", "timeout after") for regex compatibility.
 *
 * This module returns RAW response text. It does NOT sanitize for model
 * consumption — callers route any text destined for an LLM context through
 * sanitizeExternalContent() (retrieved content is DATA, never instructions, §12).
 */
import { sanitizeExternalContent } from '../llm_gateway/sanitizer.ts';
import {
  BACKOFF_DEFAULTS,
  computeBackoffDelayMs,
  isTransientRetrievalStatus,
  parseRetryAfterMs,
  RateBudgetTracker,
} from './backoff.ts';
import { RetrievalCache } from './cache.ts';

/** Approved scientific-repository hosts (the only hosts retrieval may fetch). */
export const RETRIEVAL_HOST_ALLOWLIST = [
  'api.openalex.org',
  'export.arxiv.org',
  'api.crossref.org',
] as const;
/** Type alias: an allowed retrieval host. */
export type RetrievalHost = (typeof RETRIEVAL_HOST_ALLOWLIST)[number];

const DEFAULT_TIMEOUT_MS = 20_000;
/** Server-demanded waits beyond this are surfaced as budget errors (no stall). */
const MAX_SERVER_WAIT_MS = 60_000;

/**
 * Per-host minimum interval (ms). arXiv: 3000ms = the official TOU
 * ("no more than one request every three seconds", single connection —
 * info.arxiv.org/help/api/tou.html, verified 2026-08-15; the previous 350ms
 * value violated the TOU). OpenAlex/Crossref: conservative spacing far below
 * their per-second ceilings (100 req/s OpenAlex; Crossref polite 10 req/s).
 */
export const HOST_MIN_INTERVAL_MS: Record<string, number> = {
  'export.arxiv.org': 3000,
  'api.openalex.org': 150,
  'api.crossref.org': 200,
};

/**
 * Structured retrieval failure. `kind` discriminates the failure class;
 * `retryAfterMs` carries any server-demanded wait (Retry-After / budget reset).
 */
export class RetrievalHttpError extends Error {
  readonly kind: 'http-status' | 'network' | 'timeout' | 'budget';
  readonly status: number;
  readonly url: string;
  readonly retryAfterMs: number | null;
  readonly rateLimitRemaining: number | null;

  constructor(init: {
    readonly kind: RetrievalHttpError['kind'];
    readonly status: number;
    readonly url: string;
    readonly message: string;
    readonly retryAfterMs?: number | null;
    readonly rateLimitRemaining?: number | null;
    readonly cause?: unknown;
  }) {
    super(init.message, init.cause === undefined ? {} : { cause: init.cause });
    this.name = 'RetrievalHttpError';
    this.kind = init.kind;
    this.status = init.status;
    this.url = init.url;
    this.retryAfterMs = init.retryAfterMs ?? null;
    this.rateLimitRemaining = init.rateLimitRemaining ?? null;
  }
}

/** Whether an error is retry-worthy (throttling / transient / connectivity). */
function isRetryableError(err: unknown): boolean {
  if (!(err instanceof RetrievalHttpError)) return false;
  if (err.kind === 'network' || err.kind === 'timeout') return true;
  return isTransientRetrievalStatus(err.status);
}

// ── Per-host serial gate (single connection + min interval, race-free) ───────

const hostNextAllowedAt: Record<string, number> = {};
const hostTail: Record<string, Promise<void>> = {};

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Serialize per-host requests and enforce the min interval using logical
 * target times on the monotonic clock (algorithm ported from the LLM rate
 * limiter: next = max(next + interval, now) — no drift accumulation, no
 * wall-clock dependence, no concurrent breach of the gate).
 */
async function gateOnHost(host: string): Promise<void> {
  const tail = hostTail[host] ?? Promise.resolve();
  let release!: () => void;
  const done = new Promise<void>((resolve) => {
    release = resolve;
  });
  hostTail[host] = tail.then(() => done);
  await tail;
  try {
    const interval = HOST_MIN_INTERVAL_MS[host] ?? 250;
    const now = performance.now();
    const nextAt = hostNextAllowedAt[host] ?? 0;
    const waitMs = Math.max(0, nextAt - now);
    if (waitMs > 0) await realSleep(waitMs);
    hostNextAllowedAt[host] = Math.max(nextAt + interval, performance.now());
  } finally {
    release();
  }
}

// ── Module-level defaults (budget tracker + persistent cache) ────────────────

let budgetTracker = new RateBudgetTracker();
let responseCache = new RetrievalCache();

/** Test seam: fresh budget/cache state (never call in production paths). */
export function resetRetrievalHttpDefaultsForTests(): void {
  budgetTracker = new RateBudgetTracker();
  responseCache = new RetrievalCache();
}

/** Polite User-Agent: self-identifying base + contact mailto when configured. */
function politeUserAgent(host: string): string {
  const base = 'FAR-Lab-retrieval/1.0 (scientific-evidence-verification)';
  const mailto =
    host === 'api.crossref.org'
      ? (process.env.CROSSREF_MAILTO ?? process.env.OPENALEX_MAILTO)
      : process.env.OPENALEX_MAILTO;
  const contact = mailto !== undefined && mailto !== '' ? mailto : null;
  return contact === null ? base : `${base}; mailto:${contact}`;
}

/** The result of a fetchText call. */
export interface FetchedText {
  readonly url: string;
  readonly status: number;
  readonly body: string;
  /** True when served from the persistent cache (replay semantics). */
  readonly cacheHit?: boolean;
  /** ISO timestamp of the ORIGINAL fetch (recorded in the cache envelope). */
  readonly retrievedAt?: string;
}

/** Injectable knobs for the retry/cache behavior (tests pass fast fakes). */
export interface FetchTextOptions {
  readonly maxRetries?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
}

/**
 * Fetch a URL from an allowlisted retrieval host, returning raw text.
 * Fail-closed on: non-allowlisted host, network error, timeout, non-2xx status
 * (after bounded, Retry-After-aware retries). Cached responses are replayed
 * verbatim within TTL (cacheHit=true, original retrievedAt).
 */
export async function fetchTextFromAllowlistedHost(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  opts: FetchTextOptions = {},
): Promise<FetchedText> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`retrieval/http: malformed URL '${url}'`);
  }
  assertHostAllowed(parsed.hostname);
  const host = parsed.hostname;
  const sleep = opts.sleep ?? realSleep;
  const maxRetries = opts.maxRetries ?? BACKOFF_DEFAULTS.maxRetries;

  // Cache first: a hit neither touches the network nor burns the rate budget.
  const cached = responseCache.lookup(url);
  if (cached !== null) {
    return {
      url,
      status: cached.status,
      body: cached.body,
      cacheHit: true,
      retrievedAt: cached.retrievedAt,
    };
  }

  for (let attempt = 0; ; attempt += 1) {
    // Budget guard: refuse doomed requests before they burn the last credits.
    if (budgetTracker.isExhausted(host)) {
      const resetMs = budgetTracker.getResetDelayMs(host);
      throw new RetrievalHttpError({
        kind: 'budget',
        status: 429,
        url,
        message:
          `retrieval/http: non-2xx status 429 from ${url} avoided — ` +
          `reported rate budget at/below floor for ${host}` +
          (resetMs !== null ? ` (resets in ~${Math.ceil(resetMs / 1000)}s)` : ''),
        retryAfterMs: resetMs,
        rateLimitRemaining: budgetTracker.getRemaining(host),
      });
    }

    await gateOnHost(host);

    const headers: Record<string, string> = {
      'User-Agent': politeUserAgent(host),
      Accept: 'application/json',
    };
    if (init.headers && typeof init.headers === 'object') {
      for (const [k, v] of Object.entries(init.headers as Record<string, string>)) {
        if (typeof v === 'string') headers[k] = v;
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await globalThis.fetch(url, {
        ...init,
        signal: controller.signal,
        headers,
      });
      budgetTracker.updateFromHeaders(host, response.headers);
      if (!response.ok) {
        const retryAfterMs =
          parseRetryAfterMs(response.headers.get('retry-after')) ??
          budgetResetAsRetryAfter(host);
        throw new RetrievalHttpError({
          kind: 'http-status',
          status: response.status,
          url,
          message: `retrieval/http: non-2xx status ${response.status} from ${url}`,
          retryAfterMs,
          rateLimitRemaining: budgetTracker.getRemaining(host),
        });
      }
      const body = await response.text();
      const retrievedAt = new Date().toISOString();
      responseCache.store({
        url,
        host,
        status: response.status,
        body,
        retrievedAt,
        storedAt: retrievedAt,
      });
      return { url, status: response.status, body, retrievedAt };
    } catch (err) {
      const structured = normalizeError(err, url, timeoutMs);
      const canRetry = attempt < maxRetries && isRetryableError(structured);
      if (canRetry) {
        const serverWait = structured.retryAfterMs;
        let waitMs: number;
        if (serverWait !== null && serverWait > 0) {
          // Server-demanded wait beyond the stall ceiling → surface, don't sleep.
          if (serverWait > MAX_SERVER_WAIT_MS) throw structured;
          waitMs = serverWait;
        } else {
          waitMs = computeBackoffDelayMs(attempt, undefined, opts.random);
        }
        await sleep(waitMs);
        continue;
      }
      throw structured;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** OpenAlex budget reset expressed as a retry-after (null when unknown). */
function budgetResetAsRetryAfter(host: string): number | null {
  return budgetTracker.getResetDelayMs(host);
}

/** Wrap any thrown value into a RetrievalHttpError (idempotent for structured). */
function normalizeError(err: unknown, url: string, timeoutMs: number): RetrievalHttpError {
  if (err instanceof RetrievalHttpError) return err;
  if (err instanceof Error && err.name === 'AbortError') {
    return new RetrievalHttpError({
      kind: 'timeout',
      status: 0,
      url,
      message: `retrieval/http: timeout after ${timeoutMs}ms fetching ${url}`,
      cause: err,
    });
  }
  const failMsg = err instanceof Error ? err.message : String(err);
  return new RetrievalHttpError({
    kind: 'network',
    status: 0,
    url,
    message: `retrieval/http: fetch failed for ${url}: ${failMsg}`,
    cause: err,
  });
}

/** Assert host is allowlisted (fail-closed SSRF defense). */
export function assertHostAllowed(host: string): asserts host is RetrievalHost {
  if (!RETRIEVAL_HOST_ALLOWLIST.includes(host as RetrievalHost)) {
    throw new Error(
      `retrieval/http: host '${host}' is not in the retrieval allowlist ` +
        `(approved: ${RETRIEVAL_HOST_ALLOWLIST.join(', ')}). Refusing to fetch (SSRF fail-closed).`,
    );
  }
}

/**
 * Convenience: wrap raw retrieved text for safe downstream model consumption.
 * Retrieved content is UNTRUSTED DATA (§12) — call this before inserting any
 * retrieved title/abstract into an LLM context to defend against prompt
 * injection smuggled inside a paper abstract.
 */
export function sanitizeRetrievedText(raw: string): string {
  return sanitizeExternalContent(raw).text;
}
