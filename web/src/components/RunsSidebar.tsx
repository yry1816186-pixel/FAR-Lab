import { useMemo, useState } from 'react';
import { Badge, CountProgress, Skeleton, TimeAgo } from './common';
import { runStatusKey, runStatusTone } from '../tones';
import type { RunSummary } from '../api/types';
import { useI18n } from '../i18n/LanguageContext';
import { stageKey } from '../i18n/keys';
import type { DictKey } from '../i18n/dict';

/**
 * Collapse a raw lastError string into a human-readable category line
 * (gap-audit: full stack excerpts in the sidebar were a density disaster).
 * The full text stays available via the title tooltip and the Overview tab.
 */
function errorCategoryKey(raw: string): DictKey {
  if (raw.includes('quota_exceeded')) return 'runs.errQuota';
  if (raw.includes('invalid_output')) return 'runs.errInvalidOutput';
  if (raw.includes('provider_error') || raw.includes('network-')) return 'runs.errProvider';
  if (raw.startsWith('retrieve:')) return 'runs.errRetrieve';
  return 'runs.errFallback';
}

/**
 * The run's human label is the question the researcher asked (CPP-2) — the
 * machine id is metadata, never the primary identity. Shared by sidebar and
 * welcome cards so the whole workbench agrees on what a run IS.
 */
export function runLabel(run: RunSummary): string {
  const text = run.questionText?.trim();
  return text !== undefined && text.length > 0 ? text : run.id;
}

export function RunListItem({
  run,
  selected,
  onSelect,
  sourceConv,
  hideQuestion = false,
}: {
  run: RunSummary;
  selected: boolean;
  onSelect: (id: string) => void;
  /** Where this study came from (the conversation that launched it) — the
   *  unified-timeline link: records are findable from BOTH sides. */
  sourceConv?: { title: string; open: () => void };
  /** Study groups (M2): the group header already carries the question — the
   *  row then reads as a run OF that study (status/stage/time), not a repeat. */
  hideQuestion?: boolean;
}): JSX.Element {
  const { t } = useI18n();
  const active = run.status === 'running' || run.status === 'queued';
  return (
    <li>
      <button
        type="button"
        className={`run-item${selected ? ' run-item--selected' : ''}${active ? ' run-item--active' : ''}${hideQuestion ? ' run-item--in-study' : ''}`}
        onClick={() => onSelect(run.id)}
        aria-current={selected ? 'true' : undefined}
        // Machine id is metadata (B1 F-09): available on hover and in the
        // detail page, never a primary identity line in the list.
        title={`${runLabel(run)} · ${run.id}`}
      >
        {!hideQuestion && (
          <span className="run-item-top">
            <span className="run-item-question" title={runLabel(run)}>{runLabel(run)}</span>
            <Badge tone={runStatusTone(run.status)}>{t(runStatusKey(run.status))}</Badge>
          </span>
        )}
        {/* Two-line rhythm (product rebuild): what a researcher needs at a glance.
            Active studies pulse with their live stage; settled studies show
            domain + time; failures carry their category forward. */}
        <span className="run-item-mid">
          {active ? (
            <>
              <span className="run-item-live" aria-hidden="true" />
              <span className="run-item-stage">{t(stageKey(run.currentStage))}</span>
              {run.progress !== undefined && (
                <CountProgress done={run.progress.done} total={run.progress.total} label={t('runs.progress', run.progress)} />
              )}
            </>
          ) : (
            <>
              {hideQuestion && <Badge tone={runStatusTone(run.status)}>{t(runStatusKey(run.status))}</Badge>}
              {run.domain !== undefined && run.domain.length > 0 && (
                <span className="run-item-domain" title={t('runs.domain')}>{run.domain}</span>
              )}
              <TimeAgo iso={run.createdAt} />
            </>
          )}
        </span>
        {sourceConv !== undefined && !hideQuestion && (
          <span className="run-item-source">
            {/* span, not button: the parent entry is a <button>; nested buttons are invalid HTML. */}
            <span
              role="link"
              tabIndex={0}
              className="link-button small"
              onClick={(e) => { e.stopPropagation(); sourceConv.open(); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); sourceConv.open(); } }}
              title={t('runs.sourceConvTitle', { title: sourceConv.title })}
            >
              ← {t('runs.sourceConv', { title: sourceConv.title.length > 18 ? `${sourceConv.title.slice(0, 18)}…` : sourceConv.title })}
            </span>
          </span>
        )}
        {run.lastError !== undefined && run.lastError.length > 0 && (
          <span className="run-item-error" title={run.lastError}>
            {t('runs.errorPrefix')}: {t(errorCategoryKey(run.lastError))}
          </span>
        )}
      </button>
    </li>
  );
}

/** Sidebar task filter (P-PRO): match on question text first, then id/status/stage labels. */
function matchesQuery(run: RunSummary, q: string, t: (k: DictKey) => string): boolean {
  if (q.length === 0) return true;
  const needle = q.toLowerCase();
  return (
    runLabel(run).toLowerCase().includes(needle) ||
    (run.domain ?? '').toLowerCase().includes(needle) ||
    run.id.toLowerCase().includes(needle) ||
    t(runStatusKey(run.status)).toLowerCase().includes(needle) ||
    t(stageKey(run.currentStage)).toLowerCase().includes(needle)
  );
}

/** Library section: show the most recent studies by default, expand on demand. */
const LIBRARY_PREVIEW = 12;

/**
 * Study identity (M2 workspace model): runs that asked the same question are
 * one study — the researcher's mental object, not a status bucket. Normalized
 * question text is the key (id fallback keeps unlabelled runs singletons).
 */
export function studyKey(run: RunSummary): string {
  const q = run.questionText?.trim().toLowerCase().replace(/\s+/g, ' ');
  return q !== undefined && q.length > 0 ? q : run.id;
}

export interface StudyGroup {
  key: string;
  question: string;
  runs: RunSummary[]; // newest first
  latest: RunSummary;
  activeCount: number;
  failedCount: number;
}

export function groupStudies(filtered: RunSummary[]): StudyGroup[] {
  const byStudy = new Map<string, StudyGroup>();
  for (const run of filtered) {
    const key = studyKey(run);
    const group = byStudy.get(key);
    if (group === undefined) {
      byStudy.set(key, {
        key,
        question: runLabel(run),
        runs: [run],
        latest: run,
        activeCount: run.status === 'running' || run.status === 'queued' ? 1 : 0,
        failedCount: run.status === 'partial' || run.status === 'failed' || run.status === 'cancelled' ? 1 : 0,
      });
    } else {
      group.runs.push(run);
      if (run.status === 'running' || run.status === 'queued') group.activeCount += 1;
      if (run.status === 'partial' || run.status === 'failed' || run.status === 'cancelled') group.failedCount += 1;
      if (Date.parse(run.createdAt) > Date.parse(group.latest.createdAt)) group.latest = run;
    }
  }
  const groups = [...byStudy.values()];
  for (const g of groups) g.runs.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  groups.sort((a, b) => {
    // Live studies float to the top regardless of recency — the researcher's
    // running work outranks everything else in the library.
    if (a.activeCount !== b.activeCount) return b.activeCount - a.activeCount;
    return Date.parse(b.latest.createdAt) - Date.parse(a.latest.createdAt);
  });
  return groups;
}

export function RunsList({
  runs,
  loading,
  selectedId,
  onSelect,
  filterRef,
  query,
  onQueryChange,
  sourceByRunId,
}: {
  runs: RunSummary[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  filterRef?: React.RefObject<HTMLInputElement>;
  /** Controlled search (unified sidebar: one box filters conversations AND studies). */
  query?: string;
  onQueryChange?: (q: string) => void;
  /** runId -> the conversation that launched it (unified-timeline provenance). */
  sourceByRunId?: Map<string, { title: string; open: () => void }>;
}): JSX.Element {
  const { t } = useI18n();
  const [innerQuery, setInnerQuery] = useState('');
  const effectiveQuery = query ?? innerQuery;
  const setQuery = (q: string): void => {
    if (onQueryChange !== undefined) onQueryChange(q);
    else setInnerQuery(q);
  };
  // Studies collapse by default (the library is a question-first index, M2):
  // a selection, a live run, or an active filter expands the relevant study.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState(false);
  const filtered = useMemo(
    () => runs.filter((r) => matchesQuery(r, effectiveQuery, t)),
    [runs, effectiveQuery, t],
  );
  if (loading && runs.length === 0) {
    return (
      <div role="status">
        <Skeleton lines={4} />
        <span className="sr-only">{t('runs.loading')}</span>
      </div>
    );
  }
  if (runs.length === 0) {
    return (
      <p className="sidebar-empty">
        {t('runs.empty')}
        <br />
        <span className="muted">{t('runs.emptyHint')}</span>
      </p>
    );
  }
  const groups = groupStudies(filtered);
  const isExpanded = (g: StudyGroup): boolean => {
    if (effectiveQuery.length > 0) return true; // filtering: show everything that matched
    if (selectedId !== null && g.runs.some((r) => r.id === selectedId)) return true; // never hide the selection
    if (g.activeCount > 0) return true; // live work stays visible
    return expanded[g.key] === true;
  };
  // Library preview applies to collapsed studies: the newest LIBRARY_PREVIEW
  // studies show; the rest wait behind the show-all toggle (a selection deep
  // inside the library widens it, mirroring the old group guard).
  const selGroupIdx = selectedId !== null ? groups.findIndex((g) => g.runs.some((r) => r.id === selectedId)) : -1;
  const widened = selGroupIdx >= LIBRARY_PREVIEW;
  const visibleGroups = showAll || widened ? groups : groups.slice(0, LIBRARY_PREVIEW);
  const hiddenStudies = groups.length - visibleGroups.length;
  return (
    <nav className="runs-groups study-groups" aria-label={t('runs.title')}>
      <input
        ref={filterRef}
        type="text"
        className="runs-filter"
        value={effectiveQuery}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('runs.filterPlaceholder')}
        aria-label={t('runs.filterLabel')}
      />
      {effectiveQuery.length > 0 && filtered.length === 0 && (
        <p className="sidebar-empty">{t('runs.filterEmpty')}</p>
      )}
      {visibleGroups.map((g) => {
        const open = isExpanded(g);
        return (
        <section key={g.key} className="study-group">
          {/* Valid heading pattern (B2-critique F-01): the button lives INSIDE
              the h3 — interactive content must not contain flow content. */}
          <h3 className="runs-group-title">
            <button
              type="button"
              className="runs-group-toggle study-toggle"
              aria-expanded={open}
              onClick={() => setExpanded((prev) => ({ ...prev, [g.key]: !open }))}
              title={g.question}
            >
              <span className="study-head">
                <span className="study-question">{g.question}</span>
                <span className="study-meta">
                  <Badge tone={runStatusTone(g.latest.status)}>{t(runStatusKey(g.latest.status))}</Badge>
                  {g.runs.length > 1 && <span className="muted small">{t('runs.studyRuns', { n: g.runs.length })}</span>}
                  {g.activeCount > 0 && <span className="run-item-live" aria-hidden="true" />}
                  {g.failedCount > 0 && (
                    <span className="study-chip study-chip--warn" title={t('runs.studyFailedHint', { n: g.failedCount })}>
                      {t('runs.studyFailedChip', { n: g.failedCount })}
                    </span>
                  )}
                </span>
              </span>
              <span className="runs-group-caret muted" aria-hidden="true">{open ? '▾' : '▸'}</span>
            </button>
          </h3>
          {open && (
            <ul className="runs-list">
              {g.runs.map((run) => (
                <RunListItem
                  key={run.id}
                  run={run}
                  selected={run.id === selectedId}
                  onSelect={onSelect}
                  sourceConv={sourceByRunId?.get(run.id)}
                  hideQuestion
                />
              ))}
            </ul>
          )}
        </section>
        );
      })}
      {hiddenStudies > 0 && (
        <button type="button" className="runs-more link-button small" onClick={() => setShowAll(true)}>
          {t('runs.showAllStudies', { n: hiddenStudies })}
        </button>
      )}
    </nav>
  );
}
