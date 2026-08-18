/**
 * __tests__/helpers — shared test scaffolding: fresh query client (no retries,
 * no cache), the real provider tree (i18n/theme/router), and honest fetch
 * stubs. An unmocked request fails loudly (TypeError, same as offline) so a
 * test can never pass against an accidental real call.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

import { I18nProvider } from '@/shared/i18n/index.tsx';
import { ThemeProvider } from '@/shared/theme/ThemeProvider.tsx';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(ui: ReactElement, initialEntries: readonly string[] = ['/']) {
  const client = makeQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <ThemeProvider>
          <MemoryRouter initialEntries={[...initialEntries]}>{ui}</MemoryRouter>
        </ThemeProvider>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

/** Success envelope response (`{ ok: true, data }`). */
export function okJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** RFC 7807 problem body, as the backend emits on failure. */
export function problemJson(status: number, errorCode: string, message: string, detail?: unknown): Response {
  const body: Record<string, unknown> = {
    error_code: errorCode,
    message,
    source_anchor: { fileId: null, stageId: null, callRecordId: null },
  };
  if (detail !== undefined) body['detail'] = detail;
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response> | undefined;

/**
 * Stub global fetch with a URL router. Unmatched URLs reject with a TypeError
 * (network failure class) — the test sees it as NETWORK_ERROR, never as data.
 */
export function stubFetch(handler: FetchHandler) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const result = handler(url, init);
    if (result === undefined) return Promise.reject(new TypeError(`unmocked fetch: ${url}`));
    return Promise.resolve(result);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
