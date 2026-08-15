/**
 * ResearchWorkbenchPage —— 科研工作台主流程（§12.5 七项主流程）。
 *
 * 异步运行生命周期（202 契约）：
 *   1. 新建研究（question + profile → POST /api/v1/research → 202 {runId, statusUrl, eventsUrl}）
 *   2. 实时进度面板（状态徽章（文字·非仅颜色）· 阶段清单（completedStages ✓ / remainingStages ○）·
 *      最新 SSE 事件行 · 已用时 · 取消按钮）
 *      - SSE 订阅（subscribeResearchEvents）提供实时事件；
 *      - 状态轮询（useResearchStatus·1.5s）是唯一事实来源——SSE 两次出错即放弃实时事件，
 *        如实显示 "live events unavailable — polling"（诚实降级·绝不假装实时）；
 *   3. run_completed → GET /research/:runId 冻结运行 → 完整视图（下方 §12.5 主流程 2-7 全保留）
 *   4. run_failed → 错误面板（error + errorKind + CLI-only resume 提示）
 *   5. 用户取消 → CANCELLED 状态 + 如实标注 resume 仅限 CLI
 *
 * 主流程（全部 API 驱动·无硬编码科研结果）：
 *   1. 新建研究（见上）
 *   2. 运行摘要（gate 裁决 · 聚合+逐组件运行模式横幅 · 收据数 · 语料规模）
 *   3. 候选假设比较（确定性+模型维度评分 · Pareto 标注 · 引用绑定状态）
 *   4. 研究计划（objectives · analysisDag · 统计方法 · 停止条件 · 人工批准门）
 *   5. 真实数据分析（POST analyze · Observation 结果如实展示）
 *   6. Revision 时间线（反馈 → 不可变修订）
 *   7. 导出与验证（提示 far research export/verify；evaluate 展示程序化指标）
 *
 * 诚实边界：
 *   - 执行模式选择器跟随 llm-status（keyConfigured → 默认 Live('auto')，否则默认
 *     合成 fixtures 且 caption 常显）；提交只发 'auto' | 'offline_replay'
 *   - offline_replay 模式显式 RECORDED_REPLAY 横幅（不伪装 live）
 *   - live('auto') 无 key → 后端 503 fail-closed → 错误面板（message + detail.guidance
 *     如实透传，绝不静默回放）
 *   - GET 冻结 run 返回 409 research_run_not_completed（刷新时仍在跑）→ 采纳为进行中运行并显示进度
 *   - 空状态 / 加载 / 错误均有处理；状态不依赖颜色（文字+徽章）
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  isTerminalLifecycleEvent,
  isTerminalRunState,
  researchKeys,
  subscribeResearchEvents,
  useAnalyzeResearch,
  useApplyResearchFeedback,
  useCancelResearch,
  useEvaluateResearch,
  useResearchRun,
  useResearchStatus,
  useStartResearch,
  type ResearchLifecycleEventDto,
  type ResearchObservationDto,
  type ResearchRunDto,
  type ResearchStatusDto,
} from '@/lib/research_client';
import { ApiError, useLlmStatus } from '@/lib/api_client';
import { useT } from '@/lib/i18n';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/PageHeader';
import { FlaskConical, Loader2, PlayCircle, RotateCcw, Scale, XCircle } from 'lucide-react';

/** Type guard: the domain-general landscape observation result. */
function isLandscapeResult(
  r: ResearchObservationDto['result'],
): r is Extract<ResearchObservationDto['result'], { readonly kind: 'literature-landscape' }> {
  return 'kind' in r && r.kind === 'literature-landscape';
}

/** 运行模式徽章（状态不依赖颜色——文字 label 显式）。 */
function RunModeBadge({ run }: { readonly run: ResearchRunDto }) {
  const label = `${run.runMode} · model=${run.modes.modelExecutionMode} · retrieval=${run.modes.retrievalExecutionMode} · experiment=${run.modes.experimentExecutionMode}`;
  return (
    <Badge variant={run.runMode === 'LIVE' ? 'default' : 'secondary'} data-testid="run-mode-badge">
      {label}
    </Badge>
  );
}

/** 候选假设比较表（§12.5 主流程 4）。 */
function HypothesisTable({ run }: { readonly run: ResearchRunDto }) {
  return (
    <div className="overflow-x-auto" data-testid="hypothesis-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 pr-3 font-medium">Hypothesis</th>
            <th className="py-2 pr-3 font-medium">Deterministic grades</th>
            <th className="py-2 pr-3 font-medium">Model grades</th>
            <th className="py-2 pr-3 font-medium">Citations</th>
            <th className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {run.hypotheses.map((h) => {
            const card = run.scorecards[h.id];
            const binding = run.bindings[h.id];
            const isPrimary = run.plan.primaryHypothesisId === h.id;
            const det = (card?.dimensions ?? []).filter((d) => d.source === 'deterministic');
            const model = (card?.dimensions ?? []).filter((d) => d.source === 'model');
            return (
              <tr key={h.id} className="border-b align-top">
                <td className="max-w-[360px] py-2 pr-3">
                  <div className="font-medium">{h.statement}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{h.mechanism}</div>
                </td>
                <td className="py-2 pr-3 text-xs">
                  {det.map((d) => (
                    <div key={d.name}>
                      {d.name}: <span className="font-medium">{d.grade}</span>
                    </div>
                  ))}
                </td>
                <td className="py-2 pr-3 text-xs">
                  {model.map((d) => (
                    <div key={d.name}>
                      {d.name}: <span className="font-medium">{d.grade}</span>
                    </div>
                  ))}
                </td>
                <td className="py-2 pr-3 text-xs">
                  <div>supporting: {h.supportingCitations.length}</div>
                  <div>counter: {h.counterEvidenceCitations.length}</div>
                  {binding !== undefined && !binding.allBound && (
                    <div className="text-destructive">unbound: {binding.unbound.length}</div>
                  )}
                </td>
                <td className="py-2 text-xs">
                  {isPrimary && <Badge data-testid="primary-badge">PRIMARY</Badge>}
                  {card?.paretoOptimal === true && (
                    <Badge variant="outline" className="ml-1">
                      Pareto
                    </Badge>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 研究计划渲染（§12.5 主流程 5）。 */
function PlanSection({ run }: { readonly run: ResearchRunDto }) {
  const p = run.plan;
  return (
    <div className="space-y-3 text-sm" data-testid="plan-section">
      <div>
        <span className="font-medium">Objectives: </span>
        {p.objectives.join('; ')}
      </div>
      <div>
        <span className="font-medium">Design: </span>
        {p.design}
      </div>
      <div>
        <span className="font-medium">Analysis DAG: </span>
        {p.analysisDag.length > 0 ? (
          <ol className="ml-5 list-decimal">
            {p.analysisDag.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        ) : (
          '(none)'
        )}
      </div>
      <div>
        <span className="font-medium">Statistical methods: </span>
        {p.statisticalMethods.join('; ') || '(none)'}
      </div>
      <div>
        <span className="font-medium">Stopping conditions: </span>
        {p.stoppingConditions.join('; ') || '(none)'}
      </div>
      <div>
        <span className="font-medium">Human approval required: </span>
        {p.humanApprovalRequired.join('; ') || '(none)'}
      </div>
    </div>
  );
}

/** 进行中运行的实时进度面板（202 异步契约 · 状态徽章为文字·非仅颜色）。 */
function RunProgressPanel({
  runId,
  status,
  statusLoading,
  statusError,
  latestEvent,
  liveDegraded,
  elapsedSeconds,
  cancelPending,
  cancelError,
  onCancel,
}: {
  readonly runId: string;
  readonly status: ResearchStatusDto | null;
  readonly statusLoading: boolean;
  readonly statusError: string | null;
  readonly latestEvent: ResearchLifecycleEventDto | null;
  readonly liveDegraded: boolean;
  readonly elapsedSeconds: number | null;
  readonly cancelPending: boolean;
  readonly cancelError: string | null;
  readonly onCancel: () => void;
}) {
  const t = useT();
  const runState = status?.state ?? null;
  const isRunning = runState !== null && !isTerminalRunState(runState);
  const startedAtMs = status !== null ? Date.parse(status.startedAt) : Number.NaN;
  const elapsed =
    elapsedSeconds !== null && Number.isFinite(startedAtMs)
      ? t('research.progress.elapsed', { n: elapsedSeconds })
      : null;

  return (
    <Card data-testid="run-progress">
      <CardHeader>
        <CardTitle>{t('research.progress.title')}</CardTitle>
        <CardDescription className="font-mono">{runId}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* 当前状态徽章（文字 label）+ 已用时 + 取消按钮 */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-muted-foreground">{t('research.progress.stateLabel')}</span>
          {runState !== null ? (
            <Badge
              variant={
                runState === 'FAILED' ? 'destructive' : runState === 'COMPLETED' ? 'success' : 'secondary'
              }
              data-testid="run-state-badge"
            >
              {runState}
            </Badge>
          ) : (
            <span className="text-muted-foreground" data-testid="run-state-badge">
              …
            </span>
          )}
          {isRunning && elapsed !== null && (
            <span className="text-muted-foreground" data-testid="progress-elapsed">
              {elapsed}
            </span>
          )}
          {isRunning && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={onCancel}
              disabled={cancelPending}
              data-testid="cancel-run"
            >
              {cancelPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              {t('research.cancel.button')}
            </Button>
          )}
        </div>

        {/* 阶段清单：completedStages ✓ / remainingStages ○（勾选框符号 + sr-only 文字·非仅颜色） */}
        {status !== null && (
          <ul className="grid gap-1 sm:grid-cols-2" data-testid="stage-checklist">
            {status.completedStages.map((stage) => (
              <li key={`done-${stage}`} data-testid={`stage-item-${stage}`}>
                <span aria-hidden="true">✓</span> {stage}{' '}
                <span className="sr-only">({t('research.progress.stageDone')})</span>
              </li>
            ))}
            {status.remainingStages.map((stage) => (
              <li key={`todo-${stage}`} className="text-muted-foreground" data-testid={`stage-item-${stage}`}>
                <span aria-hidden="true">○</span> {stage}{' '}
                <span className="sr-only">({t('research.progress.stagePending')})</span>
              </li>
            ))}
          </ul>
        )}

        {/* 最新 SSE 事件行 */}
        <div data-testid="latest-event">
          <span className="text-muted-foreground">{t('research.progress.latestEvent')}: </span>
          {latestEvent !== null
            ? `${latestEvent.type}${latestEvent.stageId !== undefined ? ` · ${latestEvent.stageId}` : ''} · #${latestEvent.seq}`
            : t('research.progress.noEvents')}
        </div>

        {/* 诚实降级：SSE 两次失败 → 仅轮询 */}
        {liveDegraded && (
          <p className="text-xs text-muted-foreground" data-testid="live-degraded">
            {t('research.progress.degraded')}
          </p>
        )}

        {/* 轮询通道自身的错误（如实展示·不静默） */}
        {statusError !== null && (
          <p className="text-sm text-destructive" data-testid="status-error">
            {statusError}
          </p>
        )}
        {status === null && statusLoading && (
          <p className="text-muted-foreground" data-testid="status-connecting">
            {t('research.progress.connecting')}
          </p>
        )}

        {/* run_failed → 错误面板（error + errorKind + CLI-only resume 提示） */}
        {runState === 'FAILED' && (
          <div
            className="space-y-1 rounded border border-destructive/40 bg-destructive/5 p-3"
            data-testid="run-failed-panel"
          >
            <p className="font-medium text-destructive">{t('research.failed.title')}</p>
            {status?.error !== null && status?.error !== undefined && <p>{status.error}</p>}
            <p className="text-xs text-muted-foreground">
              {t('research.failed.errorKind')}: {status?.errorKind ?? '—'}
            </p>
            <p className="text-xs text-muted-foreground">{t('research.failed.retryHint')}</p>
            {/* EPERM+rename（文件锁阻塞检查点写入）→ 瞬态失败提示：恢复通常可越过。
                原始错误保留在上方——提示是补充而非替代（诚实原则）。 */}
            {isEpermRenameError(status?.error) && (
              <p className="text-xs text-muted-foreground" data-testid="eperm-hint">
                {t('research.failed.epermHint', { runId })}
              </p>
            )}
          </div>
        )}

        {/* 用户取消 → CANCELLED + resume 仅 CLI 的诚实标注 */}
        {runState === 'CANCELLED' && (
          <div className="rounded border p-3" data-testid="run-cancelled-panel">
            <p className="font-medium">{t('research.cancel.noteTitle')}</p>
            <p className="text-xs text-muted-foreground">{t('research.cancel.note')}</p>
          </div>
        )}

        {cancelError !== null && (
          <p className="text-sm text-destructive" data-testid="cancel-error">
            {cancelError}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** 工作台主页面。 */

/**
 * EPERM + rename 组合 = 检查点写入被文件锁（杀毒/索引服务）短暂阻塞——
 * Windows 上常见的瞬态失败，恢复运行通常可越过。用于在 FAILED 面板追加提示。
 */
function isEpermRenameError(error: string | null | undefined): boolean {
  if (typeof error !== 'string') {
    return false;
  }
  const lower = error.toLowerCase();
  return lower.includes('eperm') && lower.includes('rename');
}

/** llm-status profile（如 competition_aliyun_qwen）→ 状态行的短标签（qwen）。 */
function shortProviderLabel(profile: string): string {
  const parts = profile.split('_');
  return parts[parts.length - 1] ?? profile;
}

/** 执行模式选择：'auto'（live·后端按 key 可用性解析）或 'offline_replay'（合成 fixtures）。 */
export type WorkbenchProfile = 'auto' | 'offline_replay';

export default function ResearchWorkbenchPage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const runIdParam = searchParams.get('runId') ?? '';

  // 问题输入默认为空（placeholder 保留示例）——不预填问题，避免“示例即结果”的错觉。
  const [question, setQuestion] = useState('');
  // null = 用户尚未显式选择 → 默认值跟随 llm-status 的 keyConfigured（live 优先）。
  const [profileChoice, setProfileChoice] = useState<WorkbenchProfile | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [showEvaluate, setShowEvaluate] = useState(false);

  // 运行期 LLM 状态（GET /api/v1/llm-status）：keyConfigured 驱动默认执行模式 + 状态行。
  const llmStatus = useLlmStatus();
  const keyConfigured = llmStatus.data?.keyConfigured;
  const profile: WorkbenchProfile = profileChoice ?? (keyConfigured ? 'auto' : 'offline_replay');

  // 本会话通过 202 启动的进行中运行（runId + 事件流地址）。
  const [startedRun, setStartedRun] = useState<{ readonly runId: string } | null>(null);

  const start = useStartResearch();
  const runQuery = useResearchRun(runIdParam);

  // 分享链接指向仍在跑的运行：GET 冻结 run 返回 409 research_run_not_completed →
  // 采纳为进行中运行，显示进度面板（轮询直到终态）。
  const runConflict =
    runQuery.isError &&
    runQuery.error instanceof ApiError &&
    runQuery.error.errorCode === 'research_run_not_completed';
  const progressRunId = startedRun?.runId ?? (runConflict ? runIdParam : '');

  const statusQuery = useResearchStatus(progressRunId, progressRunId !== '');
  const cancel = useCancelResearch(progressRunId);
  const feedback = useApplyResearchFeedback(runIdParam);
  const analyze = useAnalyzeResearch(runIdParam);
  const evaluate = useEvaluateResearch(showEvaluate ? runIdParam : '');

  const run = runQuery.data;
  const startError = start.isError ? (start.error as Error).message : null;
  // 后端 fail-closed 错误（503 research_live_profile_unavailable）的 detail.guidance
  // 如实透传展示（message 之外的可操作指引·不吞不改）。
  const startGuidance =
    start.isError && start.error instanceof ApiError ? start.error.guidance() : null;
  const busy = start.isPending || feedback.isPending || analyze.isPending;

  const status = statusQuery.data ?? null;
  const runState = status?.state ?? null;
  const isRunning = runState !== null && !isTerminalRunState(runState);

  // ---- SSE 实时事件（组件自管订阅；两次出错 → 放弃实时·仅轮询·如实标注） ----
  const [latestEvent, setLatestEvent] = useState<ResearchLifecycleEventDto | null>(null);
  const [liveDegraded, setLiveDegraded] = useState(false);
  useEffect(() => {
    setLatestEvent(null);
    setLiveDegraded(false);
    if (progressRunId === '') {
      return;
    }
    if (typeof EventSource === 'undefined') {
      // 运行时无原生 EventSource → 直接降级（轮询仍可用）。
      setLiveDegraded(true);
      return;
    }
    let sseErrors = 0;
    const unsubscribe = subscribeResearchEvents(
      progressRunId,
      (frame) => {
        if (frame.kind === 'research') {
          setLatestEvent(frame.event);
          if (isTerminalLifecycleEvent(frame.event.type)) {
            // 终态事件 → 立即刷新轮询通道（不等下一个 1.5s 周期）。
            void queryClient.invalidateQueries({ queryKey: researchKeys.status(frame.event.runId) });
          }
        }
        // 'state' 帧：轮询是唯一事实来源，无需重复应用。
      },
      () => {
        sseErrors += 1;
        if (sseErrors >= 2) {
          setLiveDegraded(true);
          unsubscribe();
        }
      },
    );
    return unsubscribe;
  }, [progressRunId, queryClient]);

  // ---- 已用时计时器（仅运行中跳动；由 startedAt 计算·非墙钟起点） ----
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!isRunning) {
      return;
    }
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isRunning]);
  const elapsedSeconds =
    status !== null && status.startedAt !== ''
      ? Math.max(0, Math.floor((nowTick - Date.parse(status.startedAt)) / 1000))
      : null;

  // ---- 终态迁移：COMPLETED → 拉取冻结 run；本会话启动的运行导航到 ?runId=（可分享） ----
  useEffect(() => {
    if (runState !== 'COMPLETED' || progressRunId === '') {
      return;
    }
    void queryClient.invalidateQueries({ queryKey: researchKeys.run(progressRunId) });
    if (startedRun !== null) {
      setStartedRun(null);
      navigate(`/research?runId=${encodeURIComponent(progressRunId)}`, { replace: true });
    }
  }, [runState, progressRunId, startedRun, navigate, queryClient]);

  /** 提交创建：202 → 记录进行中运行（进度面板接管）。失败 → 错误面板（catch 防 unhandled rejection）。 */
  async function handleStart() {
    try {
      const accepted = await start.mutateAsync({ question: question.trim(), profile });
      // 若地址栏还挂着上一个冻结 run，先清掉再进入新一轮进度视图。
      if (runIdParam !== '') {
        navigate('/research', { replace: true });
      }
      setStartedRun({ runId: accepted.runId });
    } catch {
      // 错误已由 startError 面板展示（isError/error）。
    }
  }

  /** 取消进行中运行（终态由轮询通道确认·绝不本地假装取消成功）。 */
  async function handleCancel() {
    try {
      await cancel.mutateAsync();
    } catch {
      // 错误已由 cancel-error 行展示。
    }
  }

  async function handleFeedback() {
    try {
      await feedback.mutateAsync({
        source: 'human',
        actor: 'workbench-user',
        text: feedbackText.trim(),
        triggers: feedbackText.trim().length > 0 ? ['plan_rewrite'] : ['none'],
      });
      setFeedbackText('');
    } catch {
      // 错误已由 feedback.isError 面板展示。
    }
  }

  return (
    <div className="space-y-6" data-testid="research-workbench">
      <PageHeader
        title={t('research.title')}
        description={t('research.subtitle')}
        icon={<FlaskConical className="h-5 w-5" />}
      />

      {/* ── 1. 新建研究 ── */}
      <Card>
        <CardHeader>
          <CardTitle>{t('research.createTitle')}</CardTitle>
          <CardDescription>{t('research.createHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            aria-label={t('research.questionLabel')}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t('research.questionPlaceholder')}
            data-testid="question-input"
          />
          {/* 执行模式：两项人话选项。提交只发 'auto' | 'offline_replay'（绝不发原始 provider 名）。 */}
          <div className="space-y-1.5 text-sm">
            <label className="flex items-start gap-1.5" data-testid="profile-option-live">
              <input
                type="radio"
                name="profile"
                className="mt-1"
                checked={profile === 'auto'}
                onChange={() => setProfileChoice('auto')}
              />
              <span>
                {t('research.mode.live')}
                {keyConfigured === true && (
                  <span className="ml-1.5 rounded bg-emerald-600/10 px-1.5 py-0.5 text-xs text-emerald-700">
                    {t('research.mode.liveReady')}
                  </span>
                )}
                {keyConfigured === false && (
                  <span className="ml-1.5 rounded bg-amber-600/10 px-1.5 py-0.5 text-xs text-amber-700">
                    {t('research.mode.liveNeedsKey')}
                  </span>
                )}
              </span>
            </label>
            <label className="flex items-start gap-1.5" data-testid="profile-option-synthetic">
              <input
                type="radio"
                name="profile"
                className="mt-1"
                checked={profile === 'offline_replay'}
                onChange={() => setProfileChoice('offline_replay')}
              />
              <span>
                {t('research.mode.synthetic')}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {t('research.mode.syntheticCaption')}
                </span>
              </span>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void handleStart()} disabled={busy || question.trim() === ''}>
              {start.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
              {t('research.startButton')}
            </Button>
            {/* 后端模型可用性状态行（llm-status 驱动·默认模式的依据如实可见）。 */}
            <span className="text-xs text-muted-foreground" data-testid="backend-status">
              {llmStatus.data !== undefined
                ? keyConfigured
                  ? t('research.mode.statusLive', {
                      profile: shortProviderLabel(llmStatus.data.profile),
                    })
                  : t('research.mode.statusSyntheticOnly')
                : llmStatus.isError
                  ? t('research.mode.statusUnknown')
                  : ''}
            </span>
          </div>
          {startError !== null && (
            <div className="space-y-1" data-testid="start-error">
              <p className="text-sm text-destructive">{startError}</p>
              {startGuidance !== null && (
                <p className="text-xs text-muted-foreground" data-testid="start-error-guidance">
                  {startGuidance}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 1b. 进行中运行的实时进度面板（202 异步契约）── */}
      {progressRunId !== '' && (
        <RunProgressPanel
          runId={progressRunId}
          status={status}
          statusLoading={statusQuery.isLoading}
          statusError={statusQuery.isError ? (statusQuery.error as Error).message : null}
          latestEvent={latestEvent}
          liveDegraded={liveDegraded}
          elapsedSeconds={elapsedSeconds}
          cancelPending={cancel.isPending}
          cancelError={cancel.isError ? `${t('research.cancel.failed')}: ${(cancel.error as Error).message}` : null}
          onCancel={() => void handleCancel()}
        />
      )}

      {/* ── 2. 运行摘要 + 主流程（冻结 run）── */}
      {runIdParam !== '' && runQuery.isLoading && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            {t('research.loadingRun')} {runIdParam}
          </CardContent>
        </Card>
      )}
      {runIdParam !== '' && runQuery.isError && !runConflict && (
        <Card>
          <CardContent className="py-6 text-sm text-destructive" data-testid="run-error">
            {(runQuery.error as Error).message}
          </CardContent>
        </Card>
      )}

      {run !== undefined && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{run.question}</CardTitle>
              <CardDescription>
                run {run.runId} · gate {run.gateReport.verdict}
                {run.gateReport.scope.domain !== null ? ` · domain ${run.gateReport.scope.domain}` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <RunModeBadge run={run} />
              </div>
              <div>
                corpus: {run.corpus.documentCount} docs · receipts:{' '}
                {run.stageReceipts.filter((r) => r.provenanceStatus === 'complete').length}/
                {run.stageReceipts.length} complete
              </div>
              {run.gateReport.requiresEthicsGate && (
                <Badge variant="destructive">{t('research.ethicsGate')}</Badge>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('research.hypothesesTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <HypothesisTable run={run} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('research.planTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <PlanSection run={run} />
            </CardContent>
          </Card>

          {/* ── 6. 真实数据分析 ── */}
          <Card>
            <CardHeader>
              <CardTitle>{t('research.analyzeTitle')}</CardTitle>
              <CardDescription>{t('research.analyzeHint')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => void analyze.mutateAsync({ live: false })}
                  disabled={busy}
                  data-testid="analyze-replay"
                >
                  {t('research.analyzeReplay')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void analyze.mutateAsync({ live: true })}
                  disabled={busy}
                  data-testid="analyze-live"
                >
                  {t('research.analyzeLive')}
                </Button>
              </div>
              {analyze.isError && (
                <p className="text-sm text-destructive">{(analyze.error as Error).message}</p>
              )}
              {run.observations.length > 0 && (
                <ul className="space-y-2 text-sm" data-testid="observation-list">
                  {run.observations.map((o) => (
                    <li key={o.id} className="rounded border p-2">
                      <Badge variant="outline">{o.mode}</Badge>{' '}
                      {isLandscapeResult(o.result)
                        ? `literature-landscape · ${o.result.totalDocuments} docs · counter-evidence ${(o.result.counterEvidenceShare * 100).toFixed(1)}% · fresh≤5y ${(o.result.freshShare * 100).toFixed(1)}% · median year ${o.result.medianPublicationYear ?? 'n/a'}`
                        : `${o.result.status} (n=${o.result.n}) · ${o.result.summary}`}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* ── 5. Revision 时间线 + 反馈 ── */}
          <Card>
            <CardHeader>
              <CardTitle>{t('research.revisionsTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {run.revisions.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('research.noRevisions')}</p>
              ) : (
                <ol className="space-y-2 text-sm" data-testid="revision-list">
                  {run.revisions.map((r) => (
                    <li key={r.id} className="rounded border p-2">
                      <span className="font-medium">#{r.number}</span> · {r.feedback.actor}:{' '}
                      {r.feedback.text}
                      {r.planChanges.length > 0 && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {r.planChanges.join('; ')}
                        </div>
                      )}
                      {r.unresolvedConflicts.length > 0 && (
                        <div className="mt-1 text-xs text-destructive">
                          {r.unresolvedConflicts.join('; ')}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              <div className="flex gap-2">
                <Input
                  aria-label={t('research.feedbackLabel')}
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder={t('research.feedbackPlaceholder')}
                />
                <Button
                  variant="secondary"
                  onClick={() => void handleFeedback()}
                  disabled={busy || feedbackText.trim() === ''}
                  data-testid="apply-feedback"
                >
                  {feedback.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                  {t('research.applyFeedback')}
                </Button>
              </div>
              {feedback.isError && (
                <p className="text-sm text-destructive">{(feedback.error as Error).message}</p>
              )}
            </CardContent>
          </Card>

          {/* ── 7. 评估（程序化指标）── */}
          <Card>
            <CardHeader>
              <CardTitle>{t('research.evaluateTitle')}</CardTitle>
              <CardDescription>{t('research.evaluateHint')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" onClick={() => setShowEvaluate((v) => !v)} data-testid="toggle-evaluate">
                <Scale className="mr-2 h-4 w-4" />
                {showEvaluate ? t('research.hideEvaluate') : t('research.showEvaluate')}
              </Button>
              {showEvaluate && evaluate.isLoading && (
                <p className="text-sm text-muted-foreground">{t('research.loadingRun')}</p>
              )}
              {showEvaluate && evaluate.isError && (
                <p className="text-sm text-destructive">{(evaluate.error as Error).message}</p>
              )}
              {showEvaluate && evaluate.data !== undefined && (
                <div className="text-sm" data-testid="evaluate-results">
                  <div className="font-medium">
                    {t('research.deterministicRecompute')}: {evaluate.data.deterministicRecompute}
                  </div>
                  <ul className="mt-2 space-y-1">
                    {evaluate.data.metrics.map((m) => (
                      <li key={m.name} className="flex justify-between gap-4">
                        <span>{m.name}</span>
                        <span className="font-mono">
                          {typeof m.value === 'number' ? m.value.toFixed(3) : String(m.value)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
