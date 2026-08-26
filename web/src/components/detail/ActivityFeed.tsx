import { CheckCircle2, ChevronRight, CircleDashed, Loader2, MinusCircle, XCircle } from 'lucide-react';
import type { ResearchRun, RunEvent, RunStageName } from '../../api/types';
import { useI18n } from '../../i18n/LanguageContext';
import { stageKey } from '../../i18n/keys';
import type { DictKey } from '../../i18n/dict';

/**
 * Research narrative timeline (HX3 / S2a descendant): the researcher reads
 * WHAT happened to their study (one card per stage, milestone lines), not the
 * runtime's telemetry. Model/tool/receipt events fold into a collapsed
 * "technical trace" (L3). Everything is derived from the REAL event stream —
 * no invented progress, no percentages; a quiet pipeline is a quiet timeline.
 */

const STAGE_TRANSITIONS: ReadonlySet<string> = new Set([
  'stage_started', 'stage_done', 'stage_failed', 'stage_skipped',
]);
/** Milestone notes worth a researcher's attention (internal notes stay hidden). */
const NOTE_MILESTONES: ReadonlySet<string> = new Set([
  'hypothesis_critiqued', 'document_extracted', 'query_plan_ready',
]);
/** Research iteration controller decisions — rounds and why they ended. */
const ITERATION_REASONS: ReadonlySet<string> = new Set(['iteration_round_started', 'iteration_decided']);
/** L3 telemetry: real receipts that belong under the disclosure, not the story. */
const TELEMETRY: ReadonlySet<string> = new Set([
  'receipt_recorded', 'agent_started', 'agent_tool_used', 'agent_finished',
  'run_status_changed', 'feedback_received',
]);

interface StageRow {
  stage: RunStageName;
  status: 'done' | 'failed' | 'skipped' | 'running';
  at: string;
  summary?: string;
  milestones: AggMilestone[];
}

/**
 * Milestones aggregate per stage (M1): ten "批判完成（支持 0 · 反证 0）" lines
 * are storage truth, not reading truth — one line with the sums is. Event
 * detail is untrusted; numbers fall back to 0 on wrong shapes.
 */
interface AggMilestone {
  key: string;
  count: number;
  supporting: number;
  counter: number;
  claims: number;
  plannedQueries: number;
  counterQueries: number;
}

function emptyAgg(key: string): AggMilestone {
  return { key, count: 0, supporting: 0, counter: 0, claims: 0, plannedQueries: 0, counterQueries: 0 };
}

/** Latest transition per stage wins; milestones aggregate onto their own stage. */
function deriveTimeline(events: RunEvent[], run: ResearchRun): { stages: StageRow[]; telemetry: RunEvent[]; iterations: RunEvent[] } {
  const byStage = new Map<string, StageRow>();
  const aggByStage = new Map<string, Map<string, AggMilestone>>();
  const milestones: RunEvent[] = [];
  const telemetry: RunEvent[] = [];
  const iterations: RunEvent[] = [];
  for (const e of events) {
    if (STAGE_TRANSITIONS.has(e.type)) {
      const stage = e.stage;
      if (stage === undefined) continue;
      const status: StageRow['status'] =
        e.type === 'stage_done' ? 'done' : e.type === 'stage_failed' ? 'failed' : e.type === 'stage_skipped' ? 'skipped' : 'running';
      const summary = typeof e.detail?.summary === 'string' ? e.detail.summary : undefined;
      const prev = byStage.get(stage);
      byStage.set(stage, {
        stage, status, at: e.at, summary: summary ?? prev?.summary,
        milestones: prev?.milestones ?? [],
      });
    } else if (e.type === 'note' && typeof e.detail?.reason === 'string' && ITERATION_REASONS.has(e.detail.reason)) {
      iterations.push(e);
    } else if (e.type === 'note' && typeof e.detail?.reason === 'string' && NOTE_MILESTONES.has(e.detail.reason)) {
      milestones.push(e);
    } else if (TELEMETRY.has(e.type)) {
      telemetry.push(e);
    }
  }
  // Aggregate milestones onto their stage by event order.
  for (const m of milestones) {
    const stage = m.stage;
    if (stage === undefined) { telemetry.push(m); continue; } // no owning stage yet → stay visible in trace
    const reason = String(m.detail?.reason ?? '');
    const stageAgg = aggByStage.get(stage) ?? new Map<string, AggMilestone>();
    aggByStage.set(stage, stageAgg);
    const agg = stageAgg.get(reason) ?? emptyAgg(reason);
    const d = m.detail ?? {};
    agg.count += 1;
    if (typeof d.supportingLinks === 'number') agg.supporting += d.supportingLinks;
    if (typeof d.counterLinks === 'number') agg.counter += d.counterLinks;
    if (typeof d.claims === 'number') agg.claims += d.claims;
    if (typeof d.plannedQueries === 'number') agg.plannedQueries += d.plannedQueries;
    if (typeof d.counterQueries === 'number') agg.counterQueries += d.counterQueries;
    stageAgg.set(reason, agg);
  }
  for (const [stage, agg] of aggByStage) {
    const row = byStage.get(stage);
    if (row !== undefined) row.milestones = [...agg.values()];
  }
  const active = run.status === 'running' || run.status === 'queued';
  if (active) {
    const cur = run.currentStage;
    const row = byStage.get(cur);
    if (row !== undefined && row.status !== 'done' && row.status !== 'failed') row.status = 'running';
  }
  return { stages: [...byStage.values()], telemetry, iterations };
}

function StageIcon({ status }: { status: StageRow['status'] }): JSX.Element {
  if (status === 'running') return <Loader2 size={15} className="attach-spinner" aria-hidden="true" />;
  if (status === 'done') return <CheckCircle2 size={15} aria-hidden="true" />;
  if (status === 'failed') return <XCircle size={15} aria-hidden="true" />;
  if (status === 'skipped') return <MinusCircle size={15} aria-hidden="true" />;
  return <CircleDashed size={15} aria-hidden="true" />;
}

export function ActivityFeed({ run, events }: { run: ResearchRun; events: RunEvent[] }): JSX.Element {
  const { t, formatTime } = useI18n();
  const { stages, telemetry, iterations } = deriveTimeline(events, run);
  const active = run.status === 'running' || run.status === 'queued';
  const currentDesc: string | null = active ? t(`activity.stageDesc.${run.currentStage}` as DictKey) : null;
  const ordered = [...stages].reverse(); // newest first, matching the live-feed reading direction

  /** Iteration event → one researcher-readable line (defensive: event detail is untrusted). */
  const iterationText = (e: RunEvent): string => {
    const d = e.detail ?? {};
    const round = typeof d.round === 'number' ? d.round : 0;
    if (d.reason === 'iteration_round_started') {
      const trigger = d.trigger as { kind?: unknown } | undefined;
      const kind = typeof trigger?.kind === 'string' ? trigger.kind : '';
      const label = kind === 'unconsumed_feedback' ? t('iter.trigger.feedback')
        : kind === 'executable_plan_unexecuted' ? t('iter.trigger.plan')
        : t('iter.trigger.other');
      return t('iter.round', { n: round, label });
    }
    const stop = d.stopReason as { kind?: unknown } | undefined;
    const kind = typeof stop?.kind === 'string' ? stop.kind : '';
    const label = kind === 'round_cap' ? t('iter.stop.roundCap')
      : kind === 'budget_exhausted' ? t('iter.stop.budget')
      : kind === 'no_material_delta' ? t('iter.stop.noDelta')
      : t('iter.stop.noWork');
    return t('iter.stopped', { label });
  };

  const milestoneText = (m: AggMilestone): string => {
    if (m.key === 'hypothesis_critiqued') {
      return t('activity.mHypothesesAgg', { n: m.count, supporting: m.supporting, counter: m.counter });
    }
    if (m.key === 'document_extracted') {
      return t('activity.mDocumentsAgg', { sources: m.count, claims: m.claims });
    }
    return t('activity.mQueryPlan', { n: m.plannedQueries, c: m.counterQueries });
  };

  return (
    <div className="timeline" aria-live="polite">
      {active && (
        <div className="tl-now" role="status">
          <span className="tl-now-dot" aria-hidden="true" />
          <div>
            <strong>{t(stageKey(run.currentStage))}</strong>
            {currentDesc !== null && currentDesc.length > 0 && <span className="muted"> — {currentDesc}</span>}
          </div>
        </div>
      )}

      {ordered.length === 0 && telemetry.length === 0 ? (
        <p className="muted small">{t('activity.empty')}</p>
      ) : (
        <ol className="tl-stages">
          {ordered.map((row) => (
            <li key={row.stage} className={`tl-stage tl-stage--${row.status}`}>
              <span className="tl-stage-icon"><StageIcon status={row.status} /></span>
              <div className="tl-stage-body">
                <div className="tl-stage-head">
                  <span className="tl-stage-name">{t(stageKey(row.stage))}</span>
                  <time className="mono muted small" dateTime={row.at}>{formatTime(row.at).split(' ').pop()}</time>
                </div>
                <p className="tl-stage-desc muted small">{t(`activity.stageDesc.${row.stage}` as DictKey)}</p>
                {row.summary !== undefined && row.summary.length > 0 && (
                  <p className="tl-stage-summary small" title={row.summary}>
                    {row.summary.length > 90 ? `${row.summary.slice(0, 90)}…` : row.summary}
                  </p>
                )}
                {row.milestones.map((m, i) => (
                  <p key={i} className="tl-milestone small">
                    <ChevronRight size={12} aria-hidden="true" /> {milestoneText(m)}
                  </p>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}

      {iterations.length > 0 && (
        <div className="tl-iterations" aria-label={t('iter.section')}>
          {iterations.slice(-6).reverse().map((e) => (
            <p key={e.seq} className="tl-iteration small">
              <time className="mono muted" dateTime={e.at}>{formatTime(e.at).split(' ').pop()}</time>
              <span>{iterationText(e)}</span>
            </p>
          ))}
        </div>
      )}

      {telemetry.length > 0 && (
        <details className="tl-telemetry">
          <summary className="muted small">{t('activity.telemetry', { n: telemetry.length })}</summary>
          <ul className="tl-raw">
            {telemetry.slice(-40).reverse().map((e) => (
              <li key={e.seq} className="tl-raw-item">
                <time className="mono muted small" dateTime={e.at}>{formatTime(e.at).split(' ').pop()}</time>
                <span className="tl-raw-text small">{telemetryLine(e, t)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Compact one-line rendering for the folded technical trace (L3). */
function telemetryLine(e: RunEvent, t: (k: DictKey, vars?: Record<string, string | number>) => string): string {
  const stageLabel = e.stage !== undefined ? t(stageKey(e.stage)) : '';
  if (e.type === 'receipt_recorded') {
    const d = e.detail;
    if (d?.kind === 'source_retrieval' && typeof d.query === 'string') {
      const n = typeof d.resultCount === 'number' ? d.resultCount : 0;
      return `${t('activity.retrievalHit', { family: typeof d.family === 'string' ? d.family : '', n })} — ${d.query.slice(0, 80)}`;
    }
    if (d !== undefined && typeof d.modelId === 'string') {
      const ms = typeof d.latencyMs === 'number' ? ` ${t('activity.modelLatency', { ms: d.latencyMs })}` : '';
      return `${t('activity.modelCallDetail', { model: d.modelId })}${ms}${stageLabel.length > 0 ? ` · ${stageLabel}` : ''}`;
    }
    return `${t('activity.modelCall')}${stageLabel.length > 0 ? ` · ${stageLabel}` : ''}`;
  }
  if (e.type === 'agent_tool_used') return t('activity.agentTool', { tool: typeof e.detail?.tool === 'string' ? e.detail.tool : '' });
  if (e.type === 'agent_started') return t('activity.agentStarted');
  if (e.type === 'agent_finished') return t('activity.agentFinished', { status: typeof e.detail?.status === 'string' ? e.detail.status : '' });
  if (e.type === 'feedback_received') return t('activity.feedback');
  return t('activity.statusChanged');
}
