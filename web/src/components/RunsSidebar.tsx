import { useMemo, useState } from 'react';
import { Badge, CountProgress, IdText, Skeleton, TimeText } from './common';
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
}: {
  run: RunSummary;
  selected: boolean;
  onSelect: (id: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <li>
      <button
        type="button"
        className={`run-item${selected ? ' run-item--selected' : ''}`}
        onClick={() => onSelect(run.id)}
        aria-current={selected ? 'true' : undefined}
      >
        <span className="run-item-top">
          <span className="run-item-question" title={runLabel(run)}>{runLabel(run)}</span>
          <Badge tone={runStatusTone(run.status)}>{t(runStatusKey(run.status))}</Badge>
        </span>
        <span className="run-item-mid">
          <span className="run-item-idline">
            <IdText value={run.id} />
            {run.domain !== undefined && run.domain.length > 0 && (
              <span className="run-item-domain" title={t('runs.domain')}>{run.domain}</span>
            )}
          </span>
          <span className="run-item-stage">
            {t('runs.currentStage')}: {t(stageKey(run.currentStage))}
          </span>
          {run.progress !== undefined ? (
            <CountProgress done={run.progress.done} total={run.progress.total} label={t('runs.progress', run.progress)} />
          ) : (
            <span className="muted small">—</span>
          )}
        </span>
        <span className="run-item-bottom">
          <TimeText iso={run.createdAt} />
        </span>
        {run.lastError !== undefined && run.lastError.length > 0 && (
          <span className="run-item-error" title={run.lastError}>
            {t('runs.errorPrefix')}: {t(errorCategoryKey(run.lastError))}
          </span>
        )}
      </button>
    </li>
  );
}

/** Status groups (P-IA: the sidebar reads as tasks-at-a-glance, not a flat feed).
 *  The last entry is a true fallback: it only receives statuses no named group claimed. */
const NAMED_GROUPS: { key: 'runs.groupActive' | 'runs.groupAttention' | 'runs.groupDone'; match: (s: string) => boolean }[] = [
  { key: 'runs.groupActive', match: (s) => s === 'running' || s === 'queued' },
  { key: 'runs.groupAttention', match: (s) => s === 'partial' || s === 'failed' || s === 'cancelled' },
  { key: 'runs.groupDone', match: (s) => s === 'completed' },
];
const GROUP_ORDER: { key: 'runs.groupActive' | 'runs.groupAttention' | 'runs.groupDone' | 'runs.groupOther'; match: (s: string) => boolean }[] = [
  ...NAMED_GROUPS,
  { key: 'runs.groupOther', match: (s) => !NAMED_GROUPS.some((g) => g.match(s)) },
];

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

export function RunsList({
  runs,
  loading,
  selectedId,
  onSelect,
  filterRef,
}: {
  runs: RunSummary[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  filterRef?: React.RefObject<HTMLInputElement>;
}): JSX.Element {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const filtered = useMemo(
    () => runs.filter((r) => matchesQuery(r, query, t)),
    [runs, query, t],
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
  const grouped = GROUP_ORDER.map((g) => ({ ...g, items: filtered.filter((r) => g.match(r.status)) })).filter(
    (g) => g.items.length > 0,
  );
  return (
    <nav className="runs-groups" aria-label={t('runs.title')}>
      <input
        ref={filterRef}
        type="text"
        className="runs-filter"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('runs.filterPlaceholder')}
        aria-label={t('runs.filterLabel')}
      />
      {query.length > 0 && filtered.length === 0 && (
        <p className="sidebar-empty">{t('runs.filterEmpty')}</p>
      )}
      {grouped.map((g) => (
        <section key={g.key} className="runs-group">
          <h3 className="runs-group-title">{t(g.key)} <span className="muted small">{g.items.length}</span></h3>
          <ul className="runs-list">
            {g.items.map((run) => (
              <RunListItem key={run.id} run={run} selected={run.id === selectedId} onSelect={onSelect} />
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}
