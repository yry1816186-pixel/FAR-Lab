import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HonestyWallPage from '@/pages/HonestyWallPage';
import type { HonestVerdictDto, VerdictListResponse, VerdictValue } from '@/lib/types';

// ---------- 测试工具 ----------

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

// ---------- Fixtures ----------

const falsificationSpec = {
  prediction: 'macro_f1 >= 0.8',
  metric: 'macro_f1',
  falsificationThreshold: 0.8,
  thresholdSemantics: 'gt' as const,
};

const sourceAnchor = {
  gitCommitSha: 'g'.repeat(40),
  isoTimestamp: '2026-01-01T00:00:00Z',
};

function makeVerdict(overrides: Partial<HonestVerdictDto> & { decision: VerdictValue }, index: number): HonestVerdictDto {
  return {
    verdictId: `v-${String(index).padStart(3, '0')}`,
    evidenceId: `ev-${String(index).padStart(3, '0')}`,
    parentNodeId: index > 0 ? `v-${String(index - 1).padStart(3, '0')}` : null,
    nodeKind: 'hypothesis',
    decision: overrides.decision,
    falsificationSpec: overrides.falsificationSpec ?? falsificationSpec,
    thresholdSpec: overrides.thresholdSpec ?? null,
    metricValue: overrides.metricValue ?? (index % 2 === 0 ? 0.85 + index * 0.01 : null),
    conflictingEvidenceCount: overrides.conflictingEvidenceCount ?? index,
    scopeSlipText: overrides.scopeSlipText ?? null,
    untestedReason: overrides.untestedReason ?? null,
    sourceAnchor: overrides.sourceAnchor ?? sourceAnchor,
    prevHash: overrides.prevHash ?? 'a'.repeat(64),
    currentHash: overrides.currentHash ?? 'b'.repeat(64),
    createdAt: overrides.createdAt ?? `2026-01-${String(10 + index).padStart(2, '0')}T00:00:00Z`,
    updatedAt: overrides.updatedAt ?? `2026-01-${String(10 + index).padStart(2, '0')}T00:00:00Z`,
  } as HonestVerdictDto;
}

/** 构造 5 种判決的混合列表 */
function mixedVerdicts(): HonestVerdictDto[] {
  return [
    makeVerdict({ decision: 'CONFIRMED' }, 1),
    makeVerdict({ decision: 'CONFIRMED' }, 2),
    makeVerdict({ decision: 'REFUTED' }, 3),
    makeVerdict({ decision: 'REFUTED' }, 4),
    makeVerdict({ decision: 'REFUTED' }, 5),
    makeVerdict({ decision: 'INCONCLUSIVE' }, 6),
    makeVerdict({ decision: 'DEGRADED_SCOPE', scopeSlipText: '原假设 P 不可直接测试，降级为 P\'' }, 7),
    makeVerdict({ decision: 'DEGRADED_SCOPE', scopeSlipText: '数据覆盖不足，限定于亚洲人群' }, 8),
    makeVerdict({ decision: 'UNTESTED', untestedReason: '缺少对照实验数据' }, 9),
    makeVerdict({ decision: 'UNTESTED', untestedReason: '方法尚未实现' }, 10),
    makeVerdict({ decision: 'UNTESTED' }, 11),
  ];
}

function mockVerdictList(items: HonestVerdictDto[]) {
  const body: VerdictListResponse = {
    items,
    count: items.length,
    limit: 100,
    offset: 0,
  };
  vi.mocked(fetch).mockResolvedValue(jsonResponse(body));
}

// ---------- 测试 ----------

describe('HonestyWallPage', () => {
  it('渲染页面容器与标题', async () => {
    mockVerdictList([]);
    renderWithQueryClient(<HonestyWallPage />);
    await waitFor(() => {
      expect(screen.getByTestId('honesty-page')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: /诚信墙/ })).toBeInTheDocument();
  });

  it('加载中显示 spinner', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<HonestyWallPage />);
    expect(screen.getByTestId('honesty-loading')).toBeInTheDocument();
    expect(screen.getByText('加载判決数据…')).toBeInTheDocument();
  });

  it('API 错误显示错误告警', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('Internal Server Error', { status: 500, headers: { 'Content-Type': 'text/plain' } }),
    );
    renderWithQueryClient(<HonestyWallPage />);
    await waitFor(() => {
      expect(screen.getByTestId('honesty-error')).toBeInTheDocument();
    });
    expect(screen.getByText('数据加载失败')).toBeInTheDocument();
  });

  it('空列表显示占位提示', async () => {
    mockVerdictList([]);
    renderWithQueryClient(<HonestyWallPage />);
    await waitFor(() => {
      expect(screen.getByTestId('honesty-empty')).toBeInTheDocument();
    });
    expect(screen.getByText('尚未运行实验，此墙诚实为空')).toBeInTheDocument();
  });

  it('汇总统计展示 5 种判決计数', async () => {
    const items = mixedVerdicts();
    mockVerdictList(items);
    renderWithQueryClient(<HonestyWallPage />);

    await waitFor(() => {
      expect(screen.getByTestId('summary-stats')).toBeInTheDocument();
    });

    expect(screen.getByTestId('stat-count-confirmed')).toHaveTextContent('2');
    expect(screen.getByTestId('stat-count-refuted')).toHaveTextContent('3');
    expect(screen.getByTestId('stat-count-inconclusive')).toHaveTextContent('1');
    expect(screen.getByTestId('stat-count-degraded_scope')).toHaveTextContent('2');
    expect(screen.getByTestId('stat-count-untested')).toHaveTextContent('3');
  });

  it('汇总统计显示总数', async () => {
    const items = mixedVerdicts();
    mockVerdictList(items);
    renderWithQueryClient(<HonestyWallPage />);

    await waitFor(() => {
      expect(screen.getByTestId('summary-stats')).toBeInTheDocument();
    });

    const matches = screen.getAllByText(/共 11 条/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('时间线条目展示 verdictId / nodeKind / metricValue / createdAt', async () => {
    const items = [
      makeVerdict({ decision: 'CONFIRMED', metricValue: 0.92, nodeKind: 'hypothesis' }, 1),
    ];
    mockVerdictList(items);
    renderWithQueryClient(<HonestyWallPage />);

    await waitFor(() => {
      expect(screen.getByTestId('timeline-entry-v-001')).toBeInTheDocument();
    });

    const entry = screen.getByTestId('timeline-entry-v-001');
    expect(entry).toHaveTextContent('v-001');
    expect(entry).toHaveTextContent('hypothesis');
    expect(entry).toHaveTextContent('0.9200');
    expect(entry).toHaveTextContent('2026-01-11');
  });

  it('时间线条目展示可证伪规格（prediction + metric + threshold）', async () => {
    const items = [makeVerdict({ decision: 'CONFIRMED' }, 1)];
    mockVerdictList(items);
    renderWithQueryClient(<HonestyWallPage />);

    await waitFor(() => {
      expect(screen.getByTestId('timeline-entry-v-001')).toBeInTheDocument();
    });

    const entry = screen.getByTestId('timeline-entry-v-001');
    expect(entry).toHaveTextContent('macro_f1 >= 0.8');
    expect(entry).toHaveTextContent('macro_f1');
    expect(entry).toHaveTextContent('0.8');
  });

  describe('5 种判決差异化视觉', () => {
    it('CONFIRMED 卡片使用绿色左边框', async () => {
      const items = [makeVerdict({ decision: 'CONFIRMED' }, 1)];
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('timeline-entry-v-001')).toBeInTheDocument();
      });

      const card = screen.getByTestId('timeline-card-v-001');
      expect(card.className).toContain('border-l-verdict-confirmed');
    });

    it('REFUTED 卡片使用红色左边框', async () => {
      const items = [makeVerdict({ decision: 'REFUTED' }, 1)];
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('timeline-entry-v-001')).toBeInTheDocument();
      });

      const card = screen.getByTestId('timeline-card-v-001');
      expect(card.className).toContain('border-l-verdict-refuted');
    });

    it('INCONCLUSIVE 卡片使用黄色左边框', async () => {
      const items = [makeVerdict({ decision: 'INCONCLUSIVE' }, 1)];
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('timeline-entry-v-001')).toBeInTheDocument();
      });

      const card = screen.getByTestId('timeline-card-v-001');
      expect(card.className).toContain('border-l-verdict-inconclusive');
    });

    it('DEGRADED_SCOPE 卡片使用橙色左边框', async () => {
      const items = [makeVerdict({ decision: 'DEGRADED_SCOPE', scopeSlipText: '测试降级' }, 1)];
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('timeline-entry-v-001')).toBeInTheDocument();
      });

      const card = screen.getByTestId('timeline-card-v-001');
      expect(card.className).toContain('border-l-verdict-degraded');
    });

    it('UNTESTED 卡片使用灰色虚线框', async () => {
      const items = [makeVerdict({ decision: 'UNTESTED' }, 1)];
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('timeline-entry-v-001')).toBeInTheDocument();
      });

      const card = screen.getByTestId('timeline-card-v-001');
      expect(card.className).toContain('border-dashed');
      expect(card.className).toContain('border-verdict-untested');
    });
  });

  describe('DEGRADED_SCOPE scopeSlipText 高亮展示', () => {
    it('展示 scopeSlipText 在橙色高亮框中', async () => {
      const items = [
        makeVerdict({ decision: 'DEGRADED_SCOPE', scopeSlipText: '原假设不可直接测试' }, 1),
      ];
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('scope-slip-v-001')).toBeInTheDocument();
      });

      const el = screen.getByTestId('scope-slip-v-001');
      expect(el).toHaveTextContent('范围降级说明：');
      expect(el).toHaveTextContent('原假设不可直接测试');
    });

    it('scopeSlipText 为 null 时不渲染', async () => {
      const items = [
        makeVerdict({ decision: 'DEGRADED_SCOPE', scopeSlipText: null }, 1),
      ];
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('timeline-entry-v-001')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('scope-slip-v-001')).toBeNull();
    });
  });

  describe('UNTESTED untestedReason 高亮展示', () => {
    it('展示 untestedReason 在灰色高亮框中', async () => {
      const items = [
        makeVerdict({ decision: 'UNTESTED', untestedReason: '缺少对照实验数据' }, 1),
      ];
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('untested-reason-v-001')).toBeInTheDocument();
      });

      const el = screen.getByTestId('untested-reason-v-001');
      expect(el).toHaveTextContent('未测试原因：');
      expect(el).toHaveTextContent('缺少对照实验数据');
    });

    it('untestedReason 为 null 时不渲染', async () => {
      const items = [
        makeVerdict({ decision: 'UNTESTED', untestedReason: null }, 1),
      ];
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('timeline-entry-v-001')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('untested-reason-v-001')).toBeNull();
    });
  });

  describe('交互式展开 SourceCard + 哈希链回放', () => {
    it('点击时间线条目展开 SourceCard 与哈希链回放', async () => {
      const user = userEvent.setup();
      const items = [
        makeVerdict(
          {
            decision: 'CONFIRMED',
            sourceAnchor: {
              gitCommitSha: 'a'.repeat(40),
              isoTimestamp: '2026-06-27T00:00:00Z',
              dashscopeRequestId: 'req-12345',
              rawResponseHash: 'c'.repeat(64),
            },
            prevHash: 'p'.repeat(64),
            currentHash: 'c'.repeat(64),
          },
          1,
        ),
      ];
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('timeline-card-v-001')).toBeInTheDocument();
      });

      // 初始未展开
      expect(screen.queryByTestId('source-card')).toBeNull();
      expect(screen.queryByTestId('hash-chain-replay')).toBeNull();

      // 点击展开
      await user.click(screen.getByTestId('timeline-card-v-001'));

      await waitFor(() => {
        expect(screen.getByTestId('source-card')).toBeInTheDocument();
      });
      expect(screen.getByTestId('hash-chain-replay')).toBeInTheDocument();

      // SourceCard 内容
      const sourceCard = screen.getByTestId('source-card');
      expect(sourceCard).toHaveTextContent('来源锚点');
      expect(sourceCard).toHaveTextContent('2026-06-27T00:00:00Z');
      expect(sourceCard).toHaveTextContent('req-12345');

      // 哈希链回放
      const hashChain = screen.getByTestId('hash-chain-replay');
      expect(hashChain).toHaveTextContent('哈希链回放');
    });

    it('再次点击收起已展开的详情', async () => {
      const user = userEvent.setup();
      const items = [makeVerdict({ decision: 'CONFIRMED' }, 1)];
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('timeline-card-v-001')).toBeInTheDocument();
      });

      // 展开
      await user.click(screen.getByTestId('timeline-card-v-001'));
      await waitFor(() => {
        expect(screen.getByTestId('source-card')).toBeInTheDocument();
      });

      // 收起
      await user.click(screen.getByTestId('timeline-card-v-001'));
      await waitFor(() => {
        expect(screen.queryByTestId('source-card')).toBeNull();
      });
    });

    it('展开后展示 expanded-detail 区域', async () => {
      const user = userEvent.setup();
      const items = [makeVerdict({ decision: 'CONFIRMED' }, 1)];
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('timeline-card-v-001')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('timeline-card-v-001'));

      await waitFor(() => {
        expect(screen.getByTestId('expanded-detail-v-001')).toBeInTheDocument();
      });
    });

    it('创世哈希展示特殊标记', async () => {
      const user = userEvent.setup();
      const items = [
        makeVerdict(
          {
            decision: 'UNTESTED',
            prevHash: '0'.repeat(64),
            currentHash: 'c'.repeat(64),
          },
          1,
        ),
      ];
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('timeline-card-v-001')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('timeline-card-v-001'));

      await waitFor(() => {
        const hashChain = screen.getByTestId('hash-chain-replay');
        expect(hashChain).toHaveTextContent('创世哈希');
        expect(hashChain).toHaveTextContent('GENESIS');
      });
    });
  });

  describe('分页', () => {
    function manyVerdicts(count: number): HonestVerdictDto[] {
      return Array.from({ length: count }, (_, i) =>
        makeVerdict(
          {
            decision: (['CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'DEGRADED_SCOPE', 'UNTESTED'] as const)[i % 5],
            scopeSlipText: i % 5 === 3 ? `scope slip ${i}` : null,
            untestedReason: i % 5 === 4 ? `untested reason ${i}` : null,
          },
          i + 1,
        ),
      );
    }

    it('超过 PAGE_SIZE 时显示分页控件', async () => {
      const items = manyVerdicts(15);
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('pagination')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
      expect(screen.getByRole('button', { name: '下一页' })).toBeEnabled();
    });

    it('点击下一页切换到第二页', async () => {
      const user = userEvent.setup();
      const items = manyVerdicts(15);
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('pagination')).toBeInTheDocument();
      });

      expect(screen.getByTestId('timeline-entry-v-001')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: '下一页' }));

      await waitFor(() => {
        expect(screen.queryByTestId('timeline-entry-v-001')).toBeNull();
      });
      await waitFor(() => {
        expect(screen.getByRole('button', { name: '上一页' })).toBeEnabled();
      });
      expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled();
    });

    it('不足 PAGE_SIZE 时两个分页按钮均禁用', async () => {
      const items = manyVerdicts(5);
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('timeline-entry-v-001')).toBeInTheDocument();
      });

      const prevBtn = screen.getByRole('button', { name: '上一页' });
      const nextBtn = screen.getByRole('button', { name: '下一页' });
      expect(prevBtn).toBeDisabled();
      expect(nextBtn).toBeDisabled();
    });
  });

  describe('时间线视觉结构', () => {
    it('渲染证据时间线容器', async () => {
      const items = [makeVerdict({ decision: 'CONFIRMED' }, 1)];
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('evidence-timeline')).toBeInTheDocument();
      });
    });

    it('时间线末端标记', async () => {
      const items = [makeVerdict({ decision: 'CONFIRMED' }, 1)];
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('timeline-end-marker')).toBeInTheDocument();
      });
      expect(screen.getByText('证据链末端')).toBeInTheDocument();
    });
  });
});
