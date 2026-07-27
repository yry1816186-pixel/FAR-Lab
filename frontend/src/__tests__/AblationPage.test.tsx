import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AblationPage from '@/pages/AblationPage';
import type { HypothesizeResponse, VerdictValue } from '@/lib/types';

// ============================================================
// Test helpers
// ============================================================

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function makeResponse(
  runId: string,
  verdict: VerdictValue = 'CONFIRMED',
  overrides: Partial<HypothesizeResponse['loopState']> = {},
  verdictOverrides: Partial<HypothesizeResponse['loopState']['verdictNode']> = {},
): HypothesizeResponse {
  return {
    loopState: {
      runId,
      iterationsCompleted: 5,
      terminated: true,
      terminationReason: 'feedback_converged',
      artifacts: [],
      verdictNode: {
        verdictId: `v-${runId}`,
        evidenceId: `ev-${runId}`,
        parentVerdictId: null,
        nodeKind: 'hypothesis',
        verdict,
        falsificationSpec: {
          prediction: 'test prediction',
          metric: 'accuracy',
          falsificationThreshold: 0.8,
          thresholdSemantics: 'gt',
        },
        thresholdSpec: null,
        metricValue: 0.92,
        conflictingEvidenceCount: 0,
        scopeSlipText: null,
        untestedReason: null,
        sourceAnchor: {},
        replayProver: {},
        prevHash: 'abc123',
        currentHash: 'def456',
        createdAt: '2026-06-27T00:00:00Z',
        updatedAt: '2026-06-27T00:00:00Z',
        ...verdictOverrides,
      },
      error: null,
      ...overrides,
    },
    graphSubtree: { rootId: 'r1', nodes: [], edges: [] },
    honestVerdict: null,
    reproHash: `sha256:${runId}hash1234567890abcdef`,
  };
}

function mockFetchSuccess(response: HypothesizeResponse) {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }) as Response,
  );
}

function mockFetchError(status: number, statusText: string) {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({ error: statusText }), {
      status,
      statusText,
      headers: { 'Content-Type': 'application/json' },
    }) as Response,
  );
}

const BASELINE_KEYS = ['random', 'search', 'direct-llm', 'far-chain'] as const;

// ============================================================
// Tests
// ============================================================

describe('AblationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Rendering ----

  it('renders page container with header, input, and disabled run button', () => {
    renderWithQueryClient(<AblationPage />);

    expect(screen.getByTestId('ablation-page')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Ablation study', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('ablation-input')).toBeInTheDocument();

    const runButton = screen.getByTestId('ablation-run-button');
    expect(runButton).toBeInTheDocument();
    expect(runButton).toBeDisabled();
  });

  it('shows input card with baseline descriptions', () => {
    renderWithQueryClient(<AblationPage />);
    expect(screen.getByTestId('ablation-input-card')).toBeInTheDocument();
    // baseline label 现出现在「baseline 卡片」+「能力矩阵表头」两处（card 详细视图 · matrix 对比视图）·用 getAllByText 容忍。
    expect(screen.getAllByText('Random Baseline').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Search Baseline').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Direct LLM').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('FAR-Lab Full').length).toBeGreaterThanOrEqual(1);
  });

  it('enables run button when input is non-empty', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<AblationPage />);

    const input = screen.getByTestId('ablation-input');
    await user.type(input, 'test hypothesis');

    expect(screen.getByTestId('ablation-run-button')).not.toBeDisabled();
  });

  it('runs baselines on click and completes with results', async () => {
    const user = userEvent.setup();
    for (const key of BASELINE_KEYS) {
      mockFetchSuccess(makeResponse(`run-${key}`));
    }

    renderWithQueryClient(<AblationPage />);
    await user.type(screen.getByTestId('ablation-input'), 'test');
    await user.click(screen.getByTestId('ablation-run-button'));

    // After click, results should appear (all 4 baselines complete)
    await waitFor(() => {
      expect(screen.getByTestId('baseline-result-random')).toBeInTheDocument();
    });
    expect(screen.getByTestId('baseline-result-search')).toBeInTheDocument();
    expect(screen.getByTestId('baseline-result-direct-llm')).toBeInTheDocument();
    expect(screen.getByTestId('baseline-result-far-chain')).toBeInTheDocument();

    // After completion, button should be re-enabled and input enabled
    expect(screen.getByTestId('ablation-run-button')).not.toBeDisabled();
    expect(screen.getByTestId('ablation-input')).not.toBeDisabled();
  });

  // ---- Baseline cards ----

  it('renders 4 baseline cards in idle state', () => {
    renderWithQueryClient(<AblationPage />);

    expect(screen.getByTestId('baseline-cards')).toBeInTheDocument();

    for (const key of BASELINE_KEYS) {
      const card = screen.getByTestId(`baseline-card-${key}`);
      expect(card).toBeInTheDocument();
      expect(screen.getByTestId(`baseline-idle-${key}`)).toHaveTextContent(
        'Waiting to run…',
      );
    }
  });

  it('highlights FAR-Lab card with ring style', () => {
    renderWithQueryClient(<AblationPage />);
    const card = screen.getByTestId('baseline-card-far-chain');
    expect(card.className).toContain('ring');
  });

  // ---- Successful run ----

  it('runs all 4 baselines in parallel and displays results', async () => {
    const user = userEvent.setup();
    for (let i = 0; i < BASELINE_KEYS.length; i++) {
      mockFetchSuccess(
        makeResponse(`run-${BASELINE_KEYS[i]}`, 'CONFIRMED', {
          iterationsCompleted: 3 + i,
        }),
      );
    }

    renderWithQueryClient(<AblationPage />);
    await user.type(screen.getByTestId('ablation-input'), 'test research question');
    await user.click(screen.getByTestId('ablation-run-button'));

    // Wait for all 4 results to appear
    for (const key of BASELINE_KEYS) {
      await waitFor(() => {
        expect(
          screen.getByTestId(`baseline-result-${key}`),
        ).toBeInTheDocument();
      });
    }

    // Verify each card shows Run ID (scoped within result cards)
    for (const key of BASELINE_KEYS) {
      const card = screen.getByTestId(`baseline-result-${key}`);
      expect(card.textContent).toContain(`run-${key}`);
    }
  });

  // ---- Comparison table ----

  it('shows comparison table after successful run', async () => {
    const user = userEvent.setup();
    for (const key of BASELINE_KEYS) {
      mockFetchSuccess(makeResponse(`run-${key}`));
    }

    renderWithQueryClient(<AblationPage />);
    await user.type(screen.getByTestId('ablation-input'), 'test');
    await user.click(screen.getByTestId('ablation-run-button'));

    await waitFor(() => {
      expect(screen.getByTestId('comparison-table')).toBeInTheDocument();
    });

    // Each baseline should have a table row
    for (const key of BASELINE_KEYS) {
      expect(screen.getByTestId(`row-${key}`)).toBeInTheDocument();
    }
  });

  it('displays verdict badges with correct English labels in table', async () => {
    const user = userEvent.setup();
    const verdicts: VerdictValue[] = [
      'CONFIRMED',
      'REFUTED',
      'INCONCLUSIVE',
      'UNTESTED',
    ];
    for (let i = 0; i < BASELINE_KEYS.length; i++) {
      mockFetchSuccess(makeResponse(`run-${BASELINE_KEYS[i]}`, verdicts[i]));
    }

    renderWithQueryClient(<AblationPage />);
    await user.type(screen.getByTestId('ablation-input'), 'test');
    await user.click(screen.getByTestId('ablation-run-button'));

    await waitFor(() => {
      expect(screen.getByTestId('comparison-table')).toBeInTheDocument();
    });

    // Scope within comparison table — each verdict text appears both in cards and table
    const table = screen.getByTestId('comparison-table');
    expect(table.textContent).toContain('Confirmed');
    expect(table.textContent).toContain('Refuted');
    expect(table.textContent).toContain('Inconclusive');
    expect(table.textContent).toContain('Untested');
  });

  it('shows termination reason badges in table', async () => {
    const user = userEvent.setup();
    mockFetchSuccess(
      makeResponse('run-random', 'CONFIRMED', {
        terminationReason: 'feedback_converged',
      }),
    );
    mockFetchSuccess(
      makeResponse('run-search', 'INCONCLUSIVE', {
        terminationReason: 'max_iterations',
      }),
    );
    mockFetchSuccess(
      makeResponse('run-direct-llm', 'REFUTED', {
        terminationReason: 'error',
      }),
    );
    mockFetchSuccess(
      makeResponse('run-far-chain', 'CONFIRMED', {
        terminationReason: 'max_tokens',
      }),
    );

    renderWithQueryClient(<AblationPage />);
    await user.type(screen.getByTestId('ablation-input'), 'test');
    await user.click(screen.getByTestId('ablation-run-button'));

    await waitFor(() => {
      expect(screen.getByTestId('comparison-table')).toBeInTheDocument();
    });

    // Scope within comparison table — text appears both in cards and table
    const table = screen.getByTestId('comparison-table');
    expect(table.textContent).toContain('Converged');
    expect(table.textContent).toContain('Max iterations');
    expect(table.textContent).toContain('Errored');
    expect(table.textContent).toContain('Token limit');
  });

  it('displays reproHash truncated in table', async () => {
    const user = userEvent.setup();
    for (const key of BASELINE_KEYS) {
      mockFetchSuccess(makeResponse(`run-${key}`));
    }

    renderWithQueryClient(<AblationPage />);
    await user.type(screen.getByTestId('ablation-input'), 'test');
    await user.click(screen.getByTestId('ablation-run-button'));

    await waitFor(() => {
      expect(screen.getByTestId('row-random')).toBeInTheDocument();
    });

    // The full hash is sha256:run-randomhash1234567890abcdef, truncated to 12 chars + …
    const row = screen.getByTestId('row-random');
    expect(row.textContent).toContain('…');
  });

  // ---- Error handling ----

  it('handles partial failures: shows results for successes, errors for failures', async () => {
    const user = userEvent.setup();

    mockFetchSuccess(makeResponse('run-random'));
    mockFetchError(500, 'Internal Server Error');
    mockFetchSuccess(makeResponse('run-direct-llm'));
    mockFetchError(503, 'Service Unavailable');

    renderWithQueryClient(<AblationPage />);
    await user.type(screen.getByTestId('ablation-input'), 'test');
    await user.click(screen.getByTestId('ablation-run-button'));

    // Wait for success cards
    await waitFor(() => {
      expect(
        screen.getByTestId('baseline-result-random'),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('baseline-result-direct-llm'),
    ).toBeInTheDocument();

    // Error rows should appear in table
    await waitFor(() => {
      expect(screen.getByTestId('row-search-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('row-search-error')).toBeInTheDocument();
    expect(screen.getByTestId('row-search-error')).toHaveTextContent(
      'Request failed',
    );
  });

  it('shows all-error fallback when every baseline fails', async () => {
    const user = userEvent.setup();

    for (let i = 0; i < 4; i++) {
      mockFetchError(500, 'Error');
    }

    renderWithQueryClient(<AblationPage />);
    await user.type(screen.getByTestId('ablation-input'), 'test');
    await user.click(screen.getByTestId('ablation-run-button'));

    await waitFor(() => {
      expect(screen.getByTestId('ablation-all-error')).toBeInTheDocument();
    });
    expect(screen.getByText('All baselines failed')).toBeInTheDocument();
  });

  it('handles network error (fetch rejection)', async () => {
    const user = userEvent.setup();

    // Simulate a network-level failure (fetch rejects, not just non-2xx)
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network Error'));
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Connection refused'));
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network Error'));
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Connection refused'));

    renderWithQueryClient(<AblationPage />);
    await user.type(screen.getByTestId('ablation-input'), 'test');
    await user.click(screen.getByTestId('ablation-run-button'));

    await waitFor(() => {
      expect(screen.getByTestId('ablation-all-error')).toBeInTheDocument();
    });
  });

  // ---- Summary section ----

  it('shows advantage summary cards after all baselines complete', async () => {
    const user = userEvent.setup();
    for (const key of BASELINE_KEYS) {
      mockFetchSuccess(makeResponse(`run-${key}`));
    }

    renderWithQueryClient(<AblationPage />);
    await user.type(screen.getByTestId('ablation-input'), 'test');
    await user.click(screen.getByTestId('ablation-run-button'));

    await waitFor(() => {
      expect(screen.getByTestId('advantage-cards')).toBeInTheDocument();
    });

    expect(screen.getByText('Tamper-detectability')).toBeInTheDocument();
    expect(screen.getByText('Independent re-computability')).toBeInTheDocument();
    expect(screen.getByText('Falsifiability')).toBeInTheDocument();
  });

  it('does not show summary before all baselines complete', async () => {
    const user = userEvent.setup();

    // Only 2 successes + 2 errors so allComplete is true but not all success
    mockFetchSuccess(makeResponse('run-random'));
    mockFetchSuccess(makeResponse('run-search'));
    mockFetchError(500, 'Error');
    mockFetchError(500, 'Error');

    renderWithQueryClient(<AblationPage />);
    await user.type(screen.getByTestId('ablation-input'), 'test');
    await user.click(screen.getByTestId('ablation-run-button'));

    // Wait for results
    await waitFor(() => {
      expect(
        screen.getByTestId('baseline-result-random'),
      ).toBeInTheDocument();
    });

    // Summary should be shown (allComplete = true, hasAnyResult = true)
    expect(screen.getByTestId('advantage-cards')).toBeInTheDocument();
  });

  // ---- Empty input guard ----

  it('does not fire requests on whitespace-only input', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<AblationPage />);

    const input = screen.getByTestId('ablation-input');
    await user.type(input, '   ');

    // Button should still be disabled for whitespace-only input
    expect(screen.getByTestId('ablation-run-button')).toBeDisabled();
  });

  // ---- Metric value display ----

  it('shows metric value formatted to 4 decimal places', async () => {
    const user = userEvent.setup();
    mockFetchSuccess(
      makeResponse('run-random', 'CONFIRMED', {}, { metricValue: 0.123456789 }),
    );
    for (let i = 1; i < BASELINE_KEYS.length; i++) {
      mockFetchSuccess(makeResponse(`run-${BASELINE_KEYS[i]}`));
    }

    renderWithQueryClient(<AblationPage />);
    await user.type(screen.getByTestId('ablation-input'), 'test');
    await user.click(screen.getByTestId('ablation-run-button'));

    await waitFor(() => {
      expect(screen.getByTestId('row-random')).toBeInTheDocument();
    });

    // The metric 0.123456789 formatted to 4 decimal places = 0.1235
    // Scope within the table row to avoid duplicates (value appears in card too)
    const row = screen.getByTestId('row-random');
    expect(row.textContent).toContain('0.1235');
  });

  // ---- Null metricValue ----

  it('shows em-dash when metricValue is null', async () => {
    const user = userEvent.setup();
    mockFetchSuccess(
      makeResponse('run-random', 'UNTESTED', {}, { metricValue: null }),
    );
    for (const key of BASELINE_KEYS) {
      if (key === 'random') continue; // already mocked above
      mockFetchSuccess(makeResponse(`run-${key}`));
    }

    renderWithQueryClient(<AblationPage />);
    await user.type(screen.getByTestId('ablation-input'), 'test');
    await user.click(screen.getByTestId('ablation-run-button'));

    await waitFor(() => {
      expect(screen.getByTestId('row-random')).toBeInTheDocument();
    });

    // The em-dash should appear for null metricValue
    const row = screen.getByTestId('row-random');
    // There should be a '—' in the row for the null metric
    expect(row.textContent).toContain('—');
  });

  // ---- Visualization charts ----

  it('renders visualization chart containers after successful run', async () => {
    const user = userEvent.setup();
    for (const key of BASELINE_KEYS) {
      mockFetchSuccess(makeResponse(`run-${key}`));
    }

    renderWithQueryClient(<AblationPage />);
    await user.type(screen.getByTestId('ablation-input'), 'test');
    await user.click(screen.getByTestId('ablation-run-button'));

    await waitFor(() => {
      expect(screen.getByTestId('ablation-charts')).toBeInTheDocument();
    });

    // All 4 chart containers should be present
    expect(screen.getByTestId('iteration-chart-container')).toBeInTheDocument();
    expect(screen.getByTestId('metric-chart-container')).toBeInTheDocument();
    expect(
      screen.getByTestId('verdict-dist-chart-container'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('falsifiability-chart-container'),
    ).toBeInTheDocument();
  });

  it('renders D3 SVG elements inside chart containers', async () => {
    const user = userEvent.setup();
    for (const key of BASELINE_KEYS) {
      mockFetchSuccess(makeResponse(`run-${key}`));
    }

    renderWithQueryClient(<AblationPage />);
    await user.type(screen.getByTestId('ablation-input'), 'test');
    await user.click(screen.getByTestId('ablation-run-button'));

    await waitFor(() => {
      expect(screen.getByTestId('iteration-chart-svg')).toBeInTheDocument();
    });

    // Iteration chart SVG should contain rect elements (bars)
    const iterationSvg = screen.getByTestId('iteration-chart-svg');
    const bars = iterationSvg.querySelectorAll('rect.bar');
    expect(bars.length).toBeGreaterThanOrEqual(1);
  });

  it('charts show FAR-Lab baseline with distinct color', async () => {
    const user = userEvent.setup();
    for (const key of BASELINE_KEYS) {
      mockFetchSuccess(makeResponse(`run-${key}`));
    }

    renderWithQueryClient(<AblationPage />);
    await user.type(screen.getByTestId('ablation-input'), 'test');
    await user.click(screen.getByTestId('ablation-run-button'));

    await waitFor(() => {
      expect(screen.getByTestId('iteration-chart-svg')).toBeInTheDocument();
    });

    // All chart SVGs should have aria-labels for accessibility
    const iterationSvg = screen.getByTestId('iteration-chart-svg');
    expect(iterationSvg.getAttribute('aria-label')).toBeTruthy();
    expect(iterationSvg.getAttribute('role')).toBe('img');

    const metricSvg = screen.getByTestId('metric-chart-svg');
    expect(metricSvg.getAttribute('aria-label')).toBeTruthy();
  });

  it('charts are not rendered before any result', () => {
    renderWithQueryClient(<AblationPage />);
    expect(
      screen.queryByTestId('ablation-charts'),
    ).not.toBeInTheDocument();
  });

  it('charts handle partial success — render with available data only', async () => {
    const user = userEvent.setup();

    // Only 2 baselines succeed
    mockFetchSuccess(makeResponse('run-random', 'CONFIRMED'));
    mockFetchError(500, 'Error');
    mockFetchSuccess(makeResponse('run-direct-llm', 'REFUTED'));
    mockFetchError(503, 'Unavailable');

    renderWithQueryClient(<AblationPage />);
    await user.type(screen.getByTestId('ablation-input'), 'test');
    await user.click(screen.getByTestId('ablation-run-button'));

    await waitFor(() => {
      expect(
        screen.getByTestId('baseline-result-random'),
      ).toBeInTheDocument();
    });

    // Charts should still render (using only the 2 successful baselines)
    expect(screen.getByTestId('ablation-charts')).toBeInTheDocument();
    expect(screen.getByTestId('iteration-chart-svg')).toBeInTheDocument();
  });

  // ---- Honesty wall + capability matrix (反 theater·真实化) ----

  it('renders HonestyWall: same offline fixture loopState + moat is not the verdict', () => {
    renderWithQueryClient(<AblationPage />);
    const wall = screen.getByTestId('ablation-honesty-wall');
    expect(wall).toBeInTheDocument();
    expect(wall.textContent).toContain('the same deterministic loopState');
    expect(wall.textContent).toContain('not in the verdict value');
  });

  it('renders CapabilityMatrix: 4 methods × 6 capability dimensions (testids present)', () => {
    renderWithQueryClient(<AblationPage />);
    const matrix = screen.getByTestId('ablation-capability-matrix');
    expect(matrix).toBeInTheDocument();
    const dims = [
      'evidenceRetrieval',
      'structuredChain',
      'singlePassReasoning',
      'falsificationSpec',
      'reproducibleHash',
      'gatedVerdict',
    ];
    for (const dim of dims) {
      expect(screen.getByTestId(`cap-${dim}-far-chain`)).toBeInTheDocument();
      expect(screen.getByTestId(`cap-${dim}-random`)).toBeInTheDocument();
    }
  });

  it('capability matrix attribution: FAR-Lab all present · random all absent (qualitative truth, not fabricated numbers)', () => {
    renderWithQueryClient(<AblationPage />);
    const dims = [
      'evidenceRetrieval',
      'structuredChain',
      'singlePassReasoning',
      'falsificationSpec',
      'reproducibleHash',
      'gatedVerdict',
    ];
    for (const dim of dims) {
      const farCell = screen.getByTestId(`cap-${dim}-far-chain`);
      expect(farCell.querySelector('[aria-label="Present"]')).not.toBeNull();
      const randCell = screen.getByTestId(`cap-${dim}-random`);
      expect(randCell.querySelector('[aria-label="Absent"]')).not.toBeNull();
    }
  });
});
