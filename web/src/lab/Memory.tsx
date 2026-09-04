import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Brain, Download, Pencil } from 'lucide-react';
import { ApiError } from '../api/client';
import { archiveMemoryItem, editMemoryItem, getMemoryItems } from '../api/endpoints';
import type { MemoryItemView, MemoryStatus } from '../api/types';
import { ErrorBox, TimeAgo } from '../components/common';
import { useI18n } from '../i18n/LanguageContext';
import type { DictKey } from '../i18n/dict';
import './lab.css';

/** Rows rendered before the expand toggle (search overrides). */
const PAGE = 30;

const KIND_KEYS: Record<string, DictKey> = {
  episodic: 'memory.kind.episodic', semantic: 'memory.kind.semantic',
  experiment_outcome: 'memory.kind.experiment_outcome', profile: 'memory.kind.profile',
};
const TRUST_KEYS: Record<string, DictKey> = {
  own_verified: 'memory.trust.own_verified', own_unverified: 'memory.trust.own_unverified',
  external_literature: 'memory.trust.external_literature', external_untrusted: 'memory.trust.external_untrusted',
};
const STATUS_KEYS: Record<string, DictKey> = {
  active: 'memory.status.active', superseded: 'memory.status.superseded', archived: 'memory.status.archived',
};
const STATUS_VALUES: MemoryStatus[] = ['active', 'superseded', 'archived'];

/**
 * FA-HAR-06 workspace memory management (#memory): the researcher surface over
 * the memory substrate — inspect what the workspace remembers, correct it
 * (edit = audited supersession, trust re-derived — a hand edit never becomes
 * own_verified), archive it (terminal, reason required), export it. Every
 * mutation lands server-side audit; the UI only reflects real API outcomes.
 */
export function Memory(): JSX.Element {
  const { t } = useI18n();
  const [items, setItems] = useState<MemoryItemView[] | null>(null);
  const [complete, setComplete] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<MemoryStatus | 'all'>('all');
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<MemoryItemView | null>(null);
  const [archiving, setArchiving] = useState<MemoryItemView | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mutateError, setMutateError] = useState<ApiError | null>(null);
  const reloadRef = useRef<(() => void) | null>(null);

  const load = (signal?: AbortSignal): void => {
    getMemoryItems({}, signal)
      .then((v) => { setItems(v.items); setComplete(v.complete); setError(null); })
      .catch((e: unknown) => { if (e instanceof ApiError) setError(e); setItems([]); });
  };
  useEffect(() => {
    const c = new AbortController();
    load(c.signal);
    return () => c.abort();
  }, []);
  reloadRef.current = () => { setItems(null); load(); };

  const vocabLabel = (keys: Record<string, DictKey>, value: string): string =>
    keys[value] !== undefined ? t(keys[value]) : value;

  const filtered = useMemo(() => {
    if (items === null) return null;
    const needle = query.trim().toLowerCase();
    return items.filter((m) =>
      (statusFilter === 'all' || m.status === statusFilter)
      && (needle.length === 0
        || m.title.toLowerCase().includes(needle)
        || m.body.toLowerCase().includes(needle)
        || m.id.toLowerCase().includes(needle)));
  }, [items, query, statusFilter]);

  const searching = query.trim().length > 0;
  const visible = filtered !== null ? (searching || showAll ? filtered.slice(0, 200) : filtered.slice(0, PAGE)) : null;
  const activeCount = items?.filter((m) => m.status === 'active').length ?? 0;

  const runMutation = (id: string, action: () => Promise<unknown>): void => {
    setBusyId(id);
    setMutateError(null);
    action()
      .then(() => { reloadRef.current?.(); setEditing(null); setArchiving(null); })
      .catch((e: unknown) => { if (e instanceof ApiError) setMutateError(e); })
      .finally(() => { setBusyId(null); });
  };

  return (
    <div className="lab-root">
      <header className="lab-topline">
        <span className="lab-title">{t('memory.title')}</span>
        <span className="lab-spacer" />
        {items !== null && items.length > 0 && (
          complete
            ? <span className="lib-stats">{t('memory.stats', { n: items.length, m: activeCount })}</span>
            : <span className="lib-stats">{t('memory.statsCapped', { n: items.length })}</span>
        )}
        <a
          className="btn btn--small"
          href="/api/v1/memory/export"
          download="farlab-memory.json"
          aria-label={t('memory.export')}
          title={t('memory.exportHint')}
        >
          <Download size={12} aria-hidden="true" /> {t('memory.export')}
        </a>
      </header>

      <main className="queue-canvas">
        {error !== null && <ErrorBox error={error} onRetry={() => { setItems(null); setError(null); load(); }} />}
        {mutateError !== null && <ErrorBox error={mutateError} onRetry={() => setMutateError(null)} />}

        {items === null && error === null && <p className="queue-empty">{t('memory.loading')}</p>}

        {items !== null && items.length === 0 && error === null && (
          <section className="lib-empty" aria-labelledby="mem-empty-title">
            <Brain size={28} aria-hidden="true" />
            <h2 id="mem-empty-title">{t('memory.emptyTitle')}</h2>
            <p>{t('memory.emptyBody')}</p>
          </section>
        )}

        {visible !== null && (visible.length > 0 || (filtered !== null && filtered.length === 0 && items !== null && items.length > 0)) && (
          <section className="queue-section" aria-labelledby="mem-rows">
            <div className="queue-section-head">
              <h2 className="queue-section-title" id="mem-rows">{t('memory.rowsTitle')}</h2>
              <div className="mem-filters" role="group" aria-label={t('memory.statusFilter')}>
                <button
                  type="button"
                  className={`mem-chip${statusFilter === 'all' ? ' is-active' : ''}`}
                  aria-pressed={statusFilter === 'all'}
                  onClick={() => setStatusFilter('all')}
                >
                  {t('memory.statusFilterAll')}
                </button>
                {STATUS_VALUES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`mem-chip${statusFilter === s ? ' is-active' : ''}`}
                    aria-pressed={statusFilter === s}
                    onClick={() => setStatusFilter(s)}
                  >
                    {vocabLabel(STATUS_KEYS, s)}
                  </button>
                ))}
                <div className="lab-search">
                  <input
                    type="search"
                    value={query}
                    placeholder={t('memory.search')}
                    aria-label={t('memory.search')}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <p className="queue-section-sub">{t('memory.rowsSub')}</p>
            {visible.length === 0 && (
              /* A filter that matches nothing must not strand the researcher:
                 the filter bar stays, with an honest no-match line. */
              <p className="queue-empty">{t('memory.noMatch')}</p>
            )}
            {visible.map((m) => (
              <article key={m.id} className={`lib-row${m.status !== 'active' ? ' mem-row--inactive' : ''}`}>
                <div className="lib-row-main">
                  <button
                    type="button"
                    className="mem-title-button"
                    aria-expanded={expanded === m.id}
                    onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                  >
                    <h3 className="lib-title" title={m.title}>{m.title}</h3>
                  </button>
                  <p className="lib-meta">
                    <span className={`mem-flag mem-flag--${m.trustClass.startsWith('own_') ? 'own' : 'ext'}`}>
                      {vocabLabel(TRUST_KEYS, m.trustClass)}
                    </span>
                    {' · '}
                    {vocabLabel(KIND_KEYS, m.kind)}
                    {' · '}
                    {vocabLabel(STATUS_KEYS, m.status)}
                    {' · '}
                    <TimeAgo iso={m.createdAt} />
                    {m.supersedesId !== undefined && <> · {t('memory.supersedes')}</>}
                  </p>
                  {expanded === m.id && (
                    <div className="mem-detail">
                      <p className="mem-body">{m.body}</p>
                      {m.failureReason !== undefined && (
                        <p className="mem-meta-line">{t('memory.failureReason')}: {m.failureReason}</p>
                      )}
                      <dl className="mem-meta-list">
                        <div><dt>{t('memory.detail.id')}</dt><dd>{m.id}</dd></div>
                        <div><dt>{t('memory.detail.entityType')}</dt><dd>{m.entityType}</dd></div>
                        <div><dt>{t('memory.detail.trustTaint')}</dt><dd>{m.trustClass} / {m.taint}</dd></div>
                        {m.outcome !== undefined && <div><dt>{t('memory.detail.outcome')}</dt><dd>{m.outcome}</dd></div>}
                        {m.supersedesId !== undefined && <div><dt>{t('memory.detail.supersedes')}</dt><dd>{m.supersedesId}</dd></div>}
                        {m.provenance.runId !== undefined && <div><dt>{t('memory.detail.run')}</dt><dd>{m.provenance.runId}</dd></div>}
                        {m.provenance.sourceRef !== undefined && <div><dt>{t('memory.detail.source')}</dt><dd>{m.provenance.sourceRef}</dd></div>}
                      </dl>
                    </div>
                  )}
                </div>
                {m.status === 'active' && (
                  <div className="mem-row-actions">
                    <button
                      type="button"
                      className="btn btn--small"
                      disabled={busyId !== null}
                      onClick={() => { setEditing(m); setArchiving(null); setMutateError(null); }}
                      aria-label={t('memory.edit')}
                    >
                      <Pencil size={12} aria-hidden="true" /> {t('memory.edit')}
                    </button>
                    <button
                      type="button"
                      className="btn btn--small btn--danger"
                      disabled={busyId !== null}
                      onClick={() => { setArchiving(m); setEditing(null); setMutateError(null); }}
                      aria-label={t('memory.archive')}
                    >
                      <Archive size={12} aria-hidden="true" /> {t('memory.archive')}
                    </button>
                  </div>
                )}
              </article>
            ))}
            {!searching && filtered !== null && filtered.length > PAGE && (
              <button
                type="button"
                className="lab-studies-toggle"
                aria-expanded={showAll}
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? t('memory.collapse') : t('memory.showAll', { n: filtered.length })}
              </button>
            )}
          </section>
        )}

        {editing !== null && (
          <EditDrawer
            item={editing}
            busy={busyId !== null}
            onCancel={() => setEditing(null)}
            onSubmit={(fields) => runMutation(editing.id, () => editMemoryItem(editing.id, fields))}
          />
        )}
        {archiving !== null && (
          <ArchiveConfirm
            item={archiving}
            busy={busyId !== null}
            onCancel={() => setArchiving(null)}
            onConfirm={(reason) => runMutation(archiving.id, () => archiveMemoryItem(archiving.id, reason))}
          />
        )}
      </main>
    </div>
  );
}

function EditDrawer({ item, busy, onCancel, onSubmit }: {
  item: MemoryItemView;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (fields: { title?: string; body?: string; failureReason?: string; reason: string }) => void;
}): JSX.Element {
  const { t } = useI18n();
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body);
  const [failureReason, setFailureReason] = useState(item.failureReason ?? '');
  const [reason, setReason] = useState('');
  const reasonRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { reasonRef.current?.focus(); }, []);
  const disabled = busy || reason.trim().length === 0;
  return (
    <section className="mem-dialog" role="dialog" aria-modal="true" aria-labelledby="mem-edit-title">
      <h2 id="mem-edit-title">{t('memory.editTitle')}</h2>
      <p className="mem-dialog-note">{t('memory.editNote')}</p>
      <label className="mem-field">
        <span>{t('memory.fieldTitle')}</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      </label>
      <label className="mem-field">
        <span>{t('memory.fieldBody')}</span>
        <textarea value={body} rows={5} onChange={(e) => setBody(e.target.value)} />
      </label>
      {item.kind === 'experiment_outcome' && item.outcome === 'failed' && (
        <label className="mem-field">
          <span>{t('memory.failureReason')}</span>
          <textarea value={failureReason} rows={2} onChange={(e) => setFailureReason(e.target.value)} />
        </label>
      )}
      <label className="mem-field">
        <span>{t('memory.editReason')}</span>
        <textarea ref={reasonRef} value={reason} rows={2} onChange={(e) => setReason(e.target.value)} maxLength={2_000} />
      </label>
      <div className="mem-dialog-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>{t('memory.cancel')}</button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={disabled}
          onClick={() => onSubmit({
            ...(title !== item.title ? { title } : {}),
            ...(body !== item.body ? { body } : {}),
            ...(failureReason !== (item.failureReason ?? '') ? { failureReason } : {}),
            reason: reason.trim(),
          })}
        >
          {busy ? t('memory.saving') : t('memory.editSubmit')}
        </button>
      </div>
    </section>
  );
}

function ArchiveConfirm({ item, busy, onCancel, onConfirm }: {
  item: MemoryItemView;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  const [armed, setArmed] = useState(false);
  const [reason, setReason] = useState('');
  const reasonRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { if (armed) reasonRef.current?.focus(); }, [armed]);
  return (
    <section className="mem-dialog" role="dialog" aria-modal="true" aria-labelledby="mem-archive-title">
      <h2 id="mem-archive-title">{t('memory.archiveTitle')}</h2>
      <p className="mem-dialog-note">{t('memory.archiveNote')}</p>
      <p className="mem-meta-line" title={item.title}>{item.title}</p>
      {!armed ? (
        <div className="mem-dialog-actions">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>{t('memory.cancel')}</button>
          <button type="button" className="btn btn--danger" onClick={() => setArmed(true)}>{t('memory.archiveArm')}</button>
        </div>
      ) : (
        <>
          <label className="mem-field">
            <span>{t('memory.archiveReason')}</span>
            <textarea ref={reasonRef} value={reason} rows={2} onChange={(e) => setReason(e.target.value)} maxLength={2_000} />
          </label>
          <div className="mem-dialog-actions">
            <button type="button" className="btn" onClick={() => setArmed(false)} disabled={busy}>{t('memory.back')}</button>
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy || reason.trim().length === 0}
              onClick={() => onConfirm(reason.trim())}
            >
              {busy ? t('memory.saving') : t('memory.archiveConfirm')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
