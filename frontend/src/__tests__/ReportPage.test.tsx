import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReportPage from '@/pages/ReportPage';
import type { HonestVerdictDto, VerdictListResponse } from '@/lib/types';

// ---------- Helpers ----------

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function errorResponse(status: number, statusText: string): Response {
  return new Response(statusText, {
    status,
    statusText,
  });
}

// ---------- Fixtures ----------

const REPORT_HTML = '<!DOCTYPE html><html><head><title>Test Report</title></head><body><h1>FAR-Lab 研究报告</h1><p>run-001 的结果。</p></body></html>';

const SAMPLE_VERDICT: HonestVerdictDto = {
  verdictId: 'v-run001',
  evidenceId: 'ev-run001',
  parentNodeId: null,
  nodeKind: 'hypothesis',
  decision: 'CONFIRMED',
  falsificationSpec: {
    prediction: 'macro_f1 >= 0.8',
    metric: 'macro_f1',
    falsificationThreshold: 0.8,
    thresholdSemantics: 'gt',
  },
  thresholdSpec: null,
  metricValue: 0.92,
  conflictingEvidenceCount: 0,
  scopeSlipText: null,
  untestedReason: null,
  sourceAnchor: {
    gitCommitSha: 'a'.repeat(40),
    isoTimestamp: '2026-06-27T00:00:00Z',
  },
  prevHash: 'prev-hash',
  currentHash: 'curr-hash',
  createdAt: '2026-06-27T00:00:00Z',
  updatedAt: '2026-06-27T00:00:00Z',
};

const VERDICT_LIST: VerdictListResponse = {
  items: [SAMPLE_VERDICT],
  count: 1,
  limit: 100,
  offset: 0,
};

/**
 * Default mock: a healthy backend returning empty verdict list.
 * Individual tests override as needed.
 */
function mockDefault() {
  vi.mocked(fetch)
    // first call = useVerdictList → GET /api/v1/verdict
    .mockResolvedValueOnce(jsonResponse(VERDICT_LIST))
    // second call = useReport → won't be called if activeRunId is empty
    .mockResolvedValueOnce(htmlResponse(REPORT_HTML));
}

// ---------- Tests ----------

describe('ReportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Render & structure ---

  it('渲染页面容器与标题', () => {
    mockDefault();
    renderWithQueryClient(<ReportPage />);
    expect(screen.getByTestId('report-page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Research Report', level: 1 })).toBeInTheDocument();
  });

  it('渲染 runId 输入框与查看按钮', () => {
    mockDefault();
    renderWithQueryClient(<ReportPage />);
    expect(screen.getByTestId('report-runid-input')).toBeInTheDocument();
    expect(screen.getByTestId('report-view-btn')).toBeInTheDocument();
  });

  it('查看按钮在输入为空时 disabled', () => {
    mockDefault();
    renderWithQueryClient(<ReportPage />);
    const btn = screen.getByTestId('report-view-btn');
    expect(btn).toBeDisabled();
  });

  it('查看按钮在输入非空白后可用', async () => {
    mockDefault();
    const user = userEvent.setup();
    renderWithQueryClient(<ReportPage />);
    const input = screen.getByTestId('report-runid-input');
    await user.type(input, 'run-1');
    expect(screen.getByTestId('report-view-btn')).not.toBeDisabled();
  });

  // --- Idle state ---

  it('未输入 runId 时显示空闲提示', () => {
    mockDefault();
    renderWithQueryClient(<ReportPage />);
    expect(screen.getByTestId('report-idle')).toBeInTheDocument();
    expect(screen.getByTestId('report-idle')).toHaveTextContent('Enter a runId');
  });

  // --- Loading state ---

  it('输入 runId 并点击查看后显示加载状态', async () => {
    // Prevent fetch from resolving immediately to keep loading state visible.
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(VERDICT_LIST))
      .mockImplementationOnce(
        () => new Promise(() => {
          // never resolves — keeps loading state
        }),
      );
    const user = userEvent.setup();
    renderWithQueryClient(<ReportPage />);
    await user.type(screen.getByTestId('report-runid-input'), 'run-loading');
    await user.click(screen.getByTestId('report-view-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('report-loading')).toBeInTheDocument();
    });
  });

  // --- Error state ---

  it('报告 API 返回非 2xx 时展示错误信息', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(VERDICT_LIST))
      .mockResolvedValueOnce(errorResponse(404, 'Not Found'));
    const user = userEvent.setup();
    renderWithQueryClient(<ReportPage />);
    await user.type(screen.getByTestId('report-runid-input'), 'run-404');
    await user.click(screen.getByTestId('report-view-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('report-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('report-error')).toHaveTextContent('Failed to load report');
  });

  // --- Success: iframe ---

  it('成功加载 HTML 报告后渲染 sandboxed iframe', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(VERDICT_LIST))
      .mockResolvedValueOnce(htmlResponse(REPORT_HTML));
    const user = userEvent.setup();
    renderWithQueryClient(<ReportPage />);
    await user.type(screen.getByTestId('report-runid-input'), 'run-001');
    await user.click(screen.getByTestId('report-view-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('report-success')).toBeInTheDocument();
    });
    const iframe = screen.getByTestId('report-iframe');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('sandbox', 'allow-scripts');
    expect(iframe.tagName).toBe('IFRAME');
  });

  // --- Empty report ---

  it('报告内容为空字符串时显示空报告提示', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(VERDICT_LIST))
      .mockResolvedValueOnce(htmlResponse(''));
    const user = userEvent.setup();
    renderWithQueryClient(<ReportPage />);
    await user.type(screen.getByTestId('report-runid-input'), 'run-empty');
    await user.click(screen.getByTestId('report-view-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('report-empty')).toBeInTheDocument();
    });
    expect(screen.getByTestId('report-empty')).toHaveTextContent('Report content is empty');
  });

  // --- History ---

  it('查看一个 runId 后将其加入历史列表', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(VERDICT_LIST))
      .mockResolvedValueOnce(htmlResponse(REPORT_HTML));
    const user = userEvent.setup();
    renderWithQueryClient(<ReportPage />);
    await user.type(screen.getByTestId('report-runid-input'), 'run-001');
    await user.click(screen.getByTestId('report-view-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('report-success')).toBeInTheDocument();
    });
    // History item should now exist.
    expect(screen.getByTestId('report-history-list')).toBeInTheDocument();
    expect(screen.getByTestId('report-history-item-run-001')).toBeInTheDocument();
  });

  it('查看多个 runId 后历史列表包含所有条目', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ReportPage />);
    const input = screen.getByTestId('report-runid-input');

    // run-A
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(VERDICT_LIST))
      .mockResolvedValueOnce(htmlResponse(REPORT_HTML));
    await user.type(input, 'run-A');
    await user.click(screen.getByTestId('report-view-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('report-success')).toBeInTheDocument();
    });

    // run-B — need to clear input first
    await user.clear(input);
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(VERDICT_LIST))
      .mockResolvedValueOnce(htmlResponse(REPORT_HTML));
    await user.type(input, 'run-B');
    await user.click(screen.getByTestId('report-view-btn'));
    await waitFor(() => {
      const iframes = screen.getAllByTestId('report-iframe');
      expect(iframes.length).toBeGreaterThanOrEqual(1);
    });

    const historyList = screen.getByTestId('report-history-list');
    expect(within(historyList).getByTestId('report-history-item-run-A')).toBeInTheDocument();
    expect(within(historyList).getByTestId('report-history-item-run-B')).toBeInTheDocument();
  });

  it('重复查看同一个 runId 不重复加入历史', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(VERDICT_LIST))
      .mockResolvedValueOnce(htmlResponse(REPORT_HTML));
    const user = userEvent.setup();
    renderWithQueryClient(<ReportPage />);
    const input = screen.getByTestId('report-runid-input');
    await user.type(input, 'run-001');
    await user.click(screen.getByTestId('report-view-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('report-success')).toBeInTheDocument();
    });

    // Trigger view again for the same runId
    await user.click(screen.getByTestId('report-view-btn'));

    const historyItems = screen.getAllByTestId(/^report-history-item-/);
    // Still only one entry for run-001
    expect(
      historyItems.filter((el) => el.getAttribute('data-testid') === 'report-history-item-run-001'),
    ).toHaveLength(1);
  });

  it('历史为空时显示“暂无查看历史”', () => {
    mockDefault();
    renderWithQueryClient(<ReportPage />);
    expect(screen.getByTestId('report-history-empty')).toBeInTheDocument();
    expect(screen.getByTestId('report-history-empty')).toHaveTextContent('No view history yet');
  });

  // --- History chips ---

  it('查看 runId 后在输入框下方展示快速选择 chip', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(VERDICT_LIST))
      .mockResolvedValueOnce(htmlResponse(REPORT_HTML));
    const user = userEvent.setup();
    renderWithQueryClient(<ReportPage />);
    await user.type(screen.getByTestId('report-runid-input'), 'run-001');
    await user.click(screen.getByTestId('report-view-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('report-success')).toBeInTheDocument();
    });
    expect(screen.getByTestId('report-history-chip-run-001')).toBeInTheDocument();
  });

  it('点击历史 chip 切换到对应 runId', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ReportPage />);
    const input = screen.getByTestId('report-runid-input');

    // View first runId
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(VERDICT_LIST))
      .mockResolvedValueOnce(htmlResponse(REPORT_HTML));
    await user.type(input, 'run-A');
    await user.click(screen.getByTestId('report-view-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('report-success')).toBeInTheDocument();
    });

    // View second runId
    await user.clear(input);
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(VERDICT_LIST))
      .mockResolvedValueOnce(htmlResponse(REPORT_HTML));
    await user.type(input, 'run-B');
    await user.click(screen.getByTestId('report-view-btn'));
    await waitFor(() => {
      expect(screen.getAllByTestId('report-iframe').length).toBeGreaterThanOrEqual(1);
    });

    // Click chip for first runId
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(VERDICT_LIST))
      .mockResolvedValueOnce(htmlResponse(REPORT_HTML));
    await user.click(screen.getByTestId('report-history-chip-run-A'));

    // Input should be set to run-A
    expect(screen.getByTestId('report-runid-input')).toHaveValue('run-A');
  });

  it('按 Enter 键触发查看', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(VERDICT_LIST))
      .mockResolvedValueOnce(htmlResponse(REPORT_HTML));
    const user = userEvent.setup();
    renderWithQueryClient(<ReportPage />);
    await user.type(screen.getByTestId('report-runid-input'), 'run-enter');
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(screen.getByTestId('report-success')).toBeInTheDocument();
    });
  });

  // --- Verdict panel ---

  it('判词摘要面板在有判词数据时渲染判词列表', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(VERDICT_LIST))
      .mockResolvedValueOnce(htmlResponse(REPORT_HTML));
    renderWithQueryClient(<ReportPage />);
    await waitFor(() => {
      expect(screen.getByTestId('report-verdict-list')).toBeInTheDocument();
    });
    expect(screen.getByTestId('report-verdict-item-v-run001')).toBeInTheDocument();
  });

  it('判词数据为空时显示“暂无判词数据”', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ items: [], count: 0, limit: 100, offset: 0 }))
      .mockResolvedValueOnce(htmlResponse(REPORT_HTML));
    renderWithQueryClient(<ReportPage />);
    await waitFor(() => {
      expect(screen.getByTestId('report-verdict-empty')).toBeInTheDocument();
    });
    expect(screen.getByTestId('report-verdict-empty')).toHaveTextContent('No verdict data');
  });

  it('历史条目在有匹配判词时展示判词 badge', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(VERDICT_LIST)) // useVerdictList
      .mockResolvedValueOnce(htmlResponse(REPORT_HTML)); // useReport
    const user = userEvent.setup();
    renderWithQueryClient(<ReportPage />);
    // Use a runId that fuzzy-matches the sample verdict's evidenceId
    await user.type(screen.getByTestId('report-runid-input'), 'run001');
    await user.click(screen.getByTestId('report-view-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('report-success')).toBeInTheDocument();
    });
    // The verdict evidenceId 'ev-run001' contains 'run001', so badge should appear
    const badge = screen.getByTestId('report-verdict-badge-run001');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('CONFIRMED');
  });
});
