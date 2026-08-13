/**
 * ResearchWorkbenchPage —— Track-1A 科研工作台主流程（§12.5 七项主流程）。
 *
 * 主流程（全部 API 驱动·无硬编码科研结果）：
 *   1. 新建研究（question + profile → POST /api/v1/research·同步纵向切片）
 *   2. 运行摘要（gate 裁决 · 聚合+逐组件运行模式横幅 · 收据数 · 语料规模）
 *   3. 候选假设比较（确定性+模型维度评分 · Pareto 标注 · 引用绑定状态）
 *   4. 研究计划（objectives · analysisDag · 统计方法 · 停止条件 · 人工批准门）
 *   5. 真实数据分析（POST analyze · Observation 结果如实展示）
 *   6. Revision 时间线（反馈 → 不可变修订）
 *   7. 导出与验证（提示 far research export/verify；evaluate 展示程序化指标）
 *
 * 诚实边界：
 *   - offline_replay 模式显式 RECORDED_REPLAY 横幅（不伪装 live）
 *   - live profile 无 key → 后端 503 fail-closed → 错误面板（绝不静默回放）
 *   - 空状态 / 加载 / 错误均有处理；状态不依赖颜色（文字+徽章）
 */

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useAnalyzeResearch,
  useApplyResearchFeedback,
  useEvaluateResearch,
  useResearchRun,
  useStartResearch,
  type ResearchRunDto,
} from '@/lib/research_client';
import { useT } from '@/lib/i18n';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/PageHeader';
import { FlaskConical, Loader2, PlayCircle, RotateCcw, Scale } from 'lucide-react';

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

/** 工作台主页面。 */
export default function ResearchWorkbenchPage() {
  const t = useT();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const runId = searchParams.get('runId') ?? '';

  const [question, setQuestion] = useState(
    'Does stellar activity inflate hot Jupiter radii?',
  );
  const [profile, setProfile] = useState<'offline_replay' | 'competition_aliyun_qwen'>(
    'offline_replay',
  );
  const [feedbackText, setFeedbackText] = useState('');
  const [showEvaluate, setShowEvaluate] = useState(false);

  const start = useStartResearch();
  const runQuery = useResearchRun(runId);
  const feedback = useApplyResearchFeedback(runId);
  const analyze = useAnalyzeResearch(runId);
  const evaluate = useEvaluateResearch(showEvaluate ? runId : '');

  const run = runQuery.data;
  const startError = start.isError ? (start.error as Error).message : null;
  const busy = start.isPending || feedback.isPending || analyze.isPending;

  /** 提交创建：成功 → 写入 ?runId= 参数（可分享·刷新保留）。失败 → 错误面板（catch 防 unhandled rejection）。 */
  async function handleStart() {
    try {
      const created = await start.mutateAsync({ question: question.trim(), profile });
      navigate(`/research?runId=${encodeURIComponent(created.runId)}`, { replace: true });
    } catch {
      // 错误已由 startError 面板展示（isError/error）。
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
          />
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="profile"
                checked={profile === 'offline_replay'}
                onChange={() => setProfile('offline_replay')}
              />
              offline_replay
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="profile"
                checked={profile === 'competition_aliyun_qwen'}
                onChange={() => setProfile('competition_aliyun_qwen')}
              />
              {t('research.liveProfile')}
            </label>
            <Button onClick={() => void handleStart()} disabled={busy || question.trim() === ''}>
              {start.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
              {t('research.startButton')}
            </Button>
          </div>
          {startError !== null && (
            <p className="text-sm text-destructive" data-testid="start-error">
              {startError}
            </p>
          )}
          {profile === 'competition_aliyun_qwen' && (
            <p className="text-xs text-muted-foreground">{t('research.liveKeyHint')}</p>
          )}
        </CardContent>
      </Card>

      {/* ── 2. 运行摘要 + 主流程 ── */}
      {runId !== '' && runQuery.isLoading && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            {t('research.loadingRun')} {runId}
          </CardContent>
        </Card>
      )}
      {runId !== '' && runQuery.isError && (
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
                      <Badge variant="outline">{o.mode}</Badge> {o.result.status} (n={o.result.n}) ·{' '}
                      {o.result.summary}
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
