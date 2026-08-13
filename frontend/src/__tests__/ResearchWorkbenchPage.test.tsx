/**
 * ResearchWorkbenchPage.test.tsx —— Track-1A 科研工作台页面测试。
 *
 * 全 API 驱动（mock fetch·无网络）：创建研究 → run 详情渲染（模式横幅·假设比较·
 * 计划）→ 反馈 → 修订时间线 → 分析 → Observation → 评估指标。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import ResearchWorkbenchPage from '@/pages/ResearchWorkbenchPage';
import type { ResearchRunDto } from '@/lib/research_client';

// ---------- Fixture: 后端真实 DTO 形态（字段名 verbatim）----------

const RUN_DTO: ResearchRunDto = {
  runId: 'run-test-1',
  question: 'Does stellar activity inflate hot Jupiter radii?',
  gateReport: {
    verdict: 'RESEARCHABLE',
    reasons: [],
    safetyRisks: [],
    scope: { domain: 'astronomy' },
    requiresEthicsGate: false,
  },
  corpus: { documentCount: 2, snapshotId: 'snap123' },
  hypotheses: [
    {
      id: 'h1',
      statement: 'Apparent radius inflation is a starspot artifact.',
      mechanism: 'Starspots bias transit depth.',
      falsificationMethod: { prediction: 'p', metric: 'pearson_r', comparator: 'gt', value: 0.5 },
      supportingCitations: ['docA'],
      counterEvidenceCitations: ['docB'],
      relationToExistingTheory: '',
      alternativeExplanations: [],
      observablePredictions: [],
      distinguishingObservations: [],
      noveltyRelativeToCorpus: '',
      assumptions: [],
      risks: [],
    },
    {
      id: 'h2',
      statement: 'Inflation is physical tidal heating.',
      mechanism: 'Tidal dissipation.',
      falsificationMethod: { prediction: 'p2', metric: 'slope', comparator: 'gt', value: 0 },
      supportingCitations: [],
      counterEvidenceCitations: ['docA'],
      relationToExistingTheory: '',
      alternativeExplanations: [],
      observablePredictions: [],
      distinguishingObservations: [],
      noveltyRelativeToCorpus: '',
      assumptions: [],
      risks: [],
    },
  ],
  bindings: {
    h1: { allBound: true, unbound: [] },
    h2: { allBound: true, unbound: [] },
  },
  scorecards: {
    h1: {
      hypothesisId: 'h1',
      dimensions: [
        { name: 'Falsifiability', grade: 'A', rationale: 'r', source: 'deterministic' },
        { name: 'ScientificPlausibility', grade: 'B', rationale: 'r', source: 'model' },
      ],
      paretoOptimal: true,
      keyEvidenceToChangeConclusion: 'k',
    },
    h2: {
      hypothesisId: 'h2',
      dimensions: [
        { name: 'Falsifiability', grade: 'A', rationale: 'r', source: 'deterministic' },
      ],
      paretoOptimal: false,
      keyEvidenceToChangeConclusion: 'k',
    },
  },
  plan: {
    objectives: ['Test whether inflation persists after spot correction'],
    primaryHypothesisId: 'h1',
    alternativeHypothesisIds: ['h2'],
    preregisteredPredictions: ['residual anti-correlates'],
    dataRequirements: ['transit sample'],
    inclusionExclusionCriteria: ['exclude blended'],
    variables: ['radius_ratio'],
    design: 'Retrospective cross-sectional study',
    analysisDag: ['Select sample', 'Fit corrected radii'],
    tools: ['python'],
    statisticalMethods: ['Pearson with bootstrap CI'],
    sampleSizeRationale: 'n>=30',
    multiplicityHandling: 'single pre-registered test',
    missingOutlierStrategy: 'listwise',
    stoppingConditions: ['stop if n<30'],
    checkpoints: ['after selection'],
    budget: 'compute-only',
    risks: ['proxy heterogeneity'],
    reproducibility: ['seed everything'],
    nextRoundDecisionRules: ['promote tidal if rejected'],
    humanApprovalRequired: ['publication'],
  },
  revisions: [],
  observations: [],
  stageReceipts: [
    { stageId: 'grounding', provenanceStatus: 'complete' },
    { stageId: 'research_hypotheses', provenanceStatus: 'partial' },
  ],
  modes: {
    modelExecutionMode: 'RECORDED_REPLAY',
    retrievalExecutionMode: 'RECORDED_REPLAY',
    experimentExecutionMode: 'NOT_EXECUTED',
  },
  runMode: 'RECORDED_REPLAY',
  schemaVersion: 2,
};

const RUN_WITH_REVISION: ResearchRunDto = {
  ...RUN_DTO,
  revisions: [
    {
      id: 'rev1',
      number: 1,
      feedback: {
        source: 'human',
        actor: 'workbench-user',
        text: 'Pre-register a control analysis.',
      },
      planChanges: ['plan rewritten per feedback'],
      metricChanges: [],
      unresolvedConflicts: [],
    },
  ],
};

const RUN_WITH_OBSERVATION: ResearchRunDto = {
  ...RUN_DTO,
  observations: [
    {
      id: 'obs1',
      adapter: 'exoplanet-archive-radius-insolation',
      mode: 'RECORDED_REPLAY',
      result: {
        status: 'SUCCESS',
        n: 60,
        pearsonR: 0.671,
        pValue: 0.0001,
        significantAt05: true,
        summary: 'n=60 hot Jupiters: r=0.671 (p=0.0001)',
      },
    },
  ],
};

function v1(body: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data: body }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function wrapper(initialEntries = ['/research']): (props: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function W({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="/research" element={children} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

describe('ResearchWorkbenchPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the creation form with an honest offline_replay default', () => {
    render(<ResearchWorkbenchPage />, { wrapper: wrapper() });
    expect(screen.getByTestId('research-workbench')).toBeInTheDocument();
    expect(screen.getByLabelText(/scientific question/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start research/i })).toBeInTheDocument();
    const radio = screen.getByRole('radio', { name: /offline_replay/ });
    expect((radio as HTMLInputElement).checked).toBe(true);
  });

  it('starts a run and renders hypotheses / plan / run-mode banner from the API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(v1(RUN_DTO));
    const user = userEvent.setup();
    render(<ResearchWorkbenchPage />, { wrapper: wrapper() });

    await user.click(screen.getByRole('button', { name: /start research/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await screen.findByText('Apparent radius inflation is a starspot artifact.');

    // 运行模式横幅：聚合 + 逐组件（不依赖颜色）。
    const badge = screen.getByTestId('run-mode-badge');
    expect(badge.textContent).toContain('RECORDED_REPLAY');
    expect(badge.textContent).toContain('model=RECORDED_REPLAY');
    expect(badge.textContent).toContain('experiment=NOT_EXECUTED');

    // 假设比较表 + PRIMARY + Pareto 标注。
    expect(screen.getByTestId('hypothesis-table')).toBeInTheDocument();
    expect(screen.getByTestId('primary-badge')).toBeInTheDocument();
    expect(screen.getAllByText('Pareto').length).toBeGreaterThan(0);

    // 研究计划：DAG 步骤 + 停止条件。
    expect(screen.getByText(/Select sample/)).toBeInTheDocument();
    expect(screen.getByText(/stop if n<30/)).toBeInTheDocument();
  });

  it('applies feedback → revision timeline updates', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(v1(RUN_DTO)) // POST /research
      .mockResolvedValueOnce(v1(RUN_DTO)) // GET /research/:runId (post-navigate)
      .mockResolvedValueOnce(v1({ revision: RUN_WITH_REVISION.revisions[0] })) // POST feedback
      .mockResolvedValue(v1(RUN_WITH_REVISION)); // refetch GET

    const user = userEvent.setup();
    render(<ResearchWorkbenchPage />, { wrapper: wrapper() });
    await user.click(screen.getByRole('button', { name: /start research/i }));
    await screen.findByText('Apparent radius inflation is a starspot artifact.');

    await user.type(screen.getByLabelText(/expert feedback/i), 'Pre-register a control analysis.');
    await user.click(screen.getByTestId('apply-feedback'));

    await screen.findByText(/Pre-register a control analysis\./);
    expect(screen.getByTestId('revision-list')).toBeInTheDocument();
    expect(screen.getByText(/plan rewritten per feedback/)).toBeInTheDocument();
  });

  it('analyze collects an observation shown honestly with its mode', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(v1(RUN_DTO))
      .mockResolvedValueOnce(v1(RUN_DTO))
      .mockResolvedValueOnce(v1({ observation: RUN_WITH_OBSERVATION.observations[0], revision: { number: 1 } }))
      .mockResolvedValue(v1(RUN_WITH_OBSERVATION));

    const user = userEvent.setup();
    render(<ResearchWorkbenchPage />, { wrapper: wrapper() });
    await user.click(screen.getByRole('button', { name: /start research/i }));
    await screen.findByText('Apparent radius inflation is a starspot artifact.');

    await user.click(screen.getByTestId('analyze-replay'));
    await screen.findByTestId('observation-list');
    expect(screen.getByText(/n=60 hot Jupiters/)).toBeInTheDocument();
    expect(screen.getByText('RECORDED_REPLAY')).toBeInTheDocument();
  });

  it('evaluate toggle renders program metrics + deterministic recompute', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(v1(RUN_DTO))
      .mockResolvedValueOnce(v1(RUN_DTO))
      .mockResolvedValueOnce(
        v1({
          deterministicRecompute: 'PASS',
          metrics: [{ name: 'citationBindingRate', value: 1 }],
          humanRubricMetrics: ['scientificPlausibilityOfText'],
        }),
      )
      .mockResolvedValue(v1(RUN_DTO));

    const user = userEvent.setup();
    render(<ResearchWorkbenchPage />, { wrapper: wrapper() });
    await user.click(screen.getByRole('button', { name: /start research/i }));
    await screen.findByText('Apparent radius inflation is a starspot artifact.');

    await user.click(screen.getByTestId('toggle-evaluate'));
    await screen.findByTestId('evaluate-results');
    expect(screen.getByText(/Deterministic recompute/)).toBeInTheDocument();
    expect(screen.getByText(/PASS/)).toBeInTheDocument();
    expect(screen.getByText('citationBindingRate')).toBeInTheDocument();
  });

  it('shows a structured error when the API fails (no silent fallback)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error_code: 'research_pipeline_failed',
          message: 'pipeline failed (boom)',
          source_anchor: null,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const user = userEvent.setup();
    render(<ResearchWorkbenchPage />, { wrapper: wrapper() });
    await user.click(screen.getByRole('button', { name: /start research/i }));
    await screen.findByTestId('start-error');
    expect(screen.getByText(/pipeline failed \(boom\)/)).toBeInTheDocument();
  });
});
