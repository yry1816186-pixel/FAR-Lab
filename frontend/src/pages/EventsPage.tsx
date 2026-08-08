/**
 * EventsPage —— 实时 Agent 事件流可视化（SSE · /api/v1/events/stream）。
 *
 * Authority: src/agent_loop/events.ts AgentLoopEvent + src/api/routes/events.ts。
 *
 * 组件：
 *   1. ConnectionBadge — SSE 连接状态（live / connecting / closed）。
 *   2. FilterBar — runId 过滤 + replay 开关 + 暂停自动滚动 + 清空。
 *   3. EventStream — 按时间序渲染事件行（type / stage / iteration / verdict / tokens）。
 *
 * 诚实定位（红线）：
 *   - 事件是「运行时观测」而非裁决：verdict 只在 run_completed / iteration_completed 出现，
 *     且由 R0-R9 确定性内核产出（LLM 非裁决者）。
 *   - 无 server 时 EventSource 自动重连，页面保持 connecting 而非伪造「已连接」。
 *   - 事件流是尽力而为的观测视图；完整证据链以 far replay / 证据链 DB 为准。
 */

import { useEffect, useRef, useState } from 'react';
import { useAgentEventStream } from '@/lib/api_client';
import type { AgentEventDto, StageId, VerdictValue } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VerdictBadge } from '@/components/VerdictBadge';
import { Radio, Pause, Play, Trash2, AlertTriangle } from 'lucide-react';

const STAGE_LABEL: Record<StageId, string> = {
  stage0_dialogue: 'Dialogue',
  stage1_understanding: 'Understanding',
  stage2_integration: 'Integration',
  stage3_hypothesis: 'Hypothesis',
  stage4_evidence: 'Evidence',
  stage5_plan: 'Plan',
  stage6_feedback: 'Feedback',
};

function isVerdictValue(v: string | null | undefined): v is VerdictValue {
  return (
    v !== null &&
    v !== undefined &&
    ['CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'DEGRADED_SCOPE', 'UNTESTED'].includes(v)
  );
}

/** SSE 连接状态徽章。 */
function ConnectionBadge({ status }: { readonly status: 'connecting' | 'live' | 'closed' }) {
  const variant =
    status === 'live' ? 'default' : status === 'connecting' ? 'secondary' : 'destructive';
  const label = status === 'live' ? 'Live' : status === 'connecting' ? 'Connecting' : 'Closed';
  return (
    <Badge variant={variant} data-testid={`conn-${status}`}>
      <Radio className="mr-1 h-3 w-3" />
      {label}
    </Badge>
  );
}

/** 单行事件渲染。 */
function EventRow({ event }: { readonly event: AgentEventDto }) {
  const ts = event.ts.slice(11, 19); // HH:mm:ss
  switch (event.type) {
    case 'run_started':
      return (
        <div className="flex items-center gap-2 border-b border-muted py-1.5 text-sm" data-testid="evt-run_started">
          <span className="w-16 shrink-0 text-muted-foreground">{ts}</span>
          <Badge variant="outline">run started</Badge>
          <span className="font-mono text-xs text-muted-foreground">{event.runId.slice(0, 12)}</span>
          <span className="text-muted-foreground">maxIter={event.maxIterations}</span>
          {event.verdictDriven && <Badge variant="secondary">verdict-driven</Badge>}
        </div>
      );
    case 'stage_started':
      return (
        <div className="flex items-center gap-2 border-b border-muted py-1.5 text-sm" data-testid="evt-stage_started">
          <span className="w-16 shrink-0 text-muted-foreground">{ts}</span>
          <Badge variant="outline">stage</Badge>
          <span className="font-mono text-xs">it{event.iteration}</span>
          <span>{STAGE_LABEL[event.stageId] ?? event.stageId}</span>
        </div>
      );
    case 'stage_completed':
      return (
        <div className="flex items-center gap-2 border-b border-muted py-1.5 text-sm" data-testid="evt-stage_completed">
          <span className="w-16 shrink-0 text-muted-foreground">{ts}</span>
          <Badge variant="outline">stage done</Badge>
          <span className="font-mono text-xs">it{event.iteration}</span>
          <span>{STAGE_LABEL[event.stageId] ?? event.stageId}</span>
          <Badge variant="secondary">{event.payloadKind}</Badge>
          {event.degraded && <Badge variant="destructive">degraded</Badge>}
          <span className="ml-auto font-mono text-xs text-muted-foreground">tokens={event.tokens}</span>
        </div>
      );
    case 'iteration_completed':
      return (
        <div className="flex items-center gap-2 border-b border-muted py-1.5 text-sm" data-testid="evt-iteration_completed">
          <span className="w-16 shrink-0 text-muted-foreground">{ts}</span>
          <Badge variant="outline">iter done</Badge>
          <span className="font-mono text-xs">it{event.iteration}</span>
          {isVerdictValue(event.verdict) ? (
            <VerdictBadge decision={event.verdict} />
          ) : (
            <Badge variant="secondary">no verdict</Badge>
          )}
          {event.continueIteration ? (
            <Badge variant="outline">continue</Badge>
          ) : (
            <Badge variant="outline">stop</Badge>
          )}
          <span className="ml-auto font-mono text-xs text-muted-foreground">tokens={event.tokensConsumed}</span>
        </div>
      );
    case 'run_completed':
      return (
        <div className="flex items-center gap-2 border-b border-muted py-1.5 text-sm" data-testid="evt-run_completed">
          <span className="w-16 shrink-0 text-muted-foreground">{ts}</span>
          <Badge>run complete</Badge>
          <span className="font-mono text-xs text-muted-foreground">{event.runId.slice(0, 12)}</span>
          <Badge variant="secondary">{event.reason}</Badge>
          {isVerdictValue(event.verdict) ? <VerdictBadge decision={event.verdict} /> : null}
          <span className="ml-auto font-mono text-xs text-muted-foreground">iter={event.iterations} artifacts={event.artifactCount}</span>
        </div>
      );
    case 'run_error':
      return (
        <div className="flex items-center gap-2 border-b border-muted py-1.5 text-sm" data-testid="evt-run_error">
          <span className="w-16 shrink-0 text-muted-foreground">{ts}</span>
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <Badge variant="destructive">run error</Badge>
          <span className="font-mono text-xs">{event.code}</span>
          <span className="truncate text-muted-foreground">{event.message}</span>
        </div>
      );
    case 'stage_held':
    case 'stage_resumed':
      return (
        <div className="flex items-center gap-2 border-b border-muted py-1.5 text-sm" data-testid={`evt-${event.type}`}>
          <span className="w-16 shrink-0 text-muted-foreground">{ts}</span>
          <Badge variant="outline">{event.type === 'stage_held' ? 'held' : 'resumed'}</Badge>
          <span className="font-mono text-xs">it{event.iteration}</span>
          <span className="text-muted-foreground">{STAGE_LABEL[event.stageId] ?? event.stageId}</span>
        </div>
      );
  }
}

export default function EventsPage() {
  const [runId, setRunId] = useState('');
  const [replay, setReplay] = useState(true);
  const [paused, setPaused] = useState(false);
  const [cleared, setCleared] = useState(false);
  const { status, events, error } = useAgentEventStream({ runId, replay, maxEvents: 500 });
  const scrollRef = useRef<HTMLDivElement>(null);
  const visibleEvents = cleared ? [] : events;

  useEffect(() => {
    if (!paused && scrollRef.current !== null) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleEvents.length, paused]);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Agent Runtime Event Stream</h1>
          <ConnectionBadge status={status} />
        </div>
        <p className="text-muted-foreground">
          Live SSE feed from <code className="font-mono text-xs">/api/v1/events/stream</code> — raw
          agent-loop observation (stages, iterations, verdicts, tokens). Deterministic R0-R9 verdict
          kernel decides; the LLM never judges.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>
            Replays bus history first (when enabled), then streams new events live.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Input
            data-testid="events-runid-input"
            placeholder="runId (empty = all runs)"
            value={runId}
            onChange={(e) => setRunId(e.target.value)}
            className="max-w-64 font-mono text-xs"
          />
          <Button
            variant={replay ? 'default' : 'outline'}
            size="sm"
            onClick={() => setReplay((v) => !v)}
            data-testid="events-replay-toggle"
          >
            replay: {replay ? 'on' : 'off'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPaused((v) => !v)}
            data-testid="events-pause-toggle"
          >
            {paused ? <Play className="mr-1 h-4 w-4" /> : <Pause className="mr-1 h-4 w-4" />}
            {paused ? 'resume' : 'pause'} auto-scroll
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCleared(true)}
            data-testid="events-clear-button"
          >
            <Trash2 className="mr-1 h-4 w-4" />
            clear
          </Button>
          <span className="ml-auto text-xs text-muted-foreground" data-testid="events-count">
            {visibleEvents.length} event{visibleEvents.length === 1 ? '' : 's'}
          </span>
        </CardContent>
      </Card>

      {error !== null && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error} — connection will auto-reconnect.
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div ref={scrollRef} className="max-h-[26rem] overflow-y-auto p-3" data-testid="events-stream">
            {visibleEvents.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground" data-testid="events-empty">
                No events yet. Start a run via <code className="font-mono text-xs">far ask</code> or
                the hypothesize form — the stream will light up live.
              </p>
            ) : (
              visibleEvents.map((evt, i) => <EventRow key={`${evt.runId}-${i}`} event={evt} />)
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
