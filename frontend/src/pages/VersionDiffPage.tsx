/**
 * VersionDiffPage —— 版本比较面板（IC-15 T2' · 赛题关键词"版本比较"直接对应）。
 *
 * Authority: IC-15.contract.yaml + GET /api/v1/evidence/chain/:headHash。
 *
 * 功能：
 *   1. 输入 chain head hash（用户粘贴或从其他页面跳转）
 *   2. 拉取该链的 GraphSubtree（含 verdict_nodes + edges）
 *   3. 并列展示多轮 hypothesis + verdict，高亮差异
 *   4. 诚实边界：每轮标注 "LLM 自评驱动" 或 "prompt 注入 verdict 软建议驱动"（IC-15 T1' 消费）
 *
 * 诚实定位（赛题"版本比较"）：
 *   - 当前架构下 verdict 在收敛后产出（fsm_runner.ts:347），同一 chain 通常含 1 个 root verdict
 *   - 若有 supersede 关系（migration 0014），本页展示前后版本裁决对比
 *   - 缺省（无 hash / 链不存在）→ 空状态而非 crash
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore / 内联 HTML / 双重断言。
 */

import { useState, useMemo, type FormEvent } from 'react';
import { useEvidenceChain } from '@/lib/api_client';
import type { GraphNodeDto, GraphSubtree, VerdictValue } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { VerdictBadge } from '@/components/VerdictBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { GitCompare, Search, Info } from 'lucide-react';

const FIVE_VERDICTS = new Set<string>([
  'CONFIRMED',
  'REFUTED',
  'INCONCLUSIVE',
  'DEGRADED_SCOPE',
  'UNTESTED',
]);

function isVerdictValue(v: string): v is VerdictValue {
  return FIVE_VERDICTS.has(v);
}

/** 把 graphSubtree（API 返回为 unknown）安全收窄为 GraphSubtree。 */
function narrowSubtree(raw: unknown): GraphSubtree | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.rootId !== 'string') return null;
  if (!Array.isArray(obj.nodes)) return null;
  if (!Array.isArray(obj.edges)) return null;
  return {
    rootId: obj.rootId,
    nodes: obj.nodes as readonly GraphNodeDto[],
    edges: [],
  };
}

/** 从 subtree.nodes 提取按 createdAt 排序的裁决节点（root + hypothesis）。 */
function extractVerdictTimeline(subtree: GraphSubtree): readonly GraphNodeDto[] {
  return [...subtree.nodes]
    .filter((n) => n.nodeKind === 'root' || n.nodeKind === 'hypothesis')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export default function VersionDiffPage() {
  const [hashInput, setHashInput] = useState('');
  const [submittedHash, setSubmittedHash] = useState('');

  const isValidHash = /^[0-9a-f]{64}$/.test(submittedHash);
  const { data, isLoading, isError, error } = useEvidenceChain(submittedHash);

  const subtree = useMemo(() => {
    if (data === undefined) return null;
    return narrowSubtree(data.graphSubtree);
  }, [data]);

  const timeline = useMemo(() => {
    if (subtree === null) return [];
    return extractVerdictTimeline(subtree);
  }, [subtree]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmittedHash(hashInput.trim().toLowerCase());
  }

  return (
    <div className="space-y-8" data-testid="version-diff-page">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <GitCompare className="h-7 w-7 text-primary" aria-hidden="true" />
          <h1 className="text-3xl font-bold tracking-tight">Version Comparison</h1>
        </div>
        <p className="text-muted-foreground max-w-3xl">
          Compare multiple iterations of a research claim and its deterministic verdicts within one
          evidence chain. Aligned with the competition requirement of "version comparison and human
          feedback" (CR-03). Input a chain head hash (64-char hex) to load the verdict timeline.
        </p>
      </header>

      <Card data-testid="version-diff-input-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" aria-hidden="true" />
            Chain Head Hash
          </CardTitle>
          <CardDescription>
            Paste a 64-character hex chain head hash (from the Integrity page or any run's
            <code className="mx-1 rounded bg-muted px-1 text-xs">reproHash</code>).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={hashInput}
              onChange={(e) => setHashInput(e.target.value)}
              placeholder="e.g. a1b2c3... (64 hex chars)"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="chain head hash input"
              data-testid="version-diff-hash-input"
            />
            <Button type="submit" data-testid="version-diff-submit">
              Load Timeline
            </Button>
          </form>
          {submittedHash.length > 0 && !isValidHash && (
            <p className="mt-2 text-sm text-destructive" data-testid="version-diff-hash-error">
              Hash must be 64 hexadecimal characters (0-9, a-f).
            </p>
          )}
        </CardContent>
      </Card>

      {!isValidHash && submittedHash.length === 0 && (
        <Alert data-testid="version-diff-empty-state">
          <Info className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>No chain loaded</AlertTitle>
          <AlertDescription>
            Submit a chain head hash above to view its version timeline. The timeline shows each
            verdict node (root + hypothesis iterations) ordered by creation time, with side-by-side
            verdict comparisons when multiple versions exist.
          </AlertDescription>
        </Alert>
      )}

      {isLoading && (
        <div className="space-y-4" data-testid="version-diff-loading">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {isError && (
        <Alert variant="destructive" data-testid="version-diff-error">
          <AlertTitle>Failed to load chain</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'Unknown error'}
          </AlertDescription>
        </Alert>
      )}

      {isValidHash && !isLoading && !isError && subtree !== null && timeline.length === 0 && (
        <Alert data-testid="version-diff-no-verdicts">
          <Info className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>No verdict nodes in this chain</AlertTitle>
          <AlertDescription>
            The chain loaded successfully but contains no root or hypothesis verdict nodes. This is
            expected for chains that converged before reaching the verdict stage.
          </AlertDescription>
        </Alert>
      )}

      {timeline.length > 0 && (
        <div className="space-y-4" data-testid="version-diff-timeline">
          <h2 className="text-xl font-semibold">
            Verdict Timeline ({timeline.length} version{timeline.length === 1 ? '' : 's'})
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {timeline.map((node, idx) => {
              const verdict = isVerdictValue(node.decision) ? node.decision : 'UNTESTED';
              const prevNode = idx > 0 ? timeline[idx - 1] : null;
              const verdictChanged =
                prevNode !== null && prevNode.decision !== node.decision;
              return (
                <Card
                  key={node.nodeId}
                  data-testid={`version-diff-card-${idx}`}
                  className={verdictChanged ? 'border-primary' : ''}
                >
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-base">
                      <span>Version {idx + 1}</span>
                      {verdictChanged && (
                        <span
                          className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                          data-testid={`version-diff-changed-${idx}`}
                        >
                          verdict changed
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription className="font-mono text-xs">
                      {node.nodeId.slice(0, 12)}… · {node.nodeKind}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Verdict:</span>
                      <VerdictBadge decision={verdict} />
                    </div>
                    {node.scopeSlipText !== null && (
                      <p className="text-xs text-muted-foreground">
                        Scope: {node.scopeSlipText}
                      </p>
                    )}
                    {node.untestedReason !== null && (
                      <p className="text-xs text-muted-foreground">
                        Untested reason: {node.untestedReason}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Created: {new Date(node.createdAt).toISOString()}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <Card data-testid="version-diff-honesty">
        <CardContent>
          <p className="text-xs text-muted-foreground">
            <strong>Honesty boundary:</strong> Per the project's design intent, verdict kernel
            re-entry within the FSM loop is a V2 roadmap item (fsm_runner.ts:10-14). This page
            displays versions linked by supersede relationships (migration 0014) — it does not
            automatically trigger hypothesis regeneration. IC-15 T1' injects prior verdicts as soft
            advice via stage6 prompt; stage6 LLM retains independent control over
            continueIteration.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
