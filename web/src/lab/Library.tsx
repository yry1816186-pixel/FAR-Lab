import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Search } from 'lucide-react';
import { ApiError } from '../api/client';
import { getLibrarySources } from '../api/endpoints';
import type { LibrarySource, RunSummary } from '../api/types';
import { ErrorBox, TimeAgo } from '../components/common';
import { useI18n } from '../i18n/LanguageContext';
import type { DictKey } from '../i18n/dict';
import { decodeEntities } from './bilingual';
import { runLabel } from '../studies';
import './lab.css';

/** Studies listed per document before the inline "…more" suffix. */
const RUN_CHIPS = 3;
/** Rows rendered before the expand toggle (search overrides). */
const PAGE = 30;

/** Closed vocabularies → dict keys (template-string keys don't type-narrow;
 *  an unknown value renders its raw string — honest, never a wrong label). */
const FAMILY_KEYS: Record<string, DictKey> = {
  openalex: 'library.family.openalex', arxiv: 'library.family.arxiv', crossref: 'library.family.crossref',
  europepmc: 'library.family.europepmc', user_provided: 'library.family.user_provided',
};
const DEPTH_KEYS: Record<string, DictKey> = {
  metadata_only: 'library.depth.metadata_only', abstract: 'library.depth.abstract',
  full_text: 'library.depth.full_text', data: 'library.depth.data',
};
const RETRACTION_KEYS: Record<string, DictKey> = {
  retracted: 'library.retraction.retracted', corrected: 'library.retraction.corrected',
  expression_of_concern: 'library.retraction.expression_of_concern', reinstated: 'library.retraction.reinstated',
};

/**
 * Workspace literature library (Bohrium-style knowledge base, truth-plane
 * edition): every DISTINCT document the studies retrieved, deduplicated
 * server-side by persistent identifier. A row links back to every study that
 * used the document — the library is an index over earned evidence, never a
 * fabricated collection.
 */
export function Library({ runs, onOpenStudy }: {
  runs: RunSummary[];
  onOpenStudy: (runId: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  const [sources, setSources] = useState<LibrarySource[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const c = new AbortController();
    getLibrarySources(c.signal)
      .then((s) => { setSources(s); setError(null); })
      .catch((e: unknown) => { if (e instanceof ApiError) setError(e); setSources([]); });
    return () => c.abort();
  }, []);

  const runLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of runs) m.set(r.id, runLabel(r));
    return m;
  }, [runs]);
  // Vocabulary labeler: dict key when known, raw value otherwise.
  const vocabLabel = (keys: Record<string, DictKey>, value: string): string =>
    keys[value] !== undefined ? t(keys[value]) : value;

  const filtered = useMemo(() => {
    if (sources === null) return null;
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return sources;
    return sources.filter((s) =>
      s.title.toLowerCase().includes(needle)
      || s.authors.some((a) => a.toLowerCase().includes(needle))
      || (s.venue ?? '').toLowerCase().includes(needle));
  }, [sources, query]);

  const searching = query.trim().length > 0;
  const visible = filtered !== null ? (searching || showAll ? filtered.slice(0, 200) : filtered.slice(0, PAGE)) : null;
  const studyCount = new Set(sources?.flatMap((s) => s.runIds) ?? []).size;

  return (
    <div className="lab-root">
      <header className="lab-topline">
        <span className="lab-title">{t('library.title')}</span>
        <span className="lab-spacer" />
        {sources !== null && sources.length > 0 && (
          <span className="lib-stats">{t('library.stats', { n: sources.length, m: studyCount })}</span>
        )}
      </header>

      <main className="queue-canvas">
        {error !== null && <ErrorBox error={error} onRetry={() => { setSources(null); setError(null); }} />}

        {sources === null && error === null && <p className="queue-empty">{t('library.loading')}</p>}

        {sources !== null && sources.length === 0 && error === null && (
          <section className="lib-empty" aria-labelledby="lib-empty-title">
            <BookOpen size={28} aria-hidden="true" />
            <h2 id="lib-empty-title">{t('library.emptyTitle')}</h2>
            <p>{t('library.emptyBody')}</p>
          </section>
        )}

        {visible !== null && visible.length > 0 && (
          <section className="queue-section" aria-labelledby="lib-docs">
            <div className="queue-section-head">
              <h2 className="queue-section-title" id="lib-docs">{t('library.docsTitle')}</h2>
              <div className="lab-search">
                <Search size={12} aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  placeholder={t('library.search')}
                  aria-label={t('library.search')}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
            <p className="queue-section-sub">{t('library.docsSub')}</p>
            {visible.map((s) => (
              <article key={s.id} className="lib-row">
                <div className="lib-row-main">
                  <h3 className="lib-title" title={decodeEntities(s.title)}>
                    {s.retractionStatus !== undefined && <span className="lib-flag lib-flag--retracted">{vocabLabel(RETRACTION_KEYS, s.retractionStatus)}</span>}
                    {decodeEntities(s.title)}
                  </h3>
                  <p className="lib-meta">
                    {s.authors.length > 0 && (
                      <>
                        {s.authors.slice(0, 3).join(', ')}
                        {s.authorCount > 3 ? ` … (${s.authorCount})` : ''}
                        {' · '}
                      </>
                    )}
                    {s.publicationYear ?? t('library.yearUnknown')}
                    {s.venue !== null && <> · {s.venue}</>}
                    {' · '}
                    {vocabLabel(DEPTH_KEYS, s.contentDepth)}
                    {' · '}
                    {vocabLabel(FAMILY_KEYS, s.family)}
                    {' · '}
                    <TimeAgo iso={s.retrievedAt} />
                  </p>
                </div>
                <div className="lib-row-runs">
                  {s.runIds.slice(0, RUN_CHIPS).map((rid) => {
                    const label = runLabelById.get(rid);
                    const short = label !== undefined && label.length > 26 ? `${label.slice(0, 26)}…` : label;
                    return (
                      <button
                        type="button"
                        key={rid}
                        className="lib-run-chip"
                        onClick={() => onOpenStudy(rid)}
                        title={label ?? rid}
                      >
                        {short ?? rid}
                      </button>
                    );
                  })}
                  {s.runIds.length > RUN_CHIPS && (
                    <span className="lib-run-more" title={s.runIds.slice(RUN_CHIPS).map((rid) => runLabelById.get(rid) ?? rid).join('\n')}>
                      +{s.runIds.length - RUN_CHIPS}
                    </span>
                  )}
                </div>
              </article>
            ))}
            {!searching && filtered !== null && filtered.length > PAGE && (
              <button
                type="button"
                className="lab-studies-toggle"
                aria-expanded={showAll}
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? t('library.collapse') : t('library.showAll', { n: filtered.length })}
              </button>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
