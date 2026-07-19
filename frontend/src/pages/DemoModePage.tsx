import { useState, useCallback } from 'react';
import {
  ShieldCheck,
  Eye,
  Repeat,
  ChevronLeft,
  ChevronRight,
  Circle,
  CheckCircle2,
  AlertTriangle,
  Hash,
  Gavel,
  FlaskConical,
  PackageOpen,
  ScrollText,
  Info,
  X,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ---------- 8 幕场景定义 ----------
// demo-03 诚实标注（2026-06-29）：当前 8 幕是「FAR 功能导览子集」——每幕介绍一个概念
// （可信点 + 诚实标注 + 关联页面跳转），非 spec 16 §2 八幕可信链现场演示
// （claim→SciIR→falsification→sandbox→reproHash→verdict→ProofEnvelope→.far-proof 数据流转 +
// 幕6 INCONCLUSIVE 灵魂时刻 + 降级加演幕）。spec 16 完整八幕引导向导 = T-W5-05〔路线图项〕
// （22 T-W5-05 状态 MVP必须实现·待实现）。V1 交付功能导览子集，不声称已实现 spec 16 现场演示。

interface DemoScene {
  /** 幕编号 1-8 */
  readonly act: number;
  /** 幕标题 */
  readonly title: string;
  /** 幕副标题 */
  readonly subtitle: string;
  /** 图标组件 */
  readonly icon: typeof ShieldCheck;
  /** 可信点列表 */
  readonly credibilityPoints: readonly string[];
  /** 诚实标注 */
  readonly honestyNote: string;
  /** 关联页面路径 */
  readonly relatedPath: string;
  /** 关联页面标签 */
  readonly relatedLabel: string;
}

const DEMO_SCENES: readonly DemoScene[] = [
  {
    act: 1,
    title: 'FAR three pillars',
    subtitle: 'Falsifiable · Tamper-Evident · Independently Recomputable',
    icon: ShieldCheck,
    credibilityPoints: [
      'Every scientific claim carries a falsification spec (FalsificationSpec): prediction, metric, falsification threshold, threshold semantics',
      'The whole evidence chain is hash-linked (SHA-256); any tampering is detected instantly — append-only, no deletion or modification',
      'Deterministic replay gate: same input + same model snapshot → same hash; drift is exposed, not hidden',
    ],
    honestyNote:
      'FAR-Chain does not claim absolute scientific truth. It provides a reliability evidence package, not a proof of truth. A CONFIRMED verdict still requires human scientific review; even if every gate passes, it is merely "re-reviewable", not "proven".',
    relatedPath: '/',
    relatedLabel: 'Overview',
  },
  {
    act: 2,
    title: 'Evidence chain',
    subtitle: 'Hash-Linked Evidence Log',
    icon: Hash,
    credibilityPoints: [
      'Each evidence entry is uniquely identified by canonicalHash (fast-json-stable-stringify + SHA-256)',
      'A four-field whitelist (stageId, cred, payloadKind, prevHash) keeps the hash reproducible across languages',
      'The genesis prevHash is hard-coded to all zeros; all evidence chains start from the same anchor and cannot forge a starting point',
    ],
    honestyNote:
      'Cross-language hash alignment (TS ↔ Python) is currently verified via golden_vectors (E4 gate) but does not yet cover every edge case. Integer/float boundaries (N1-N4) still require manual spot-checks for semantic equivalence.',
    relatedPath: '/viz',
    relatedLabel: 'Evidence chain graph',
  },
  {
    act: 3,
    title: '5-value verdict system',
    subtitle: 'CONFIRMED · REFUTED · INCONCLUSIVE · DEGRADED_SCOPE · UNTESTED',
    icon: Gavel,
    credibilityPoints: [
      'The verdict is decided by a deterministic rule tree — no LLM self-evaluation; any LLM-as-judge loop is forbidden',
      'Priority order: DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED',
      'Anti-theater constraint (F1): when a checked conclusion in proof_envelopes contains "WARN", sealing as CONFIRMED is forbidden',
    ],
    honestyNote:
      'A CONFIRMED verdict must meet strict conditions — falsificationSpec passed, sourceAnchor present, reproHash verified, prevProofHash valid, all safety checks PASS. The bar is high; most lab hypotheses stop at INCONCLUSIVE.',
    relatedPath: '/honesty',
    relatedLabel: 'Honesty Wall',
  },
  {
    act: 4,
    title: 'Honesty Wall',
    subtitle: 'HonestyWall · all verdicts public',
    icon: Eye,
    credibilityPoints: [
      'All verdicts are visible in real time, categorized by the 5 values: confirmed, refuted, inconclusive, degraded scope, untested',
      'Each verdict expands to show the full evidence timeline: hash chain, source anchor, falsification threshold, metric value',
      'Paginate through all verdicts without hiding negative results — REFUTED matters as much as CONFIRMED',
    ],
    honestyNote:
      'Honesty Wall data comes from the backend /api/v1/verdict endpoint and is only reachable when running locally. A production deployment needs additional access control and rate limiting. An empty wall means no experiment has run yet, not that data is being hidden.',
    relatedPath: '/honesty',
    relatedLabel: 'Honesty Wall',
  },
  {
    act: 5,
    title: 'Falsifiability contract',
    subtitle: 'Falsifiability Contract · pre-registration · Bonferroni correction',
    icon: ScrollText,
    credibilityPoints: [
      'The pre-registration hash (preregistrationHash) is locked before the experiment: hypothesis → metric → threshold → α = 0.0125',
      'The pseudo-random seed is fixed at 42 (F8 anti-p-hacking) — dynamic seeds are forbidden',
      'Bonferroni correction defaults to applied=1 (single hypothesis) — accumulates automatically for multiple hypotheses',
      'Four auditor rules: has_falsification_spec, has_preregistration_hash, has_evidence_hash_chain, has_sealed_proof_envelope',
    ],
    honestyNote:
      'FalsificationSufficiencyAuditor uses regex heuristics (V1) and does not perform full semantic validation. Rule id 2 (bonferroni_correction_applied) only WARNs rather than FAILs for multiple hypotheses — allowing single-hypothesis scenarios to pass.',
    relatedPath: '/ablation',
    relatedLabel: 'Ablation study',
  },
  {
    act: 6,
    title: 'Ablation study',
    subtitle: 'Ablation Study · component-removal comparison',
    icon: FlaskConical,
    credibilityPoints: [
      'Systematically remove FAR-Chain components and compare output drift, quantifying each component’s information contribution',
      'Ablation matrix: removed vs retained × 6 stages, each cell reporting hash diff and verdict change',
      'The ablation results themselves are protected by the hash chain — ablation output is part of the evidence chain',
    ],
    honestyNote:
      'The ablation study validates a component’s effect on output, not whether it is "necessary". Zero drift does not mean a component is useless — it may only activate under certain inputs (coverage gap). The W1 ablation is framework-level and does not cover every input distribution.',
    relatedPath: '/ablation',
    relatedLabel: 'Ablation study',
  },
  {
    act: 7,
    title: 'Proof bundle export',
    subtitle: '.far-proof · seven-component evidence bundle',
    icon: PackageOpen,
    credibilityPoints: [
      'Seven components + code/MANIFEST.md: ro-crate-metadata.json, prov.ttl, proof_envelopes.jsonl, repro_runs.jsonl, call_records.redacted.jsonl, data_manifest.json, README_REPLAY.md',
      'The export is anchored to gitCommitSha + envHash (fresh-clone replay lock); call_records are redacted (API keys in request/response payloads are stripped)',
      'Real scripts run live: pnpm exec tsx scripts/replay_demo_chain.ts (build the C-ASTRO-0001 proof chain → export → byte-level recompute of proofHash)',
    ],
    honestyNote:
      'The exported RO-Crate and PROV-O files are not claimed to pass third-party validators (W3C PROV validator, RO-Crate validator) — that is a V3 roadmap item, not a W1 deliverable. The redaction policy may miss edge fields; manually spot-check before export.',
    relatedPath: '/report',
    relatedLabel: 'Research report',
  },
  {
    act: 8,
    title: 'Reproduction & audit',
    subtitle: 'Reproducibility · independent verification flow',
    icon: Repeat,
    credibilityPoints: [
      'Three live replay steps (all with real scripts): ci/verify_chain_smoke.ts verifies the hash chain → scripts/recompute_proof_hashes.ts byte-level recomputes proofHash → scripts/replay_demo_chain.ts end-to-end replays C-ASTRO-0001',
      'Golden vectors (8 groups) cover the N1-N4 numeric boundaries and Unicode samples; the cross_lang CI gate verifies both directions',
      'CI pipeline: typecheck → lint → test → cross_lang → anti-theater → model_neutrality → security',
    ],
    honestyNote:
      'Full reproduction requires a locked environment (Node ≥ 24, Python ≥ 3.12, no global-tool drift). Some system-level differences (file-path encoding, OS line endings) may introduce nondeterminism, but the core hash path is normalized to avoid it. W1 does not claim physical process isolation.',
    relatedPath: '/about',
    relatedLabel: 'About',
  },
];

// ---------- 辅助组件 ----------

function CreditPoint({ index, text }: { readonly index: number; readonly text: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <CheckCircle2
        className="mt-0.5 h-4 w-4 shrink-0 text-success"
        aria-hidden="true"
      />
      <span>
        <span className="font-medium text-foreground">Credibility point {index + 1}:</span>{' '}
        <span className="text-muted-foreground">{text}</span>
      </span>
    </li>
  );
}

function HonestyPopover({
  note,
  visible,
  onToggle,
}: {
  readonly note: string;
  readonly visible: boolean;
  readonly onToggle: () => void;
}) {
  if (!visible) return null;
  return (
    <div
      className="relative mt-4 rounded-lg border border-warning/40 bg-warning/5 p-4"
      role="alert"
      data-testid="honesty-popover"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-warning"
            aria-hidden="true"
          />
          <div>
            <h4 className="text-sm font-semibold text-warning-foreground">
              Honesty note
            </h4>
            <p className="mt-1 text-sm text-muted-foreground">{note}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label="Close honesty note"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ---------- 进度指示器 ----------

function ProgressDots({
  total,
  current,
  onGoTo,
}: {
  readonly total: number;
  readonly current: number;
  readonly onGoTo: (index: number) => void;
}) {
  return (
    <nav aria-label="Scene progress" className="flex items-center justify-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <button
          type="button"
          key={i}
          onClick={() => onGoTo(i)}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors',
            i === current
              ? 'bg-primary text-primary-foreground'
              : i < current
                ? 'bg-success/20 text-success-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent',
          )}
          aria-label={`Act ${i + 1}${i === current ? ' (current)' : ''}`}
          aria-current={i === current ? 'step' : undefined}
          data-testid={`progress-dot-${i}`}
        >
          {i < current ? (
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Circle className="h-3 w-3" aria-hidden="true" />
          )}
        </button>
      ))}
    </nav>
  );
}

// ---------- 页面主体 ----------

export default function DemoModePage() {
  const [currentScene, setCurrentScene] = useState(0);
  const [honestyVisible, setHonestyVisible] = useState(false);

  const scene = DEMO_SCENES[currentScene];
  const total = DEMO_SCENES.length;
  const isFirst = currentScene === 0;
  const isLast = currentScene === total - 1;

  const goTo = useCallback((index: number) => {
    setCurrentScene(Math.max(0, Math.min(total - 1, index)));
    setHonestyVisible(false);
  }, [total]);

  const goNext = useCallback(() => {
    if (!isLast) {
      goTo(currentScene + 1);
    }
  }, [currentScene, isLast, goTo]);

  const goPrev = useCallback(() => {
    if (!isFirst) {
      goTo(currentScene - 1);
    }
  }, [currentScene, isFirst, goTo]);

  const Icon = scene.icon;

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="demo-mode-page">
      {/* 页头 */}
      <header className="text-center">
        <div className="flex items-center justify-center gap-2">
          <Info className="h-6 w-6 text-primary" aria-hidden="true" />
          <h1 className="text-3xl font-bold tracking-tight">Demo mode</h1>
        </div>
        <p className="mt-1 text-muted-foreground">
          Demo Mode · 8-act feature tour · each act shows credibility points and an honesty note
        </p>
        <p
          className="mx-auto mt-2 max-w-xl text-xs text-muted-foreground"
          data-testid="demo-v1-scope-note"
        >
          V1 scope: this is a FAR feature-tour subset, not the spec 16 §2 eight-act live trusted-chain demo
          (claim→SciIR→falsification→sandbox→reproHash→verdict→ProofEnvelope→.far-proof).
          The full eight-act guided wizard is T-W5-05 (roadmap item, not V1 deliverable).
        </p>
      </header>

      {/* 进度指示器 */}
      <ProgressDots total={total} current={currentScene} onGoTo={goTo} />

      {/* 当前幕卡片 */}
      <Card data-testid={`scene-card-${currentScene}`}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-mono text-xs">
                  Act {scene.act} / {total}
                </Badge>
              </div>
              <CardTitle className="mt-1 text-xl">{scene.title}</CardTitle>
              <CardDescription className="mt-0.5">{scene.subtitle}</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* 可信点列表 */}
          <section aria-labelledby={`cred-points-${scene.act}`}>
            <h3
              id={`cred-points-${scene.act}`}
              className="mb-3 text-sm font-semibold text-foreground"
            >
              Credibility points
            </h3>
            <ul className="space-y-3" data-testid="credibility-points">
              {scene.credibilityPoints.map((point, i) => (
                <CreditPoint key={i} index={i} text={point} />
              ))}
            </ul>
          </section>

          {/* 诚实标注切换按钮 */}
          {!honestyVisible && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHonestyVisible(true)}
              aria-label="Show honesty note"
              data-testid="show-honesty-btn"
            >
              <AlertTriangle className="mr-2 h-4 w-4 text-warning" aria-hidden="true" />
              View honesty note
            </Button>
          )}

          {/* 诚实标注弹出 */}
          <HonestyPopover
            note={scene.honestyNote}
            visible={honestyVisible}
            onToggle={() => setHonestyVisible(false)}
          />

          {/* 关联页面跳转 */}
          <div className="flex items-center justify-between rounded-md bg-muted/50 px-4 py-3">
            <span className="text-sm text-muted-foreground">
              Related page:
              <span className="ml-1 font-medium text-foreground">{scene.relatedLabel}</span>
            </span>
            <a
              href={scene.relatedPath}
              className="text-sm font-medium text-primary hover:underline"
              data-testid="related-link"
            >
              Go to {scene.relatedLabel} →
            </a>
          </div>
        </CardContent>
      </Card>

      {/* 导航按钮 */}
      <nav
        className="flex items-center justify-between"
        aria-label="Scene navigation"
        data-testid="demo-navigation"
      >
        <Button
          variant="outline"
          onClick={goPrev}
          disabled={isFirst}
          aria-label="Previous act"
          data-testid="prev-scene-btn"
        >
          <ChevronLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          Previous act
        </Button>

        <span className="text-sm text-muted-foreground" data-testid="scene-counter">
          {currentScene + 1} / {total}
        </span>

        <Button
          variant="outline"
          onClick={goNext}
          disabled={isLast}
          aria-label="Next act"
          data-testid="next-scene-btn"
        >
          Next act
          <ChevronRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </Button>
      </nav>
    </div>
  );
}
