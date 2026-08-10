// frontend/src/__tests__/ArenaPage.test.tsx
// 测 ArenaPage：mock GET /api/v1/arena/demo → 渲染 ArenaResult（robust·3 refuter 全 held）。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ArenaPage from '@/pages/ArenaPage';
import type { ArenaResultDto } from '@/lib/types';

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const MOCK_RESULT: ArenaResultDto = {
  arenaId: '01KWZTESTARENARST456',
  datasetSource: 'replay',
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
  honestNote: 'offline_replay 下 refuter 回放同一套 fixture，verdict 必然与原始相同 → 无有效攻击',
};

function mockArenaOk() {
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.endsWith('/arena/demo')) {
      return new Response(JSON.stringify({ ok: true, data: MOCK_RESULT }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('/llm-status')) {
      return new Response(JSON.stringify({ ok: true, data: { profile: 'offline_replay', keyConfigured: false } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('', { status: 404 });
  });
}

describe('ArenaPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('渲染 ROBUST 裁决 + 3 refuter 记分板（全 held）', async () => {
    mockArenaOk();
    renderWithQueryClient(<ArenaPage />);

    await waitFor(() => {
      expect(screen.getByText(/ROBUST/)).toBeInTheDocument();
    });

    expect(screen.getByText('Adversarial Science Arena')).toBeInTheDocument();
    expect(screen.getByText('01KWZTESTARENARST456')).toBeInTheDocument();

    // 3 refuter 全 held（多匹配）
    expect(screen.getAllByText(/held \(withstood\)/).length).toBe(3);

    // refuter 名
    expect(screen.getByText('scope-launderer')).toBeInTheDocument();
    expect(screen.getByText('post-hoc-threshold')).toBeInTheDocument();
    expect(screen.getByText('dataset-drift')).toBeInTheDocument();

    expect(screen.getByText('Honesty statement')).toBeInTheDocument();
  });

  it('渲染失败态（fetch 500）', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response('', { status: 500 }));
    renderWithQueryClient(<ArenaPage />);

    await waitFor(() => {
      expect(screen.getByText('Arena session failed')).toBeInTheDocument();
    });
  });

  it('WS-B.2 渲染 live 表单 + offline replay 状态横幅', async () => {
    mockArenaOk();
    renderWithQueryClient(<ArenaPage />);

    expect(screen.getByTestId('arena-live-form')).toBeInTheDocument();
    expect(screen.getByTestId('arena-live-hypothesis-input')).toBeInTheDocument();
    expect(screen.getByTestId('arena-live-run')).toBeDisabled();

    await waitFor(() => {
      expect(screen.getByTestId('arena-llm-status')).toHaveTextContent('Offline replay mode');
    });
  });
});
