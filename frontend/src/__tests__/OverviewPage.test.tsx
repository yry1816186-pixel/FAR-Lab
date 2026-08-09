import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OverviewPage from '@/pages/OverviewPage';
import type { HealthResponse } from '@/lib/types';

// OverviewPage 现使用 <Link>(react-router),需 Router 上下文。
// R-03 工作台改造后移除了"三大支柱"与"运行命令"段,对应测试同步移除。
function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

// GET /health → { status, service, timestamp } (spec 24 health probe shape).
// 用 mockImplementation 而非 mockResolvedValue:后者复用单个 Response 对象,
// useHealth 消费 body 后 useReceiptList 再消费同一对象会抛 "body already consumed"。
// 每次调用返回全新 Response 才能并行满足 useHealth + useReceiptList。
function mockHealth(body: HealthResponse) {
  vi.mocked(fetch).mockImplementation(async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

const HEALTH_OK: HealthResponse = {
  status: 'ok',
  service: 'far-chain-api',
  timestamp: '2026-06-27T00:00:00Z',
};

describe('OverviewPage', () => {
  it('renders the page container and title', () => {
    mockHealth(HEALTH_OK);
    renderWithQueryClient(<OverviewPage />);
    expect(screen.getByTestId('overview-page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'FAR-Lab', level: 1 })).toBeInTheDocument();
  });

  it('renders the workbench CTA and quick-entry cards (R-03 workbench)', () => {
    mockHealth(HEALTH_OK);
    renderWithQueryClient(<OverviewPage />);
    // Primary CTA links into the wizard
    expect(screen.getByTestId('workbench-cta')).toBeInTheDocument();
    expect(screen.getByTestId('quick-entries')).toBeInTheDocument();
    expect(screen.getByTestId('quick-wizard')).toBeInTheDocument();
    expect(screen.getByTestId('quick-v2receipt')).toBeInTheDocument();
    expect(screen.getByTestId('quick-viz')).toBeInTheDocument();
    expect(screen.getByTestId('quick-integrity')).toBeInTheDocument();
  });

  it('health card shows status data (status / service / timestamp) after fetch succeeds', async () => {
    mockHealth(HEALTH_OK);
    renderWithQueryClient(<OverviewPage />);
    await waitFor(() => {
      expect(screen.getByTestId('health-data')).toBeInTheDocument();
    });
    expect(screen.getByTestId('health-status')).toHaveTextContent('ok');
    expect(screen.getByTestId('health-data')).toHaveTextContent('far-chain-api');
    expect(screen.getByTestId('health-data')).toHaveTextContent('2026-06-27');
  });

  it('recent-receipts card renders an empty-state guide when no receipts exist', async () => {
    // counter-case 2/3:useReceiptList 走 parseV2Response({ ok: true, data: T }),
    // mock 必须返回统一信封,否则 zod parse 抛错 → 错误态(非空态)。
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/api/v2/receipts')) {
        return new Response(
          JSON.stringify({ ok: true, data: { receipts: [], total: 0, limit: 5, offset: 0 } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify(HEALTH_OK), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    renderWithQueryClient(<OverviewPage />);
    await waitFor(() => {
      expect(screen.getByTestId('recent-receipts-empty')).toBeInTheDocument();
    });
    // Empty-state CTA routes to the wizard
    expect(screen.getByTestId('recent-receipts-empty')).toHaveTextContent(/No receipts yet/);
  });
});
