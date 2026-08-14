/**
 * ResearchWorkbenchPage.test.tsx —— Track-1A 科研工作台异步流程测试（202 契约）。
 *
 * 全 API 驱动（mock fetch 按 URL 路由·无网络）：
 *   202 start → 状态轮询（CREATED→…→COMPLETED 序列）→ 实时进度面板
 *   （状态徽章·阶段清单·最新 SSE 事件行·SSE 缺席时的诚实降级）→ 取消 → CANCELLED
 *   → run_failed 错误面板 → run_completed 冻结 run 完整视图（假设比较·计划·
 *   反馈修订·分析·评估全保留）→ 409 research_run_not_completed 采纳为进行中运行。
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import ResearchWorkbenchPage from '@/pages/ResearchWorkbenchPage';
import type {
  ResearchRunDto,
  ResearchRunState,
  ResearchStatusDto,
  StartResearchAcceptedDto,
} from '@/lib/research_client';

// ---------- Fixture: 后端真实 DTO 形态（字段名 verbatim）----------

const RUN_ID = 'run-async-1';

const RUN_DTO: ResearchRunDto = {
  runId: RUN_ID,
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

// ---------- Async lifecycle fixtures (202 契约) ----------

const STAGES = [
  'validate_question',
  'retrieve_literature',
  'generate_hypotheses',
  'review_hypotheses',
  'plan_next_round',
] as const;

const ACCEPTED: StartResearchAcceptedDto = {
  runId: RUN_ID,
  state: 'CREATED',
  statusUrl: `/api/v1/research/${RUN_ID}/status`,
  eventsUrl: `/api/v1/research/${RUN_ID}/events`,
};

function statusDto(partial: Partial<ResearchStatusDto> & { state: ResearchRunState }): ResearchStatusDto {
  return {
    runId: RUN_ID,
    question: 'Does stellar activity inflate hot Jupiter radii?',
    profile: 'offline_replay',
    completedStages: [],
    remainingStages: [...STAGES],
    startedAt: new Date(Date.now() - 5_000).toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    error: null,
    errorKind: null,
    runReady: false,
    ...partial,
  };
}

const STATUS_RETRIEVING = statusDto({
  state: 'RETRIEVING',
  completedStages: ['validate_question'],
  remainingStages: ['retrieve_literature', 'generate_hypotheses', 'review_hypotheses', 'plan_next_round'],
});

const STATUS_COMPLETED = statusDto({
  state: 'COMPLETED',
  completedStages: [...STAGES],
  remainingStages: [],
  completedAt: new Date().toISOString(),
  runReady: true,
});

const STATUS_FAILED = statusDto({
  state: 'FAILED',
  completedStages: ['validate_question', 'retrieve_literature'],
  remainingStages: ['generate_hypotheses', 'review_hypotheses', 'plan_next_round'],
  error: 'retrieval quota exceeded (429)',
  errorKind: 'pipeline',
});

const STATUS_CANCELLED = statusDto({
  state: 'CANCELLED',
  completedStages: ['validate_question'],
  remainingStages: ['retrieve_literature', 'generate_hypotheses', 'review_hypotheses', 'plan_next_round'],
});

// ---------- fetch helpers ----------

const HEADERS = { 'Content-Type': 'application/json' };

function v1(body: unknown, status = 200): Response {
  return new Response(JSON.stringify({ ok: true, data: body }), { status, headers: HEADERS });
}

function apiError(status: number, errorCode: string, message: string, detail?: unknown): Response {
  const body: Record<string, unknown> = { error_code: errorCode, message, source_anchor: null };
  if (detail !== undefined) {
    body['detail'] = detail;
  }
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

interface ResearchApiOpts {
  /** 按次消费的状态序列（末位重复）；缺省 [COMPLETED]。 */
  readonly statuses?: readonly ResearchStatusDto[];
  /** null → GET /research/:runId 返回 409 research_run_not_completed。 */
  readonly frozenRun?: ResearchRunDto | null;
  /** POST /research 返回 500（startError 场景）。 */
  readonly startError?: boolean;
  /** POST /research 返回结构化错误（如 503 research_live_profile_unavailable + detail.guidance）。 */
  readonly startApiError?: {
    readonly status: number;
    readonly errorCode: string;
    readonly message: string;
    readonly detail?: unknown;
  };
  /** GET /api/v1/llm-status 响应（缺省：无 key → 默认合成模式）。 */
  readonly llmStatus?: { readonly profile: string; readonly keyConfigured: boolean };
  /** POST feedback 后冻结 run 的下一个形态。 */
  readonly onFeedback?: (run: ResearchRunDto) => ResearchRunDto;
  /** POST analyze 后冻结 run 的下一个形态。 */
  readonly onAnalyze?: (run: ResearchRunDto) => ResearchRunDto;
}

interface ResearchApiHandle {
  readonly fetchMock: MockInstance<typeof fetch>;
  readonly scenario: {
    cancelled: boolean;
    run: ResearchRunDto | null;
    statusIndex: number;
    cancelCalls: number;
  };
}

/** 按 URL 路由的 /api/v1/research mock（真实信封 {ok:true,data} + RFC 7807 错误形态）。 */
function installResearchApi(opts: ResearchApiOpts = {}): ResearchApiHandle {
  const statuses = opts.statuses ?? [STATUS_COMPLETED];
  const handle: ResearchApiHandle = {
    fetchMock: vi.spyOn(globalThis, 'fetch'),
    scenario: {
      cancelled: false,
      run: opts.frozenRun === undefined ? RUN_DTO : opts.frozenRun,
      statusIndex: 0,
      cancelCalls: 0,
    },
  };
  handle.fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? 'GET';
    // 默认相对基址（same-origin）——URL 即路径（dev 由 vite proxy 转发到 :3000）。
    const base = '/api/v1/research';

    if (url === '/api/v1/llm-status') {
      return v1(opts.llmStatus ?? { profile: 'competition_aliyun_qwen', keyConfigured: false });
    }
    if (method === 'POST' && url === base) {
      if (opts.startApiError !== undefined) {
        return apiError(
          opts.startApiError.status,
          opts.startApiError.errorCode,
          opts.startApiError.message,
          opts.startApiError.detail,
        );
      }
      if (opts.startError === true) {
        return apiError(500, 'research_pipeline_failed', 'pipeline failed (boom)');
      }
      return v1(ACCEPTED, 202);
    }
    if (url.includes('/status')) {
      if (handle.scenario.cancelled) {
        return v1(STATUS_CANCELLED);
      }
      const status = statuses[Math.min(handle.scenario.statusIndex, statuses.length - 1)];
      handle.scenario.statusIndex += 1;
      return v1(status);
    }
    if (method === 'POST' && url.includes('/cancel')) {
      handle.scenario.cancelled = true;
      handle.scenario.cancelCalls += 1;
      return v1({ runId: RUN_ID, cancelled: true, state: 'CANCELLED' });
    }
    if (method === 'POST' && url.includes('/feedback')) {
      if (opts.onFeedback !== undefined && handle.scenario.run !== null) {
        handle.scenario.run = opts.onFeedback(handle.scenario.run);
      }
      return v1({ revision: RUN_WITH_REVISION.revisions[0] });
    }
    if (method === 'POST' && url.includes('/analyze')) {
      if (opts.onAnalyze !== undefined && handle.scenario.run !== null) {
        handle.scenario.run = opts.onAnalyze(handle.scenario.run);
      }
      return v1({
        observation: RUN_WITH_OBSERVATION.observations[0],
        revision: { number: 1 },
      });
    }
    if (url.includes('/evaluate')) {
      return v1({
        deterministicRecompute: 'PASS',
        metrics: [{ name: 'citationBindingRate', value: 1 }],
        humanRubricMetrics: ['scientificPlausibilityOfText'],
      });
    }
    if (method === 'GET' && url.startsWith(`${base}/`)) {
      if (handle.scenario.run === null) {
        return apiError(409, 'research_run_not_completed', 'run is still executing');
      }
      return v1(handle.scenario.run);
    }
    return apiError(404, 'NOT_FOUND', `unexpected fetch ${method} ${url}`);
  });
  return handle;
}

// ---------- 可控的 EventSource 假实现（SSE 帧分派） ----------

class FakeEventSource {
  static last: FakeEventSource | null = null;
  readonly listeners = new Map<string, Array<(evt: { data: string }) => void>>();
  closed = false;
  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, listener: (evt: { data: string }) => void): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(listener);
    this.listeners.set(type, arr);
  }
  removeEventListener(type: string, listener: (evt: { data: string }) => void): void {
    const arr = this.listeners.get(type) ?? [];
    this.listeners.set(type, arr.filter((l) => l !== listener));
  }
  close(): void {
    this.closed = true;
  }
  dispatch(type: string, data: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data });
    }
  }
}

// ---------- render helpers ----------

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

/** 问题输入默认为空（不预填示例）——测试先键入问题再点击开始。 */
async function startRun(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(
    screen.getByLabelText(/scientific question/i),
    'Does stellar activity inflate hot Jupiter radii?',
  );
  await user.click(screen.getByRole('button', { name: /start research/i }));
}

describe('ResearchWorkbenchPage（异步 202 契约）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    // 撤销本文件内 vi.stubGlobal('EventSource')；同时复位 test-setup 的 fetch 桩，
    // 让后续用例可继续 vi.spyOn(globalThis, 'fetch')。
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn());
    FakeEventSource.last = null;
  });

  it('renders the creation form: empty question, synthetic default when no API key, caption + status line visible', async () => {
    installResearchApi({ llmStatus: { profile: 'competition_aliyun_qwen', keyConfigured: false } });
    render(<ResearchWorkbenchPage />, { wrapper: wrapper() });
    expect(screen.getByTestId('research-workbench')).toBeInTheDocument();
    expect(screen.getByLabelText(/scientific question/i)).toBeInTheDocument();
    // 问题输入默认为空（placeholder 保留示例——不预填、不伪装已就绪）。
    const question = screen.getByLabelText(/scientific question/i) as HTMLInputElement;
    expect(question.value).toBe('');
    expect(question).toHaveAttribute(
      'placeholder',
      expect.stringContaining('hot Jupiter'),
    );
    // 无 key → 默认合成模式，caption 常显（诚实标注假设不对应问题）。
    const synthetic = screen.getByRole('radio', { name: /synthetic demo/i }) as HTMLInputElement;
    await waitFor(() => expect(synthetic.checked).toBe(true));
    expect(screen.getByTestId('profile-option-synthetic')).toHaveTextContent(
      /will NOT match your question/i,
    );
    // live 选项如实标注需要 key（随 llm-status 到达渲染）。
    await waitFor(() =>
      expect(screen.getByTestId('profile-option-live')).toHaveTextContent(/needs API key/i),
    );
    // 状态行（llm-status 驱动）。
    await waitFor(() =>
      expect(screen.getByTestId('backend-status')).toHaveTextContent(
        /no API key — synthetic mode only/i,
      ),
    );
    // 空问题 → 开始按钮禁用。
    expect(screen.getByRole('button', { name: /start research/i })).toBeDisabled();
  });

  it('keyConfigured=true → live is the default (radio auto-checked) and submit sends profile:"auto"', async () => {
    const api = installResearchApi({
      llmStatus: { profile: 'competition_aliyun_qwen', keyConfigured: true },
    });
    const user = userEvent.setup();
    render(<ResearchWorkbenchPage />, { wrapper: wrapper() });

    // llm-status 到达后默认翻到 live（用户未显式选择时跟随 key 可用性）。
    const live = screen.getByRole('radio', { name: /live model/i }) as HTMLInputElement;
    await waitFor(() => expect(live.checked).toBe(true));
    expect(screen.getByTestId('profile-option-live')).toHaveTextContent(/ready/i);
    await waitFor(() =>
      expect(screen.getByTestId('backend-status')).toHaveTextContent(/live model ready \(qwen\)/i),
    );

    await startRun(user);

    // 提交体只含 profile:'auto'（绝不发送原始 provider 名——后端 model-neutral 解析）。
    const startCall = api.fetchMock.mock.calls.find(([input, init]) =>
      input.toString() === '/api/v1/research' && init?.method === 'POST',
    );
    expect(startCall).toBeDefined();
    const sentBody = JSON.parse(String(startCall?.[1]?.body)) as { question: string; profile: string };
    expect(sentBody.profile).toBe('auto');
    expect(sentBody.question).toBe('Does stellar activity inflate hot Jupiter radii?');
  });

  it('no-key default is synthetic → submit sends profile:"offline_replay"', async () => {
    const api = installResearchApi({
      llmStatus: { profile: 'competition_aliyun_qwen', keyConfigured: false },
    });
    const user = userEvent.setup();
    render(<ResearchWorkbenchPage />, { wrapper: wrapper() });
    await waitFor(() =>
      expect((screen.getByRole('radio', { name: /synthetic demo/i }) as HTMLInputElement).checked)
        .toBe(true),
    );

    await startRun(user);

    const startCall = api.fetchMock.mock.calls.find(([input, init]) =>
      input.toString() === '/api/v1/research' && init?.method === 'POST',
    );
    const sentBody = JSON.parse(String(startCall?.[1]?.body)) as { profile: string };
    expect(sentBody.profile).toBe('offline_replay');
  });

  it('live submit without a key → 503 error panel surfaces message AND backend detail.guidance', async () => {
    installResearchApi({
      llmStatus: { profile: 'competition_aliyun_qwen', keyConfigured: false },
      startApiError: {
        status: 503,
        errorCode: 'research_live_profile_unavailable',
        message: 'live profile needs an API key in the environment (see far doctor)',
        detail: {
          profile: 'auto',
          guidance:
            'set DASHSCOPE_API_KEY (https://bailian.console.aliyun.com/) for live runs; pass profile=offline_replay explicitly for synthetic-fixture wiring demos',
        },
      },
    });
    const user = userEvent.setup();
    render(<ResearchWorkbenchPage />, { wrapper: wrapper() });

    // 无 key 仍可显式选择 live（fail-closed 由后端裁决，前端不拦截）。
    await user.click(screen.getByRole('radio', { name: /live model/i }));
    await startRun(user);

    // 原始 message 与 detail.guidance 都如实展示（不吞不改）。
    await screen.findByTestId('start-error');
    expect(screen.getByTestId('start-error')).toHaveTextContent(/needs an API key/i);
    const guidance = await screen.findByTestId('start-error-guidance');
    expect(guidance).toHaveTextContent('set DASHSCOPE_API_KEY');
    expect(guidance).toHaveTextContent(/offline_replay/);
  });

  it('202 start → live progress panel (state badge · stage checklist · elapsed · cancel button)', async () => {
    installResearchApi({ statuses: [STATUS_RETRIEVING] });
    const user = userEvent.setup();
    render(<ResearchWorkbenchPage />, { wrapper: wrapper() });

    await startRun(user);
    const panel = await screen.findByTestId('run-progress');
    expect(panel).toBeInTheDocument();

    // 状态徽章为文字 label（非仅颜色）。
    expect(screen.getByTestId('run-state-badge')).toHaveTextContent('RETRIEVING');

    // 阶段清单：completedStages ✓ / remainingStages ○。
    const checklist = screen.getByTestId('stage-checklist');
    expect(checklist).toHaveTextContent('validate_question');
    expect(checklist).toHaveTextContent('retrieve_literature');
    expect(screen.getByTestId('stage-item-validate_question')).toHaveTextContent('✓');
    expect(screen.getByTestId('stage-item-retrieve_literature')).toHaveTextContent('○');

    // 已用时（由 startedAt 计算）。
    expect(screen.getByTestId('progress-elapsed')).toBeInTheDocument();

    // 运行中可取消。
    expect(screen.getByTestId('cancel-run')).toBeInTheDocument();

    // jsdom 无原生 EventSource → 如实降级标注（不假装实时）。
    expect(screen.getByTestId('live-degraded')).toHaveTextContent(/live events unavailable/i);

    // 冻结 run 视图尚未出现（run 仍在进行）。
    expect(screen.queryByTestId('hypothesis-table')).not.toBeInTheDocument();
  });

  it('SSE live events update the latest-event line (state + research frames)', async () => {
    installResearchApi({ statuses: [STATUS_RETRIEVING] });
    vi.stubGlobal('EventSource', FakeEventSource);
    const user = userEvent.setup();
    render(<ResearchWorkbenchPage />, { wrapper: wrapper() });

    await startRun(user);
    await screen.findByTestId('run-progress');

    const es = FakeEventSource.last;
    expect(es).not.toBeNull();
    expect(es?.url).toContain(`/api/v1/research/${RUN_ID}/events`);

    // SSE 帧到达后最新事件行更新（stage_started · seq）。
    es?.dispatch(
      'research',
      JSON.stringify({
        type: 'stage_started',
        runId: RUN_ID,
        at: new Date().toISOString(),
        seq: 3,
        stageId: 'retrieve_literature',
      }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('latest-event')).toHaveTextContent('stage_started');
    });
    expect(screen.getByTestId('latest-event')).toHaveTextContent('retrieve_literature');
    expect(screen.getByTestId('latest-event')).toHaveTextContent('#3');

    // 无降级标注（EventSource 存在且未失败两次）。
    expect(screen.queryByTestId('live-degraded')).not.toBeInTheDocument();
  });

  it('cancel during a running run → POST cancel → CANCELLED state + CLI-only resume note', async () => {
    const api = installResearchApi({ statuses: [STATUS_RETRIEVING] });
    const user = userEvent.setup();
    render(<ResearchWorkbenchPage />, { wrapper: wrapper() });

    await startRun(user);
    await screen.findByTestId('run-state-badge');

    await user.click(screen.getByTestId('cancel-run'));

    // 取消经真实 POST /research/:runId/cancel（绝不本地假装取消成功）。
    await waitFor(() => expect(api.scenario.cancelCalls).toBe(1));
    const cancelCall = api.fetchMock.mock.calls.find(([input, init]) =>
      input.toString().includes('/cancel') && init?.method === 'POST',
    );
    expect(cancelCall).toBeDefined();

    // 终态由轮询通道确认：CANCELLED 徽章 + 诚实标注 resume 仅 CLI。
    await waitFor(() => expect(screen.getByTestId('run-state-badge')).toHaveTextContent('CANCELLED'));
    expect(screen.getByTestId('run-cancelled-panel')).toHaveTextContent(/far research resume/);
  });

  it('run_failed → error panel with error + errorKind + CLI-only retry hint', async () => {
    installResearchApi({ statuses: [STATUS_FAILED] });
    const user = userEvent.setup();
    render(<ResearchWorkbenchPage />, { wrapper: wrapper() });

    await startRun(user);
    const panel = await screen.findByTestId('run-failed-panel');
    expect(panel).toHaveTextContent('retrieval quota exceeded (429)');
    expect(panel).toHaveTextContent('pipeline');
    expect(panel).toHaveTextContent(/far research resume/);
    expect(screen.getByTestId('run-state-badge')).toHaveTextContent('FAILED');
    // 失败后不再显示取消按钮。
    expect(screen.queryByTestId('cancel-run')).not.toBeInTheDocument();
    // 非 EPERM 错误不出现文件锁提示（提示按错误特征触发·不泛化）。
    expect(screen.queryByTestId('eperm-hint')).not.toBeInTheDocument();
  });

  it('run_failed with EPERM+rename → raw error kept + file-lock resume hint appended', async () => {
    const epermError =
      "EPERM: operation not permitted, rename 'C:\\.far\\research-runs\\run-async-1\\checkpoint.tmp.json' -> 'C:\\.far\\research-runs\\run-async-1\\checkpoint.json'";
    installResearchApi({
      statuses: [statusDto({ state: 'FAILED', error: epermError, errorKind: 'pipeline' })],
    });
    const user = userEvent.setup();
    render(<ResearchWorkbenchPage />, { wrapper: wrapper() });

    await startRun(user);
    const panel = await screen.findByTestId('run-failed-panel');
    // 原始错误完整保留在提示之上（诚实原则：提示是补充而非替代）。
    expect(panel).toHaveTextContent('EPERM: operation not permitted, rename');
    const hint = await screen.findByTestId('eperm-hint');
    expect(hint).toHaveTextContent(/file lock \(antivirus\/indexer\)/i);
    expect(hint).toHaveTextContent(`far research resume ${RUN_ID}`);
  });

  it('run_completed → frozen run view renders (mode banner · hypotheses · plan)', async () => {
    installResearchApi({ statuses: [STATUS_COMPLETED], frozenRun: RUN_DTO });
    const user = userEvent.setup();
    render(<ResearchWorkbenchPage />, { wrapper: wrapper() });

    await startRun(user);
    await screen.findByText('Apparent radius inflation is a starspot artifact.');

    // 进度面板退场，冻结 run 完整视图接管。
    await waitFor(() => expect(screen.queryByTestId('run-progress')).not.toBeInTheDocument());

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

  it('adopts a still-running shared run (409 research_run_not_completed) instead of erroring', async () => {
    // 分享链接指向仍在跑的运行：GET 冻结 run → 409 → 采纳为进行中运行；轮询到 COMPLETED 后 409 解除 → 冻结 run。
    const scenario = { completed: false };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? 'GET';
      if (url.includes('/status')) {
        const s = scenario.completed
          ? { ...STATUS_COMPLETED, runId: 'run-live-9' }
          : { ...STATUS_RETRIEVING, runId: 'run-live-9' };
        scenario.completed = true;
        return v1(s);
      }
      if (url.includes('/api/v1/research/run-live-9')) {
        return scenario.completed
          ? v1({ ...RUN_DTO, runId: 'run-live-9' })
          : apiError(409, 'research_run_not_completed', 'run is still executing');
      }
      return apiError(404, 'NOT_FOUND', `unexpected fetch ${method} ${url}`);
    });

    render(<ResearchWorkbenchPage />, { wrapper: wrapper(['/research?runId=run-live-9']) });

    // 409 不渲染为错误卡片，而是进度面板（轮询直至终态）。
    await screen.findByTestId('run-progress');
    expect(screen.queryByTestId('run-error')).not.toBeInTheDocument();

    // 第二次轮询（1.5s 间隔）到达 COMPLETED → 409 解除 → 冻结 run 完整视图。
    await screen.findByText('Apparent radius inflation is a starspot artifact.', {}, { timeout: 5000 });
    await waitFor(() => expect(screen.queryByTestId('run-progress')).not.toBeInTheDocument());
  });

  it('applies feedback → revision timeline updates (on the frozen run)', async () => {
    installResearchApi({
      statuses: [STATUS_COMPLETED],
      frozenRun: RUN_DTO,
      onFeedback: () => RUN_WITH_REVISION,
    });
    const user = userEvent.setup();
    render(<ResearchWorkbenchPage />, { wrapper: wrapper() });
    await startRun(user);
    await screen.findByText('Apparent radius inflation is a starspot artifact.');

    await user.type(screen.getByLabelText(/expert feedback/i), 'Pre-register a control analysis.');
    await user.click(screen.getByTestId('apply-feedback'));

    await screen.findByText(/Pre-register a control analysis\./);
    expect(screen.getByTestId('revision-list')).toBeInTheDocument();
    expect(screen.getByText(/plan rewritten per feedback/)).toBeInTheDocument();
  });

  it('analyze collects an observation shown honestly with its mode', async () => {
    installResearchApi({
      statuses: [STATUS_COMPLETED],
      frozenRun: RUN_DTO,
      onAnalyze: () => RUN_WITH_OBSERVATION,
    });
    const user = userEvent.setup();
    render(<ResearchWorkbenchPage />, { wrapper: wrapper() });
    await startRun(user);
    await screen.findByText('Apparent radius inflation is a starspot artifact.');

    await user.click(screen.getByTestId('analyze-replay'));
    await screen.findByTestId('observation-list');
    expect(screen.getByText(/n=60 hot Jupiters/)).toBeInTheDocument();
    expect(screen.getByText('RECORDED_REPLAY')).toBeInTheDocument();
  });

  it('evaluate toggle renders program metrics + deterministic recompute', async () => {
    installResearchApi({ statuses: [STATUS_COMPLETED], frozenRun: RUN_DTO });
    const user = userEvent.setup();
    render(<ResearchWorkbenchPage />, { wrapper: wrapper() });
    await startRun(user);
    await screen.findByText('Apparent radius inflation is a starspot artifact.');

    await user.click(screen.getByTestId('toggle-evaluate'));
    await screen.findByTestId('evaluate-results');
    expect(screen.getByText(/Deterministic recompute/)).toBeInTheDocument();
    expect(screen.getByText(/PASS/)).toBeInTheDocument();
    expect(screen.getByText('citationBindingRate')).toBeInTheDocument();
  });

  it('shows a structured error when the start API fails (no silent fallback)', async () => {
    installResearchApi({ startError: true });
    const user = userEvent.setup();
    render(<ResearchWorkbenchPage />, { wrapper: wrapper() });
    await startRun(user);
    await screen.findByTestId('start-error');
    expect(screen.getByText(/pipeline failed \(boom\)/)).toBeInTheDocument();
  });
});
