// frontend/src/__tests__/CourtPage.test.tsx
// 测 CourtPage（live-only）：无 key → 表单禁用 + 指引（无罐头内容）；有 key → 真实 POST 渲染证书。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CourtPage from '@/pages/CourtPage';
import type { CourtCertificateDto } from '@/lib/types';

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const MOCK_CERT: CourtCertificateDto = {
  certificateId: '01KWZTESTCOURTCERT123',
  datasetSource: 'online',
  claim: 'C-ASTRO-0001: TIC lightcurve transit signal',
  modelCount: 3,
  verdicts: [
    { model: 'court-persona-alpha', verdict: 'CONFIRMED', decisiveRuleId: 'R7_PRIMARY_TEST_CONFIRMS', chainHead: 'a'.repeat(64), error: null },
    { model: 'court-persona-beta', verdict: 'CONFIRMED', decisiveRuleId: 'R7_PRIMARY_TEST_CONFIRMS', chainHead: 'b'.repeat(64), error: null },
    { model: 'court-persona-gamma', verdict: 'CONFIRMED', decisiveRuleId: 'R7_PRIMARY_TEST_CONFIRMS', chainHead: 'c'.repeat(64), error: null },
  ],
  distinctVerdicts: ['CONFIRMED'],
  agreement: 'unanimous',
  honestNote: 'real provider cross-model court (real gateway)',
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
    if (url.endsWith('/court') && init?.method === 'POST') {
      return new Response(JSON.stringify({ ok: true, data: MOCK_CERT }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // 罐头端点已删除——任何对 /court/demo 的请求都必须失败（防回潮）。
    if (url.endsWith('/court/demo')) {
      return new Response('', { status: 404 });
    }
    return new Response('', { status: 404 });
  });
}

describe('CourtPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('无 key：run 禁用 + 指引在场，且绝不请求已删除的 /court/demo（无罐头内容）', async () => {
    const fetchMock = mockFetch({ keyConfigured: false });
    renderWithQueryClient(<CourtPage />);

    const run = await waitFor(() => screen.getByTestId('court-live-run'));
    expect(run).toBeDisabled();
    expect(screen.getByTestId('court-live-disabled-hint')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('court-llm-status')).toHaveTextContent('Live inference unavailable');
    });

    // 页面不渲染任何预录证书（罐头面清零）。
    expect(screen.queryByTestId('court-demo-reference')).toBeNull();
    expect(screen.queryByText('01KWZTESTCOURTCERT123')).toBeNull();
    for (const call of fetchMock.mock.calls) {
      expect(call[0].toString().endsWith('/court/demo')).toBe(false);
    }
  });

  it('有 key：输入 claim → POST /court → 渲染证书标题 + 一致性 + 3 模型裁决表', async () => {
    mockFetch({ keyConfigured: true });
    renderWithQueryClient(<CourtPage />);

    const input = await waitFor(() => screen.getByTestId('court-live-claim-input'));
    fireEvent.change(input, { target: { value: 'C-ASTRO-0001: TIC lightcurve transit signal' } });

    const run = screen.getByTestId('court-live-run');
    await waitFor(() => expect(run).toBeEnabled());
    fireEvent.click(run);

    // 一致性 + 模型数（等待 mutation 解析→success 态）
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
});
