/**
 * retrieval/http — minimal, fail-closed HTTP client for retrieval adapters.
 *
 * Security posture (directive §32 threat model, §54 fail-closed):
 *   - HOST ALLOWLIST: only approved scientific-repository hosts are fetched.
 *     Any other host → throw (no SSRF surface; untrusted query text can never
 *     redirect the system at an attacker-chosen internal URL).
 *   - TIMEOUT: every request has an AbortController deadline; a hung source
 *     fails closed, never silently returns empty.
 *   - PER-HOST RATE LIMIT: a min-interval gate per host (arXiv ≤3 req/s,
 *     OpenAlex/Crossref polite pool). Prevents accidental DoS of free APIs.
 *
 * This module returns RAW response text. It does NOT sanitize for model
 * consumption — callers route any text destined for an LLM context through
 * sanitizeExternalContent() (retrieved content is DATA, never instructions, §12).
 */
import { sanitizeExternalContent } from '../llm_gateway/sanitizer.ts';

/** Approved scientific-repository hosts (the only hosts retrieval may fetch). */
export const RETRIEVAL_HOST_ALLOWLIST = [
  'api.openalex.org',
  'export.arxiv.org',
  'api.crossref.org',
] as const;
/** Type alias: an allowed retrieval host. */
export type RetrievalHost = (typeof RETRIEVAL_HOST_ALLOWLIST)[number];

const DEFAULT_TIMEOUT_MS = 20_000;

/** Per-host last-request timestamp + min interval (ms) for polite rate limiting. */
const HOST_MIN_INTERVAL_MS: Record<string, number> = {
  'export.arxiv.org': 350, // arXiv asks ≤3 req/s → ≥333ms; 350ms is safe
  'api.openalex.org': 150, // polite pool (with mailto) tolerates ~10 req/s
  'api.crossref.org': 200, // polite pool
};
const hostLastRequestAt: Record<string, number> = {};

/** Assert host is allowlisted (fail-closed SSRF defense). */
export function assertHostAllowed(host: string): asserts host is RetrievalHost {
  if (!RETRIEVAL_HOST_ALLOWLIST.includes(host as RetrievalHost)) {
    throw new Error(
      `retrieval/http: host '${host}' is not in the retrieval allowlist ` +
        `(approved: ${RETRIEVAL_HOST_ALLOWLIST.join(', ')}). Refusing to fetch (SSRF fail-closed).`,
    );
  }
}

/** Block until the per-host min-interval has elapsed (polite rate limiting). */
async function respectRateLimit(host: string): Promise<void> {
  const minInterval = HOST_MIN_INTERVAL_MS[host] ?? 250;
  const last = hostLastRequestAt[host] ?? 0;
  const elapsed = Date.now() - last;
  if (elapsed < minInterval) {
    await new Promise((resolve) => setTimeout(resolve, minInterval - elapsed));
  }
  hostLastRequestAt[host] = Date.now();
}

/** The result of a fetchText call. */
export interface FetchedText {
  readonly url: string;
  readonly status: number;
  readonly body: string;
}

/**
 * Fetch a URL from an allowlisted retrieval host, returning raw text.
 * Fail-closed on: non-allowlisted host, network error, timeout, non-2xx status.
 * The caller is responsible for parsing + (if feeding a model) sanitizing.
 */
export async function fetchTextFromAllowlistedHost(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<FetchedText> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`retrieval/http: malformed URL '${url}'`);
  }
  assertHostAllowed(parsed.hostname);

  await respectRateLimit(parsed.hostname);

  // Build headers: polite User-Agent + JSON Accept, overridable by caller.
  const headers: Record<string, string> = {
    'User-Agent': 'FAR-Lab-retrieval/1.0 (scientific-evidence-verification)',
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
    if (!response.ok) {
      throw new Error(
        `retrieval/http: non-2xx status ${response.status} from ${url}`,
      );
    }
    const body = await response.text();
    return { url, status: response.status, body };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`retrieval/http: timeout after ${timeoutMs}ms fetching ${url}`, { cause: err });
    }
    // Fail closed: network errors propagate (caller must not silently get []).
    const failMsg = err instanceof Error ? err.message : String(err);
    throw new Error(`retrieval/http: fetch failed for ${url}: ${failMsg}`, { cause: err });
  } finally {
    clearTimeout(timer);
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
