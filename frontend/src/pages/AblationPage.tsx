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
    description: 'Random-guess baseline; no search or reasoning capability',
    mode: 'quick',
    researchInputPrefix: '[Random Baseline] ',
  },
  {
    key: 'search',
    label: 'Search Baseline',
    description: 'Retrieval-only; no LLM reasoning',
    mode: 'quick',
    researchInputPrefix: '[Search Baseline] ',
  },
  {
    key: 'direct-llm',
    label: 'Direct LLM',
    description: 'Single-pass LLM reasoning; no evidence chain or verification loop',
    mode: 'quick',
    researchInputPrefix: '[Direct LLM] ',
  },
  {
    key: 'far-chain',
    label: 'FAR-Chain Full',
    description: 'Full 6-stage FSM + evidence chain + falsification gate + reproducibility hash',
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
  { key: 'evidenceRetrieval', label: 'Evidence retrieval', description: 'Retrieves external evidence/literature' },
  { key: 'structuredChain', label: 'Hash-structured evidence chain', description: 'call_records hash-linked; traceable audit' },
  { key: 'singlePassReasoning', label: 'Single-pass reasoning', description: 'LLM reasoning produces a conclusion' },
  { key: 'falsificationSpec', label: 'Falsification spec', description: 'Structured prediction/metric/threshold; supports falsification verdicts' },
  { key: 'reproducibleHash', label: 'Reproducible hash', description: 'reproHash designed to connect to 03 calc_bridge; independently re-computable' },
  { key: 'gatedVerdict', label: 'Gated verdict', description: 'verdict gate + degraded-scope/untested branches' },
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
  CONFIRMED: 'Confirmed',
  REFUTED: 'Refuted',
  INCONCLUSIVE: 'Inconclusive',
  DEGRADED_SCOPE: 'Degraded scope',
  UNTESTED: 'Untested',
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
      return 'Converged';
    case 'max_iterations':
      return 'Max iterations';
    case 'max_tokens':
      return 'Token limit';
    case 'max_duration':
      return 'Timeout';
    case 'error':
      return 'Errored';
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
        const message = e instanceof Error ? e.message : 'Unknown error';
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
        <h1 className="text-3xl font-bold tracking-tight">Ablation study</h1>
        <p className="mt-1 text-muted-foreground">
          Compares the full FAR-Chain pipeline against simplified baselines on tamper-detectability, independent re-computability, and falsifiability
        </p>
      </header>

      {/* ---- Input section ---- */}
      <Card data-testid="ablation-input-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5" aria-hidden="true" />
            <CardTitle className="text-lg">Experiment input</CardTitle>
          </div>
          <CardDescription>
            Enter a research question to fire hypothesize requests against all 4 baselines in parallel and compare results (via the same offline fixture — the three quick baselines produce identical output; see the honesty boundary below)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <textarea
              className="w-full min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Enter a research question, e.g.: Is the protective efficacy of the COVID-19 mRNA vaccine in people aged 65+ no less than 80%?"
              value={researchInput}
              onChange={(e) => {
                setResearchInput(e.target.value);
              }}
              disabled={isRunning}
              aria-label="Research question input"
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
                aria-label="Run ablation study"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Running…
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" aria-hidden="true" />
                    Run ablation study
                  </>
                )}
              </Button>
              <span className="text-xs text-muted-foreground">
                {isRunning ? '4 baselines running in parallel…' : 'Ctrl + Enter to run'}
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
          Baseline results
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
            Comparison table
          </h2>
          <Card data-testid="comparison-table">
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Baseline</TableHead>
                    <TableHead>Run ID</TableHead>
                    <TableHead>Iterations</TableHead>
                    <TableHead>Termination</TableHead>
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
                              Request failed: {r.error}
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
            Visual comparison
          </h2>
          <div className="space-y-6" data-testid="ablation-charts">
            {/* Iteration comparison */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" aria-hidden="true" />
                  <CardTitle className="text-lg">Iteration count comparison</CardTitle>
                </div>
                <CardDescription>
                  Number of iterations each baseline needs to complete the research; reflects search/reasoning efficiency
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
                  <CardTitle className="text-lg">Metric value comparison</CardTitle>
                </div>
                <CardDescription>
                  metricValue of each baseline's verdict node (only baselines with a metric value are shown)
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
                  <CardTitle className="text-lg">Verdict distribution</CardTitle>
                </div>
                <CardDescription>
                  Final verdict type per baseline — CONFIRMED / REFUTED / INCONCLUSIVE /
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
                  <CardTitle className="text-lg">Falsifiability support</CardTitle>
                </div>
                <CardDescription>
                  Whether each baseline emits a structured falsificationSpec (a falsifiable claim) — FAR-Chain's core differentiator
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
            FAR-Chain advantages over the baselines
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            The comparison below focuses on tamper-detectability, independent re-computability, and falsifiability — not only on conclusion accuracy.
          </p>
          <div className="grid gap-4 md:grid-cols-3" data-testid="advantage-cards">
            {/* Auditability */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Eye className="h-5 w-5" aria-hidden="true" />
                  <CardTitle className="text-lg">Tamper-detectability</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  FAR-Chain's hash evidence chain spans the full 6-stage FSM (call_records are hash-linked one by one). The three baselines also land call_records via the offline FSM, but by their method definition they do not build a cross-stage structured evidence chain — see the capability matrix above for capability attribution.
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
                      {b.label}: {otherResults[j]?.status === 'success' ? 'no structured evidence chain (see capability matrix)' : '—'}
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
                  <CardTitle className="text-lg">Independent re-computability</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  FAR-Chain's reproHash is designed to connect to the 03 calc_bridge seven-component hash (production path; independently re-computable). The current offline demo uses a placeholder hash (0×64; satisfies only the chain-structure constraint; not a production reproducibility anchor); the three baselines have no re-computation mechanism by method definition.
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
                  <CardTitle className="text-lg">Falsifiability</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Every FAR-Chain hypothesis is bound to an explicit falsificationSpec, enabling meaningful falsification verdicts such as REFUTED / DEGRADED_SCOPE. The baselines have no structured falsification standard.
                </p>
                {farChainResult?.status === 'success' && farChainResult.data !== null && (
                  <div className="rounded bg-muted px-3 py-2">
                    <span className="text-xs text-muted-foreground">
                      Iterations: {farChainResult.data.loopState.iterationsCompleted}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {' · '}Termination: {terminationLabel(farChainResult.data.loopState.terminationReason)}
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
          <AlertTitle>All baselines failed</AlertTitle>
          <AlertDescription>
            Make sure the backend is running (http://localhost:3000) and the /api/v1/hypothesize endpoint is available. Open the browser dev tools to inspect the network errors.
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
      <AlertTitle>Honesty boundary of the offline demo</AlertTitle>
      <AlertDescription className="space-y-2 text-sm">
        <p>
          All four baselines go through the <code className="font-mono">offline_replay</code> adapter (model-neutral; no real LLM calls). The fixture matches only by <code className="font-mono">stageId</code> and does not read the research-question text, so the Random / Search / Direct LLM quick baselines produce <strong>the same deterministic loopState</strong>.
        </p>
        <p>
          The only real runtime difference is that <strong>FAR-Chain uses mode=full</strong> (multi-iteration FSM); the other three use mode=quick (single pass, then terminate). The three baselines showing identical output below is an honest reflection, not a defect.
        </p>
        <p>
          FAR-Chain's real moat lies <strong>not in the verdict value</strong> but in structural capabilities (hash evidence chain / falsification spec / calc_bridge-linked reproducibility hash / gated verdict) — see the capability matrix below.
        </p>
        <p>
          Quantifying the capability differences among Random / Search / Direct LLM requires plugging in a real LLM provider (competition_aliyun_qwen), which is beyond the scope of the offline demo.
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
        Capability matrix
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          (method-definition level; qualitative; not fabricated numbers)
        </span>
      </h2>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Capability dimension</TableHead>
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
                            <CheckCircle2 className="h-5 w-5" aria-label="Present" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center text-muted-foreground">
                            <XCircle className="h-5 w-5" aria-label="Absent" />
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
            Waiting to run…
          </p>
        )}
        {result.status === 'loading' && (
          <div
            className="flex items-center gap-2 text-sm text-muted-foreground"
            data-testid={`baseline-loading-${baseline.key}`}
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Running…
          </div>
        )}
        {result.status === 'error' && (
          <Alert variant="destructive" className="text-xs">
            <AlertTriangle className="h-3 w-3" />
            <AlertTitle className="text-xs">Run failed</AlertTitle>
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
              <dt className="text-muted-foreground">Termination</dt>
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
