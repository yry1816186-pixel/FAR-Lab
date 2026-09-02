import { SourceAdapterError } from './error.js';
import { assertFetchDestination } from '../shared/destination-guard.js';

export { assertFetchDestination };

/**
 * Structural fetch contract — the real global fetch satisfies it, tests inject fakes.
 * Keeps adapters testable without patching the global.
 */
export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  /** Present on real fetch responses; read for manual redirect handling. */
  readonly headers?: { get(name: string): string | null };
  /** Present on real fetch responses (Undici; null for empty bodies); absent on test
   *  fakes — the capped reader below falls back to text(). */
  readonly body?: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal; redirect?: 'manual' | 'follow' | 'error' },
) => Promise<FetchResponseLike>;

/** Options shared by every source adapter factory. */
export interface SourceAdapterOptions {
  /** Injected for unit tests; defaults to the global fetch (live path). */
  fetchImpl?: FetchLike;
  /** Per-request abort timeout. Default 30s. */
  timeoutMs?: number;
}

export interface HttpGetContext {
  /** Diagnostic family label (adapter SourceFamily or fulltext variant label). */
  family: string;
  /** Query text or identifier rendering — carried onto network errors. */
  query: string;
}

export interface HttpGetResult {
  ok: boolean;
  status: number;
  bodyText: string;
  latencyMs: number;
  url: string;
}

export const DEFAULT_TIMEOUT_MS = 30_000;

/** Scholarly-metadata response guard (FA-DAT-01): a runaway response body must fail
 *  closed mid-read instead of being buffered whole by res.text() until OOM. This is a
 *  defensive bound on the citation plane, not a dataset capability cap (the dataset
 *  plane streams via the artifact store). */
export const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;

const readBodyCapped = async (res: FetchResponseLike, context: HttpGetContext, url: string): Promise<string> => {
  if (res.body === undefined || res.body === null) return res.text(); // test fakes / empty body
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value === undefined) continue;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      throw new Error(`response body exceeds ${MAX_RESPONSE_BYTES} bytes (${context.family} ${url}) — refusing to buffer`);
    }
    parts.push(value);
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(parts));
};

/**
 * Egress destination guard for the scholarly-fetch chokepoint: the shared
 * policy owner is src/shared/destination-guard.ts (one invariant, one owner —
 * the providers and MCP boundaries apply the identical rule). Every hop
 * including manual redirect follows passes through it.
 */

/**
 * Single GET with abort timeout. No built-in retry — retry budgets are owned by the
 * calling plane (ports.ts philosophy), and silent retries would hide rate limits.
 * Network failures throw SourceAdapterError(kind='network', httpStatus=0).
 * Non-2xx statuses are RETURNED; each adapter decides 404-vs-error semantics.
 * Redirects are followed MANUALLY (max 3 hops) so every hop passes the same
 * destination guard — an upstream or proxy redirect cannot pivot an academic
 * fetch onto a blocked destination.
 */
export async function httpGet(
  url: string,
  opts: {
    fetchImpl?: FetchLike;
    headers?: Record<string, string>;
    timeoutMs?: number;
    context: HttpGetContext;
  },
): Promise<HttpGetResult> {
  const doFetch: FetchLike = opts.fetchImpl ?? ((u, init) => globalThis.fetch(u, init));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const startedAt = performance.now();
  const guard = (target: string): void => {
    try {
      assertFetchDestination(target);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      throw new SourceAdapterError({
        ...opts.context,
        kind: 'network',
        httpStatus: 0,
        message: `destination blocked: ${reason}`,
        url: target,
      });
    }
  };
  try {
    guard(url);
    let res = await doFetch(url, { headers: opts.headers, signal: controller.signal, redirect: 'manual' });
    let finalUrl = url;
    for (let hop = 0; hop < 3 && res.status >= 300 && res.status < 400; hop++) {
      const loc = res.headers !== undefined ? res.headers.get('location') : null;
      if (loc === null) break; // opaque/missing location: surface the 3xx to the caller as-is
      const next = new URL(loc, finalUrl).toString();
      guard(next);
      finalUrl = next;
      res = await doFetch(next, { headers: opts.headers, signal: controller.signal, redirect: 'manual' });
    }
    const bodyText = await readBodyCapped(res, opts.context, finalUrl);
    return {
      ok: res.ok,
      status: res.status,
      bodyText,
      latencyMs: Math.round(performance.now() - startedAt),
      url: finalUrl,
    };
  } catch (err) {
    if (err instanceof SourceAdapterError) throw err;
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    throw new SourceAdapterError({
      ...opts.context,
      kind: 'network',
      httpStatus: 0,
      message: `request failed: ${reason}`,
      url,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Clamp a user-supplied limit into [1, max] with a sane default. */
export const clampLimit = (limit: number | undefined, fallback: number, max: number): number => {
  if (limit === undefined) return fallback;
  if (!Number.isInteger(limit) || limit < 1) return fallback;
  return Math.min(limit, max);
};

/**
 * Encode an identifier (e.g. a DOI) for interpolation as a single URL PATH segment.
 * encodeURIComponent escapes everything path/host-significant (`?`, `#`, `&`, `=`),
 * then `/` and `:` are selectively restored: DOIs legally contain forward slashes and
 * OpenAlex's canonical work path uses a `doi:` prefix — both are legal pchars
 * (RFC 3986) inside an absolute-URL path segment, and canonical shapes stay
 * server-cache-friendly. encodeURI alone leaves `?` and `#` unescaped — a DOI like
 * `10.1/x#v2` would truncate the path at the fragment and drop the query string.
 */
export const encodePathSegment = (id: string): string =>
  encodeURIComponent(id).replace(/%2F/gi, '/').replace(/%3A/g, ':');
