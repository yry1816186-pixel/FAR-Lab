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
  milestones: { key: string; detail: RunEvent['detail'] }[];
}

/** Latest transition per stage wins; milestones attach to their own stage. */
function deriveTimeline(events: RunEvent[], run: ResearchRun): { stages: StageRow[]; telemetry: RunEvent[] } {
  const byStage = new Map<string, StageRow>();
  const milestones: RunEvent[] = [];
  const telemetry: RunEvent[] = [];
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
    } else if (e.type === 'note' && typeof e.detail?.reason === 'string' && NOTE_MILESTONES.has(e.detail.reason)) {
      milestones.push(e);
    } else if (TELEMETRY.has(e.type)) {
      telemetry.push(e);
    }
  }
  // Attach milestones to their stage by event order: the stage they arrived in.
  for (const m of milestones) {
    const stage = m.stage;
    const row = stage !== undefined ? byStage.get(stage) : undefined;
    if (row !== undefined && stage !== undefined) row.milestones.push({ key: String(m.detail?.reason ?? ''), detail: m.detail });
    else telemetry.push(m); // no owning stage yet → stay visible in trace
  }
  const active = run.status === 'running' || run.status === 'queued';
  if (active) {
    const cur = run.currentStage;
    const row = byStage.get(cur);
    if (row !== undefined && row.status !== 'done' && row.status !== 'failed') row.status = 'running';
  }
  return { stages: [...byStage.values()], telemetry };
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
  const { stages, telemetry } = deriveTimeline(events, run);
  const active = run.status === 'running' || run.status === 'queued';
  const currentDesc: string | null = active ? t(`activity.stageDesc.${run.currentStage}` as DictKey) : null;
  const ordered = [...stages].reverse(); // newest first, matching the live-feed reading direction

  const milestoneText = (key: string, detail: RunEvent['detail']): { text: string; extra?: string } => {
    const d = detail ?? {};
    if (key === 'hypothesis_critiqued') {
      const sup = typeof d.supportingLinks === 'number' ? d.supportingLinks : 0;
      const ctr = typeof d.counterLinks === 'number' ? d.counterLinks : 0;
      return { text: t('activity.mHypothesis', { supporting: sup, counter: ctr }) };
    }
    if (key === 'document_extracted') {
      const claims = typeof d.claims === 'number' ? d.claims : 0;
      return { text: t('activity.mDocument', { n: claims }), extra: typeof d.sourceTitle === 'string' ? d.sourceTitle : undefined };
    }
    const planned = typeof d.plannedQueries === 'number' ? d.plannedQueries : 0;
    const counter = typeof d.counterQueries === 'number' ? d.counterQueries : 0;
    return { text: t('activity.mQueryPlan', { n: planned, c: counter }) };
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
                    {row.summary.length > 140 ? `${row.summary.slice(0, 140)}…` : row.summary}
                  </p>
                )}
                {row.milestones.map((m, i) => {
                  const { text } = milestoneText(m.key, m.detail);
                  return (
                    <p key={i} className="tl-milestone small">
                      <ChevronRight size={12} aria-hidden="true" /> {text}
                    </p>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
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
