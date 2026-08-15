// frontend/src/__tests__/ArenaPage.test.tsx
// 测 ArenaPage（live-only）：无 key → 表单禁用 + 指引（无罐头内容）；有 key → 真实 POST 渲染结果。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ArenaPage from '@/pages/ArenaPage';
import type { ArenaResultDto } from '@/lib/types';

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const MOCK_RESULT: ArenaResultDto = {
  arenaId: '01KWZTESTARENARST456',
  datasetSource: 'online',
  hypothesis: 'C-ASTRO-0001: TIC lightcurve transit signal',
  originalVerdict: 'CONFIRMED',
  originalRule: 'R7_PRIMARY_TEST_CONFIRMS',
  attempts: [
    { refuter: 'scope-launderer', verdict: 'CONFIRMED', attackLanded: false, error: null },
    { refuter: 'post-hoc-threshold', verdict: 'CONFIRMED', attackLanded: false, error: null },
    { refuter: 'dataset-drift', verdict: 'CONFIRMED', attackLanded: false, error: null },
  ],
  landedCount: 0,
  robust: true,
  honestNote: 'real provider adversarial arena (real gateway)',
};

function mockFetch(opts: { keyConfigured: boolean }) {
  return vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    if (url.endsWith('/llm-status')) {
      return new Response(
        JSON.stringify({
          ok: true,
          data: { profile: opts.keyConfigured ? 'competition_aliyun_qwen' : null, keyConfigured: opts.keyConfigured },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.endsWith('/arena') && init?.method === 'POST') {
      return new Response(JSON.stringify({ ok: true, data: MOCK_RESULT }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' } ,
      });
    }
    // 罐头端点已删除——任何对 /arena/demo 的请求都必须失败（防回潮）。
    if (url.endsWith('/arena/demo')) {
      return new Response('', { status: 404 });
    }
    return new Response('', { status: 404 });
  });
}

describe('ArenaPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('无 key：run 禁用 + 指引在场，且绝不请求已删除的 /arena/demo（无罐头内容）', async () => {
    const fetchMock = mockFetch({ keyConfigured: false });
    renderWithQueryClient(<ArenaPage />);

    const run = await waitFor(() => screen.getByTestId('arena-live-run'));
    expect(run).toBeDisabled();
    expect(screen.getByTestId('arena-live-disabled-hint')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('arena-llm-status')).toHaveTextContent('Live inference unavailable');
    });

    // 页面不渲染任何预录结果（罐头面清零）。
    expect(screen.queryByTestId('arena-demo-reference')).toBeNull();
    expect(screen.queryByText('01KWZTESTARENARST456')).toBeNull();
    for (const call of fetchMock.mock.calls) {
      expect(call[0].toString().endsWith('/arena/demo')).toBe(false);
    }
  });

  it('有 key：输入 hypothesis → POST /arena → 渲染 ROBUST 裁决 + 3 refuter 记分板', async () => {
    mockFetch({ keyConfigured: true });
    renderWithQueryClient(<ArenaPage />);

    const input = await waitFor(() => screen.getByTestId('arena-live-hypothesis-input'));
    fireEvent.change(input, { target: { value: 'C-ASTRO-0001: TIC lightcurve transit signal' } });

    const run = screen.getByTestId('arena-live-run');
    await waitFor(() => expect(run).toBeEnabled());
    fireEvent.click(run);

    await waitFor(() => {
      expect(screen.getByText(/ROBUST/)).toBeInTheDocument();
    });

    expect(screen.getByText('Adversarial Science Arena')).toBeInTheDocument();
    expect(screen.getByText('01KWZTESTARENARST456')).toBeInTheDocument();

    // 3 refuter 全 held（多匹配）。
    expect(screen.getAllByText(/held \(withstood\)/).length).toBe(3);

    expect(screen.getByText('scope-launderer')).toBeInTheDocument();
    expect(screen.getByText('post-hoc-threshold')).toBeInTheDocument();
    expect(screen.getByText('dataset-drift')).toBeInTheDocument();

    expect(screen.getByText('Honesty statement')).toBeInTheDocument();
  });
});
