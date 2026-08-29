import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Square, TerminalSquare } from 'lucide-react';
import { useI18n } from '../i18n/LanguageContext';
import {
  createTerminalSession, killTerminalSession, listTerminalSessions,
  terminalEventsUrl, writeTerminalInput, type TerminalSessionView,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import './lab.css';

/**
 * Integrated terminal (extensibility lane): REAL login-shell sessions behind
 * /api/v1/terminal — the researcher's own shell (profile-loaded), output
 * streamed over SSE, input written to the session's stdin. Honest limits
 * (no PTY): command-line workflows work; full-screen TUI programs (vim/htop)
 * do not — the banner says so instead of pretending.
 */

const BUFFER_CAP = 200_000; // client-side transcript cap (server ring is 256K)

interface SessionState {
  view: TerminalSessionView;
  buffer: string;
  exited: boolean;
  exitCode: number | null;
}

export function Terminal(): JSX.Element {
  const { t } = useI18n();
  const [sessions, setSessions] = useState<SessionState[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const patchSession = useCallback((id: string, patch: (s: SessionState) => SessionState): void => {
    setSessions((cur) => cur.map((s) => (s.view.id === id ? patch(s) : s)));
  }, []);

  const appendOut = useCallback((id: string, chunk: string): void => {
    patchSession(id, (s) => {
      let buffer = s.buffer + chunk;
      if (buffer.length > BUFFER_CAP) buffer = buffer.slice(buffer.length - BUFFER_CAP);
      return { ...s, buffer };
    });
  }, [patchSession]);

  // One EventSource per active session; replay + live output + exit.
  useEffect(() => {
    if (activeId === null) return;
    const es = new EventSource(terminalEventsUrl(activeId));
    es.addEventListener('terminal-out', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent<string>).data) as { data?: string };
        if (typeof data.data === 'string') appendOut(activeId, data.data);
      } catch { /* malformed frame: skip, the stream continues */ }
    });
    es.addEventListener('terminal-exit', (ev) => {
      let code: number | null = null;
      try { code = (JSON.parse((ev as MessageEvent<string>).data) as { code?: number | null }).code ?? null; } catch { code = null; }
      patchSession(activeId, (s) => ({ ...s, exited: true, exitCode: code }));
      es.close();
    });
    es.onerror = () => { /* EventSource auto-reconnects; exit event closes it */ };
    return () => { es.close(); };
  }, [activeId, appendOut, patchSession]);

  // Session list on mount (existing sessions from this server join the tabs).
  useEffect(() => {
    const controller = new AbortController();
    void listTerminalSessions(controller.signal)
      .then((views) => {
        setSessions(views.map((view) => ({ view, buffer: '', exited: !view.alive, exitCode: view.exitCode })));
        setActiveId((cur) => cur ?? views.find((v) => v.alive)?.id ?? null);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        if (e instanceof ApiError && (e.status === 403 || e.code === 'feature_disabled')) setDisabled(true);
        else setError(e instanceof ApiError ? e.message : String(e));
      });
    return () => { controller.abort(); };
  }, []);

  // Keep the transcript pinned to the bottom as output streams in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [sessions]);

  const newSession = (): void => {
    setBusy(true); setError(null);
    void createTerminalSession()
      .then((view) => {
        const state: SessionState = { view, buffer: '', exited: false, exitCode: null };
        setSessions((cur) => [...cur, state]);
        setActiveId(view.id);
        window.setTimeout(() => inputRef.current?.focus(), 50);
      })
      .catch((e: unknown) => {
        setError(e instanceof ApiError ? e.message : String(e));
      })
      .finally(() => { setBusy(false); });
  };

  const closeSession = (id: string): void => {
    void killTerminalSession(id)
      .then(() => { patchSession(id, (s) => ({ ...s, exited: true })); })
      .catch((e: unknown) => { setError(e instanceof ApiError ? e.message : String(e)); });
  };

  const sendLine = (): void => {
    const line = input;
    const id = activeId;
    if (line.length === 0 || id === null || busy) return;
    setBusy(true);
    // No TTY => the shell does not echo; the client shows the sent line so the
    // transcript reads like a session. This is OUR input, not shell output.
    appendOut(id, `${line}\n`);
    void writeTerminalInput(id, `${line}\n`)
      .then(() => { setInput(''); })
      .catch((e: unknown) => { setError(e instanceof ApiError ? e.message : String(e)); })
      .finally(() => { setBusy(false); });
  };

  const active = sessions.find((s) => s.view.id === activeId) ?? null;

  return (
    <section className="term-root" aria-label={t('terminal.title')}>
      <header className="term-topline">
        <TerminalSquare size={15} aria-hidden="true" />
        <span className="term-title">{t('terminal.title')}</span>
        {active !== null && (
          <span className="term-shell-tag" title={active.view.shell.program}>
            {active.view.shell.displayName}
            {active.exited ? ` · ${t('terminal.exited', { code: active.exitCode ?? '?' })}` : ''}
          </span>
        )}
        <span className="term-spacer" />
        <button type="button" className="btn btn--small" onClick={newSession} disabled={busy || disabled}>
          <Plus size={12} aria-hidden="true" /> {t('terminal.new')}
        </button>
      </header>
      <p className="term-note">{t('terminal.note')}</p>
      {disabled && <p className="term-error" role="alert">{t('terminal.disabled')}</p>}
      {error !== null && <p className="term-error" role="alert">{error}</p>}
      <div className="term-body">
        <div className="term-tabs" role="tablist" aria-label={t('terminal.sessions')}>
          {sessions.map((s, i) => (
            <div key={s.view.id} className="term-tab-row">
              <button
                type="button"
                role="tab"
                aria-selected={s.view.id === activeId}
                className={`term-tab${s.view.id === activeId ? ' is-active' : ''}`}
                onClick={() => { setActiveId(s.view.id); window.setTimeout(() => inputRef.current?.focus(), 50); }}
              >
                {`${i + 1} · ${s.view.shell.displayName}`}
                {s.exited ? ` (${t('terminal.dead')})` : ''}
              </button>
              {!s.exited && (
                <button
                  type="button"
                  className="term-tab-kill"
                  onClick={() => closeSession(s.view.id)}
                  aria-label={t('terminal.kill')}
                  title={t('terminal.kill')}
                >
                  <Square size={10} aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="term-pane">
          <div className="term-scroll" ref={scrollRef} tabIndex={0} aria-live="polite" aria-label={t('terminal.output')}>
            <pre className="term-pre">{active !== null ? active.buffer : ''}</pre>
          </div>
          <div className="term-input-row">
            <span className="term-prompt" aria-hidden="true">›</span>
            <input
              ref={inputRef}
              type="text"
              className="term-input"
              value={input}
              disabled={active === null || active.exited || disabled}
              placeholder={t('terminal.inputPlaceholder')}
              aria-label={t('terminal.inputLabel')}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendLine(); } }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
