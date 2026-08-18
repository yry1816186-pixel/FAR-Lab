/**
 * shared/api/http — the single HTTP boundary of the workbench.
 *
 * Every request flows through fetchJson/fetchText here: one timeout policy,
 * one error model, one envelope convention. No page fetches on its own.
 *
 * Base URL resolution (same-origin first):
 *   1. VITE_API_BASE_URL (absolute URL) wins — cross-origin deployments.
 *   2. Default '' = relative: the vite dev proxy / a production reverse proxy
 *      owns API routing; LAN and mobile access keep working (no hardcoded
 *      localhost origin).
 *
 * Error model: ApiError carries httpStatus + machine errorCode + the backend
 * detail payload. `guidance()` surfaces the actionable remediation the
 * backend attaches to fail-closed errors (e.g. 503 *_live_profile_unavailable)
 * — the UI displays it verbatim, never swallows it.
 *
 * Envelopes: every app endpoint answers `{ ok: true, data }` on success and
 * an RFC 7807 problem body on failure. parseV1Response validates the envelope
 * shape; parseV2Response additionally zod-parses `data` (decode once at the
 * boundary — a schema drift is a loud ApiError, never a silent cast).
 */

import type { ZodType } from 'zod';
import type { ApiErrorResponse } from '@/entities/dtos.ts';

export class ApiError extends Error {
  public readonly httpStatus: number;
  public readonly errorCode: string;
  public readonly sourceAnchor: ApiErrorResponse['source_anchor'] | null;
  public readonly detail: unknown;

  constructor(
    httpStatus: number,
    message: string,
    errorCode = 'UNKNOWN',
    sourceAnchor: ApiErrorResponse['source_anchor'] | null = null,
    detail: unknown = undefined,
  ) {
    super(message);
    this.name = 'ApiError';
    this.httpStatus = httpStatus;
    this.errorCode = errorCode;
    this.sourceAnchor = sourceAnchor;
    this.detail = detail;
  }

  /** Parse a backend RFC 7807 body; null when the body is not that shape. */
  static tryParse(status: number, bodyText: string): ApiError | null {
    try {
      const parsed: unknown = JSON.parse(bodyText);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'error_code' in parsed &&
        'message' in parsed
      ) {
        const body = parsed as ApiErrorResponse;
        return new ApiError(status, body.message, body.error_code, body.source_anchor ?? null, body.detail);
      }
    } catch {
      // Not JSON — fall through to the plain-text error.
    }
    return null;
  }

  /** Actionable guidance attached to fail-closed responses (null when absent). */
  guidance(): string | null {
    if (typeof this.detail !== 'object' || this.detail === null) return null;
    const value = (this.detail as { guidance?: unknown }).guidance;
    return typeof value === 'string' && value.length > 0 ? value : null;
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

const SAME_ORIGIN_PLACEHOLDER = 'http://same-origin.invalid';

/**
 * Compose an API URL without string-concat pitfalls: the base may carry a
 * pathname prefix and query params (e.g. a token); both are preserved, and
 * extraParams win over same-named params.
 */
export function buildApiUrl(path: string, extraParams?: Record<string, string>): string {
  const sameOrigin = API_BASE_URL === '';
  const base = new URL(sameOrigin ? SAME_ORIGIN_PLACEHOLDER : API_BASE_URL);
  const basePath = base.pathname.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${base.origin}${basePath}${normalizedPath}`);
  base.searchParams.forEach((value, key) => {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  });
  if (extraParams !== undefined) {
    for (const [key, value] of Object.entries(extraParams)) {
      url.searchParams.set(key, value);
    }
  }
  return sameOrigin ? url.href.slice(SAME_ORIGIN_PLACEHOLDER.length) : url.href;
}

/** Default request timeout, aligned with the backend LLM call timeout. */
const FETCH_TIMEOUT_MS = 60_000;

/** Merge a caller signal (query cancellation) with the internal timeout signal. */
function combineSignals(external: AbortSignal | null | undefined, internal: AbortSignal): AbortSignal {
  if (external === null || external === undefined) return internal;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([external, internal]);
  const relay = new AbortController();
  const abort = (): void => relay.abort();
  if (external.aborted || internal.aborted) {
    relay.abort();
    return relay.signal;
  }
  external.addEventListener('abort', abort, { once: true });
  internal.addEventListener('abort', abort, { once: true });
  return relay.signal;
}

async function throwForStatus(response: Response, url: string): Promise<never> {
  const bodyText = await response.text().catch(() => '');
  const apiError = ApiError.tryParse(response.status, bodyText);
  if (apiError !== null) throw apiError;
  throw new ApiError(response.status, `API ${response.status} ${response.statusText} for ${url}: ${bodyText}`);
}

/** Classify browser-native fetch failures into honest, actionable ApiErrors. */
function classifyFetchError(error: unknown, external: AbortSignal | null | undefined, url: string, timeoutMs: number): never {
  if (external?.aborted === true) throw error; // query cancellation is not an error
  if (error instanceof DOMException && error.name === 'AbortError') {
    throw new ApiError(
      0,
      `Request to ${url} timed out after ${String(timeoutMs)}ms. The server may be overloaded or unreachable.`,
      'TIMEOUT',
    );
  }
  if (error instanceof TypeError) {
    throw new ApiError(
      0,
      `Network request to ${url} failed before any HTTP response (${error.message}). Check that the FAR-Lab runtime is reachable.`,
      'NETWORK_ERROR',
    );
  }
  throw error;
}

export async function fetchJson<T>(path: string, init?: RequestInit, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<T> {
  const url = buildApiUrl(path);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const external = init?.signal ?? null;
  try {
    const response = await fetch(url, {
      ...init,
      signal: combineSignals(external, controller.signal),
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!response.ok) await throwForStatus(response, url);
    return (await response.json()) as T;
  } catch (error: unknown) {
    classifyFetchError(error, external, url, timeoutMs);
  } finally {
    window.clearTimeout(timer);
  }
}

/** Fetch a non-JSON body (e.g. the HTML report endpoint). */
export async function fetchText(path: string, init?: RequestInit, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<string> {
  const url = buildApiUrl(path);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const external = init?.signal ?? null;
  try {
    const response = await fetch(url, { ...init, signal: combineSignals(external, controller.signal) });
    if (!response.ok) await throwForStatus(response, url);
    return await response.text();
  } catch (error: unknown) {
    classifyFetchError(error, external, url, timeoutMs);
  } finally {
    window.clearTimeout(timer);
  }
}

/** v1 envelope validation: `{ ok: true, data }` — loud failure on drift. */
export function parseV1Response<T>(raw: unknown, endpoint: string): T {
  if (typeof raw !== 'object' || raw === null) {
    throw new ApiError(502, `Service returned a non-object response from ${endpoint}.`, 'RESPONSE_SCHEMA_MISMATCH');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.ok !== true) {
    throw new ApiError(502, `Service response from ${endpoint} is missing the success envelope (ok: true).`, 'RESPONSE_SCHEMA_MISMATCH');
  }
  if (obj.data === undefined) {
    throw new ApiError(502, `Service response from ${endpoint} is missing the data payload.`, 'RESPONSE_SCHEMA_MISMATCH');
  }
  return obj.data as T;
}

/** v2 envelope validation + zod parse of `data` (runtime contract check). */
export function parseV2Response<T>(dataSchema: ZodType<T>, raw: unknown, endpoint: string): T {
  if (typeof raw !== 'object' || raw === null) {
    throw new ApiError(502, `Verification service returned a non-object response from ${endpoint}.`, 'RESPONSE_SCHEMA_MISMATCH');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.ok !== true) {
    throw new ApiError(502, `Verification service response from ${endpoint} is missing the success envelope (ok: true).`, 'RESPONSE_SCHEMA_MISMATCH');
  }
  if (typeof obj.data !== 'object' || obj.data === null) {
    throw new ApiError(502, `Verification service response from ${endpoint} is missing the data payload.`, 'RESPONSE_SCHEMA_MISMATCH');
  }
  const result = dataSchema.safeParse(obj.data);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`)
      .join('; ');
    throw new ApiError(
      502,
      `Verification service response from ${endpoint} does not match the expected schema: ${issues}`,
      'RESPONSE_SCHEMA_MISMATCH',
      null,
      { issues: result.error.issues, endpoint },
    );
  }
  return result.data;
}

/**
 * Deterministic idempotency key for mutations that create work (FNV-1a
 * 64-bit, synchronous): identical inputs map to one key, and the server
 * replays duplicates instead of executing twice. Not a security boundary.
 */
export function fnvIdempotencyKey(parts: readonly string[], prefix: string): string {
  const text = parts.join('|');
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i += 1) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return `${prefix}-${h.toString(16).padStart(16, '0')}`;
}
