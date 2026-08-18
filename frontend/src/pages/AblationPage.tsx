import { useState } from 'react';
import { useT } from '@/lib/i18n';
import { VERDICT_BADGE_VARIANT } from '@/lib/verdict';
import type { MessageKey } from '@/lib/i18n';
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
// Baseline definitions (key-only — labels from i18n)
// ============================================================

interface BaselineDef {
  readonly key: string;
  /** POST /api/v1/hypothesize mode parameter */
  readonly mode: 'full' | 'quick';
  /** Prefixed to researchInput to identify the baseline server-side */
  readonly researchInputPrefix: string;
}

const BASELINES: readonly BaselineDef[] = [
  { key: 'random', mode: 'quick', researchInputPrefix: '[Random Baseline] ' },
  { key: 'search', mode: 'quick', researchInputPrefix: '[Search Baseline] ' },
  { key: 'direct-llm', mode: 'quick', researchInputPrefix: '[Direct LLM] ' },
  { key: 'far-chain', mode: 'full', researchInputPrefix: '' },
];

// ============================================================
// Capability matrix — 方法定义层面的真实定性能力差异
// ============================================================

interface CapabilityDim {
  readonly key: string;
}

const CAPABILITY_DIMENSIONS: readonly CapabilityDim[] = [
  { key: 'evidenceRetrieval' },
  { key: 'structuredChain' },
  { key: 'singlePassReasoning' },
  { key: 'falsificationSpec' },
  { key: 'reproducibleHash' },
  { key: 'gatedVerdict' },
];

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
// i18n key lookup helpers (MessageKey-typed for type safety)
// ============================================================

const BASELINE_LABEL: Record<string, MessageKey> = {
  random: 'ablation.baseline.random',
  search: 'ablation.baseline.search',
  'direct-llm': 'ablation.baseline.direct-llm',
  'far-chain': 'ablation.baseline.far-chain',
};

const BASELINE_DESC: Record<string, MessageKey> = {
  random: 'ablation.baseline.random.desc',
  search: 'ablation.baseline.search.desc',
  'direct-llm': 'ablation.baseline.direct-llm.desc',
  'far-chain': 'ablation.baseline.far-chain.desc',
};

const CAP_LABEL: Record<string, MessageKey> = {
  evidenceRetrieval: 'ablation.cap.evidenceRetrieval',
  structuredChain: 'ablation.cap.structuredChain',
  singlePassReasoning: 'ablation.cap.singlePassReasoning',
  falsificationSpec: 'ablation.cap.falsificationSpec',
  reproducibleHash: 'ablation.cap.reproducibleHash',
  gatedVerdict: 'ablation.cap.gatedVerdict',
};

const CAP_DESC: Record<string, MessageKey> = {
  evidenceRetrieval: 'ablation.cap.evidenceRetrieval.desc',
  structuredChain: 'ablation.cap.structuredChain.desc',
  singlePassReasoning: 'ablation.cap.singlePassReasoning.desc',
  falsificationSpec: 'ablation.cap.falsificationSpec.desc',
  reproducibleHash: 'ablation.cap.reproducibleHash.desc',
  gatedVerdict: 'ablation.cap.gatedVerdict.desc',
};

type TerminationReason = LoopState['terminationReason'];

const TERM_MSG: Record<TerminationReason, MessageKey> = {
  feedback_converged: 'ablation.term.converged',
  max_iterations: 'ablation.term.max_iterations',
  max_tokens: 'ablation.term.max_tokens',
  max_duration: 'ablation.term.max_duration',
  error: 'ablation.term.error',
};

const VERDICT_MSG: Record<VerdictValue, MessageKey> = {
  CONFIRMED: 'ablation.verdict.CONFIRMED',
  REFUTED: 'ablation.verdict.REFUTED',
  INCONCLUSIVE: 'ablation.verdict.INCONCLUSIVE',
  DEGRADED_SCOPE: 'ablation.verdict.DEGRADED_SCOPE',
  UNTESTED: 'ablation.verdict.UNTESTED',
};

// ============================================================
// Verdict visual mapping (variant only — labels from i18n)
// ============================================================


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

function terminationVariant(reason: TerminationReason): 'success' | 'destructive' | 'secondary' {
  if (reason === 'feedback_converged') return 'success';
  if (reason === 'error') return 'destructive';
  return 'secondary';
}

// ============================================================
// Page component
// ============================================================

export default function AblationPage() {
  const t = useT();
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
        <h1 className="text-3xl font-bold tracking-tight">{t('ablation.title')}</h1>
        <p className="mt-1 text-muted-foreground">
          {t('ablation.subtitle')}
        </p>
      </header>

      {/* ---- Input section ---- */}
      <Card data-testid="ablation-input-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5" aria-hidden="true" />
            <CardTitle className="text-lg">{t('ablation.inputTitle')}</CardTitle>
          </div>
          <CardDescription>
            {t('ablation.inputDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <textarea
              className="w-full min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={t('ablation.placeholder')}
              value={researchInput}
              onChange={(e) => {
                setResearchInput(e.target.value);
              }}
              disabled={isRunning}
              aria-label={t('ablation.inputAria')}
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
                aria-label={t('ablation.runAria')}
              >
                {isRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    {t('ablation.running')}
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" aria-hidden="true" />
                    {t('ablation.runBtn')}
                  </>
                )}
              </Button>
              <span className="text-xs text-muted-foreground">
                {isRunning ? t('ablation.runHintRunning') : t('ablation.runHintIdle')}
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
          {t('ablation.resultsHeading')}
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
            {t('ablation.comparisonHeading')}
          </h2>
          <Card data-testid="comparison-table">
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('ablation.col.baseline')}</TableHead>
                    <TableHead>{t('ablation.col.runId')}</TableHead>
                    <TableHead>{t('ablation.col.iterations')}</TableHead>
                    <TableHead>{t('ablation.col.termination')}</TableHead>
                    <TableHead>{t('ablation.col.verdict')}</TableHead>
                    <TableHead>{t('ablation.col.metric')}</TableHead>
                    <TableHead>{t('ablation.col.reproHash')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {BASELINES.map((baseline, i) => {
                    const r = results[i];
                    if (r.status === 'idle' || r.status === 'loading') return null;
                    if (r.status === 'error') {
                      return (
                        <TableRow key={baseline.key} data-testid={`row-${baseline.key}-error`}>
                          <TableCell className="font-medium">{t(BASELINE_LABEL[baseline.key])}</TableCell>
                          <TableCell colSpan={6}>
                            <span className="text-destructive text-sm">
                              {t('ablation.reqFailed', { msg: r.error ?? '' })}
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
                        <TableCell className="font-medium">{t(BASELINE_LABEL[baseline.key])}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {d.loopState.runId}
                        </TableCell>
                        <TableCell>{d.loopState.iterationsCompleted}</TableCell>
                        <TableCell>
                          <Badge variant={terminationVariant(d.loopState.terminationReason)}>
                            {t(TERM_MSG[d.loopState.terminationReason])}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {verdictValue ? (
                            <Badge variant={VERDICT_BADGE_VARIANT[verdictValue]}>
                              {t(VERDICT_MSG[verdictValue])}
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
            {t('ablation.chartsHeading')}
          </h2>
          <div className="space-y-6" data-testid="ablation-charts">
            {/* Iteration comparison */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" aria-hidden="true" />
                  <CardTitle className="text-lg">{t('ablation.chart.iterTitle')}</CardTitle>
                </div>
                <CardDescription>
                  {t('ablation.chart.iterDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <IterationBarChart
                  data={BASELINES.map((b, i) => ({
                    key: b.key,
                    label: t(BASELINE_LABEL[b.key]),
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
                  <CardTitle className="text-lg">{t('ablation.chart.metricTitle')}</CardTitle>
                </div>
                <CardDescription>
                  {t('ablation.chart.metricDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MetricBarChart
                  data={BASELINES.map((b, i) => ({
                    key: b.key,
                    label: t(BASELINE_LABEL[b.key]),
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
                  <CardTitle className="text-lg">{t('ablation.chart.verdictTitle')}</CardTitle>
                </div>
                <CardDescription>
                  {t('ablation.chart.verdictDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <VerdictDistChart
                  data={BASELINES.map((b, i) => ({
                    key: b.key,
                    label: t(BASELINE_LABEL[b.key]),
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
                  <CardTitle className="text-lg">{t('ablation.chart.falsTitle')}</CardTitle>
                </div>
                <CardDescription>
                  {t('ablation.chart.falsDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FalsifiabilityChart
                  data={BASELINES.map((b, i) => ({
                    key: b.key,
                    label: t(BASELINE_LABEL[b.key]),
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

      {/* ---- Summary: FAR-Lab advantages ---- */}
      {allComplete && hasAnyResult && (
        <section aria-labelledby="summary-heading">
          <h2 id="summary-heading" className="mb-4 text-xl font-semibold">
            {t('ablation.summaryHeading')}
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {t('ablation.summaryIntro')}
          </p>
          <div className="grid gap-4 md:grid-cols-3" data-testid="advantage-cards">
            {/* Auditability */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Eye className="h-5 w-5" aria-hidden="true" />
                  <CardTitle className="text-lg">{t('ablation.adv.auditTitle')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t('ablation.adv.auditBody')}
                </p>
                {farChainResult?.status === 'success' && farChainResult.data !== null && (
                  <div className="rounded bg-muted px-3 py-2">
                    <span className="text-xs text-muted-foreground">{t('ablation.adv.reproHashLabel')}</span>
                    <code className="text-xs font-mono">
                      {truncateHash(farChainResult.data.reproHash, 16)}
                    </code>
                  </div>
                )}
                <ul className="space-y-1 text-sm text-muted-foreground list-disc list-inside">
                  {otherBaselines.map((b, j) => (
                    <li key={b.key}>
                      {t(BASELINE_LABEL[b.key])}: {otherResults[j]?.status === 'success' ? t('ablation.adv.noChain') : '—'}
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
                  <CardTitle className="text-lg">{t('ablation.adv.reproTitle')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t('ablation.adv.reproBody')}
                </p>
                {farChainResult?.status === 'success' && farChainResult.data !== null && (
                  <div className="rounded bg-muted px-3 py-2">
                    <span className="text-xs text-muted-foreground">{t('ablation.adv.verdictLabel')}</span>
                    <Badge
                      variant={
                        farChainResult.data.honestVerdict?.verdict
                          ? VERDICT_BADGE_VARIANT[farChainResult.data.honestVerdict.verdict]
                          : farChainResult.data.loopState.verdictNode?.verdict
                            ? VERDICT_BADGE_VARIANT[farChainResult.data.loopState.verdictNode.verdict]
                            : 'outline'
                      }
                    >
                      {farChainResult.data.honestVerdict?.verdict
                        ? t(VERDICT_MSG[farChainResult.data.honestVerdict.verdict])
                        : farChainResult.data.loopState.verdictNode?.verdict
                          ? t(VERDICT_MSG[farChainResult.data.loopState.verdictNode.verdict])
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
                  <CardTitle className="text-lg">{t('ablation.adv.falsTitle')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t('ablation.adv.falsBody')}
                </p>
                {farChainResult?.status === 'success' && farChainResult.data !== null && (
                  <div className="rounded bg-muted px-3 py-2">
                    <span className="text-xs text-muted-foreground">
                      {t('ablation.adv.iterLabel', { n: farChainResult.data.loopState.iterationsCompleted })}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {' · '}{t('ablation.adv.termSuffix', { label: t(TERM_MSG[farChainResult.data.loopState.terminationReason]) })}
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
          <AlertTitle>{t('ablation.allErrorTitle')}</AlertTitle>
          <AlertDescription>
            {t('ablation.allErrorDesc')}
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
  const t = useT();
  return (
    <Alert data-testid="ablation-honesty-wall" className="border-warning/40 bg-warning/5">
      <ShieldAlert className="h-4 w-4 text-warning" aria-hidden="true" />
      <AlertTitle>{t('ablation.honestyTitle')}</AlertTitle>
      <AlertDescription className="space-y-2 text-sm">
        <p>{t('ablation.honestyP1')}</p>
        <p>{t('ablation.honestyP2')}</p>
        <p>{t('ablation.honestyP3')}</p>
        <p>{t('ablation.honestyP4')}</p>
      </AlertDescription>
    </Alert>
  );
}

// ---- Capability matrix (方法定义层面的真实定性能力对比) ----
function CapabilityMatrixSection() {
  const t = useT();
  return (
    <section
      aria-labelledby="capability-matrix-heading"
      data-testid="ablation-capability-matrix"
    >
      <h2 id="capability-matrix-heading" className="mb-4 text-xl font-semibold">
        {t('ablation.matrixHeading')}
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          {t('ablation.matrixSub')}
        </span>
      </h2>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('ablation.matrixColCap')}</TableHead>
                {BASELINES.map((b) => (
                  <TableHead key={b.key} className="text-center">
                    {t(BASELINE_LABEL[b.key])}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {CAPABILITY_DIMENSIONS.map((dim) => (
                <TableRow key={dim.key}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{t(CAP_LABEL[dim.key])}</span>
                      <span className="text-xs text-muted-foreground">{t(CAP_DESC[dim.key])}</span>
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
                          <span className="inline-flex items-center justify-center text-success">
                            <CheckCircle2 className="h-5 w-5" aria-label={t('ablation.capYesAria')} />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center text-muted-foreground">
                            <XCircle className="h-5 w-5" aria-label={t('ablation.capNoAria')} />
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
  const t = useT();
  return (
    <Card
      data-testid={`baseline-card-${baseline.key}`}
      className={isFarChain ? 'border-primary/50 ring-1 ring-primary/20' : ''}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{t(BASELINE_LABEL[baseline.key])}</CardTitle>
            {isFarChain && (
              <Badge variant="default" className="text-xs">
                {t('ablation.full')}
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>{t(BASELINE_DESC[baseline.key])}</CardDescription>
      </CardHeader>
      <CardContent>
        {result.status === 'idle' && (
          <p className="text-sm text-muted-foreground" data-testid={`baseline-idle-${baseline.key}`}>
            {t('ablation.idle')}
          </p>
        )}
        {result.status === 'loading' && (
          <div
            className="flex items-center gap-2 text-sm text-muted-foreground"
            data-testid={`baseline-loading-${baseline.key}`}
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t('ablation.loadingBaseline')}
          </div>
        )}
        {result.status === 'error' && (
          <Alert variant="destructive" className="text-xs">
            <AlertTriangle className="h-3 w-3" />
            <AlertTitle className="text-xs">{t('ablation.runFailTitle')}</AlertTitle>
            <AlertDescription className="text-xs">{result.error}</AlertDescription>
          </Alert>
        )}
        {result.status === 'success' && result.data !== null && (
          <dl
            className="space-y-2 text-sm"
            data-testid={`baseline-result-${baseline.key}`}
          >
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t('ablation.cardRunId')}</dt>
              <dd>
                <code className="font-mono text-xs">{result.data.loopState.runId}</code>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t('ablation.cardIterations')}</dt>
              <dd>{result.data.loopState.iterationsCompleted}</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-muted-foreground">{t('ablation.cardTermination')}</dt>
              <dd>
                <Badge variant={terminationVariant(result.data.loopState.terminationReason)}>
                  {t(TERM_MSG[result.data.loopState.terminationReason])}
                </Badge>
              </dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-muted-foreground">{t('ablation.cardVerdict')}</dt>
              <dd>
                {(() => {
                  const v =
                    result.data.loopState.verdictNode?.verdict ??
                    result.data.honestVerdict?.verdict;
                  return v ? (
                    <Badge variant={VERDICT_BADGE_VARIANT[v]}>
                      {t(VERDICT_MSG[v])}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">{'—'}</span>
                  );
                })()}
              </dd>
            </div>
            {result.data.loopState.verdictNode?.metricValue != null && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('ablation.cardMetric')}</dt>
                <dd>
                  <code className="font-mono text-xs">
                    {result.data.loopState.verdictNode.metricValue.toFixed(4)}
                  </code>
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t('ablation.cardReproHash')}</dt>
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
