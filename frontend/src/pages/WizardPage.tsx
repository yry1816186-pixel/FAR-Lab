/**
 * WizardPage — guided end-to-end claim verification journey.
 *
 * Design goal: a competition judge can go from "I have a scientific question" to
 * "I hold a tamper-evident proof of the verdict" in under 90 seconds, seeing every
 * stage of the deterministic R0-R9 pipeline along the way.
 *
 * 4 steps:
 *   1. Input  — type a scientific claim (or pick a preset)
 *   2. Pipeline— watch the 6-stage agent loop execute (understanding → verdict)
 *   3. Verdict— see the five-value decision + decisive rule + statistical report
 *   4. Proof  — the .far-proof bundle hash + how to independently recompute it
 *
 * This page uses the REAL /api/v1/hypothesize endpoint (no fixtures). The offline
 * demo backend returns a fully structured loopState so this works without API keys.
 */

import { useState, useCallback } from 'react';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  FlaskConical,
  Hash,
  ShieldCheck,
  Search,
  Beaker,
  Scale,
  Gavel,
  PackageCheck,
  Copy,
  Check,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VerdictBadge } from '@/components/VerdictBadge';
import { cn } from '@/lib/utils';
import { useTimeout } from '@/lib/useTimeout';
import { useHypothesize } from '@/lib/api_client';
import type { VerdictValue } from '@/lib/types';

// ---------- Types (mirrors API response shape, kept minimal) ----------

interface StageArtifact {
  readonly stageId: string;
  readonly payloadKind: string;
  readonly structured: Record<string, unknown>;
}

interface LoopState {
  readonly runId: string;
  readonly iterationsCompleted: number;
  readonly terminated: boolean;
  readonly terminationReason: string;
  readonly artifacts: readonly StageArtifact[];
}

interface HonestVerdict {
  readonly verdictId: string;
  readonly verdict: string;
  readonly falsificationSpec?: { prediction?: string; metric?: string; falsificationThreshold?: number };
  readonly metricValue?: number;
  readonly verdictTrace?: string;
  readonly untestedReason?: string | null;
}

interface GraphNode {
  readonly id: string;
  readonly label?: string;
  readonly verdict?: string;
}

interface GraphSubtree {
  readonly rootId: string;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly { source: string; target: string }[];
}

interface HypothesizeResult {
  readonly loopState: LoopState;
  readonly graphSubtree: GraphSubtree;
  readonly honestVerdict: HonestVerdict | null;
  readonly reproHash: string;
}

// ---------- Wizard step definitions ----------

type WizardStep = 0 | 1 | 2 | 3;

const STEP_LABELS = ['Input', 'Pipeline', 'Verdict', 'Proof'] as const;
const STEP_ICONS = [Lightbulb, Beaker, Gavel, PackageCheck] as const;

// ---------- Preset claims (real scientific questions) ----------

const PRESET_CLAIMS: readonly { label: string; text: string }[] = [
  {
    label: 'Catalysis',
    text: 'Does catalyst X achieve higher CO2 reduction efficiency than catalyst Y under identical conditions?',
  },
  {
    label: 'Astronomy',
    text: 'Does the TESS lightcurve of TIC 268644982 exhibit a transit-like periodic signal consistent with an exoplanet?',
  },
  {
    label: 'ML benchmark',
    text: 'Does model A achieve mean per-run accuracy >= 0.72 on MMLU-physics held-out split?',
  },
];

const DEFAULT_CLAIM = PRESET_CLAIMS[0].text;

// ---------- Stage metadata for pipeline visualization ----------

const STAGE_META: readonly { id: string; icon: typeof Search; label: string; desc: string }[] = [
  { id: 'stage1_understanding', icon: Search, label: 'Understanding', desc: 'Parse the research question + scope' },
  { id: 'stage2_integration', icon: FlaskConical, label: 'Integration', desc: 'Retrieve + integrate domain knowledge' },
  { id: 'stage3_hypothesis', icon: Lightbulb, label: 'Hypothesis', desc: 'Generate a falsifiable claim (FEC)' },
  { id: 'stage4_evidence', icon: Beaker, label: 'Evidence', desc: 'Run the falsification experiment' },
  { id: 'stage5_plan', icon: Scale, label: 'Plan', desc: 'Statistical analysis plan (α, power)' },
  { id: 'stage6_feedback', icon: Gavel, label: 'Verdict', desc: 'R0-R9 deterministic kernel rules' },
];

// ---------- Helper: extract a human-readable field from a structured artifact ----------

function extractField(artifact: StageArtifact, ...keys: string[]): string {
  const s = artifact.structured;
  for (const k of keys) {
    const v = s[k];
    if (typeof v === 'string' && v.length > 0) return v;
    if (typeof v === 'number') return String(v);
  }
  return '—';
}

// ---------- Main component ----------

export default function WizardPage(): JSX.Element {
  const [step, setStep] = useState<WizardStep>(0);
  const [claim, setClaim] = useState<string>(DEFAULT_CLAIM);
  const [result, setResult] = useState<HypothesizeResult | null>(null);
  const [copied, setCopied] = useState(false);

  const hypothesize = useHypothesize();
  const schedule = useTimeout();

  const runVerification = useCallback(async () => {
    setResult(null);
    setStep(1);
    try {
      const data = await hypothesize.mutateAsync({
        researchInput: claim,
        mode: 'quick',
      });
      setResult(data as unknown as HypothesizeResult);
      // auto-advance to verdict step after a brief delay so user sees the pipeline
      schedule(() => setStep(2), 1500);
    } catch {
      // error is surfaced via hypothesize.error below
    }
  }, [claim, hypothesize, schedule]);

  const reset = useCallback(() => {
    setStep(0);
    setResult(null);
    setClaim(DEFAULT_CLAIM);
    hypothesize.reset();
  }, [hypothesize]);

  const copyReproHash = useCallback(() => {
    if (result?.reproHash) {
      void navigator.clipboard.writeText(result.reproHash);
      setCopied(true);
      schedule(() => setCopied(false), 2000);
    }
  }, [result, schedule]);

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="wizard-page">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Sparkles className="h-6 w-6 text-primary" aria-hidden="true" />
          Verification Wizard
        </h1>
        <p className="text-sm text-muted-foreground">
          From a scientific question to a tamper-evident proof in 90 seconds — powered by the deterministic R0-R9 kernel.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-between rounded-lg border bg-card p-4">
        {STEP_LABELS.map((label, i) => {
          const Icon = STEP_ICONS[i];
          const isActive = step === i;
          const isDone = step > i;
          return (
            <div key={label} className="flex flex-1 items-center">
              <button
                type="button"
                onClick={() => i <= step && setStep(i as WizardStep)}
                disabled={i > step}
                className={cn(
                  'flex items-center gap-2 text-sm font-medium transition-colors',
                  isActive ? 'text-primary' : isDone ? 'text-primary/70' : 'text-muted-foreground/50',
                  i <= step && 'cursor-pointer',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs',
                    isActive ? 'border-primary bg-primary text-primary-foreground' : isDone ? 'border-primary/50 text-primary/70' : 'border-muted',
                  )}
                >
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
                </span>
                <span className="hidden sm:inline">{label}</span>
              </button>
              {i < STEP_LABELS.length - 1 && <div className={cn('mx-2 h-px flex-1', isDone ? 'bg-primary/30' : 'bg-border')} />}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      {/* STEP 0: Input */}
      {step === 0 && (
        <Card data-testid="wizard-step-input">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Lightbulb className="h-5 w-5 text-primary" />Step 1 — Your scientific question</CardTitle>
            <CardDescription>Type a claim or pick a preset. FAR-Lab will build a falsifiable hypothesis and run the deterministic kernel.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="wizard-claim" className="text-sm font-medium">Research question / claim</label>
              <textarea
                id="wizard-claim"
                value={claim}
                onChange={(e) => setClaim(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="e.g. Does catalyst X achieve higher CO2 reduction efficiency than catalyst Y?"
                data-testid="wizard-claim-input"
              />
              <p className="text-xs text-muted-foreground">{claim.length}/2000 characters</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Or pick a preset:</p>
              <div className="flex flex-wrap gap-2">
                {PRESET_CLAIMS.map((p) => (
                  <Button
                    key={p.label}
                    variant={claim === p.text ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setClaim(p.text)}
                    data-testid={`wizard-preset-${p.label.toLowerCase()}`}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
            <Button
              onClick={runVerification}
              disabled={claim.trim().length === 0 || hypothesize.isPending}
              className="w-full"
              size="lg"
              data-testid="wizard-run"
            >
              {hypothesize.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Run verification
            </Button>
          </CardContent>
        </Card>
      )}

      {/* STEP 1: Pipeline */}
      {step === 1 && (
        <Card data-testid="wizard-step-pipeline">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Beaker className="h-5 w-5 text-primary" />Step 2 — Deterministic pipeline</CardTitle>
            <CardDescription>
              {hypothesize.isPending
                ? 'Running the 6-stage agent loop…'
                : result
                  ? `Completed in ${result.loopState.iterationsCompleted} iteration — reason: ${result.loopState.terminationReason}`
                  : 'Waiting for results…'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {STAGE_META.map((stage, i) => {
                const artifact = result?.loopState.artifacts.find((a) => a.stageId === stage.id);
                const done = artifact !== undefined;
                const active = hypothesize.isPending && !done && (i === 0 || result?.loopState.artifacts[i - 1] !== undefined);
                const Icon = stage.icon;
                return (
                  <div
                    key={stage.id}
                    className={cn(
                      'flex items-start gap-3 rounded-lg border p-3 transition-colors',
                      done ? 'border-primary/30 bg-primary/5' : active ? 'border-primary animate-pulse' : 'border-border opacity-50',
                    )}
                  >
                    <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', done ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                      {done ? <CheckCircle2 className="h-4 w-4" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{stage.label} <span className="text-xs text-muted-foreground font-normal">— {stage.desc}</span></p>
                      {done && (
                        <p className="mt-1 truncate text-xs text-muted-foreground" data-testid={`wizard-stage-${stage.id}`}>
                          {stage.id === 'stage3_hypothesis' && extractField(artifact, 'prediction')}
                          {stage.id === 'stage4_evidence' && extractField(artifact, 'measurementSummary', 'result')}
                          {stage.id === 'stage6_feedback' && extractField(artifact, 'decision', 'verdict')}
                          {!['stage3_hypothesis', 'stage4_evidence', 'stage6_feedback'].includes(stage.id) && extractField(artifact, 'problemStatement', 'scope', 'summary')}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {result && (
              <Button onClick={() => setStep(2)} className="mt-4 w-full" size="lg">
                See verdict <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* STEP 2: Verdict */}
      {step === 2 && result && (
        <Card data-testid="wizard-step-verdict">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Gavel className="h-5 w-5 text-primary" />Step 3 — Kernel verdict</CardTitle>
            <CardDescription>The R0-R9 deterministic rule tree has reached a decision.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.honestVerdict ? (
              <>
                <div className="flex items-center justify-between rounded-lg border bg-card p-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Machine verdict</p>
                    <VerdictBadge decision={result.honestVerdict.verdict as VerdictValue} />
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Run ID</p>
                    <p className="font-mono text-xs" title={result.loopState.runId}>{result.loopState.runId.slice(0, 16)}…</p>
                  </div>
                </div>
                {result.honestVerdict.falsificationSpec && (
                  <div className="space-y-1 rounded-lg border p-3">
                    <p className="text-xs font-medium text-muted-foreground">Falsifiable hypothesis</p>
                    <p className="text-sm">{result.honestVerdict.falsificationSpec.prediction ?? '—'}</p>
                    {result.honestVerdict.falsificationSpec.metric && (
                      <p className="text-xs text-muted-foreground">
                        Metric: <code className="rounded bg-muted px-1">{result.honestVerdict.falsificationSpec.metric}</code>
                        {typeof result.honestVerdict.falsificationSpec.falsificationThreshold === 'number' && (
                          <> · threshold ≥ {result.honestVerdict.falsificationSpec.falsificationThreshold}</>
                        )}
                        {typeof result.honestVerdict.metricValue === 'number' && (
                          <> · observed = {result.honestVerdict.metricValue.toFixed(4)}</>
                        )}
                      </p>
                    )}
                  </div>
                )}
                {result.honestVerdict.untestedReason && (
                  <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
                    <p className="text-sm">
                      <span className="font-medium">Honest downgrade:</span> {result.honestVerdict.untestedReason}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4" /> No verdict node was produced (the pipeline may not have reached the verdict stage).
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
              <Button onClick={() => setStep(3)} className="flex-1">See proof <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: Proof */}
      {step === 3 && result && (
        <Card data-testid="wizard-step-proof">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><PackageCheck className="h-5 w-5 text-primary" />Step 4 — Tamper-evident proof</CardTitle>
            <CardDescription>This verdict is sealed in a content-addressed .far-proof bundle. Anyone can independently recompute it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 rounded-lg border bg-card p-4">
              <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Hash className="h-3.5 w-3.5" />Reproducibility hash (reproHash)</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs" data-testid="wizard-repro-hash">{result.reproHash}</code>
                <Button variant="outline" size="icon" onClick={copyReproHash} data-testid="wizard-copy-hash">
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" />Hash chain</div>
                <p className="mt-1 text-sm">SHA-256 linked evidence log</p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Scale className="h-3.5 w-3.5" />Deterministic</div>
                <p className="mt-1 text-sm">Same input → same hash</p>
              </div>
            </div>
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium text-blue-700 dark:text-blue-400">
                <CheckCircle2 className="h-4 w-4" />How to independently verify
              </p>
              <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs"><code>{`# Export the proof bundle
far export far-proof --run-id ${result.loopState.runId.slice(0, 16)}

# Anyone can recompute (no API keys needed)
far verify --bundle .far-proof`}</code></pre>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
              <Button onClick={reset} className="flex-1"><RotateCcw className="mr-2 h-4 w-4" />Start over</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error display */}
      {hypothesize.isError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-4" data-testid="wizard-error">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">Verification failed</p>
            <p className="mt-1 text-xs text-muted-foreground">{hypothesize.error?.message ?? 'Unknown error'}</p>
            <Button variant="outline" size="sm" onClick={reset} className="mt-2">Try again</Button>
          </div>
        </div>
      )}
    </div>
  );
}
