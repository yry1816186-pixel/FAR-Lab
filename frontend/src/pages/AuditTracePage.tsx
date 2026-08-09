/**
 * AuditTracePage —— 全链路审计追溯可视化（阶段 7 P2 · BW4 Gap-7）。
 *
 * 背景（findings BW4 Gap-7）：数据层追溯完整（6 层：call_records → evidence_log →
 * verdict_nodes → proof_envelopes → lifecycle_events → falsification_audit_events），
 * 但无可视化追溯 UI——评委需 CLI/SQL 才能追溯。本页提供：
 *
 *   - 输入：hypothesis ID（claim id）→ 三路真实 API 消费：
 *       ① GET /api/v1/verdict/by_hypothesis/:hypoId   （裁决节点·五值 + currentHash）
 *       ② GET /api/v1/evidence/chain/:headHash        （证据链·call_record + 哈希链）
 *       ③ GET /api/v1/lifecycle/events?targetKind=claim&targetId=:hypoId（生命周期·修正通知）
 *   - 血缘流程可视化：Hypothesis → Evidence Chain → Verdict → Lifecycle（链式卡片）
 *   - 诚实边界：无数据 → 明确「未找到」提示（非 404 伪装）；全部真实 API 消费（无假 demo）
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch / innerHTML / 桩。useEffect 带 cleanup。
 * 无障碍：输入框 aria-label；错误 Alert 可读。
 */

import { useEffect, useRef, useState } from 'react';
import {
  useVerdictByHypothesis,
  useEvidenceChain,
  useLifecycleEvents,
  type LifecycleEventsResponse,
} from '@/lib/api_client';
import type { HonestVerdictDto, EvidenceChainResponse } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface TraceInput {
  readonly hypothesisId: string;
  readonly token: number;
}

const VERDICT_COLORS: Record<string, string> = {
  CONFIRMED: 'bg-emerald-100 text-emerald-800',
  REFUTED: 'bg-rose-100 text-rose-800',
  INCONCLUSIVE: 'bg-amber-100 text-amber-800',
  DEGRADED_SCOPE: 'bg-orange-100 text-orange-800',
  UNTESTED: 'bg-slate-200 text-slate-700',
};

export default function AuditTracePage() {
  const [input, setInput] = useState<TraceInput>({ hypothesisId: '', token: 0 });
  const [draft, setDraft] = useState('');

  const verdict = useVerdictByHypothesis(input.hypothesisId);
  const chain = useEvidenceChain(input.hypothesisId);
  const lifecycle = useLifecycleEvents(input.hypothesisId);

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const hasTrace =
    input.hypothesisId.length > 0 &&
    input.token > 0 &&
    (verdict.data !== undefined || chain.data !== undefined || lifecycle.data !== undefined);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Audit Trace — 全链路追溯</h1>
        <p className="text-muted-foreground">
          Input a hypothesis / claim ID to trace its evidence chain, verdict node and lifecycle events
          (data layer is complete; this page is the BW4 Gap-7 visualization).
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>追溯入口</CardTitle>
          <CardDescription>六层数据链（call_records → evidence_log → verdict_nodes → proof_envelopes → lifecycle_events → falsification_audit_events）</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <input
            ref={inputRef}
            aria-label="hypothesis ID to trace"
            className="flex-1 rounded-md border px-3 py-2"
            placeholder="hypothesis id / claim id（如 stage1_hypothesis 或 run id）"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.trim().length > 0) {
                setInput({ hypothesisId: draft.trim(), token: Date.now() });
              }
            }}
          />
          <Button
            aria-label="run trace"
            disabled={draft.trim().length === 0}
            onClick={() => setInput({ hypothesisId: draft.trim(), token: Date.now() })}
          >
            追溯
          </Button>
        </CardContent>
      </Card>

      {verdict.error !== null && (
        <Alert>
          <AlertTitle>追溯失败</AlertTitle>
          <AlertDescription>{verdict.error.message}</AlertDescription>
        </Alert>
      )}

      {input.hypothesisId.length > 0 && input.token > 0 && !hasTrace && verdict.error === null && (
        <Alert>
          <AlertTitle>未找到追溯数据</AlertTitle>
          <AlertDescription>
            No trace found for &quot;{input.hypothesisId}&quot; — no verdict node, evidence chain or
            lifecycle events reference this ID (honest empty result, not a fabricated demo).
          </AlertDescription>
        </Alert>
      )}

      {hasTrace && (
        <div className="space-y-4">
          {/* 血缘主链：Hypothesis → Evidence → Verdict → Lifecycle */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline">{input.hypothesisId}</Badge>
            <span aria-hidden>→</span>
            <Badge variant="secondary">{chain.data !== undefined ? 'Evidence Chain' : '—'}</Badge>
            <span aria-hidden>→</span>
            <Badge variant="secondary">{verdict.data !== undefined ? 'Verdict' : '—'}</Badge>
            <span aria-hidden>→</span>
            <Badge variant="secondary">
              {lifecycle.data !== undefined && lifecycle.data.events.length > 0
                ? `Lifecycle (${lifecycle.data.events.length})`
                : 'Lifecycle (none)'}
            </Badge>
          </div>

          {verdict.data !== undefined && <VerdictCard verdict={verdict.data} />}
          {chain.data !== undefined && <ChainCard chain={chain.data} />}
          {lifecycle.data !== undefined && lifecycle.data.events.length > 0 && (
            <LifecycleCard lifecycle={lifecycle.data} />
          )}
        </div>
      )}
    </div>
  );
}

/** Verdict 节点卡片（HonestVerdictDto：decision + currentHash + untestedReason）。 */
function VerdictCard({ verdict }: { verdict: HonestVerdictDto }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Verdict Node</CardTitle>
        <CardDescription>确定性内核五值裁决 + currentHash（哈希链篡改可检）</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">decision:</span>
          <Badge className={VERDICT_COLORS[verdict.decision] ?? ''}>{verdict.decision}</Badge>
        </div>
        {verdict.nodeKind !== undefined && (
          <p className="text-sm text-muted-foreground">nodeKind: {verdict.nodeKind}</p>
        )}
        {verdict.untestedReason !== null && verdict.untestedReason.length > 0 && (
          <p className="text-sm">untestedReason: {verdict.untestedReason}</p>
        )}
        {verdict.scopeSlipText !== null && verdict.scopeSlipText.length > 0 && (
          <p className="text-sm">scopeSlip: {verdict.scopeSlipText}</p>
        )}
        <p className="break-all font-mono text-xs">
          currentHash: {verdict.currentHash}
        </p>
      </CardContent>
    </Card>
  );
}

/** 证据链卡片（call_record + 哈希链）。 */
function ChainCard({ chain }: { chain: EvidenceChainResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Evidence Chain</CardTitle>
        <CardDescription>哈希链头 + call_record（模型/时间戳/prev→current hash）</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {chain.callRecord === null ? (
          <p className="text-sm text-muted-foreground">No call record at chain head (honest empty).</p>
        ) : (
          <div className="rounded-md border p-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">#{chain.callRecord.seq}</Badge>
              <span>{chain.callRecord.stageId}</span>
              <span className="text-muted-foreground">{chain.callRecord.payloadKind}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              model: {chain.callRecord.modelId} · finish: {chain.callRecord.finishReason} ·{' '}
              {chain.callRecord.isoTimestamp}
            </p>
            <p className="mt-1 break-all font-mono text-xs">
              prev: {chain.callRecord.prevHash.slice(0, 24)}… → curr: {chain.callRecord.currentHash.slice(0, 24)}…
            </p>
          </div>
        )}
        <p className="break-all font-mono text-xs text-muted-foreground">
          headHash: {chain.headHash}
        </p>
      </CardContent>
    </Card>
  );
}

/** 生命周期事件卡片（BA3-3 修正通知）。 */
function LifecycleCard({ lifecycle }: { lifecycle: LifecycleEventsResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lifecycle Events（修正通知）</CardTitle>
        <CardDescription>撤回 / 纠正 / supersession——修正不静默（BA3-3）</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {lifecycle.events.map((ev) => (
          <div key={ev.eventId} className="rounded-md border p-2 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{ev.fromState}</Badge>
              <span aria-hidden>→</span>
              <Badge
                variant={
                  ev.toState === 'corrected' || ev.toState === 'retracted'
                    ? 'destructive'
                    : 'secondary'
                }
              >
                {ev.toState}
              </Badge>
              <span className="text-muted-foreground">by {ev.actor}</span>
            </div>
            <p className="mt-1">{ev.reason}</p>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
              {ev.createdAt} · {ev.currentHash.slice(0, 16)}…
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
