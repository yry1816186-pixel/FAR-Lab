import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './conversation-dock.css';
import { Bell, BellOff, MonitorCog, Moon, Plus, Search, Settings, Sun, TerminalSquare, X } from 'lucide-react';
import { ApiError } from './api/client';
import { getEvents, getRun, listRuns, listConversations, createConversation, deleteConversation, renameConversation, searchAll } from './api/endpoints';
import { AppRail, type RailSurface } from './lab/AppRail';
import { TerminalPanel } from './lab/TerminalPanel';
import { Library } from './lab/Library';
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
import { ConversationView } from './components/ConversationView';
import { AwarenessBar } from './components/AwarenessBar';
import { RunDetail, resolveTabId } from './components/RunDetail';
import { CommandPalette, type Command, type PaletteSearch } from './components/CommandPalette';
import { SettingsPanel } from './components/SettingsPanel';
import { useToolCommands } from './hooks/useToolCommands';
import type { EventsState } from './components/RunDetail';
import { ErrorBox } from './components/common';
import { LabHome } from './lab/LabHome';
import { StudyMap } from './lab/StudyMap';
import { groupStudies, runLabel } from './studies';

const RUNS_POLL_MS = 5_000;
const DETAIL_POLL_ACTIVE_MS = 3_000;
const DETAIL_POLL_WAITING_MS = 10_000;
const EVENTS_POLL_MS = 2_000;
/** Safety-net cadence while SSE push is healthy (B3). */
const EVENTS_POLL_SSE_MS = 15_000;
const MAX_EVENTS_KEPT = 2_000;

const PANEL_OPEN_KEY = 'farlab.panelOpen';
const PANEL_HEIGHT_KEY = 'farlab.panelHeight';
const PANEL_MIN_HEIGHT = 140;

/**
 * App shell — HX Research Experience Architecture (skeleton A productionized).
 * The shell owns header chrome + data plumbing (runs poll, detail poll, SSE
 * events, notifications); the CONTENT is routed between the lab home (`#/`),
 * research formation (`#lab/new`), the study map (`#study/<id>`, the primary
 * run view), legacy deep tools (`#run/<id>/<tab>`) and conversations. The
 * permanent dual-list sidebar is gone: studies are navigated from the home
 * index, the map switcher, the command palette, and cross-run search.
 */
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
  // Study-map vs legacy-deep-tools view for the selected run (route-driven).
  const [studyView, setStudyView] = useState(false);
  const [newResearchView, setNewResearchView] = useState(false);
  // Workspace literature library (#library) + welcome-box question prefill
  // (#lab/new?q=…). Prefill is consumed once by NewResearch on mount.
  const [libraryView, setLibraryView] = useState(false);
  // ---- global panel (IDE parity: the terminal is SHELL state, not a route) ----
  // It stays open and its sessions stay alive across every surface, so it
  // never competes with research objects for the rail or the main view.
  const [panelMounted, setPanelMounted] = useState(false); // mounted on first open, then kept
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [panelMaximized, setPanelMaximized] = useState(false);
  const [panelHeight, setPanelHeight] = useState(300);
  // Bumped to ask the panel for a new session (Ctrl+Shift+` / palette).
  const [terminalSessionSignal, setTerminalSessionSignal] = useState(0);
  // Live session count is OWNED by the panel; the status bar shows a projection.
  const [terminalAlive, setTerminalAlive] = useState(0);
  const [prefilledQuestion, setPrefilledQuestion] = useState<string | null>(null);

  // Panel geometry/open state is a per-browser preference (IDE convention: the
  // panel you closed stays closed next session). Restore once on mount.
  useEffect(() => {
    try {
      const open = window.localStorage.getItem(PANEL_OPEN_KEY) === '1';
      const raw = Number(window.localStorage.getItem(PANEL_HEIGHT_KEY) ?? 0);
      setPanelHeight(Number.isFinite(raw) && raw >= PANEL_MIN_HEIGHT ? Math.min(raw, 720) : 300);
      if (open) { setPanelOpen(true); setPanelMounted(true); }
    } catch { /* private mode: session-only panel state */ }
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem(PANEL_OPEN_KEY, panelOpen ? '1' : '0'); } catch { /* ignore */ }
  }, [panelOpen]);
  useEffect(() => {
    try { window.localStorage.setItem(PANEL_HEIGHT_KEY, String(panelHeight)); } catch { /* ignore */ }
  }, [panelHeight]);

  const togglePanel = useCallback((): void => {
    setPanelMounted(true);
    setPanelCollapsed(false);
    setPanelOpen((v) => !v);
  }, []);
  const newTerminalSession = useCallback((): void => {
    setPanelMounted(true);
    setPanelOpen(true);
    setPanelCollapsed(false);
    setTerminalSessionSignal((n) => n + 1);
  }, []);

  // IDE keyboard conventions: Ctrl+` toggles the terminal panel (VS Code /
  // Cursor / Trae / CodeBuddy), Ctrl+Shift+` opens a NEW session, Ctrl+J
  // toggles the panel. Modifiers only, so they never steal typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.key === '`' || e.key === '~') {
        e.preventDefault();
        if (e.shiftKey) newTerminalSession();
        else togglePanel();
      } else if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        togglePanel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePanel, newTerminalSession]);

  // Judgment-queue size lifted from LabHome (the one truth) for the rail badge.
  const [judgmentCount, setJudgmentCount] = useState(0);
  const reportJudgmentCount = useCallback((n: number): void => {
    setJudgmentCount((cur) => (cur === n ? cur : n));
  }, []);

  // ---- conversations (a tool, not the spine) ----
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  // A conversation never *replaces* an open research view — it docks beside it.
  const [convDocked, setConvDocked] = useState(false);
  const refreshConversations = useCallback((): Promise<void> => {
    const controller = new AbortController();
    return listConversations(controller.signal)
      .then((list) => { setConversations(list); })
      .catch(() => { /* list degrades quietly; the view itself fails visibly */ });
  }, []);
  useEffect(() => { void refreshConversations(); }, [refreshConversations]);
  const openConversation = useCallback((id: string): void => {
    setSelectedConvId(id);
    setLibraryView(false);
    setNewResearchView(false);
    if (selectedRunId !== null) setConvDocked(true); // objects stay primary; dialogue docks
    void refreshConversations();
  }, [refreshConversations, selectedRunId]);
  const closeConversation = useCallback((): void => {
    setSelectedConvId(null);
    setConvDocked(false);
  }, []);
  const sourceByRunId = useMemo(() => {
    const m = new Map<string, { title: string; open: () => void }>();
    for (const c of conversations) {
      for (const rid of c.runIds) m.set(rid, { title: c.title, open: () => openConversation(c.id) });
    }
    return m;
  }, [conversations, openConversation]);

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
  // (deleted via the run-lifecycle DELETE /runs/:id), fall back to the home.
  // Grace window (B1 P0, direct-launch variant): a run just created via
  // #lab/new exists server-side (createRun returned its id) but is absent
  // from the LAST poll snapshot — the guard must not kill that selection
  // before the next list refresh confirms it. Two poll cycles is enough;
  // after that a genuinely vanished run deselects as before.
  const selectedAtRef = useRef(0);
  useEffect(() => { if (selectedRunId !== null) selectedAtRef.current = Date.now(); }, [selectedRunId]);
  useEffect(() => {
    if (
      selectedRunId !== null && !runsLoading && runs.length > 0 && !runs.some((r) => r.id === selectedRunId)
      && Date.now() - selectedAtRef.current > 2 * RUNS_POLL_MS
    ) {
      setSelectedRunId(null);
      setStudyView(false);
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

  /** Opening a run lands on the study map (the primary run view). */
  const selectStudy = useCallback((runId: string): void => {
    setSelectedRunId(runId);
    setStudyView(true);
    setNewResearchView(false);
    setLibraryView(false);
    if (selectedConvId !== null) setConvDocked(true);
  }, [selectedConvId]);
  const openHome = useCallback((): void => {
    setSelectedRunId(null);
    setStudyView(false);
    setNewResearchView(false);
    setLibraryView(false);
    closeConversation();
  }, [closeConversation]);
  const openNewResearch = useCallback((prefill: string | null = null): void => {
    setNewResearchView(true);
    setSelectedRunId(null);
    setStudyView(false);
    setLibraryView(false);
    setSelectedConvId(null);
    setConvDocked(false);
    setPrefilledQuestion(prefill);
  }, []);
  const openLibrary = useCallback((): void => {
    setLibraryView(true);
    setNewResearchView(false);
    setSelectedRunId(null);
    setStudyView(false);
    closeConversation();
  }, [closeConversation]);

  // ---- shareable hash routes: #/ #lab/new #library #study/<id> #run/<id>/<tab> #conv/<id> ----
  // Mount restore + back/forward + typed links all flow through here.
  const [routeTab, setRouteTab] = useState<string | null>(null);
  useEffect(() => {
    const route = parseHash(window.location.hash);
    if (route.newResearch) { setNewResearchView(true); setLibraryView(false); }
    if (route.library) { setLibraryView(true); setNewResearchView(false); }
    if (route.prefilledQuestion !== null) setPrefilledQuestion(route.prefilledQuestion);
    if (route.runId !== null) { setSelectedRunId(route.runId); setStudyView(route.study); }
    if (route.convId !== null) {
      setSelectedConvId(route.convId);
      setConvDocked(route.runId !== null); // ?conv= on a run route restores the docked pair
    }
    setRouteTab(route.tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only route restore
  }, []);
  const routedConvId = selectedConvId !== null && (selectedRunId === null || convDocked) ? selectedConvId : null;
  useHashRoute(selectedRunId, routeTab, (route) => {
    setNewResearchView(route.newResearch);
    setLibraryView(route.library);
    if (route.prefilledQuestion !== null) setPrefilledQuestion(route.prefilledQuestion);
    if (route.runId !== null && route.runId !== selectedRunId) { setSelectedRunId(route.runId); setStudyView(route.study); }
    else if (route.runId !== null) setStudyView(route.study);
    if (route.runId === null && selectedRunId !== null) { setSelectedRunId(null); setStudyView(false); }
    if (route.convId !== null) { setSelectedConvId(route.convId); if (route.runId !== null) setConvDocked(true); }
    else if (routedConvId !== null) { setSelectedConvId(null); setConvDocked(false); } // back/forward to a no-conv URL closes the dialogue
    setRouteTab(route.tab);
  }, routedConvId, studyView, newResearchView, libraryView);

  // ---- command palette: every entry is a real capability ----
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
    const navCmds: Command[] = selectedRunId === null
      ? []
      : (['research', 'evidence', 'hypotheses', 'plan', 'revisions', 'verify'] as const)
          .map((tab) => ({
            id: `nav-${tab}`,
            labelKey: `tab.${tab}` as Command['labelKey'],
            groupKey: 'palette.groupNav' as Command['groupKey'],
            keywords: `go ${tab}`,
            run: () => { setRouteTab(tab); setStudyView(false); },
          }));
    const runCmds: Command[] = runs.slice(0, 10).map((r) => {
      const text = runLabel(r);
      return {
        id: `run-${r.id}`,
        label: text.length > 72 ? `${text.slice(0, 72)}…` : text,
        groupKey: 'palette.groupRuns' as Command['groupKey'],
        keywords: `${text} ${r.id} ${r.status}`,
        run: () => { selectStudy(r.id); },
      };
    });
    // TIS user commands: palette entry inserts the prompt template into the
    // mounted composer (NewResearch textarea or conversation view) via a DOM
    // event — composer state is local, so a decoupled event avoids prop drills.
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
        run: () => openNewResearch(),
      },
      {
        id: 'go-home',
        labelKey: 'palette.goHome',
        groupKey: 'palette.groupActions',
        run: openHome,
      },
      ...navCmds,
      ...runCmds,
      ...userCmds,
      {
        id: 'terminal-toggle',
        labelKey: 'palette.toggleTerminal',
        groupKey: 'palette.groupActions',
        keywords: 'terminal shell console 终端 shell 命令行',
        run: togglePanel,
      },
      {
        id: 'terminal-new',
        labelKey: 'palette.newTerminal',
        groupKey: 'palette.groupActions',
        keywords: 'new terminal session 新终端 新建会话',
        run: newTerminalSession,
      },
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
  }, [runs, selectedRunId, selectStudy, openNewResearch, openHome, cycleTheme, lang, setLang, userCommands, togglePanel, newTerminalSession]);

  // ---- universal search wiring (B2): palette -> cross-run object lookup ----
  // A claim hit lands on the study map and opens that claim in the inspector
  // (same authority the legacy evidence tab had via flash-highlight).
  const [focusClaimId, setFocusClaimId] = useState<string | null>(null);
  const paletteSearch = useMemo<PaletteSearch>(() => ({
    fetch: (q, signal) => searchAll(q, signal),
    navigate: {
      run: (runId) => { selectStudy(runId); setFocusClaimId(null); },
      hypothesis: (runId) => { selectStudy(runId); setFocusClaimId(null); },
      claim: (runId, claimId) => { selectStudy(runId); setFocusClaimId(claimId); },
      conversation: (convId) => { openConversation(convId); },
    },
    // setSelectedRunId/setRouteTab are stable state setters; routeTab semantics captured per call
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [selectStudy, openConversation]);

  // IDE convention: "/" opens the command palette (universal search — the
  // sidebar filter died with the sidebar); "n" is quick capture: one key from
  // anywhere to a fresh question box.
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
        setPaletteOpen(true);
      } else if (e.key === 'n' || e.key === 'N') {
        if (inField(el)) return;
        e.preventDefault();
        openNewResearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openNewResearch]);

  // ---- B3-2: multi-run awareness + completion notifications ----
  const activeRuns = useMemo(
    () => runs.filter((r) => r.status === 'running' || r.status === 'queued'),
    [runs],
  );
  const notifications = useNotifications(
    runs,
    selectedRunId,
    useCallback((runId: string): void => { selectStudy(runId); }, [selectStudy]),
    useCallback((): string => t('notify.doneTitle'), [t]),
  );

  // ---- R2-01 seam: "讨论此研究" ----
  // Source conversation exists -> open it docked; otherwise create one titled
  // by the research question (real POST /conversations; no silent fake-open).
  const discussionsRef = useRef(new Map<string, string>());
  const [convCreateError, setConvCreateError] = useState<{ error: ApiError; runId: string } | null>(null);
  const discussRun = useCallback((runId: string): void => {
    setConvCreateError(null);
    const src = sourceByRunId.get(runId);
    if (src !== undefined) { src.open(); return; }
    const existing = discussionsRef.current.get(runId);
    if (existing !== undefined) { openConversation(existing); return; }
    const run = runs.find((r) => r.id === runId);
    const title = run !== undefined ? runLabel(run).slice(0, 80) : undefined;
    void createConversation({ title })
      .then((c) => {
        discussionsRef.current.set(runId, c.id);
        void refreshConversations();
        openConversation(c.id);
      })
      .catch((e: unknown) => {
        setConvCreateError({
          error: e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }),
          runId,
        });
      });
  }, [sourceByRunId, runs, refreshConversations, openConversation]);
  const dockOpen = convDocked && selectedConvId !== null && selectedRunId !== null;
  const dockedConversation = conversations.find((c) => c.id === selectedConvId) ?? null;

  const studies = useMemo(() => groupStudies(runs), [runs]);

  // ---- rail (Bohrium/Doubao parity): persistent navigation + conversation ops ----
  const removeConversation = useCallback((id: string): void => {
    void deleteConversation(id)
      .then(() => refreshConversations())
      .catch((e: unknown) => {
        setConvCreateError({
          error: e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }),
          runId: '',
        });
      });
    if (selectedConvId === id) { setSelectedConvId(null); setConvDocked(false); }
  }, [refreshConversations, selectedConvId]);
  const renameConv = useCallback((id: string, title: string): void => {
    void renameConversation(id, title)
      .then(() => refreshConversations())
      .catch((e: unknown) => {
        setConvCreateError({
          error: e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }),
          runId: '',
        });
      });
  }, [refreshConversations]);
  // Rail "new conversation" (Doubao parity): a REAL POST creates it (never a
  // fake open); failure surfaces through the primary ErrorBox path.
  const newConversation = useCallback((): void => {
    void createConversation({})
      .then((c) => { void refreshConversations(); setSelectedConvId(c.id); setConvDocked(false); })
      .catch((e: unknown) => {
        setConvCreateError({
          error: e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }),
          runId: '',
        });
      });
  }, [refreshConversations]);
  // The workspace is ONE surface: the new-research compose zone plus the
  // judgment queue and the studies index. `#/` and `#lab/new` are the same
  // surface with different compose-open state — the rail therefore has a
  // single work entry, and the researcher never chooses between "workspace"
  // and "new research".
  const homeSurface = (
    <LabHome
      runs={runs}
      runsLoading={runsLoading}
      runsError={runsError}
      conversations={conversations}
      composeOpen={newResearchView}
      onComposeOpenChange={setNewResearchView}
      initialQuestion={prefilledQuestion}
      onOpenStudy={selectStudy}
      onOpenConversation={openConversation}
      onStartConversation={newConversation}
      onOpenSettings={() => setSettingsOpen(true)}
      onRetryRuns={() => void refreshRunsWithAbort()}
      onLaunched={selectStudy}
      onJudgmentCount={reportJudgmentCount}
    />
  );

  const railSurface: RailSurface = libraryView
    ? 'library'
    // The compose zone belongs to the workspace, not to a second surface:
    // `#lab/new` lights up 工作台 (the rail has exactly one work entry).
    : selectedConvId !== null && selectedRunId === null
          ? 'conv'
          : selectedRunId !== null
            ? 'study'
            : 'home';

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <LogoFull size={26} />
          <p className="muted app-tagline">{t('app.subtitle')}</p>
        </div>
        <div className="app-header-right">
          <div
            className={`conn ${online ? 'conn--online' : 'conn--offline'}`}
            role="status"
            title={online ? t('conn.online') : t('conn.offline')}
          >
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
            aria-label={t('palette.open')}
            title="Ctrl K"
          >
            <Search size={12} aria-hidden="true" /> {t('palette.open')}
          </button>
          <button
            type="button"
            className="theme-toggle theme-toggle--icon"
            aria-label={`${t('app.themeToggle')}（${t(theme === 'auto' ? 'app.themeAuto' : theme === 'light' ? 'app.themeLight' : 'app.themeDark')}）`}
            title={`${t('app.themeToggle')} · ${t(theme === 'auto' ? 'app.themeAuto' : theme === 'light' ? 'app.themeLight' : 'app.themeDark')}`}
            onClick={cycleTheme}
          >
            {theme === 'auto' ? <MonitorCog size={12} aria-hidden="true" /> : theme === 'light' ? <Sun size={12} aria-hidden="true" /> : <Moon size={12} aria-hidden="true" />}
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

      <AwarenessBar
        activeRuns={activeRuns}
        loading={runsLoading}
        selectedRunId={selectedRunId}
        onSelect={selectStudy}
        idleVisible={railSurface === 'home'}
      />

      <div className="app-body app-body--noshell">
        <AppRail
          surface={railSurface}
          runs={runs}
          runsLoading={runsLoading}
          conversations={conversations}
          judgmentCount={judgmentCount}
          onHome={openHome}
          onLibrary={openLibrary}
          onOpenStudy={selectStudy}
          onOpenConversation={openConversation}
          onDeleteConversation={removeConversation}
          onRenameConversation={renameConv}
          onNewConversation={newConversation}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <div className={`workbench-main${panelOpen && panelMaximized ? ' is-panel-maximized' : ''}`}>
        <main className="content content--full" aria-label={t('app.title')}>
          {convCreateError !== null && (
            /* Adversarial-audit P1 fix: the create-conversation failure must be
               visible on the PRIMARY path too — with no conversation selected
               the dock never mounts, so this error cannot live only in the
               dock slot. One rendering location, visible in every dock state. */
            <ErrorBox error={convCreateError.error} onRetry={() => discussRun(convCreateError.runId)} />
          )}
          {/* homeSurface must occupy exactly ONE slot: rendering it in two
              alternative branches (newResearchView vs. the fallback) remounts
              the whole surface when the branch flips — the initial hash
              routing lands newResearchView=true after the first commit, and
              that remount silently discards a question typed into the still-
              pristine first frame (caught on Firefox's looser commit timing;
              spec optional-assets "survives the transition"). */}
          {newResearchView || (!libraryView && selectedConvId === null && selectedRunId === null) ? (
            homeSurface
          ) : libraryView ? (
            <Library runs={runs} onOpenStudy={selectStudy} />
          ) : selectedConvId !== null && selectedRunId === null ? (
            <ConversationView
              conversationId={selectedConvId}
              onOpenedRun={selectStudy}
              onMutated={refreshConversations}
            />
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
            <div className={`research-workspace${studyView ? '' : ' is-lens-open'}`}>
              <StudyMap
                run={runDetail}
                events={events}
                stream={stream}
                studies={studies}
                focusClaimId={studyView ? focusClaimId : null}
                onClaimFocused={() => setFocusClaimId(null)}
                onMutated={onMutated}
              />
              {!studyView && (
                <aside className="research-lens" aria-label={t('workspace.lensTitle')}>
                  <header className="research-lens-head">
                    <div>
                      <p className="research-lens-kicker">{t('workspace.lensKicker')}</p>
                      <h2>{t('workspace.lensTitle')}</h2>
                    </div>
                    <button
                      type="button"
                      className="research-lens-close"
                      onClick={() => { setStudyView(true); setRouteTab(null); }}
                      aria-label={t('workspace.lensClose')}
                      title={t('workspace.lensClose')}
                    >
                      <X size={18} aria-hidden="true" />
                    </button>
                  </header>
                  <RunDetail
                    run={runDetail}
                    events={eventsState}
                    onMutated={onMutated}
                    tab={routeTab !== null ? resolveTabId(routeTab) ?? undefined : undefined}
                    onTabChange={(tab) => setRouteTab(tab)}
                    focusClaimId={focusClaimId}
                    onClaimFocused={() => setFocusClaimId(null)}
                    stream={stream}
                    sourceConversation={sourceByRunId.get(runDetail.id) ?? null}
                    dockedConversation={dockOpen ? selectedConvId : null}
                    onDiscuss={() => discussRun(runDetail.id)}
                    embedded
                  />
                </aside>
              )}
            </div>
          )}
        </main>
        {panelMounted && (
          <TerminalPanel
            open={panelOpen}
            enabled={panelMounted}
            height={panelHeight}
            maximized={panelMaximized}
            collapsed={panelCollapsed}
            newSessionSignal={terminalSessionSignal}
            onHeightChange={setPanelHeight}
            onMaximizeToggle={() => setPanelMaximized((v) => !v)}
            onCollapseToggle={() => setPanelCollapsed((v) => !v)}
            onClose={() => setPanelOpen(false)}
            onAliveCountChange={setTerminalAlive}
          />
        )}
        </div>
        {dockOpen && (
          <aside className="conv-dock" aria-label={t('dock.title')}>
            <div className="conv-dock-head">
              <span className="conv-dock-title" title={dockedConversation?.title ?? selectedConvId ?? undefined}>
                {t('dock.title')}
                {dockedConversation !== null && <span className="muted small"> · {dockedConversation.title}</span>}
              </span>
              <button
                type="button"
                className="btn btn--small"
                onClick={closeConversation}
                aria-label={t('dock.close')}
                title={t('dock.close')}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </div>
            <ConversationView
              conversationId={selectedConvId!}
              onOpenedRun={selectStudy}
              onMutated={refreshConversations}
            />
          </aside>
        )}
      </div>
      {/* IDE status bar: the shell's always-visible truth — connection, live
          work, and the one global home of the terminal (open, count, new). */}
      <footer className="status-bar">
        <div className="status-group">
          <span
            className={`status-conn${online ? ' is-online' : ' is-offline'}`}
            role="status"
            title={online ? t('conn.online') : t('conn.offline')}
          >
            <span className="status-dot" aria-hidden="true" />
            {online ? t('conn.online') : t('conn.offline')}
          </span>
          {activeRuns.length > 0 && <span className="status-item">{t('statusbar.running', { n: activeRuns.length })}</span>}
          {judgmentCount > 0 && (
            /* SC5: the pending-judgment count is an ACTION, not telemetry —
               the chip jumps to the workspace queue instead of sitting inert
               in the bottom bar. */
            <button
              type="button"
              className="status-item status-item--action"
              onClick={() => {
                openHome();
                window.setTimeout(() => document.getElementById('labq-judgment')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
              }}
              title={t('statusbar.judgmentHint')}
            >
              {t('statusbar.judgment', { n: judgmentCount })}
            </button>
          )}
        </div>
        <div className="status-group status-group--right">
          <button
            type="button"
            className={`status-btn${panelOpen ? ' is-active' : ''}`}
            onClick={togglePanel}
            aria-pressed={panelOpen}
            title={t('panel.toggleHint')}
          >
            <TerminalSquare size={11} aria-hidden="true" />
            {/* Zero-session noise guard (design-baseline home-W10): "(0)" next
                to a terminal nobody opened reads as a broken counter. */}
            {terminalAlive > 0 ? t('statusbar.terminal', { n: terminalAlive }) : t('statusbar.terminalIdle')}
          </button>
          <button
            type="button"
            className="status-btn status-btn--icon"
            onClick={newTerminalSession}
            aria-label={t('terminal.new')}
            title={t('panel.newSessionHint')}
          >
            <Plus size={11} aria-hidden="true" />
          </button>
        </div>
      </footer>
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
