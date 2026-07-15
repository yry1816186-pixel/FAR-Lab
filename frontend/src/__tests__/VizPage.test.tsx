import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import VizPage from '@/pages/VizPage';
import type { EvidenceChainResponse, GraphSubtree } from '@/lib/types';

// ---------- 测试工具 ----------

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return {
    client,
    ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const HEAD_HASH = 'a'.repeat(64);
const HEAD_HASH_2 = 'b'.repeat(64);

// ---------- Fixtures ----------

function makeGraphSubtree(overrides: Partial<GraphSubtree> = {}): GraphSubtree {
  return {
    rootId: 'node-root',
    nodes: [
      {
        nodeId: 'node-root',
        evidenceId: 'ev-root',
        parentNodeId: null,
        nodeKind: 'hypothesis',
        decision: 'UNTESTED',
        metricValue: null,
        conflictingEvidenceCount: 0,
        scopeSlipText: null,
        untestedReason: null,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        nodeId: 'node-ev1',
        evidenceId: 'ev-001',
        parentNodeId: 'node-root',
        nodeKind: 'evidence',
        decision: 'CONFIRMED',
        metricValue: 0.92,
        conflictingEvidenceCount: 1,
        scopeSlipText: null,
        untestedReason: null,
        createdAt: '2026-01-02T00:00:00Z',
      },
      {
        nodeId: 'node-m1',
        evidenceId: 'ev-002',
        parentNodeId: 'node-root',
        nodeKind: 'method',
        decision: 'INCONCLUSIVE',
        metricValue: 0.55,
        conflictingEvidenceCount: 0,
        scopeSlipText: '指标阈值未达成',
        untestedReason: null,
        createdAt: '2026-01-03T00:00:00Z',
      },
    ],
    edges: [
      {
        edgeId: 'edge-1',
        fromNode: 'node-root',
        toNode: 'node-ev1',
        edgeKind: 'supports',
        weight: 0.85,
        createdAt: '2026-01-02T00:00:00Z',
      },
      {
        edgeId: 'edge-2',
        fromNode: 'node-root',
        toNode: 'node-m1',
        edgeKind: 'refutes',
        weight: 0.4,
        createdAt: '2026-01-03T00:00:00Z',
      },
    ],
    ...overrides,
  };
}

function makeChainResponse(overrides: Partial<EvidenceChainResponse> = {}): EvidenceChainResponse {
  return {
    headHash: HEAD_HASH,
    callRecord: {
      seq: 0,
      stageId: 'stage3_hypothesis',
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
      modelId: 'offline-replay',
      reproHash: 'r'.repeat(64),
      gitCommitSha: 'g'.repeat(40),
      isoTimestamp: '2026-01-01T00:00:00Z',
      finishReason: 'stop',
      usageTokensTotal: null,
      prevHash: 'p'.repeat(64),
      currentHash: HEAD_HASH,
      createdAt: '2026-01-01T00:00:00Z',
    },
    graphSubtree: makeGraphSubtree(),
    ...overrides,
  };
}

function mockChainResponse(body: EvidenceChainResponse) {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(body));
}

// ---------- 测试 ----------

describe('VizPage', () => {
  it('渲染初始空态：输入框 + 查询按钮 + 引导文案', () => {
    renderWithQueryClient(<VizPage />);

    expect(screen.getByTestId('viz-page')).toBeInTheDocument();
    expect(screen.getByTestId('headhash-input')).toBeInTheDocument();
    expect(screen.getByTestId('search-button')).toBeInTheDocument();
    expect(screen.getByTestId('viz-initial')).toBeInTheDocument();
    expect(screen.getByText('Enter a headHash to start exploring')).toBeInTheDocument();
  });

  it('输入 headHash 并按回车触发查询', async () => {
    const user = userEvent.setup();
    mockChainResponse(makeChainResponse());
    renderWithQueryClient(<VizPage />);

    const input = screen.getByTestId('headhash-input');
    await user.type(input, HEAD_HASH);
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByTestId('force-graph-container')).toBeInTheDocument();
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(calledUrl).toContain(`/api/v1/evidence/chain/${HEAD_HASH}`);
  });

  it('点击查询按钮触发查询', async () => {
    const user = userEvent.setup();
    mockChainResponse(makeChainResponse());
    renderWithQueryClient(<VizPage />);

    const input = screen.getByTestId('headhash-input');
    await user.type(input, HEAD_HASH);
    await user.click(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByTestId('force-graph-container')).toBeInTheDocument();
    });
  });

  it('空白输入不触发查询', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<VizPage />);

    await user.click(screen.getByTestId('search-button'));
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(screen.getByTestId('viz-initial')).toBeInTheDocument();
  });

  it('加载中状态：按钮显示 spinner 且禁用', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(
      () => new Promise<Response>(() => {}),
    );
    renderWithQueryClient(<VizPage />);

    const input = screen.getByTestId('headhash-input');
    await user.type(input, HEAD_HASH);
    await user.click(screen.getByTestId('search-button'));

    await waitFor(() => {
      const btn = screen.getByTestId('search-button');
      expect(btn).toBeDisabled();
    });
  });

  it('错误状态：展示 Alert 错误信息', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response('Internal Server Error', {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'Content-Type': 'text/plain' },
      }),
    );
    renderWithQueryClient(<VizPage />);

    const input = screen.getByTestId('headhash-input');
    await user.type(input, HEAD_HASH);
    await user.click(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByTestId('viz-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('viz-error')).toHaveTextContent(/500/);
  });

  it('空数据状态：graphSubtree 含零节点时提示空证据链', async () => {
    const user = userEvent.setup();
    mockChainResponse(
      makeChainResponse({ graphSubtree: makeGraphSubtree({ nodes: [], edges: [] }) }),
    );
    renderWithQueryClient(<VizPage />);

    const input = screen.getByTestId('headhash-input');
    await user.type(input, HEAD_HASH);
    await user.click(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByTestId('viz-empty')).toBeInTheDocument();
    });
  });

  it('成功加载证据链后渲染 D3 力导向图（节点圆 + 边线）', async () => {
    const user = userEvent.setup();
    mockChainResponse(makeChainResponse());
    renderWithQueryClient(<VizPage />);

    const input = screen.getByTestId('headhash-input');
    await user.type(input, HEAD_HASH);
    await user.click(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByTestId('force-graph-container')).toBeInTheDocument();
    });

    const svg = screen.getByTestId('force-graph-svg');
    const circles = svg.querySelectorAll('circle');
    expect(circles.length).toBe(3);
    const lines = svg.querySelectorAll('line');
    expect(lines.length).toBe(2);
  });

  it('渲染图例（裁决着色 + 节点类型 + 边类型）', async () => {
    const user = userEvent.setup();
    mockChainResponse(makeChainResponse());
    renderWithQueryClient(<VizPage />);

    const input = screen.getByTestId('headhash-input');
    await user.type(input, HEAD_HASH);
    await user.click(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByTestId('verdict-legend')).toBeInTheDocument();
    });
    expect(screen.getByTestId('node-legend')).toBeInTheDocument();
    expect(screen.getByTestId('edge-legend')).toBeInTheDocument();
    // 裁决图例包含中文标签
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText('Refuted')).toBeInTheDocument();
    // 节点类型图例
    expect(screen.getByText('Hypothesis')).toBeInTheDocument();
    expect(screen.getByText('Evidence')).toBeInTheDocument();
    // 边类型图例
    expect(screen.getByText('Supports')).toBeInTheDocument();
    expect(screen.getByText('Refutes')).toBeInTheDocument();
  });

  it('节点圆按 verdict 着色（CONFIRMED=绿 / INCONCLUSIVE=黄 / UNTESTED=灰）', async () => {
    const user = userEvent.setup();
    mockChainResponse(makeChainResponse());
    renderWithQueryClient(<VizPage />);

    const input = screen.getByTestId('headhash-input');
    await user.type(input, HEAD_HASH);
    await user.click(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByTestId('force-graph-container')).toBeInTheDocument();
    });

    const svg = screen.getByTestId('force-graph-svg');
    const circles = svg.querySelectorAll('circle');
    const fills = Array.from(circles).map((c) => c.getAttribute('fill'));

    // node-root = UNTESTED (gray), node-ev1 = CONFIRMED (green), node-m1 = INCONCLUSIVE (yellow/amber)
    expect(fills).toContain('hsl(215.4, 16.3%, 46.9%)');  // UNTESTED gray
    expect(fills).toContain('hsl(142.1, 70.6%, 45.3%)');  // CONFIRMED green
    expect(fills).toContain('hsl(47.9, 95.8%, 53.1%)');   // INCONCLUSIVE yellow
  });

  it('节点圆包含 SVG title 悬停提示', async () => {
    const user = userEvent.setup();
    mockChainResponse(makeChainResponse());
    renderWithQueryClient(<VizPage />);

    const input = screen.getByTestId('headhash-input');
    await user.type(input, HEAD_HASH);
    await user.click(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByTestId('force-graph-container')).toBeInTheDocument();
    });

    const svg = screen.getByTestId('force-graph-svg');
    const titles = svg.querySelectorAll('title');
    expect(titles.length).toBe(3);

    // 第一个节点的 title 应包含 evidence_record 字段
    const firstTitle = titles[0].textContent ?? '';
    expect(firstTitle).toContain('Evidence ID');
    expect(firstTitle).toContain('Verdict');
    expect(firstTitle).toContain('Metric');
  });

  it('点击节点打开侧栏详情', async () => {
    const user = userEvent.setup();
    mockChainResponse(makeChainResponse());
    renderWithQueryClient(<VizPage />);

    const input = screen.getByTestId('headhash-input');
    await user.type(input, HEAD_HASH);
    await user.click(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByTestId('force-graph-container')).toBeInTheDocument();
    });

    const svg = screen.getByTestId('force-graph-svg');
    const nodeGroups = svg.querySelectorAll('.nodes g');
    expect(nodeGroups.length).toBeGreaterThanOrEqual(1);

    const firstNode = nodeGroups[0] as SVGGElement;
    fireEvent.click(firstNode);

    await waitFor(() => {
      expect(screen.getByTestId('node-detail-sidebar')).toBeInTheDocument();
    });
    expect(screen.getByTestId('node-detail-sidebar')).toHaveTextContent('Node details');
  });

  it('关闭侧栏按钮隐藏详情', async () => {
    const user = userEvent.setup();
    mockChainResponse(makeChainResponse());
    renderWithQueryClient(<VizPage />);

    const input = screen.getByTestId('headhash-input');
    await user.type(input, HEAD_HASH);
    await user.click(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByTestId('force-graph-container')).toBeInTheDocument();
    });

    const svg = screen.getByTestId('force-graph-svg');
    const nodeGroups = svg.querySelectorAll('.nodes g');
    fireEvent.click(nodeGroups[0] as SVGGElement);

    await waitFor(() => {
      expect(screen.getByTestId('node-detail-sidebar')).toBeInTheDocument();
    });

    const closeBtn = screen.getByRole('button', { name: 'Close sidebar' });
    await user.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('node-detail-sidebar')).not.toBeInTheDocument();
    });
  });

  it('切换查询时清除旧侧栏选中', async () => {
    const user = userEvent.setup();
    mockChainResponse(makeChainResponse());
    renderWithQueryClient(<VizPage />);

    const input = screen.getByTestId('headhash-input');
    await user.type(input, HEAD_HASH);
    await user.click(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByTestId('force-graph-container')).toBeInTheDocument();
    });

    const svg = screen.getByTestId('force-graph-svg');
    const nodeGroups = svg.querySelectorAll('.nodes g');
    fireEvent.click(nodeGroups[0] as SVGGElement);

    await waitFor(() => {
      expect(screen.getByTestId('node-detail-sidebar')).toBeInTheDocument();
    });

    mockChainResponse(makeChainResponse({ headHash: HEAD_HASH_2 }));
    await user.clear(input);
    await user.type(input, HEAD_HASH_2);
    await user.click(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.queryByTestId('node-detail-sidebar')).not.toBeInTheDocument();
    });
  });

  it('API 返回 graphSubtree 非法形状时展示警告', async () => {
    const user = userEvent.setup();
    mockChainResponse({
      headHash: HEAD_HASH,
      callRecord: null,
      graphSubtree: { nodes: [], edges: [] },
    } as unknown as EvidenceChainResponse);
    renderWithQueryClient(<VizPage />);

    const input = screen.getByTestId('headhash-input');
    await user.type(input, HEAD_HASH);
    await user.click(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByTestId('viz-no-subtree')).toBeInTheDocument();
    });
  });

  it('节点详情侧栏使用 VerdictBadge 展示判定', async () => {
    const user = userEvent.setup();
    const subtree = makeGraphSubtree();
    mockChainResponse(makeChainResponse({ graphSubtree: subtree }));
    renderWithQueryClient(<VizPage />);

    const input = screen.getByTestId('headhash-input');
    await user.type(input, HEAD_HASH);
    await user.click(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByTestId('force-graph-container')).toBeInTheDocument();
    });

    const svg = screen.getByTestId('force-graph-svg');
    const nodeGroups = svg.querySelectorAll('.nodes g');
    // 点击第二个节点（evidence / CONFIRMED）
    fireEvent.click(nodeGroups[1] as SVGGElement);

    await waitFor(() => {
      const sidebar = screen.getByTestId('node-detail-sidebar');
      expect(sidebar).toHaveTextContent('Evidence');
      expect(sidebar).toHaveTextContent('Confirmed');
      expect(sidebar).toHaveTextContent('0.92');
    });
  });

  it('节点详情侧栏展示判定 Badge 与指标值', async () => {
    const user = userEvent.setup();
    const subtree = makeGraphSubtree();
    mockChainResponse(makeChainResponse({ graphSubtree: subtree }));
    renderWithQueryClient(<VizPage />);

    const input = screen.getByTestId('headhash-input');
    await user.type(input, HEAD_HASH);
    await user.click(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByTestId('force-graph-container')).toBeInTheDocument();
    });

    const svg = screen.getByTestId('force-graph-svg');
    const nodeGroups = svg.querySelectorAll('.nodes g');
    fireEvent.click(nodeGroups[1] as SVGGElement);

    await waitFor(() => {
      const sidebar = screen.getByTestId('node-detail-sidebar');
      expect(sidebar).toHaveTextContent('Evidence');
      expect(sidebar).toHaveTextContent('Confirmed');
      expect(sidebar).toHaveTextContent('0.92');
    });
  });
});
