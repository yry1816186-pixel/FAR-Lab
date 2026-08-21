import type { SourceFamily } from '../domain/source.js';
import { SourceAdapterError } from './error.js';

/**
 * Structural fetch contract — the real global fetch satisfies it, tests inject fakes.
 * Keeps adapters testable without patching the global.
 */
export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<FetchResponseLike>;

/** Options shared by every source adapter factory. */
export interface SourceAdapterOptions {
  /** Injected for unit tests; defaults to the global fetch (live path). */
  fetchImpl?: FetchLike;
  /** Per-request abort timeout. Default 30s. */
  timeoutMs?: number;
}

export interface HttpGetContext {
  family: SourceFamily;
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

/**
 * Single GET with abort timeout. No built-in retry — retry budgets are owned by the
 * calling plane (ports.ts philosophy), and silent retries would hide rate limits.
 * Network failures throw SourceAdapterError(kind='network', httpStatus=0).
 * Non-2xx statuses are RETURNED; each adapter decides 404-vs-error semantics.
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
  try {
    const res = await doFetch(url, { headers: opts.headers, signal: controller.signal });
    const bodyText = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      bodyText,
      latencyMs: Math.round(performance.now() - startedAt),
      url,
    };
  } catch (err) {
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
