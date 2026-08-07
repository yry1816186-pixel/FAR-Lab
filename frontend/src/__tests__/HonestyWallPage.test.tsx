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
    decisionTrace: overrides.decisionTrace ?? null,
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
  it('renders page container and title', async () => {
    mockVerdictList([]);
    renderWithQueryClient(<HonestyWallPage />);
    await waitFor(() => {
      expect(screen.getByTestId('honesty-page')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: /Honesty Wall/ })).toBeInTheDocument();
  });

  it('shows spinner while loading', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<HonestyWallPage />);
    expect(screen.getByTestId('honesty-loading')).toBeInTheDocument();
    expect(screen.getByText('Loading verdict data…')).toBeInTheDocument();
  });

  it('shows error alert on API error', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('Internal Server Error', { status: 500, headers: { 'Content-Type': 'text/plain' } }),
    );
    renderWithQueryClient(<HonestyWallPage />);
    await waitFor(() => {
      expect(screen.getByTestId('honesty-error')).toBeInTheDocument();
    });
    expect(screen.getByText('Data load failed')).toBeInTheDocument();
  });

  it('shows placeholder for an empty list', async () => {
    mockVerdictList([]);
    renderWithQueryClient(<HonestyWallPage />);
    await waitFor(() => {
      expect(screen.getByTestId('honesty-empty')).toBeInTheDocument();
    });
    expect(screen.getByText('No experiments run yet — this wall is honestly empty')).toBeInTheDocument();
  });

  it('summary stats show counts for all 5 verdicts', async () => {
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

  it('summary stats show the total count', async () => {
    const items = mixedVerdicts();
    mockVerdictList(items);
    renderWithQueryClient(<HonestyWallPage />);

    await waitFor(() => {
      expect(screen.getByTestId('summary-stats')).toBeInTheDocument();
    });

    const matches = screen.getAllByText(/11 total/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('timeline entry shows verdictId / nodeKind / metricValue / createdAt', async () => {
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

  it('timeline entry shows the falsification spec (prediction + metric + threshold)', async () => {
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

  describe('5-verdict differential visuals', () => {
    it('CONFIRMED card uses a green left border', async () => {
      const items = [makeVerdict({ decision: 'CONFIRMED' }, 1)];
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('timeline-entry-v-001')).toBeInTheDocument();
      });

      const card = screen.getByTestId('timeline-card-v-001');
      expect(card.className).toContain('border-l-verdict-confirmed');
    });

    it('REFUTED card uses a red left border', async () => {
      const items = [makeVerdict({ decision: 'REFUTED' }, 1)];
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('timeline-entry-v-001')).toBeInTheDocument();
      });

      const card = screen.getByTestId('timeline-card-v-001');
      expect(card.className).toContain('border-l-verdict-refuted');
    });

    it('INCONCLUSIVE card uses a yellow left border', async () => {
      const items = [makeVerdict({ decision: 'INCONCLUSIVE' }, 1)];
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('timeline-entry-v-001')).toBeInTheDocument();
      });

      const card = screen.getByTestId('timeline-card-v-001');
      expect(card.className).toContain('border-l-verdict-inconclusive');
    });

    it('DEGRADED_SCOPE card uses an orange left border', async () => {
      const items = [makeVerdict({ decision: 'DEGRADED_SCOPE', scopeSlipText: '测试降级' }, 1)];
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('timeline-entry-v-001')).toBeInTheDocument();
      });

      const card = screen.getByTestId('timeline-card-v-001');
      expect(card.className).toContain('border-l-verdict-degraded');
    });

    it('UNTESTED card uses a gray dashed border', async () => {
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

  describe('DEGRADED_SCOPE scopeSlipText highlight', () => {
    it('shows scopeSlipText in an orange highlight box', async () => {
      const items = [
        makeVerdict({ decision: 'DEGRADED_SCOPE', scopeSlipText: '原假设不可直接测试' }, 1),
      ];
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('scope-slip-v-001')).toBeInTheDocument();
      });

      const el = screen.getByTestId('scope-slip-v-001');
      expect(el).toHaveTextContent('Scope degradation note:');
      expect(el).toHaveTextContent('原假设不可直接测试');
    });

    it('not rendered when scopeSlipText is null', async () => {
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

  describe('UNTESTED untestedReason highlight', () => {
    it('shows untestedReason in a gray highlight box', async () => {
      const items = [
        makeVerdict({ decision: 'UNTESTED', untestedReason: '缺少对照实验数据' }, 1),
      ];
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('untested-reason-v-001')).toBeInTheDocument();
      });

      const el = screen.getByTestId('untested-reason-v-001');
      expect(el).toHaveTextContent('Untested reason:');
      expect(el).toHaveTextContent('缺少对照实验数据');
    });

    it('not rendered when untestedReason is null', async () => {
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

  describe('interactive expand: SourceCard + hash-chain replay', () => {
    it('clicking a timeline entry expands SourceCard and hash-chain replay', async () => {
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
      expect(sourceCard).toHaveTextContent('Source Anchor');
      expect(sourceCard).toHaveTextContent('2026-06-27T00:00:00Z');
      expect(sourceCard).toHaveTextContent('req-12345');

      // 哈希链回放
      const hashChain = screen.getByTestId('hash-chain-replay');
      expect(hashChain).toHaveTextContent('Hash Chain Replay');
    });

    it('clicking again collapses the expanded detail', async () => {
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

    it('shows the expanded-detail area after expanding', async () => {
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

    it('genesis hash shows a special marker', async () => {
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
        expect(hashChain).toHaveTextContent('Genesis hash');
        expect(hashChain).toHaveTextContent('GENESIS');
      });
    });

    it('B3: decisionTrace panel renders firedRuleId + 7 R7 conditions + metrics + cannotProve', async () => {
      const user = userEvent.setup();
      const decisionTrace = {
        firedRuleId: 'R7_ALL_CHECKS_PASS',
        r7Gate: {
          supports: true,
          primaryAdjustedPValueSignificant: true,
          effectSizeSufficient: true,
          evidenceSufficient: true,
          noSameScopeRefutation: true,
          noIntegrityFlags: true,
          noWarnAssumption: false,
          overallPassed: false,
        },
        metrics: {
          alpha: 0.0125,
          mde: 0.2,
          primaryAdjustedPValue: 0.008,
          primaryEffectSize: 0.35,
          primaryConfidenceInterval: [0.12, 0.58],
          powerStatus: 'adequate',
          evidenceStatus: 'sufficient',
          effectiveDirection: 'supports',
          antiTheaterFailCount: 1,
          antiTheaterWarnCount: 2,
          integrityFlags: [],
          totalStatistics: 5,
          skippedStatistics: 0,
        },
        totalRulesInTree: 18,
        cannotProveStatement: 'decisionTrace is a post-hoc explanation; it cannot prove the verdict is correct.',
      };
      const items = [makeVerdict({ decision: 'CONFIRMED', decisionTrace }, 1)];
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('timeline-card-v-001')).toBeInTheDocument();
      });
      await user.click(screen.getByTestId('timeline-card-v-001'));

      await waitFor(() => {
        const panel = screen.getByTestId('decision-trace-panel');
        expect(panel).toBeInTheDocument();
      });
      // firedRuleId 徽章
      expect(screen.getByTestId('dt-fired-rule')).toHaveTextContent('R7_ALL_CHECKS_PASS');
      // 7 个 R7 条件（6 PASS + 1 FAIL）
      expect(screen.getByTestId('dt-r7-supports')).toHaveTextContent('PASS');
      expect(screen.getByTestId('dt-r7-noWarnAssumption')).toHaveTextContent('FAIL');
      expect(screen.getByTestId('dt-r7-gate')).toHaveTextContent('BLOCKED');
      // metrics 数值
      expect(screen.getByTestId('dt-metrics')).toHaveTextContent('0.0125');
      expect(screen.getByTestId('dt-metrics')).toHaveTextContent('0.008');
      expect(screen.getByTestId('dt-metrics')).toHaveTextContent('0.35');
      expect(screen.getByTestId('dt-metrics')).toHaveTextContent('supports');
      // 诚实声明
      expect(screen.getByTestId('dt-cannot-prove')).toHaveTextContent('cannot prove');
    });

    it('B3: decisionTrace null (old rows) → panel not rendered (zero regression)', async () => {
      const user = userEvent.setup();
      const items = [makeVerdict({ decision: 'CONFIRMED' }, 1)]; // decisionTrace 默认 null
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('timeline-card-v-001')).toBeInTheDocument();
      });
      await user.click(screen.getByTestId('timeline-card-v-001'));

      await waitFor(() => {
        expect(screen.getByTestId('expanded-detail-v-001')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('decision-trace-panel')).toBeNull();
    });
  });

  describe('pagination', () => {
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

    it('shows pagination controls when exceeding PAGE_SIZE', async () => {
      const items = manyVerdicts(15);
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('pagination')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
    });

    it('clicking next switches to the second page', async () => {
      const user = userEvent.setup();
      const items = manyVerdicts(15);
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('pagination')).toBeInTheDocument();
      });

      expect(screen.getByTestId('timeline-entry-v-001')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Next page' }));

      await waitFor(() => {
        expect(screen.queryByTestId('timeline-entry-v-001')).toBeNull();
      });
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
      });
      expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    });

    it('both pagination buttons disabled when under PAGE_SIZE', async () => {
      const items = manyVerdicts(5);
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('timeline-entry-v-001')).toBeInTheDocument();
      });

      const prevBtn = screen.getByRole('button', { name: 'Previous page' });
      const nextBtn = screen.getByRole('button', { name: 'Next page' });
      expect(prevBtn).toBeDisabled();
      expect(nextBtn).toBeDisabled();
    });
  });

  describe('timeline visual structure', () => {
    it('renders the evidence-timeline container', async () => {
      const items = [makeVerdict({ decision: 'CONFIRMED' }, 1)];
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('evidence-timeline')).toBeInTheDocument();
      });
    });

    it('timeline end marker', async () => {
      const items = [makeVerdict({ decision: 'CONFIRMED' }, 1)];
      mockVerdictList(items);
      renderWithQueryClient(<HonestyWallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('timeline-end-marker')).toBeInTheDocument();
      });
      expect(screen.getByText('End of evidence chain')).toBeInTheDocument();
    });
  });
});
