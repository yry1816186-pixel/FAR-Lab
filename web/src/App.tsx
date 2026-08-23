import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellOff, RefreshCw, Search, Settings } from 'lucide-react';
import { ApiError } from './api/client';
import { getEvents, getRun, listRuns, listConversations, searchAll } from './api/endpoints';
import type { Conversation, ResearchRun, RunEvent, RunSummary } from './api/types';
import { useI18n } from './i18n/LanguageContext';
import { usePolling } from './hooks/usePolling';
import { useEventStream } from './hooks/useEventStream';
import { useNotifications } from './hooks/useNotifications';
import { useAxeAudit } from './hooks/useAxeAudit';
import { useWebVitals } from './hooks/useWebVitals';
import { parseHash, useHashRoute } from './hooks/useHashRoute';
import { useConnection } from './state/connection';
import { useTheme } from './state/theme';
import { LogoFull } from './components/Logo';
import { WelcomeView } from './components/WelcomeView';
import { ConversationView } from './components/ConversationView';
import { RunsList, runLabel } from './components/RunsSidebar';
import { AwarenessBar } from './components/AwarenessBar';
import { RunDetail, resolveTabId } from './components/RunDetail';
import { CommandPalette, type Command, type PaletteSearch } from './components/CommandPalette';
import { SettingsPanel } from './components/SettingsPanel';
import { useToolCommands } from './hooks/useToolCommands';
import type { EventsState } from './components/RunDetail';
import { Badge, ErrorBox, TimeAgo } from './components/common';
import { runStatusKey, runStatusTone } from './tones';

const RUNS_POLL_MS = 5_000;
const DETAIL_POLL_ACTIVE_MS = 3_000;
const DETAIL_POLL_WAITING_MS = 10_000;
const EVENTS_POLL_MS = 2_000;
/** Safety-net cadence while SSE push is healthy (B3). */
const EVENTS_POLL_SSE_MS = 15_000;
const MAX_EVENTS_KEPT = 2_000;

export function App(): JSX.Element {
  const { t, lang, setLang } = useI18n();
  useAxeAudit(import.meta.env.DEV); // R3: dev-only axe-core a11y audit → console
  useWebVitals(); // B14: dev-only field vitals (LCP/INP/CLS/TTFB + attribution) → console
  const { online, markOnline, markOffline } = useConnection();
  const { theme, cycleTheme } = useTheme();

  // ---- runs list (5s poll) ----
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError] = useState<ApiError | null>(null);

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // ---- conversations (conversation-first flow) ----
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  // ---- unified sidebar timeline (design fix 2026-08-23): ONE search box filters
  // both conversations and studies; studies show their source conversation, and
  // conversation entries inline the studies they launched — records are findable
  // from both sides instead of living in two disconnected lists. ----
  const [sidebarQuery, setSidebarQuery] = useState('');
  const openConversationRef = useRef<((id: string) => void) | null>(null);
  const runsById = useMemo(() => new Map(runs.map((r) => [r.id, r] as const)), [runs]);
  const sourceByRunId = useMemo(() => {
    const m = new Map<string, { title: string; open: () => void }>();
    for (const c of conversations) {
      for (const rid of c.runIds) m.set(rid, { title: c.title, open: () => { void openConversationRef.current?.(c.id); } });
    }
    return m;
  }, [conversations]);
  const visibleConversations = useMemo(() => {
    const q = sidebarQuery.trim().toLowerCase();
    if (q.length === 0) return conversations.slice(0, 12);
    return conversations.filter((c) => {
      if (c.title.toLowerCase().includes(q)) return true;
      return c.runIds.some((rid) => {
        const r = runsById.get(rid);
        return r !== undefined && runLabel(r).toLowerCase().includes(q);
      });
    }).slice(0, 30);
  }, [conversations, sidebarQuery, runsById]);
  const refreshConversations = useCallback((): Promise<void> => {
    const controller = new AbortController();
    return listConversations(controller.signal)
      .then((list) => { setConversations(list); })
      .catch(() => { /* sidebar list degrades quietly; the view itself fails visibly */ });
  }, []);
  useEffect(() => { void refreshConversations(); }, [refreshConversations]);
  const openConversation = useCallback((id: string): void => {
    setSelectedConvId(id);
    setSelectedRunId(null);
    void refreshConversations();
  }, [refreshConversations]);
  openConversationRef.current = openConversation; // unified-timeline source links

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

  // Keep the selection honest: if the selected run vanished from a FRESH list
  // (no delete API exists today; DB reset is the realistic path), deselect back
  // to the welcome view. Never silently swap the researcher to a different
  // study — context switching on their behalf breaks train of thought (B1 P0:
  // this guard fired on the STALE list right after run creation and hijacked
  // the selection to an unrelated run, corrupting the hash URL too).
  useEffect(() => {
    if (selectedRunId !== null && !runsLoading && runs.length > 0 && !runs.some((r) => r.id === selectedRunId)) {
      setSelectedRunId(null);
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

  // Track the in-flight events request so it can be cancelled (WP2 F-03): without
  // this, a slow poll from the PREVIOUS run can resolve after a run switch and append
  // its events into the new run's list, and rapid switches leak pending fetches.
  const eventsAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => { eventsAbortRef.current?.abort(); }, []);

  const applyIncomingEvents = useCallback((incoming: RunEvent[]): void => {
    if (incoming.length === 0) return;
    // Shared merge path for polled AND streamed events (B3): the seq cursor
    // makes SSE redelivery after reconnect idempotent.
    const fresh = incoming.filter((e) => e.seq > lastSeqRef.current);
    if (fresh.length === 0) return;
    const maxSeq = fresh[fresh.length - 1]!.seq;
    lastSeqRef.current = Math.max(lastSeqRef.current, maxSeq);
    setEventsTotal((n) => n + fresh.length);
    setEvents((prev) => {
      const merged = [...prev, ...fresh];
      return merged.length > MAX_EVENTS_KEPT ? merged.slice(merged.length - MAX_EVENTS_KEPT) : merged;
    });
  }, []);

  const pollEvents = useCallback((): Promise<void> => {
    if (selectedRunId === null) return Promise.resolve();
    eventsAbortRef.current?.abort();
    const controller = new AbortController();
    eventsAbortRef.current = controller;
    return (async () => {
      try {
        const incoming = await getEvents(selectedRunId, lastSeqRef.current, controller.signal);
        applyIncomingEvents(incoming);
        setEventsError(null);
        markOnline();
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setEventsError(e instanceof Error ? e.message : String(e));
        markOffline();
      }
    })();
  }, [selectedRunId, markOnline, markOffline, applyIncomingEvents]);

  // Poll events for any selected run except hard-terminal failed/cancelled:
  // a completed run can still receive feedback (feedback -> revision) events.
  const eventsEnabled = selectedRunId !== null && detailStatus !== 'failed' && detailStatus !== 'cancelled';
  // B3 realtime: SSE push is primary; polling continues as a safety net at a
  // slower cadence while the stream is healthy.
  const stream = useEventStream(selectedRunId, eventsEnabled, applyIncomingEvents);
  usePolling(pollEvents, stream.phase === 'live' ? EVENTS_POLL_SSE_MS : EVENTS_POLL_MS, eventsEnabled);

  // Initial events fetch on run selection (parity with the detail fetch above):
  // the visibility-gated poll may legitimately skip every tick while the page
  // is hidden (deep link opened into a background tab; embedded webviews whose
  // visibilityState stays hidden) — event history must not depend on that.
  // The reset effect above is declared first, so state clears before this fills.
  useEffect(() => {
    if (selectedRunId === null) return;
    void pollEvents();
  }, [selectedRunId, pollEvents]);

  const eventsState = useMemo<EventsState>(
    () => ({ events, lastSeq: lastSeqRef.current, total: eventsTotal, error: eventsError }),
    [events, eventsTotal, eventsError],
  );

  // ---- cross-refresh after mutations (create/cancel/resume/feedback) ----
  const onMutated = useCallback((): void => {
    void refreshRunsWithAbort();
    void refreshDetail();
  }, [refreshRunsWithAbort, refreshDetail]);

  const onCreated = useCallback((conversationId: string): void => {
    // conversation-first: the home composer opens a brainstorming dialogue
    openConversation(conversationId);
  }, [openConversation]);

  /** Opening a run always leaves the conversation view. */
  const selectRun = useCallback((runId: string): void => {
    setSelectedRunId(runId);
    setSelectedConvId(null);
    setRouteTab(null);
  }, []);

  // ---- shareable hash route: #run/<runId>/<tab> (S3) ----
  // Mount restore + back/forward + typed links all flow through here.
  const [routeTab, setRouteTab] = useState<string | null>(null);
  useEffect(() => {
    const route = parseHash(window.location.hash);
    if (route.runId !== null) setSelectedRunId(route.runId);
    setRouteTab(route.tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only route restore
  }, []);
  useHashRoute(selectedRunId, routeTab, (route) => {
    if (route.runId !== null && route.runId !== selectedRunId) { setSelectedRunId(route.runId); setSelectedConvId(null); }
    if (route.runId === null && selectedRunId !== null) setSelectedRunId(null);
    setRouteTab(route.tab);
  });

  // ---- command palette (S5): every entry is a real capability ----
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- TIS user commands (prompt templates wired into palette + composer) ----
  const { commands: userCommands } = useToolCommands();

  const commands = useMemo<Command[]>(() => {
    const goTab = (tab: string): void => {
      if (selectedRunId === null) return;
      const resolved = resolveTabId(tab);
      if (resolved !== null) setRouteTab(resolved);
    };
    const navCmds: Command[] = selectedRunId === null
      ? []
      : (['research', 'evidence', 'hypotheses', 'plan', 'revisions', 'verify'] as const)
          .map((tab) => ({
            id: `nav-${tab}`,
            labelKey: `tab.${tab}` as Command['labelKey'],
            groupKey: 'palette.groupNav' as Command['groupKey'],
            keywords: `go ${tab}`,
            run: () => goTab(tab),
          }));
    const runCmds: Command[] = runs.slice(0, 8).map((r) => {
      const text = runLabel(r);
      return {
        id: `run-${r.id}`,
        label: text.length > 72 ? `${text.slice(0, 72)}…` : text,
        groupKey: 'palette.groupRuns' as Command['groupKey'],
        keywords: `${text} ${r.id} ${r.status}`,
        run: () => { selectRun(r.id); },
      };
    });
    // TIS user commands: palette entry inserts the prompt template into whichever
    // composer is mounted (conversation view or welcome screen) via a DOM event —
    // composer state is local, so a decoupled event avoids prop-drilling inserts.
    const userCmds: Command[] = userCommands.map((c) => ({
      id: `cmd-${c.id}`,
      label: `/${c.name} — ${c.label}`,
      groupKey: 'palette.groupCommands' as Command['groupKey'],
      keywords: `command ${c.name} ${c.label}`,
      run: () => { window.dispatchEvent(new CustomEvent('far:insert-text', { detail: { text: c.template } })); },
    }));
    return [
      {
        id: 'new-research',
        labelKey: 'welcome.newResearch',
        groupKey: 'palette.groupActions',
        run: () => { setSelectedRunId(null); setSelectedConvId(null); setRouteTab(null); },
      },
      ...navCmds,
      ...runCmds,
      ...userCmds,
      {
        id: 'settings',
        labelKey: 'palette.openSettings',
        groupKey: 'palette.groupActions',
        keywords: 'settings model provider config 配置 模型',
        run: () => setSettingsOpen(true),
      },
      {
        id: 'theme',
        labelKey: 'palette.toggleTheme',
        groupKey: 'palette.groupActions',
        run: cycleTheme,
      },
      {
        id: 'lang',
        labelKey: 'palette.toggleLang',
        groupKey: 'palette.groupActions',
        run: () => setLang(lang === 'zh' ? 'en' : 'zh'),
      },
    ];
  }, [runs, selectedRunId, cycleTheme, lang, setLang, userCommands]);

  // ---- universal search wiring (B2): palette -> cross-run object lookup ----
  // A claim hit focuses the evidence tab and flash-highlights the claim row
  // (same affordance as the ACH block); the pending id is consumed by RunDetail.
  const [focusClaimId, setFocusClaimId] = useState<string | null>(null);
  const paletteSearch = useMemo<PaletteSearch>(() => ({
    fetch: (q, signal) => searchAll(q, signal),
    navigate: {
      run: (runId) => { selectRun(runId); setFocusClaimId(null); },
      hypothesis: (runId) => { selectRun(runId); setRouteTab('hypotheses'); setFocusClaimId(null); },
      claim: (runId, claimId) => { selectRun(runId); setRouteTab('evidence'); setFocusClaimId(claimId); },
    },
    // setSelectedRunId/setRouteTab are stable state setters; routeTab semantics captured per call
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  // IDE convention: "/" focuses the task filter unless typing in a field;
  // "n" is quick capture (B2): idea friction ≈ 0 — one key from anywhere to
  // a fresh question box.
  const filterRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const inField = (el: HTMLElement | null): boolean =>
      el !== null && (
        el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
        // ARIA textbox roles and elements inside them (B2-critique F-06):
        // custom editors do not always use native input tags.
        || el.closest('[role="textbox"]') !== null
      );
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (e.key === '/') {
        if (inField(el)) return;
        e.preventDefault();
        filterRef.current?.focus();
      } else if (e.key === 'n' || e.key === 'N') {
        if (inField(el)) return;
        e.preventDefault();
        setSelectedRunId(null);
        setSelectedConvId(null);
        setRouteTab(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- B3-2: multi-run awareness + completion notifications ----
  const activeRuns = useMemo(
    () => runs.filter((r) => r.status === 'running' || r.status === 'queued'),
    [runs],
  );
  const notifications = useNotifications(
    runs,
    selectedRunId,
    useCallback((runId: string): void => { selectRun(runId); }, [selectRun]),
    useCallback((): string => t('notify.doneTitle'), [t]),
  );

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <LogoFull size={26} />
          <p className="muted">{t('app.subtitle')}</p>
        </div>
        <div className="app-header-right">
          <div className={`conn ${online ? 'conn--online' : 'conn--offline'}`} role="status">
            <span className="conn-dot" aria-hidden="true" />
            {online ? <span className="sr-only">{t('conn.online')}</span> : t('conn.offline')}
          </div>
          {notifications.supported && (
            <button
              type="button"
              className="btn btn--small palette-toggle"
              onClick={notifications.toggle}
              aria-pressed={notifications.enabled}
              title={t(notifications.enabled ? 'notify.onHint' : 'notify.offHint')}
            >
              {notifications.enabled
                ? <Bell size={12} aria-hidden="true" />
                : <BellOff size={12} aria-hidden="true" />}
            </button>
          )}
          <button
            type="button"
            className="btn btn--small palette-toggle"
            onClick={() => setSettingsOpen(true)}
            aria-label={t('settings.open')}
            title={t('settings.open')}
          >
            <Settings size={12} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn--small palette-toggle"
            onClick={() => setPaletteOpen(true)}
            title="Ctrl K"
          >
            <Search size={12} aria-hidden="true" /> {t('palette.open')}
          </button>
          <button
            type="button"
            className="theme-toggle"
            aria-label={t('app.themeToggle')}
            onClick={cycleTheme}
          >
            {t(theme === 'auto' ? 'app.themeAuto' : theme === 'light' ? 'app.themeLight' : 'app.themeDark')}
          </button>
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

      <AwarenessBar activeRuns={activeRuns} selectedRunId={selectedRunId} onSelect={selectRun} />

      <div className="app-body">
        <aside className="sidebar" aria-label={t('runs.title')}>
          {/* conversation-first: the dialogue list leads; runs live below */}
          <div className="sidebar-head">
            <h2 className="sidebar-title">{t('conv.sectionTitle')}</h2>
            <div className="sidebar-head-actions">
              <button
                type="button"
                className="btn btn--small btn--primary"
                onClick={() => { setSelectedRunId(null); setSelectedConvId(null); setRouteTab(null); }}
                aria-label={t('conv.new')}
                title={t('conv.new')}
              >
                ＋ {t('conv.new')}
              </button>
              <button type="button" className="btn btn--small" onClick={() => { void refreshConversations(); void refreshRunsWithAbort(); }}>
                <RefreshCw size={12} aria-hidden="true" /> {t('runs.refresh')}
              </button>
            </div>
          </div>
          <section className="runs-group conv-group">
            <h3 className="runs-group-title">
              <button type="button" className="runs-group-toggle" aria-expanded="true">
                <span>{t('conv.sectionTitle')} <span className="muted small">{conversations.length}</span></span>
              </button>
            </h3>
            {conversations.length === 0 ? (
              <p className="muted small conv-side-empty">{t('conv.empty')}</p>
            ) : visibleConversations.length === 0 ? (
              <p className="muted small conv-side-empty">{t('runs.filterEmpty')}</p>
            ) : (
              <ul className="runs-list">
                {visibleConversations.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`run-item${selectedConvId === c.id ? ' run-item--on' : ''}`}
                      onClick={() => openConversation(c.id)}
                      title={`${c.title} · ${c.id}`}
                    >
                      <span className="run-item-top">
                        <span className="run-item-question">{c.title}</span>
                        <span className={`badge ${c.status === 'converged' ? 'badge--ok' : 'badge--info'}`}>
                          {t(c.status === 'converged' ? 'conv.statusConverged' : 'conv.statusOpen')}
                        </span>
                      </span>
                      <span className="run-item-mid">
                        <span className="run-item-domain">{t('conv.turns', { n: c.turns })}</span>
                        <time className="mono" dateTime={c.updatedAt}><TimeAgo iso={c.updatedAt} /></time>
                      </span>
                    </button>
                    {/* Unified timeline: studies this conversation launched, inline —
                        the record is findable from the conversation side too. */}
                    {c.runIds
                      .map((rid) => runsById.get(rid))
                      .filter((r): r is NonNullable<typeof r> => r !== undefined)
                      .map((r) => (
                        <button
                          key={`${c.id}:${r.id}`}
                          type="button"
                          className={`conv-run-child${selectedRunId === r.id ? ' conv-run-child--on' : ''}`}
                          onClick={() => selectRun(r.id)}
                          title={runLabel(r)}
                        >
                          <Badge tone={runStatusTone(r.status)}>{t(runStatusKey(r.status))}</Badge>
                          <span className="conv-run-child-title">{runLabel(r)}</span>
                        </button>
                      ))}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <div className="sidebar-head sidebar-head--runs">
            <h2 className="sidebar-title">{t('runs.title')}</h2>
          </div>
          {runsError !== null && <ErrorBox error={runsError} onRetry={() => void refreshRunsWithAbort()} />}
          <RunsList
            runs={runs}
            loading={runsLoading}
            selectedId={selectedRunId}
            onSelect={selectRun}
            filterRef={filterRef}
            query={sidebarQuery}
            onQueryChange={setSidebarQuery}
            sourceByRunId={sourceByRunId}
          />
        </aside>

        <main className="content" aria-label={t('app.title')}>
          {selectedConvId !== null ? (
            <ConversationView
              conversationId={selectedConvId}
              onOpenedRun={selectRun}
              onMutated={refreshConversations}
            />
          ) : selectedRunId === null ? (
            <WelcomeView onCreated={onCreated} onOpenSettings={() => setSettingsOpen(true)} runs={runs} onSelectRun={selectRun} />
          ) : runDetail === null ? (
            detailLoading ? (
              <div className="select-hint" role="status">
                {t('common.loading')}
              </div>
            ) : detailError !== null ? (
              <ErrorBox error={detailError} onRetry={() => void refreshDetail()} />
            ) : (
              <div className="select-hint">
                <p>{t('common.selectRun')}</p>
                <p className="muted">{t('common.selectRunHint')}</p>
              </div>
            )
          ) : (
            <RunDetail
              run={runDetail}
              events={eventsState}
              onMutated={onMutated}
              tab={routeTab !== null ? resolveTabId(routeTab) ?? undefined : undefined}
              onTabChange={(tab) => setRouteTab(tab)}
              focusClaimId={focusClaimId}
              onClaimFocused={() => setFocusClaimId(null)}
              stream={stream}
            />
          )}
        </main>
      </div>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
        search={paletteSearch}
      />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
