import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ApiError } from './api/client';
import { getEvents, getRun, listRuns } from './api/endpoints';
import type { ResearchRun, RunEvent, RunSummary } from './api/types';
import { useI18n } from './i18n/LanguageContext';
import { usePolling } from './hooks/usePolling';
import { useConnection } from './state/connection';
import { NewRunForm } from './components/NewRunForm';
import { RunsList } from './components/RunsSidebar';
import { RunDetail } from './components/RunDetail';
import type { EventsState } from './components/RunDetail';
import { ErrorBox } from './components/common';

const RUNS_POLL_MS = 5_000;
const DETAIL_POLL_ACTIVE_MS = 3_000;
const DETAIL_POLL_WAITING_MS = 10_000;
const EVENTS_POLL_MS = 2_000;
const MAX_EVENTS_KEPT = 2_000;

export function App(): JSX.Element {
  const { t, lang, setLang } = useI18n();
  const { online, markOnline, markOffline } = useConnection();

  // ---- runs list (5s poll) ----
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError] = useState<ApiError | null>(null);

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const refreshRuns = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      try {
        const list = await listRuns(signal);
        setRuns(list);
        setRunsError(null);
        markOnline();
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setRunsError(e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }));
        markOffline();
      } finally {
        setRunsLoading(false);
      }
    },
    [markOnline, markOffline],
  );

  const refreshRunsWithAbort = useCallback((): Promise<void> => {
    const controller = new AbortController();
    return refreshRuns(controller.signal);
  }, [refreshRuns]);

  usePolling(refreshRunsWithAbort, RUNS_POLL_MS, true);

  // Keep a valid selection: drop it if the run disappears from the list.
  useEffect(() => {
    if (selectedRunId !== null && !runsLoading && runs.length > 0 && !runs.some((r) => r.id === selectedRunId)) {
      setSelectedRunId(runs[0]!.id);
    }
  }, [runs, runsLoading, selectedRunId]);

  // ---- selected run detail (adaptive poll; settled runs poll only on demand) ----
  const [runDetail, setRunDetail] = useState<ResearchRun | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<ApiError | null>(null);

  const refreshDetail = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      if (selectedRunId === null) return;
      try {
        const run = await getRun(selectedRunId, signal);
        setRunDetail(run);
        setDetailError(null);
        markOnline();
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setDetailError(e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }));
        markOffline();
      }
    },
    [selectedRunId, markOnline, markOffline],
  );

  // Full reload on selection change.
  useEffect(() => {
    if (selectedRunId === null) {
      setRunDetail(null);
      setDetailError(null);
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    void refreshDetail(controller.signal).finally(() => setDetailLoading(false));
    return () => controller.abort();
  }, [selectedRunId, refreshDetail]);

  const detailStatus = runDetail?.status;
  const detailActive = detailStatus !== undefined && (detailStatus === 'running' || detailStatus === 'queued');
  const detailWaiting = detailStatus !== undefined && (detailStatus === 'paused' || detailStatus === 'partial');
  usePolling(
    useCallback((): Promise<void> => {
      const controller = new AbortController();
      return refreshDetail(controller.signal);
    }, [refreshDetail]),
    detailActive ? DETAIL_POLL_ACTIVE_MS : DETAIL_POLL_WAITING_MS,
    selectedRunId !== null && (detailActive || detailWaiting),
  );

  // ---- events (2s incremental poll, seq cursor; resets on run switch) ----
  const [events, setEvents] = useState<RunEvent[]>([]);
  const lastSeqRef = useRef(0);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [eventsError, setEventsError] = useState<string | null>(null);

  useEffect(() => {
    setEvents([]);
    setEventsTotal(0);
    setEventsError(null);
    lastSeqRef.current = 0;
  }, [selectedRunId]);

  const pollEvents = useCallback((): Promise<void> => {
    if (selectedRunId === null) return Promise.resolve();
    const controller = new AbortController();
    return (async () => {
      try {
        const incoming = await getEvents(selectedRunId, lastSeqRef.current, controller.signal);
        if (incoming.length > 0) {
          const maxSeq = incoming[incoming.length - 1]!.seq;
          lastSeqRef.current = Math.max(lastSeqRef.current, maxSeq);
          setEventsTotal((n) => n + incoming.length);
          setEvents((prev) => {
            const merged = [...prev, ...incoming];
            return merged.length > MAX_EVENTS_KEPT ? merged.slice(merged.length - MAX_EVENTS_KEPT) : merged;
          });
        }
        setEventsError(null);
        markOnline();
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setEventsError(e instanceof Error ? e.message : String(e));
        markOffline();
      }
    })();
  }, [selectedRunId, markOnline, markOffline]);

  // Poll events for any selected run except hard-terminal failed/cancelled:
  // a completed run can still receive feedback (feedback -> revision) events.
  const eventsEnabled = selectedRunId !== null && detailStatus !== 'failed' && detailStatus !== 'cancelled';
  usePolling(pollEvents, EVENTS_POLL_MS, eventsEnabled);

  const eventsState = useMemo<EventsState>(
    () => ({ events, lastSeq: lastSeqRef.current, total: eventsTotal, error: eventsError }),
    [events, eventsTotal, eventsError],
  );

  // ---- cross-refresh after mutations (create/cancel/resume/feedback) ----
  const onMutated = useCallback((): void => {
    void refreshRunsWithAbort();
    void refreshDetail();
  }, [refreshRunsWithAbort, refreshDetail]);

  const onCreated = useCallback((runId: string): void => {
    setSelectedRunId(runId);
    void refreshRunsWithAbort();
  }, [refreshRunsWithAbort]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <h1>{t('app.title')}</h1>
          <p className="muted">{t('app.subtitle')}</p>
        </div>
        <div className="app-header-right">
          <div className={`conn ${online ? 'conn--online' : 'conn--offline'}`} role="status">
            <span className="conn-dot" aria-hidden="true" />
            {online ? <span className="sr-only">{t('conn.online')}</span> : t('conn.offline')}
          </div>
          <div className="lang-toggle" role="group" aria-label={t('app.langToggle')}>
            <button
              type="button"
              className={`lang-btn${lang === 'zh' ? ' lang-btn--active' : ''}`}
              aria-pressed={lang === 'zh'}
              onClick={() => setLang('zh')}
            >
              {t('app.langZh')}
            </button>
            <button
              type="button"
              className={`lang-btn${lang === 'en' ? ' lang-btn--active' : ''}`}
              aria-pressed={lang === 'en'}
              onClick={() => setLang('en')}
            >
              {t('app.langEn')}
            </button>
          </div>
        </div>
      </header>

      {!online && (
        <div className="offline-banner" role="alert">
          {t('conn.offline')}
        </div>
      )}

      <div className="app-body">
        <aside className="sidebar" aria-label={t('runs.title')}>
          <div className="sidebar-head">
            <h2 className="sidebar-title">{t('runs.title')}</h2>
            <button type="button" className="btn btn--small" onClick={() => void refreshRunsWithAbort()}>
              <RefreshCw size={12} aria-hidden="true" /> {t('runs.refresh')}
            </button>
          </div>
          {runsError !== null && <ErrorBox error={runsError} onRetry={() => void refreshRunsWithAbort()} />}
          <RunsList
            runs={runs}
            loading={runsLoading}
            selectedId={selectedRunId}
            onSelect={setSelectedRunId}
          />
          <NewRunForm onCreated={onCreated} />
        </aside>

        <main className="content" aria-label={t('app.title')}>
          {selectedRunId === null || runDetail === null ? (
            detailLoading && selectedRunId !== null ? (
              <div className="select-hint" role="status">
                {t('common.loading')}
              </div>
            ) : detailError !== null && selectedRunId !== null ? (
              <ErrorBox error={detailError} onRetry={() => void refreshDetail()} />
            ) : (
              <div className="select-hint">
                <p>{t('common.selectRun')}</p>
                <p className="muted">{t('common.selectRunHint')}</p>
              </div>
            )
          ) : (
            <RunDetail run={runDetail} events={eventsState} onMutated={onMutated} />
          )}
        </main>
      </div>
    </div>
  );
}
