/**
 * HTTP client for the /api/v1 contract.
 *
 * Error contract (INTERFACES.md §8): every non-2xx body is expected to be
 * { error: { code, message, retryable } }. When the body does not match, we
 * still produce a structured ApiError (fail-visible, never silently swallowed).
 * All requests accept an AbortSignal — callers must abort on unmount/rekey.
 */

/**
 * Server error codes with a researcher-language story (the raw message stays
 * reachable via the ErrorBox tooltip). Codes not listed surface their raw
 * server message — honest, never a wrong label.
 */
const I18N_ERROR_CODES: Record<string, { i18nKey: import('../i18n/dict').DictKey }> = {
  // Real-content discipline: the offline development route refuses template
  // scope — the researcher is told what happened and what to do next.
  scope_proposal_unavailable: { i18nKey: 'err.scopeProposalUnavailable' },
};

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  /** i18n override: when present, UI surfaces translate this key instead of the raw message. */
  readonly i18nKey?: import('../i18n/dict').DictKey;
  readonly i18nVars?: Record<string, string | number>;

  constructor(args: {
    code: string;
    message: string;
    status?: number;
    retryable?: boolean;
    i18nKey?: import('../i18n/dict').DictKey;
    i18nVars?: Record<string, string | number>;
  }) {
    super(args.message);
    this.name = 'ApiError';
    this.code = args.code;
    this.status = args.status ?? 0;
    this.retryable = args.retryable ?? (args.status !== undefined && (args.status === 0 || args.status >= 500));
    this.i18nKey = args.i18nKey;
    this.i18nVars = args.i18nVars;
  }
}

export function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.code === 'not_found');
}

const DEFAULT_TIMEOUT_MS = 30_000;

async function request(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal; text?: boolean } = {},
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError({
      code: 'network',
      message: `无法连接 API（${path}）：${e instanceof Error ? e.message : String(e)}`,
      status: 0,
      retryable: true,
      i18nKey: 'err.network',
      i18nVars: { path, cause: e instanceof Error ? e.message : String(e) },
    });
  }

  if (!res.ok) {
    let code = `http_${res.status}`;
    let message = `${res.status} ${res.statusText || 'HTTP error'} — ${path}`;
    let retryable: boolean | undefined;
    try {
      const data: unknown = await res.json();
      const err = (data as { error?: { code?: string; message?: string; retryable?: boolean } }).error;
      if (err && typeof err === 'object') {
        if (typeof err.code === 'string') code = err.code;
        if (typeof err.message === 'string') message = err.message;
        if (typeof err.retryable === 'boolean') retryable = err.retryable;
      }
    } catch {
      // non-JSON error body — keep the status-derived message
    }
    throw new ApiError({ code, message, status: res.status, retryable, ...I18N_ERROR_CODES[code] });
  }

  if (init.text === true) {
    let text: string;
    try {
      text = await res.text();
    } catch (e) {
      // Mid-body abort (run/tab switch) rejects the stream read; that is a
      // cancellation, not a transport failure — surface AbortError so
      // consumer-side AbortError filters classify it correctly.
      if (init.signal?.aborted === true) throw new DOMException('aborted', 'AbortError');
      throw e;
    }
    // Honest handling: an endpoint contracted to return markdown text must not
    // silently pass a JSON envelope through as if it were report content.
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      try {
        const data: unknown = JSON.parse(text);
        const wrapped = (data as { report?: unknown; content?: unknown; markdown?: unknown }).report
          ?? (data as { content?: unknown }).content
          ?? (data as { markdown?: unknown }).markdown;
        if (typeof wrapped === 'string') return wrapped;
      } catch {
        // non-parseable body claiming to be JSON — fall through to raw text
      }
      throw new ApiError({
        code: 'unexpected_schema',
        message: '报告端点返回了无法识别的 JSON 信封（期望 markdown 文本或含 report/content/markdown 字段）',
        status: res.status,
        retryable: false,
        i18nKey: 'err.reportEnvelope',
      });
    }
    return text;
  }

  try {
    return await res.json();
  } catch (e) {
    // Same mid-body-abort class: a truncated stream parses as a SyntaxError,
    // which used to be misreported as bad_json on every run/tab switch (B1).
    if (init.signal?.aborted === true) {
      throw e instanceof DOMException && e.name === 'AbortError' ? e : new DOMException('aborted', 'AbortError');
    }
    throw new ApiError({
      code: 'bad_json',
      message: `API 返回了无法解析的 JSON（${path}）`,
      status: res.status,
      retryable: true,
      i18nKey: 'err.badJson',
      i18nVars: { path },
    });
  }
}

export const api = {
  get: (path: string, signal?: AbortSignal): Promise<unknown> => request(path, { signal }),
  getJson: (path: string, signal?: AbortSignal): Promise<unknown> => request(path, { signal }),
  getText: (path: string, signal?: AbortSignal): Promise<unknown> => request(path, { signal, text: true }),
  post: (path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> =>
    request(path, { method: 'POST', body, signal }),
  put: (path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> =>
    request(path, { method: 'PUT', body, signal }),
  patch: (path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> =>
    request(path, { method: 'PATCH', body, signal }),
  del: (path: string, signal?: AbortSignal): Promise<unknown> =>
    request(path, { method: 'DELETE', signal }),
};

export type Api = typeof api;

/** Timeout guard used by mutating actions so a hung request cannot freeze a button forever. */
export function withTimeout(signal: AbortSignal | undefined, ms = DEFAULT_TIMEOUT_MS): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), ms);
  const onAbort = (): void => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  // Release the timer when the derived signal is no longer needed.
  void controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  return controller.signal;
}
