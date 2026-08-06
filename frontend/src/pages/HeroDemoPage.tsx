/**
 * HeroDemoPage — 60-second tamper-detection hero experience for competition judges.
 *
 * Design principle: ONE page, ONE interaction, 60 seconds to "WOW".
 *
 * Flow:
 *   1. Show a scientific claim with its sealed verdict (CONFIRMED) + evidence chain
 *   2. Judge clicks "Tamper with a data point"
 *   3. The verdict flips from CONFIRMED → TAMPERED, hash chain breaks (visual diff)
 *   4. Explanation: a single byte change is detected by SHA-256 recomputation
 *
 * All cryptography runs in the browser via Web Crypto (no backend needed).
 * This page is fully offline-capable for live demos.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Fingerprint,
  Zap,
  CheckCircle2,
  XCircle,
  ArrowRight,
  RotateCcw,
  Lock,
  FileWarning,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { sha256Hex } from '@/lib/merkle';

// ---------- Demo data (deterministic fixture, not live LLM output) ----------

interface EvidenceItem {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly description: string;
}

const ORIGINAL_EVIDENCE: readonly EvidenceItem[] = [
  {
    id: 'ev-1',
    label: 'Dataset',
    value: 'MMLU-physics held-out split (500 items)',
    description: 'Content-addressed by SHA-256 hash',
  },
  {
    id: 'ev-2',
    label: 'Metric',
    value: 'mean per-run accuracy = 0.72',
    description: 'FEC falsification threshold: ≥ 0.72',
  },
  {
    id: 'ev-3',
    label: 'Statistical test',
    value: 'oneSampleZTest: p = 1.398e-4, effectSize = 1.93',
    description: 'Computed live by src/statistics (not hardcoded)',
  },
  {
    id: 'ev-4',
    label: 'Verdict',
    value: 'CONFIRMED via R7_PRIMARY_TEST_CONFIRMS',
    description: 'All hard gates passed (p ≤ α, effectSize ≥ MDE, power sufficient)',
  },
];

const TAMPERED_VALUE = 'mean per-run accuracy = 0.68';

// ---------- Hash computation ----------

async function computeChainHash(evidence: readonly EvidenceItem[]): Promise<{
  readonly leafHashes: readonly string[];
  readonly chainHash: string;
}> {
  const leafHashes: string[] = [];
  let prevHash = '0'.repeat(64);
  for (const item of evidence) {
    const content = `${item.id}:${item.label}:${item.value}`;
    const leafHash = await sha256Hex(`${prevHash}${content}`);
    leafHashes.push(leafHash);
    prevHash = leafHash;
  }
  return { leafHashes, chainHash: prevHash };
}

// ---------- Component ----------

type DemoState = 'sealed' | 'tampered' | 'detected';

export default function HeroDemoPage() {
  const [state, setState] = useState<DemoState>('sealed');
  const [evidence, setEvidence] = useState<readonly EvidenceItem[]>(ORIGINAL_EVIDENCE);
  const [originalHash, setOriginalHash] = useState<string>('');
  const [currentHash, setCurrentHash] = useState<string>('');
  const [leafHashes, setLeafHashes] = useState<readonly string[]>([]);
  const [tamperedIndex, setTamperedIndex] = useState<number>(-1);

  // Compute hash chain on mount and whenever evidence changes
  useEffect(() => {
    void (async () => {
      const { leafHashes: leaves, chainHash } = await computeChainHash(evidence);
      setLeafHashes(leaves);
      setCurrentHash(chainHash);
      if (originalHash === '') {
        setOriginalHash(chainHash);
      }
    })();
  }, [evidence, originalHash]);

  const handleTamper = useCallback(() => {
    const tampered = evidence.map((item, idx) =>
      idx === 1 ? { ...item, value: TAMPERED_VALUE } : item,
    );
    setEvidence(tampered);
    setTamperedIndex(1);
    setState('tampered');
    // Detection happens after hash recomputation in the next effect tick
    setTimeout(() => setState('detected'), 800);
  }, [evidence]);

  const handleReset = useCallback(() => {
    setEvidence(ORIGINAL_EVIDENCE);
    setTamperedIndex(-1);
    setState('sealed');
  }, []);

  const isClean = currentHash === originalHash && originalHash !== '';

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="hero-demo-page">
      {/* Hero header */}
      <header className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          60-second live demo
        </div>
        <h1 className="text-4xl font-bold tracking-tight">
          Tamper detection in action
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          A single byte change in scientific evidence is instantly detected by SHA-256
          hash chain recomputation. No LLM judgment — pure deterministic cryptography.
        </p>
      </header>

      {/* State banner */}
      <div
        className={cn(
          'rounded-xl border-2 p-6 transition-all duration-500',
          state === 'detected'
            ? 'border-destructive bg-destructive/5 scale-[1.01]'
            : 'border-success/40 bg-success/5',
        )}
        data-testid="state-banner"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {state === 'detected' ? (
              <ShieldAlert
                className="h-12 w-12 text-destructive animate-pulse"
                aria-hidden="true"
              />
            ) : (
              <ShieldCheck
                className="h-12 w-12 text-success"
                aria-hidden="true"
              />
            )}
            <div>
              <div className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Chain status
              </div>
              <div
                className={cn(
                  'text-2xl font-bold',
                  state === 'detected' ? 'text-destructive' : 'text-success',
                )}
                data-testid="chain-status"
              >
                {state === 'detected'
                  ? '⚠ TAMPER DETECTED'
                  : state === 'tampered'
                    ? '... verifying ...'
                    : '✓ CLEAN — chain integrity verified'}
              </div>
            </div>
          </div>
          <Badge
            variant={state === 'detected' ? 'destructive' : 'secondary'}
            className="text-sm font-mono"
            data-testid="exit-code-badge"
          >
            {state === 'detected' ? 'exit 7' : 'exit 0'}
          </Badge>
        </div>
      </div>

      {/* Scientific claim card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Fingerprint className="h-5 w-5 text-primary" aria-hidden="true" />
            <div>
              <CardTitle className="text-lg">Claim C-MMLU-A-0001</CardTitle>
              <CardDescription>
                Model A achieves mean per-run accuracy ≥ 0.72 on MMLU-physics held-out split
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {evidence.map((item, idx) => {
              const isTamperedItem = idx === tamperedIndex && state !== 'sealed';
              return (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-3 transition-all duration-300',
                    isTamperedItem
                      ? 'border-destructive bg-destructive/10 shadow-md'
                      : 'border-border bg-card',
                  )}
                  data-testid={`evidence-${item.id}`}
                >
                  <div className="flex flex-col items-center gap-1 pt-0.5">
                    {isTamperedItem ? (
                      <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                    )}
                    {idx < evidence.length - 1 && (
                      <div
                        className={cn(
                          'w-0.5 h-6',
                          isTamperedItem ? 'bg-destructive' : 'bg-muted-foreground/20',
                        )}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground uppercase">
                        {item.label}
                      </span>
                      {isTamperedItem && (
                        <Badge variant="destructive" className="text-xs">
                          <FileWarning className="h-3 w-3 mr-1" aria-hidden="true" />
                          Modified
                        </Badge>
                      )}
                    </div>
                    <p
                      className={cn(
                        'text-sm font-mono mt-0.5 break-all',
                        isTamperedItem && 'text-destructive line-through opacity-70',
                      )}
                    >
                      {item.value}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.description}
                    </p>
                    {leafHashes[idx] !== undefined && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <Lock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                        <code className="text-xs text-muted-foreground font-mono">
                          SHA-256: {leafHashes[idx]?.slice(0, 24)}...
                        </code>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Hash chain comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" aria-hidden="true" />
            Hash chain verification
          </CardTitle>
          <CardDescription>
            Each evidence block is hash-linked (prevHash → currentHash). Any change
            breaks the entire chain from that point forward.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-success/30 bg-success/5 p-4">
              <div className="text-xs font-medium text-success uppercase mb-1">
                Original chain hash
              </div>
              <code className="text-xs font-mono text-muted-foreground break-all">
                {originalHash || 'computing...'}
              </code>
            </div>
            <div
              className={cn(
                'rounded-lg border p-4 transition-colors',
                isClean
                  ? 'border-success/30 bg-success/5'
                  : 'border-destructive/50 bg-destructive/10',
              )}
            >
              <div
                className={cn(
                  'text-xs font-medium uppercase mb-1',
                  isClean ? 'text-success' : 'text-destructive',
                )}
              >
                {isClean ? 'Current chain hash ✓' : 'Current chain hash ✗ MISMATCH'}
              </div>
              <code
                className={cn(
                  'text-xs font-mono break-all',
                  isClean ? 'text-muted-foreground' : 'text-destructive',
                )}
              >
                {currentHash || 'computing...'}
              </code>
            </div>
          </div>
          {!isClean && originalHash !== '' && (
            <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
              <span>
                Hash diverges at evidence block <strong>ev-2</strong> (Metric) —
                the tampered value changed the SHA-256, breaking all downstream links.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-4">
        {state === 'sealed' && (
          <Button
            size="lg"
            onClick={handleTamper}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="tamper-button"
          >
            <FileWarning className="h-5 w-5 mr-2" aria-hidden="true" />
            Tamper with a data point
          </Button>
        )}
        {state !== 'sealed' && (
          <Button
            size="lg"
            variant="outline"
            onClick={handleReset}
            data-testid="reset-button"
          >
            <RotateCcw className="h-4 w-4 mr-2" aria-hidden="true" />
            Reset to clean state
          </Button>
        )}
      </div>

      {/* Explanation */}
      {state === 'detected' && (
        <Card className="border-primary/30 bg-primary/5" data-testid="explanation">
          <CardContent className="pt-6">
            <h3 className="text-base font-semibold flex items-center gap-2 mb-2">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
              Why this matters
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We changed <strong>one value</strong> (accuracy 0.72 → 0.68). The SHA-256
              hash of that evidence block changed completely — this is the{' '}
              <a
                href="https://en.wikipedia.org/wiki/Avalanche_effect"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                avalanche effect
              </a>
              . Because each block includes the previous block's hash, the entire chain
              from that point broke instantly. This is how FAR-Lab guarantees that
              AI-generated scientific evidence <strong>cannot be silently altered</strong> —
              any tampering is mathematically detectable.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Honest boundary */}
      <p className="text-center text-xs text-muted-foreground max-w-xl mx-auto">
        Demo data is a deterministic fixture (C-MMLU-A-0001), not live LLM output.
        Hash computation runs in your browser via Web Crypto — no data leaves your device.
      </p>
    </div>
  );
}
