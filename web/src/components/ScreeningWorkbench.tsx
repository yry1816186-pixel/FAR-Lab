import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleSlash, Loader2, X } from 'lucide-react';
import { useI18n } from '../i18n/LanguageContext';
import { decideScreening, getScreening, stopScreening } from '../api/endpoints';
import { ApiError } from '../api/client';
import type { ScreeningView } from '../api/types';
import { ErrorBox } from './common';

/**
 * Active-learning screening workbench (ASReview-pattern, user-approved
 * 2026-08-24): one card at a time, include/exclude, real progress, and an
 * honest WSS@95-style stop estimate. Every displayed number maps to server
 * truth — no invented percentages.
 */

export function ScreeningWorkbench({ runId, onClose }: { runId: string; onClose: () => void }): JSX.Element | null {
  const { t } = useI18n();
  const [view, setView] = useState<ScreeningView | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [stoppedNote, setStoppedNote] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    getScreening(runId, controller.signal)
      .then((v) => { setView(v); setBusy(false); })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e instanceof ApiError ? e : null);
        setBusy(false);
      });
    return () => controller.abort();
  }, [runId]);

  const decide = useCallback((verdict: 'include' | 'exclude'): void => {
    const card = view?.next[0];
    if (view === null || card === undefined || busy) return;
    setBusy(true);
    decideScreening(runId, card.srcId, verdict)
      .then((r) => { setView(r.view); setBusy(false); })
      .catch((e: unknown) => { setError(e instanceof ApiError ? e : null); setBusy(false); });
  }, [view, busy, runId]);

  const stop = useCallback((): void => {
    if (busy) return;
    setBusy(true);
    stopScreening(runId)
      .then((r) => {
        setView(r.view);
        setStoppedNote(t('screening.stoppedNote', {
          n: r.view.session.includeCount,
          m: r.view.session.excludeCount,
        }) + (r.feedbackId !== undefined ? ` · ${t('screening.feedbackRecorded')}` : ''));
        setBusy(false);
      })
      .catch((e: unknown) => { setError(e instanceof ApiError ? e : null); setBusy(false); });
  }, [busy, runId, t]);

  // Keyboard: I/E decide, Esc closes (dialog discipline from CommandPalette).
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { onClose(); return; }
      if (stoppedNote !== null) return;
      if (e.key === 'i' || e.key === 'I') decide('include');
      if (e.key === 'e' || e.key === 'E') decide('exclude');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [decide, onClose, stoppedNote]);

  const card = view?.next[0];
  const labeled = view !== null ? view.session.includeCount + view.session.excludeCount : 0;
  const pool = view?.session.poolSize ?? 0;
  const progressPct = pool > 0 ? Math.round((labeled / pool) * 100) : 0;
  const done = view !== null && (view.session.state === 'stopped' || (card === undefined && labeled >= pool));

  return (
    <div
      className="zotero-overlay"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        className="zotero-panel screening-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('screening.title')}
      >
        <div className="sidebar-head">
          <h2 className="sidebar-title">{t('screening.title')}</h2>
          <div className="sidebar-head-actions">
            <button type="button" className="btn btn--small" onClick={onClose}>
              <X size={12} aria-hidden="true" /> {t('settings.cancel')}
            </button>
          </div>
        </div>

        {error !== null && <div className="screening-pad"><ErrorBox error={error} onRetry={() => { setError(null); void getScreening(runId).then(setView).catch(() => { /* retry shows via error state */ }); }} /></div>}

        {view !== null && (
          <div className="screening-body">
            {/* Progress: real labeled/pool ratio — nothing else. */}
            <div className="screening-progress" aria-label={t('screening.progress')}>
              <div className="screening-progress-bar">
                <div className="screening-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="muted small mono">{labeled}/{pool}</span>
              <span className="badge badge--ok">{t('screening.included', { n: view.session.includeCount })}</span>
              <span className="badge">{t('screening.excluded', { n: view.session.excludeCount })}</span>
            </div>

            {view.session.corpusGrew && (
              <p className="callout callout--warn small screening-pad-x">{t('screening.corpusGrew')}</p>
            )}

            {stoppedNote !== null || done ? (
              <div className="screening-done" role="status">
                <CheckCircle2 size={20} aria-hidden="true" />
                <p>{stoppedNote ?? t('screening.allLabeled', { n: view.session.includeCount, m: view.session.excludeCount })}</p>
                <p className="muted small">{t('screening.doneHint')}</p>
                <button type="button" className="btn btn--primary" onClick={onClose}>{t('common.close')}</button>
              </div>
            ) : card !== undefined ? (
              <>
                <article className="screening-card" aria-live="polite">
                  <div className="screening-card-top">
                    <h3 className="screening-card-title">{card.title}</h3>
                    <span className="muted small">
                      {card.year !== undefined ? `${card.year} · ` : ''}{card.authors.slice(0, 3).join(', ')}
                    </span>
                  </div>
                  {card.abstractText !== undefined && card.abstractText.length > 0
                    ? <p className="screening-card-abs">{card.abstractText}</p>
                    : <p className="muted small">{t('screening.noAbstract')}</p>}
                  <p className="muted small">
                    {card.phase === 'random'
                      ? t('screening.whyRandom')
                      : t('screening.whyModel', { p: Math.round((card.pRelevant ?? 0) * 100) })}
                  </p>
                </article>
                <div className="screening-actions">
                  <button type="button" className="btn btn--primary" disabled={busy} onClick={() => decide('include')}>
                    <CheckCircle2 size={14} aria-hidden="true" /> {t('screening.include')} <kbd>I</kbd>
                  </button>
                  <button type="button" className="btn" disabled={busy} onClick={() => decide('exclude')}>
                    <CircleSlash size={14} aria-hidden="true" /> {t('screening.exclude')} <kbd>E</kbd>
                  </button>
                </div>
                {busy && <p className="muted small"><Loader2 size={12} className="spin" aria-hidden="true" /> {t('screening.saving')}</p>}
              </>
            ) : (
              <div className="screening-done"><Loader2 size={20} className="spin" aria-hidden="true" /><p>{t('screening.loadingQueue')}</p></div>
            )}

            {/* Stop estimate: honest basis, eligible highlight — researcher decides. */}
            <div className={`screening-stop${view.stop.eligible ? ' screening-stop--eligible' : ''}`} role="status">
              <p className="small">{view.stop.basis}</p>
              <div className="screening-stop-actions">
                {view.stop.coverageEstimate !== null && (
                  <span className="muted small mono">
                    {t('screening.coverage', { p: Math.round(view.stop.coverageEstimate * 100) })}
                  </span>
                )}
                <button type="button" className="btn btn--small" disabled={busy || labeled === 0} onClick={stop}>
                  {t('screening.stop')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
