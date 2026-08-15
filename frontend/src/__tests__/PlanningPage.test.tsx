/**
 * PlanningPage.test —— 规划门禁方法论门禁面板组件测试。
 *
 * 覆盖（mock 4 个 /api/v1/planning/* 端点 + fetch 按 URL 路由）：
 *   - 4 个门禁卡片渲染（risk/plan/spec/gate 标题）
 *   - Risk 卡片：运行 → Level 徽章 + reasons 展示
 *   - Plan 卡片：运行 → Gate PASS 徽章 + 拓扑执行序
 *   - Spec 卡片：运行 → Gate PASS
 *   - Gate 卡片：运行 → Conclusion 徽章（not_run → IMPLEMENTED_UNVERIFIED）
 *   - 非法 JSON 输入 → 友好错误（不发请求）
 *
 * 零容忍：无 any / ts-ignore / 双重断言 / 桩。fetch mock 用 type-safe URL 路由。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PlanningPage from '@/pages/PlanningPage';

function renderWithQueryClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}><PlanningPage /></QueryClientProvider>);
}

const HEADERS = { 'Content-Type': 'application/json' };

const RISK_BODY = {
  level: 'P4',
  reasons: ['P3: touches trust-kernel (Claim/FEC/Evidence/Verdict/Proof) — additive only + cannotProveStatement', 'ambiguous: rounded up → P4'],
};

const PLAN_BODY = {
  ok: true,
  violations: [],
  executionOrder: ['T1', 'T2', 'T3'],
};

const SPEC_BODY = { ok: true, violations: [] };

const GATE_BODY = {
  conclusion: 'IMPLEMENTED_UNVERIFIED',
  passed: ['typecheck', 'lint'],
  failed: [],
  notRun: ['test'],
  rationale: 'not_run item(s) present: test — unverified items must be explicitly labeled, never default-passed',
};

function mockPlanningEndpoints() {
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.endsWith('/api/v1/planning/risk')) {
      return new Response(JSON.stringify({ ok: true, data: RISK_BODY }), { status: 200, headers: HEADERS });
    }
    if (url.endsWith('/api/v1/planning/plan')) {
      return new Response(JSON.stringify({ ok: true, data: PLAN_BODY }), { status: 200, headers: HEADERS });
    }
    if (url.endsWith('/api/v1/planning/spec')) {
      return new Response(JSON.stringify({ ok: true, data: SPEC_BODY }), { status: 200, headers: HEADERS });
    }
    if (url.endsWith('/api/v1/planning/gate')) {
      return new Response(JSON.stringify({ ok: true, data: GATE_BODY }), { status: 200, headers: HEADERS });
    }
    return new Response('', { status: 404 });
  });
}

describe('PlanningPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    mockPlanningEndpoints();
  });

  it('渲染 4 个门禁卡片标题 + 页面副标题', () => {
    renderWithQueryClient();
    expect(screen.getByRole('heading', { name: 'Planning Gates' })).toBeInTheDocument();
    expect(screen.getByText('Risk Grading')).toBeInTheDocument();
    expect(screen.getByText('Plan Gate')).toBeInTheDocument();
    expect(screen.getByText('Spec Gate')).toBeInTheDocument();
    expect(screen.getByText('Verification Gate')).toBeInTheDocument();
  });

  it('Risk 卡片：运行默认示例 → Level P4 徽章 + reasons 展示', async () => {
    renderWithQueryClient();
    fireEvent.click(screen.getByTestId('run-planning.risk.title'));
    await waitFor(() => expect(screen.getByTestId('badge-risk')).toBeInTheDocument());
    expect(screen.getByTestId('badge-risk')).toHaveTextContent('Level P4');
    expect(screen.getByTestId('result-planning.risk.title')).toHaveTextContent('touches trust-kernel');
  });

  it('Plan 卡片：运行 → Gate PASS 徽章 + 拓扑执行序', async () => {
    renderWithQueryClient();
    fireEvent.click(screen.getByTestId('run-planning.plan.title'));
    await waitFor(() => expect(screen.getByTestId('badge-plan')).toBeInTheDocument());
    expect(screen.getByTestId('badge-plan')).toHaveTextContent('Gate PASS');
    expect(screen.getByTestId('result-planning.plan.title')).toHaveTextContent('T1');
    expect(screen.getByTestId('result-planning.plan.title')).toHaveTextContent('T2');
  });

  it('Spec 卡片：运行 → Gate PASS', async () => {
    renderWithQueryClient();
    fireEvent.click(screen.getByTestId('run-planning.spec.title'));
    await waitFor(() => expect(screen.getByTestId('badge-spec')).toBeInTheDocument());
    expect(screen.getByTestId('badge-spec')).toHaveTextContent('Gate PASS');
  });

  it('Gate 卡片：运行 → Conclusion 徽章（not_run → IMPLEMENTED_UNVERIFIED）', async () => {
    renderWithQueryClient();
    fireEvent.click(screen.getByTestId('run-planning.gate.title'));
    await waitFor(() => expect(screen.getByTestId('badge-gate')).toBeInTheDocument());
    expect(screen.getByTestId('badge-gate')).toHaveTextContent('Conclusion: IMPLEMENTED_UNVERIFIED');
    expect(screen.getByTestId('result-planning.gate.title')).toHaveTextContent('never default-passed');
  });

  it('非法 JSON 输入 → 友好错误（不发请求）', async () => {
    renderWithQueryClient();
    const textarea = screen.getByTestId('input-planning.risk.title');
    fireEvent.change(textarea, { target: { value: '{ not valid json' } });
    fireEvent.click(screen.getByTestId('run-planning.risk.title'));
    expect(await screen.findByText('Input is not valid JSON')).toBeInTheDocument();
    expect(screen.queryByTestId('badge-risk')).not.toBeInTheDocument();
  });
});
