import type { ResearchRun, RunEvent } from '../../api/types';
import { useI18n } from '../../i18n/LanguageContext';
import { stageKey } from '../../i18n/keys';
import type { DictKey } from '../../i18n/dict';

/**
 * Research activity narrative (S2a, product-critique "fatal #1"): during a
 * multi-minute run the researcher used to stare at an echo of their own
 * question. This feed renders the REAL event stream the runtime already
 * emits (stage transitions with their honest summaries, every model/retrieval
 * call receipt) as a readable, auto-updating log — no invented progress, no
 * percentages; if the pipeline is quiet, the feed is quiet.
 */

/** Events that carry narrative value; checkpoint_saved and non-milestone notes are intentionally excluded. */
const NARRATIVE: ReadonlySet<string> = new Set([
  'stage_started', 'stage_done', 'stage_failed', 'stage_skipped',
  'receipt_recorded', 'feedback_received', 'run_status_changed', 'note',
]);

/** B3-critique P1-3: milestone floods must never evict the stage boundaries —
 *  the window below always reserves slots for the latest transitions. */
const STAGE_TRANSITIONS: ReadonlySet<string> = new Set([
  'stage_started', 'stage_done', 'stage_failed', 'stage_skipped',
]);
const RESERVED_STAGE_SLOTS = 5;

/** B3 milestone notes worth a researcher's attention (internal notes stay hidden). */
const NOTE_MILESTONES: ReadonlySet<string> = new Set([
  'hypothesis_critiqued', 'document_extracted', 'query_plan_ready',
]);

const MAX_LINES = 14;

/** Selection window: the newest RESERVED_STAGE_SLOTS stage transitions are
 *  always visible; remaining slots go to the newest other narrative lines. */
function windowOf(events: RunEvent[]): RunEvent[] {
  const stage = events.filter((e) => STAGE_TRANSITIONS.has(e.type)).slice(-RESERVED_STAGE_SLOTS);
  const others = events.filter((e) => !STAGE_TRANSITIONS.has(e.type)).slice(-(MAX_LINES - stage.length));
  return [...stage, ...others].sort((a, b) => a.seq - b.seq);
}

interface ActivityLine {
  key: string;
  at: string;
  glyph: string;
  tone: 'ok' | 'err' | 'info' | 'muted';
  text: string;
  summary?: string;
}

export function ActivityFeed({ run, events }: { run: ResearchRun; events: RunEvent[] }): JSX.Element {
  const { t, formatTime } = useI18n();
  const lines = windowOf(events.filter((e) => NARRATIVE.has(e.type)))
    .reverse()
    .map((e): ActivityLine | null => {
      const stageLabel = e.stage !== undefined ? t(stageKey(e.stage)) : '';
      switch (e.type) {
        case 'stage_started':
          return { key: `s${e.seq}`, at: e.at, glyph: '●', tone: 'info', text: t('activity.stageStarted', { stage: stageLabel }) };
        case 'stage_done': {
          const summary = typeof e.detail?.summary === 'string' ? e.detail.summary : undefined;
          return { key: `d${e.seq}`, at: e.at, glyph: '✓', tone: 'ok', text: t('activity.stageDone', { stage: stageLabel }), summary };
        }
        case 'stage_failed':
          return { key: `f${e.seq}`, at: e.at, glyph: '✗', tone: 'err', text: t('activity.stageFailed', { stage: stageLabel }) };
        case 'stage_skipped':
          return { key: `k${e.seq}`, at: e.at, glyph: '—', tone: 'muted', text: t('activity.stageSkipped', { stage: stageLabel }) };
        case 'receipt_recorded': {
          const d = e.detail;
          // B3: enriched receipts name the model and latency, or the query and
          // its yield — a run's ten model calls become distinguishable. Older
          // events without facts degrade to the plain label.
          if (d?.kind === 'source_retrieval' && typeof d.query === 'string') {
            const family = typeof d.family === 'string' ? d.family : '';
            const n = typeof d.resultCount === 'number' ? d.resultCount : 0;
            return {
              key: `r${e.seq}`, at: e.at, glyph: '⇉', tone: 'muted',
              text: t('activity.retrievalHit', { family, n }),
              summary: d.query.length > 90 ? `${d.query.slice(0, 90)}…` : d.query,
            };
          }
          if (d !== undefined && d.kind !== 'source_retrieval' && typeof d.modelId === 'string') {
            const msText = typeof d.latencyMs === 'number' ? t('activity.modelLatency', { ms: d.latencyMs }) : '';
            return {
              key: `r${e.seq}`, at: e.at, glyph: '↳', tone: 'muted',
              text: `${t('activity.modelCallDetail', { model: d.modelId })}${msText}${stageLabel.length > 0 ? ` · ${stageLabel}` : ''}`,
            };
          }
          const kindKey: DictKey = d?.kind === 'source_retrieval' ? 'activity.retrievalCall' : 'activity.modelCall';
          return { key: `r${e.seq}`, at: e.at, glyph: '↳', tone: 'muted', text: `${t(kindKey)}${stageLabel.length > 0 ? ` · ${stageLabel}` : ''}` };
        }
        case 'note': {
          const reason = typeof e.detail?.reason === 'string' ? e.detail.reason : '';
          if (!NOTE_MILESTONES.has(reason)) return null;
          const d = e.detail ?? {};
          if (reason === 'hypothesis_critiqued') {
            const statement = typeof d.statement === 'string' ? d.statement : '';
            const sup = typeof d.supportingLinks === 'number' ? d.supportingLinks : 0;
            const ctr = typeof d.counterLinks === 'number' ? d.counterLinks : 0;
            return {
              key: `n${e.seq}`, at: e.at, glyph: '◈', tone: 'info',
              text: t('activity.mHypothesis', { supporting: sup, counter: ctr }),
              summary: statement,
            };
          }
          if (reason === 'document_extracted') {
            const title = typeof d.sourceTitle === 'string' ? d.sourceTitle : '';
            const claims = typeof d.claims === 'number' ? d.claims : 0;
            return {
              key: `n${e.seq}`, at: e.at, glyph: '◈', tone: 'info',
              text: t('activity.mDocument', { n: claims }),
              summary: title,
            };
          }
          // query_plan_ready
          const planned = typeof d.plannedQueries === 'number' ? d.plannedQueries : 0;
          const counter = typeof d.counterQueries === 'number' ? d.counterQueries : 0;
          return {
            key: `n${e.seq}`, at: e.at, glyph: '◈', tone: 'info',
            text: t('activity.mQueryPlan', { n: planned, c: counter }),
          };
        }
        case 'feedback_received':
          return { key: `b${e.seq}`, at: e.at, glyph: '⚑', tone: 'info', text: t('activity.feedback') };
        case 'run_status_changed':
          return { key: `c${e.seq}`, at: e.at, glyph: '≫', tone: 'muted', text: t('activity.statusChanged') };
        default:
          return null;
      }
    })
    .filter((l): l is ActivityLine => l !== null);

  const active = run.status === 'running' || run.status === 'queued';
  const currentDesc: string | null = active ? t(`activity.stageDesc.${run.currentStage}` as DictKey) : null;

  return (
    <div className="activity" aria-live="polite">
      {active && (
        <p className="activity-now">
          <span className="activity-dot" aria-hidden="true" />
          <strong>{t(stageKey(run.currentStage))}</strong>
          {currentDesc !== null && currentDesc.length > 0 && <span className="muted"> — {currentDesc}</span>}
        </p>
      )}
      {lines.length === 0 ? (
        <p className="muted small">{t('activity.empty')}</p>
      ) : (
        <ul className="activity-list">
          {lines.map((l) => (
            <li key={l.key} className={`activity-item activity-item--${l.tone}`}>
              <time className="mono muted" dateTime={l.at}>{formatTime(l.at).split(' ').pop()}</time>
              <span className="activity-glyph" aria-hidden="true">{l.glyph}</span>
              <span className="activity-text">
                {l.text}
                {l.summary !== undefined && l.summary.length > 0 && <span className="muted small activity-summary"> — {l.summary}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {active && <p className="muted small activity-cadence">{t('activity.cadence')}</p>}
    </div>
  );
}
