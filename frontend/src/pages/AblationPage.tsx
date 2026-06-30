import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useHypothesize } from '@/lib/api_client';
import type { HypothesizeResponse, VerdictValue, LoopState } from '@/lib/types';
import {
  FlaskConical,
  Loader2,
  AlertTriangle,
  Shield,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Eye,
  Repeat,
  Play,
  BarChart3,
  TrendingUp,
} from 'lucide-react';
import {
  IterationBarChart,
  MetricBarChart,
  VerdictDistChart,
  FalsifiabilityChart,
} from '@/components/AblationCharts';

// ============================================================
// Baseline definitions
// ============================================================

interface BaselineDef {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  /** POST /api/v1/hypothesize mode parameter */
  readonly mode: 'full' | 'quick';
  /** Prefixed to researchInput to identify the baseline server-side */
  readonly researchInputPrefix: string;
}

const BASELINES: readonly BaselineDef[] = [
  {
    key: 'random',
    label: 'Random Baseline',
    description: '随机猜测基线，无搜索/推理能力',
    mode: 'quick',
    researchInputPrefix: '[Random Baseline] ',
  },
  {
    key: 'search',
    label: 'Search Baseline',
    description: '仅搜索检索，无 LLM 推理',
    mode: 'quick',
    researchInputPrefix: '[Search Baseline] ',
  },
  {
    key: 'direct-llm',
    label: 'Direct LLM',
    description: '单次 LLM 直接推理，无证据链/验证循环',
    mode: 'quick',
    researchInputPrefix: '[Direct LLM] ',
  },
  {
    key: 'far-chain',
    label: 'FAR-Chain Full',
    description: '完整六阶段 FSM + 证据链 + 可证伪门 + 复现哈希',
    mode: 'full',
    researchInputPrefix: '',
  },
];

// ============================================================
// Capability matrix — 方法定义层面的真实定性能力差异
// ============================================================
//
// 设计理由（反 theater 红线 00§1.4 / 14§3）：
//   - offline_replay fixture 仅按 stageId 命中·不读取 researchInput 文本，
//     故 random/search/direct-ll 三条 quick 基线产出相同 loopState——
//     verdict/iterations 的「数值差异」在 offline 下不存在（真实后端相同）。
//   - 唯一可在 offline 下真实对比的是**方法定义层面的结构性能力存在性**
//     （定性 ✓/✗·非编造数值）：每条基线按其方法定义具备或不具备某项能力。
//   - 此矩阵是 FAR-Chain 真实护城河的可视化锚点（hash 证据链 / 可证伪规格 /
//     接 calc_bridge 的复现哈希 / 六阶段 FSM / 门控裁决），与 verdict 准确度无关。

interface CapabilityDim {
  readonly key: string;
  readonly label: string;
  readonly description: string;
}

const CAPABILITY_DIMENSIONS: readonly CapabilityDim[] = [
  { key: 'evidenceRetrieval', label: '证据检索', description: '是否检索外部证据/文献' },
  { key: 'structuredChain', label: 'Hash 结构化证据链', description: 'call_records hash 链接·可追溯审计' },
  { key: 'singlePassReasoning', label: '单次推理', description: 'LLM 推理产出结论' },
  { key: 'falsificationSpec', label: '可证伪规格', description: '结构化 预测/指标/阈值·支持证伪判决' },
  { key: 'reproducibleHash', label: '可复现哈希', description: 'reproHash 设计接 03 calc_bridge·可独立复现' },
  { key: 'gatedVerdict', label: '门控裁决', description: 'verdict 门 + 降级范围/未测试分支' },
];

/**
 * BASELINE_CAPABILITIES —— 每条基线在各能力维度上的真实定性归属。
 *
 * 依据方法定义（非运行时数值）：
 *   - random：纯随机猜测·不具备任何结构化能力。
 *   - search：仅检索·有证据但不构建 hash 链/不推理/不证伪/不复现/不门控。
 *   - direct-llm：单次 LLM 推理·有结论但无任何 FAR-Chain 结构化机制。
 *   - far-chain：完整六阶段 FSM·全部 6 项结构性能力具备。
 *
 * 真实性注记：reproducibleHash 对 far-chain 标 ✓ 指**机制存在**（设计接 calc_bridge）；
 *   offline demo 路径用占位 hash（0×64·非生产复现锚点）——生产路径须显式注入 reproHashProvider。
 */
const BASELINE_CAPABILITIES: Readonly<Record<string, Readonly<Record<string, boolean>>>> = {
  random: {
    evidenceRetrieval: false,
    structuredChain: false,
    singlePassReasoning: false,
    falsificationSpec: false,
    reproducibleHash: false,
    gatedVerdict: false,
  },
  search: {
    evidenceRetrieval: true,
    structuredChain: false,
    singlePassReasoning: false,
    falsificationSpec: false,
    reproducibleHash: false,
    gatedVerdict: false,
  },
  'direct-llm': {
    evidenceRetrieval: false,
    structuredChain: false,
    singlePassReasoning: true,
    falsificationSpec: false,
    reproducibleHash: false,
    gatedVerdict: false,
  },
  'far-chain': {
    evidenceRetrieval: true,
    structuredChain: true,
    singlePassReasoning: true,
    falsificationSpec: true,
    reproducibleHash: true,
    gatedVerdict: true,
  },
};

// ============================================================
// Verdict visual mapping (matches badge variants + Chinese labels)
// ============================================================

const VERDICT_VARIANT: Record<VerdictValue, 'success' | 'destructive' | 'warning' | 'secondary' | 'outline'> = {
  CONFIRMED: 'success',
  REFUTED: 'destructive',
  INCONCLUSIVE: 'warning',
  DEGRADED_SCOPE: 'secondary',
  UNTESTED: 'outline',
};

const VERDICT_LABEL: Record<VerdictValue, string> = {
  CONFIRMED: '已确认',
  REFUTED: '已证伪',
  INCONCLUSIVE: '不确定',
  DEGRADED_SCOPE: '降级范围',
  UNTESTED: '未测试',
};

// ============================================================
// Per-baseline result state
// ============================================================

type BaselineStatus = 'idle' | 'loading' | 'success' | 'error';

interface BaselineResult {
  status: BaselineStatus;
  data: HypothesizeResponse | null;
  error: string | null;
}

function createInitialResults(): BaselineResult[] {
  return BASELINES.map(() => ({ status: 'idle' as const, data: null, error: null }));
}

// ============================================================
// Helpers
// ============================================================

function truncateHash(hash: string, len = 12): string {
  if (hash.length <= len) return hash;
  return `${hash.slice(0, len)}…`;
}

type TerminationReason = LoopState['terminationReason'];

function terminationLabel(reason: TerminationReason): string {
  switch (reason) {
    case 'feedback_converged':
      return '收敛';
    case 'max_iterations':
      return '最大迭代';
    case 'max_tokens':
      return 'Token 上限';
    case 'max_duration':
      return '超时';
    case 'error':
      return '错误终止';
    default: {
      const _exhaustive: never = reason;
      void _exhaustive;
      return reason;
    }
  }
}

function terminationVariant(reason: TerminationReason): 'success' | 'destructive' | 'secondary' {
  if (reason === 'feedback_converged') return 'success';
  if (reason === 'error') return 'destructive';
  return 'secondary';
}

// ============================================================
// Page component
// ============================================================

export default function AblationPage() {
  const hypothesize = useHypothesize();
  const [researchInput, setResearchInput] = useState('');
  const [results, setResults] = useState<BaselineResult[]>(createInitialResults);
  const [isRunning, setIsRunning] = useState(false);

  const allComplete = results.every(
    (r) => r.status === 'success' || r.status === 'error',
  );
  const hasAnyResult = results.some((r) => r.status === 'success');

  const farChainIndex = BASELINES.findIndex((b) => b.key === 'far-chain');
  const farChainResult = results[farChainIndex];
  const otherBaselines = BASELINES.filter((b) => b.key !== 'far-chain');
  const otherResults = results.filter((_, i) => BASELINES[i].key !== 'far-chain');

  async function handleRun() {
    const trimmed = researchInput.trim();
    if (!trimmed) return;

    setIsRunning(true);
    setResults(BASELINES.map(() => ({ status: 'loading' as const, data: null, error: null })));

    const promises = BASELINES.map(async (baseline, i) => {
      try {
        const data = await hypothesize.mutateAsync({
          researchInput: baseline.researchInputPrefix + trimmed,
          mode: baseline.mode,
        });
        setResults((prev) => {
          const next = [...prev];
          next[i] = { status: 'success' as const, data, error: null };
          return next;
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : '未知错误';
        setResults((prev) => {
          const next = [...prev];
          next[i] = { status: 'error' as const, data: null, error: message };
          return next;
        });
      }
    });

    await Promise.allSettled(promises);
    setIsRunning(false);
  }

  return (
    <div className="space-y-8" data-testid="ablation-page">
      {/* ---- Header ---- */}
      <header>
        <h1 className="text-3xl font-bold tracking-tight">消融实验</h1>
        <p className="mt-1 text-muted-foreground">
          对比 FAR-Chain 完整流程与简化基线在可审计性、可复现性、可证伪性上的差异
        </p>
      </header>

      {/* ---- Input section ---- */}
      <Card data-testid="ablation-input-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5" aria-hidden="true" />
            <CardTitle className="text-lg">实验输入</CardTitle>
          </div>
          <CardDescription>
            输入研究问题，同时对 4 条基线发起 hypothesize 请求，对比运行结果（经同一离线
            fixture·三基线产出相同·见下方「离线演示的诚实边界」）
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <textarea
              className="w-full min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="输入研究问题，例如：COVID-19 mRNA 疫苗对 65 岁以上人群的保护效力是否不低于 80%？"
              value={researchInput}
              onChange={(e) => {
                setResearchInput(e.target.value);
              }}
              disabled={isRunning}
              aria-label="研究问题输入"
              data-testid="ablation-input"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  void handleRun();
                }
              }}
            />
            <div className="flex items-center gap-3">
              <Button
                onClick={() => {
                  void handleRun();
                }}
                disabled={isRunning || !researchInput.trim()}
                data-testid="ablation-run-button"
                aria-label="运行消融实验"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    运行中…
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" aria-hidden="true" />
                    运行消融实验
                  </>
                )}
              </Button>
              <span className="text-xs text-muted-foreground">
                {isRunning ? '4 条基线并行请求中…' : 'Ctrl + Enter 快速运行'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---- Honesty wall (offline 局限诚实声明·反 theater) ---- */}
      <HonestyWallSection />

      {/* ---- Capability matrix (方法定义层面的真实定性能力对比) ---- */}
      <CapabilityMatrixSection />

      {/* ---- Baseline result cards ---- */}
      <section aria-labelledby="baseline-results-heading">
        <h2 id="baseline-results-heading" className="mb-4 text-xl font-semibold">
          基线运行结果
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-testid="baseline-cards">
          {BASELINES.map((baseline, i) => (
            <BaselineResultCard
              key={baseline.key}
              baseline={baseline}
              result={results[i]}
              isFarChain={baseline.key === 'far-chain'}
            />
          ))}
        </div>
      </section>

      {/* ---- Comparison table (shown once any baseline has a result) ---- */}
      {hasAnyResult && (
        <section aria-labelledby="comparison-table-heading">
          <h2 id="comparison-table-heading" className="mb-4 text-xl font-semibold">
            对比表格
          </h2>
          <Card data-testid="comparison-table">
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>基线</TableHead>
                    <TableHead>Run ID</TableHead>
                    <TableHead>迭代次数</TableHead>
                    <TableHead>终止原因</TableHead>
                    <TableHead>Verdict</TableHead>
                    <TableHead>Metric Value</TableHead>
                    <TableHead>Repro Hash</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {BASELINES.map((baseline, i) => {
                    const r = results[i];
                    if (r.status === 'idle' || r.status === 'loading') return null;
                    if (r.status === 'error') {
                      return (
                        <TableRow key={baseline.key} data-testid={`row-${baseline.key}-error`}>
                          <TableCell className="font-medium">{baseline.label}</TableCell>
                          <TableCell colSpan={6}>
                            <span className="text-destructive text-sm">
                              请求失败: {r.error}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    }
                    if (r.data === null) return null;
                    const d = r.data;
                    const verdictValue: VerdictValue | undefined =
                      d.loopState.verdictNode?.verdict ?? d.honestVerdict?.verdict;
                    return (
                      <TableRow key={baseline.key} data-testid={`row-${baseline.key}`}>
                        <TableCell className="font-medium">{baseline.label}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {d.loopState.runId}
                        </TableCell>
                        <TableCell>{d.loopState.iterationsCompleted}</TableCell>
                        <TableCell>
                          <Badge variant={terminationVariant(d.loopState.terminationReason)}>
                            {terminationLabel(d.loopState.terminationReason)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {verdictValue ? (
                            <Badge variant={VERDICT_VARIANT[verdictValue]}>
                              {VERDICT_LABEL[verdictValue]}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">{'—'}</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {d.loopState.verdictNode?.metricValue != null
                            ? d.loopState.verdictNode.metricValue.toFixed(4)
                            : '—'}
                        </TableCell>
                        <TableCell
                          className="font-mono text-xs"
                          title={d.reproHash}
                        >
                          {truncateHash(d.reproHash)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ---- Visualization charts ---- */}
      {hasAnyResult && (
        <section aria-labelledby="charts-heading">
          <h2 id="charts-heading" className="mb-4 text-xl font-semibold">
            可视化对比
          </h2>
          <div className="space-y-6" data-testid="ablation-charts">
            {/* Iteration comparison */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" aria-hidden="true" />
                  <CardTitle className="text-lg">迭代次数对比</CardTitle>
                </div>
                <CardDescription>
                  各基线完成研究所需的迭代轮次，反映搜索/推理效率
                </CardDescription>
              </CardHeader>
              <CardContent>
                <IterationBarChart
                  data={BASELINES.map((b, i) => ({
                    key: b.key,
                    label: b.label,
                    response:
                      results[i]?.status === 'success'
                        ? results[i]!.data
                        : null,
                    isError: results[i]?.status === 'error',
                  }))}
                />
              </CardContent>
            </Card>

            {/* Metric value comparison */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" aria-hidden="true" />
                  <CardTitle className="text-lg">指标值对比</CardTitle>
                </div>
                <CardDescription>
                  各基线 verdict 节点的 metricValue 对比（仅展示有指标值的基线）
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MetricBarChart
                  data={BASELINES.map((b, i) => ({
                    key: b.key,
                    label: b.label,
                    response:
                      results[i]?.status === 'success'
                        ? results[i]!.data
                        : null,
                    isError: results[i]?.status === 'error',
                  }))}
                />
              </CardContent>
            </Card>

            {/* Verdict distribution */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5" aria-hidden="true" />
                  <CardTitle className="text-lg">裁决分布</CardTitle>
                </div>
                <CardDescription>
                  各基线最终裁决类型对比——CONFIRMED / REFUTED / INCONCLUSIVE /
                  DEGRADED_SCOPE / UNTESTED
                </CardDescription>
              </CardHeader>
              <CardContent>
                <VerdictDistChart
                  data={BASELINES.map((b, i) => ({
                    key: b.key,
                    label: b.label,
                    response:
                      results[i]?.status === 'success'
                        ? results[i]!.data
                        : null,
                    isError: results[i]?.status === 'error',
                  }))}
                />
              </CardContent>
            </Card>

            {/* Falsifiability presence */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5" aria-hidden="true" />
                  <CardTitle className="text-lg">可证伪性支持</CardTitle>
                </div>
                <CardDescription>
                  各基线是否输出了结构化 falsificationSpec（可证伪断言），
                  FAR-Chain 的 core differentiator
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FalsifiabilityChart
                  data={BASELINES.map((b, i) => ({
                    key: b.key,
                    label: b.label,
                    response:
                      results[i]?.status === 'success'
                        ? results[i]!.data
                        : null,
                    isError: results[i]?.status === 'error',
                  }))}
                />
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* ---- Summary: FAR-Chain advantages ---- */}
      {allComplete && hasAnyResult && (
        <section aria-labelledby="summary-heading">
          <h2 id="summary-heading" className="mb-4 text-xl font-semibold">
            FAR-Chain 相对各基线的优势
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            以下对比聚焦可审计性、可复现性、可证伪性三个维度，而非仅比较结论准确度。
          </p>
          <div className="grid gap-4 md:grid-cols-3" data-testid="advantage-cards">
            {/* Auditability */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Eye className="h-5 w-5" aria-hidden="true" />
                  <CardTitle className="text-lg">可审计性</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  FAR-Chain 的 hash 证据链贯穿完整六阶段 FSM（call_records 逐条 hash 链接）。
                  三基线虽经 offline FSM 落 call_records，但按方法定义不构建跨阶段结构化证据链——
                  能力归属见上方「能力矩阵」。
                </p>
                {farChainResult?.status === 'success' && farChainResult.data !== null && (
                  <div className="rounded bg-muted px-3 py-2">
                    <span className="text-xs text-muted-foreground">Repro Hash: </span>
                    <code className="text-xs font-mono">
                      {truncateHash(farChainResult.data.reproHash, 16)}
                    </code>
                  </div>
                )}
                <ul className="space-y-1 text-sm text-muted-foreground list-disc list-inside">
                  {otherBaselines.map((b, j) => (
                    <li key={b.key}>
                      {b.label}：{otherResults[j]?.status === 'success' ? '无结构化证据链（见能力矩阵）' : '—'}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Reproducibility */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Repeat className="h-5 w-5" aria-hidden="true" />
                  <CardTitle className="text-lg">可复现性</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  FAR-Chain 的 reproHash 设计接 03 calc_bridge 七分量（生产路径·可独立复现验证）。
                  当前 offline demo 用占位 hash（0×64·仅满足链式结构约束·非生产复现锚点）；
                  三基线按方法定义无复现验证机制。
                </p>
                {farChainResult?.status === 'success' && farChainResult.data !== null && (
                  <div className="rounded bg-muted px-3 py-2">
                    <span className="text-xs text-muted-foreground">Verdict: </span>
                    <Badge
                      variant={
                        farChainResult.data.honestVerdict?.verdict
                          ? VERDICT_VARIANT[farChainResult.data.honestVerdict.verdict]
                          : farChainResult.data.loopState.verdictNode?.verdict
                            ? VERDICT_VARIANT[farChainResult.data.loopState.verdictNode.verdict]
                            : 'outline'
                      }
                    >
                      {farChainResult.data.honestVerdict?.verdict
                        ? VERDICT_LABEL[farChainResult.data.honestVerdict.verdict]
                        : farChainResult.data.loopState.verdictNode?.verdict
                          ? VERDICT_LABEL[farChainResult.data.loopState.verdictNode.verdict]
                          : '—'}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Falsifiability */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5" aria-hidden="true" />
                  <CardTitle className="text-lg">可证伪性</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  FAR-Chain 每条假设绑定显式的 falsificationSpec，支持
                  REFUTED / DEGRADED_SCOPE 等有意义的证伪判决。基线不具备结构化证伪标准。
                </p>
                {farChainResult?.status === 'success' && farChainResult.data !== null && (
                  <div className="rounded bg-muted px-3 py-2">
                    <span className="text-xs text-muted-foreground">
                      Iterations: {farChainResult.data.loopState.iterationsCompleted}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {' · '}终止: {terminationLabel(farChainResult.data.loopState.terminationReason)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* ---- All-error fallback ---- */}
      {allComplete && !hasAnyResult && (
        <Alert variant="destructive" data-testid="ablation-all-error">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>全部基线运行失败</AlertTitle>
          <AlertDescription>
            请确认后端已启动（http://localhost:3000）且 /api/v1/hypothesize 端点可用。
            打开浏览器开发者工具查看具体网络错误。
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

// ---- Honesty wall (offline 局限诚实声明·反 theater) ----
function HonestyWallSection() {
  return (
    <Alert data-testid="ablation-honesty-wall" className="border-amber-500/40 bg-amber-500/5">
      <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <AlertTitle>离线演示的诚实边界</AlertTitle>
      <AlertDescription className="space-y-2 text-sm">
        <p>
          四条基线均经 <code className="font-mono">offline_replay</code> 适配器（模型中立·无真实 LLM 调用）。
          fixture 仅按 <code className="font-mono">stageId</code> 命中、不读取研究问题文本，故
          Random / Search / Direct LLM 三条 quick 基线产出<strong>相同的确定性 loopState</strong>。
        </p>
        <p>
          唯一真实的运行差异是 <strong>FAR-Chain 使用 mode=full</strong>（多轮迭代 FSM），其余三条使用
          mode=quick（单轮即终止）。下方「基线运行结果」中三基线呈现相同产出是诚实反映·非缺陷。
        </p>
        <p>
          FAR-Chain 的真实护城河<strong>不在 verdict 数值</strong>，而在结构性能力（hash 证据链 /
          可证伪规格 / 接 calc_bridge 的复现哈希 / 门控裁决）——见下方「能力矩阵」。
        </p>
        <p>
          量化 Random / Search / Direct LLM 的能力差异需接入真实 LLM provider
          （competition_aliyun_qwen），超出离线 demo 范围。
        </p>
      </AlertDescription>
    </Alert>
  );
}

// ---- Capability matrix (方法定义层面的真实定性能力对比) ----
function CapabilityMatrixSection() {
  return (
    <section
      aria-labelledby="capability-matrix-heading"
      data-testid="ablation-capability-matrix"
    >
      <h2 id="capability-matrix-heading" className="mb-4 text-xl font-semibold">
        能力矩阵
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          （方法定义层面·定性·非编造数值）
        </span>
      </h2>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>能力维度</TableHead>
                {BASELINES.map((b) => (
                  <TableHead key={b.key} className="text-center">
                    {b.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {CAPABILITY_DIMENSIONS.map((dim) => (
                <TableRow key={dim.key}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{dim.label}</span>
                      <span className="text-xs text-muted-foreground">{dim.description}</span>
                    </div>
                  </TableCell>
                  {BASELINES.map((b) => {
                    const has = BASELINE_CAPABILITIES[b.key][dim.key];
                    return (
                      <TableCell
                        key={b.key}
                        className="text-center"
                        data-testid={`cap-${dim.key}-${b.key}`}
                      >
                        {has ? (
                          <span className="inline-flex items-center justify-center text-green-600 dark:text-green-400">
                            <CheckCircle2 className="h-5 w-5" aria-label="具备" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center text-muted-foreground">
                            <XCircle className="h-5 w-5" aria-label="不具备" />
                          </span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}

function BaselineResultCard({
  baseline,
  result,
  isFarChain,
}: {
  baseline: BaselineDef;
  result: BaselineResult;
  isFarChain: boolean;
}) {
  return (
    <Card
      data-testid={`baseline-card-${baseline.key}`}
      className={isFarChain ? 'border-primary/50 ring-1 ring-primary/20' : ''}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{baseline.label}</CardTitle>
            {isFarChain && (
              <Badge variant="default" className="text-xs">
                Full
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>{baseline.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {result.status === 'idle' && (
          <p className="text-sm text-muted-foreground" data-testid={`baseline-idle-${baseline.key}`}>
            等待运行…
          </p>
        )}
        {result.status === 'loading' && (
          <div
            className="flex items-center gap-2 text-sm text-muted-foreground"
            data-testid={`baseline-loading-${baseline.key}`}
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            运行中…
          </div>
        )}
        {result.status === 'error' && (
          <Alert variant="destructive" className="text-xs">
            <AlertTriangle className="h-3 w-3" />
            <AlertTitle className="text-xs">运行失败</AlertTitle>
            <AlertDescription className="text-xs">{result.error}</AlertDescription>
          </Alert>
        )}
        {result.status === 'success' && result.data !== null && (
          <dl
            className="space-y-2 text-sm"
            data-testid={`baseline-result-${baseline.key}`}
          >
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Run ID</dt>
              <dd>
                <code className="font-mono text-xs">{result.data.loopState.runId}</code>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Iterations</dt>
              <dd>{result.data.loopState.iterationsCompleted}</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-muted-foreground">终止</dt>
              <dd>
                <Badge variant={terminationVariant(result.data.loopState.terminationReason)}>
                  {terminationLabel(result.data.loopState.terminationReason)}
                </Badge>
              </dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-muted-foreground">Verdict</dt>
              <dd>
                {(() => {
                  const v =
                    result.data.loopState.verdictNode?.verdict ??
                    result.data.honestVerdict?.verdict;
                  return v ? (
                    <Badge variant={VERDICT_VARIANT[v]}>
                      {VERDICT_LABEL[v]}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">{'—'}</span>
                  );
                })()}
              </dd>
            </div>
            {result.data.loopState.verdictNode?.metricValue != null && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Metric</dt>
                <dd>
                  <code className="font-mono text-xs">
                    {result.data.loopState.verdictNode.metricValue.toFixed(4)}
                  </code>
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Repro Hash</dt>
              <dd>
                <code
                  className="font-mono text-xs"
                  title={result.data.reproHash}
                >
                  {truncateHash(result.data.reproHash)}
                </code>
              </dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
