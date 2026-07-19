// frontend/src/__tests__/CourtPage.test.tsx
// 测 CourtPage：mock GET /api/v1/court/demo → 渲染 ReliabilityCertificate（unanimous·3 模型）。

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CourtPage from '@/pages/CourtPage';
import type { CourtCertificateDto } from '@/lib/types';

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const MOCK_CERT: CourtCertificateDto = {
  certificateId: '01KWZTESTCOURTCERT123',
  claim: 'C-ASTRO-0001: TIC lightcurve transit signal',
  modelCount: 3,
  verdicts: [
    { model: 'court-persona-alpha', verdict: 'CONFIRMED', decisiveRuleId: 'R7_PRIMARY_TEST_CONFIRMS', chainHead: 'a'.repeat(64), error: null },
    { model: 'court-persona-beta', verdict: 'CONFIRMED', decisiveRuleId: 'R7_PRIMARY_TEST_CONFIRMS', chainHead: 'b'.repeat(64), error: null },
    { model: 'court-persona-gamma', verdict: 'CONFIRMED', decisiveRuleId: 'R7_PRIMARY_TEST_CONFIRMS', chainHead: 'c'.repeat(64), error: null },
  ],
  distinctVerdicts: ['CONFIRMED'],
  agreement: 'unanimous',
  honestNote: 'offline_replay 下所有模型回放同一套 fixture，verdict 必然一致',
};

function mockCourtOk() {
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.endsWith('/court/demo')) {
      return new Response(JSON.stringify(MOCK_CERT), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('', { status: 404 });
  });
}

describe('CourtPage', () => {
  beforeAll(() => {
    // CourtPage 用 Tailwind + lucide；jsdom 不需真实样式。
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('渲染证书标题 + 一致性 + 3 模型裁决表', async () => {
    mockCourtOk();
    renderWithQueryClient(<CourtPage />);

    // 一致性 + 模型数（等待 fetch 解析→success 态）
    await waitFor(() => {
      expect(screen.getByText('Unanimous')).toBeInTheDocument();
    });

    // 标题（success 态渲染）
    expect(screen.getByText('Cross-Model Reliability Court')).toBeInTheDocument();

    // 模型数 + 证书 ID
    expect(screen.getByText(/3 models/)).toBeInTheDocument();
    expect(screen.getByText('01KWZTESTCOURTCERT123')).toBeInTheDocument();

    // 3 个模型名在裁决表中
    expect(screen.getByText('court-persona-alpha')).toBeInTheDocument();
    expect(screen.getByText('court-persona-beta')).toBeInTheDocument();
    expect(screen.getByText('court-persona-gamma')).toBeInTheDocument();

    // 决定性规则（3 模型同规则→多匹配）
    expect(screen.getAllByText('R7_PRIMARY_TEST_CONFIRMS').length).toBe(3);

    // 诚实声明
    expect(screen.getByText('Honesty statement')).toBeInTheDocument();
  });

  it('渲染失败态（fetch 404）', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response('', { status: 500 }));
    renderWithQueryClient(<CourtPage />);

    await waitFor(() => {
      expect(screen.getByText('Court session failed')).toBeInTheDocument();
    });
  });
});
