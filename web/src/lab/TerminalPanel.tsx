import { useCallback, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Maximize2, Minimize2, Plus, Square, TerminalSquare, X } from 'lucide-react';
import { useI18n } from '../i18n/LanguageContext';
import { useTerminalSessions } from '../hooks/useTerminalSessions';
import './lab.css';

/**
 * Global terminal panel (IDE panel parity: VS Code / Cursor / Trae /
 * CodeBuddy). It belongs to the SHELL, not to a route — it stays open (and
 * its sessions stay alive) across the workspace, studies, library and
 * conversations, and it hosts MULTIPLE concurrent sessions:
 *
 * - `Ctrl+`` toggles the panel, `Ctrl+Shift+`` opens a new session.
 * - Drag the top edge (or ArrowUp/ArrowDown on it) to resize; the height is
 *   remembered per browser.
 * - Collapse keeps the header visible; close hides the panel entirely; the
 *   status-bar terminal button always brings it back.
 *
 * Honest limits (no PTY): command-line workflows are real; full-screen TUI
 * programs (vim/htop) are not — the panel says so instead of pretending.
 */

const MIN_HEIGHT = 140;
const RESIZE_MARGIN = 220; // keep the header + a usable slice of the workbench
/** Transcripts are switched, not stacked: one tabpanel, owned by the tab list. */
const PANE_ID = 'farlab-terminal-pane';

export interface TerminalPanelProps {
  /** Panel is mounted once opened and kept mounted (sessions are shell state). */
  open: boolean;
  /** Mounted at least once — session streams only start then. */
  enabled: boolean;
  height: number;
  maximized: boolean;
  collapsed: boolean;
  /** Bumped by the shell to request a new session (Ctrl+Shift+`). */
  newSessionSignal: number;
  onHeightChange: (height: number) => void;
  onMaximizeToggle: () => void;
  onCollapseToggle: () => void;
  onClose: () => void;
  /** Live-session count, for the status bar (the panel owns the sessions). */
  onAliveCountChange: (count: number) => void;
}

export function TerminalPanel({
  open, enabled, height, maximized, collapsed, newSessionSignal,
  onHeightChange, onMaximizeToggle, onCollapseToggle, onClose, onAliveCountChange,
}: TerminalPanelProps): JSX.Element | null {
  const { t } = useI18n();
  const term = useTerminalSessions(enabled);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus follows intent: opening the panel or switching tabs puts the caret
  // in the composer (IDE convention — the terminal is a typing surface).
  useEffect(() => {
    if (!open || collapsed) return;
    window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [open, collapsed, term.activeId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [term.active?.buffer, open, collapsed]);

  const requestNewSession = useCallback((): void => {
    if (term.disabled) return;
    // Keyboard/palette requests are honored even while a create is in flight:
    // a dropped "new session" is a worse failure than a fast double create
    // (the server enforces the real cap anyway).
    if (term.sessions.filter((s) => !s.exited).length >= term.maxSessions) return;
    if (collapsed) onCollapseToggle();
    term.newSession();
  }, [term, collapsed, onCollapseToggle]);

  const prevSignalRef = useRef(newSessionSignal);
  useEffect(() => {
    if (newSessionSignal === prevSignalRef.current) return;
    prevSignalRef.current = newSessionSignal;
    if (!open) return;
    requestNewSession();
  }, [newSessionSignal, open, requestNewSession]);

  const aliveCount = term.sessions.filter((s) => !s.exited).length;
  const aliveCountRef = useRef(0);
  useEffect(() => {
    if (aliveCountRef.current === aliveCount) return;
    aliveCountRef.current = aliveCount;
    onAliveCountChange(aliveCount);
  }, [aliveCount, onAliveCountChange]);

  const clamp = useCallback((h: number): number => {
    const max = Math.max(MIN_HEIGHT, window.innerHeight - RESIZE_MARGIN);
    return Math.round(Math.min(max, Math.max(MIN_HEIGHT, h)));
  }, []);

  const startDrag = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (maximized) return;
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const onMove = (ev: PointerEvent): void => { onHeightChange(clamp(startH + (startY - ev.clientY))); };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.classList.remove('is-resizing-panel');
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    document.body.classList.add('is-resizing-panel');
  };

  if (!open) return null;

  const atCap = aliveCount >= term.maxSessions;

  return (
    <section
      className={`ide-panel${maximized ? ' is-maximized' : ''}${collapsed ? ' is-collapsed' : ''}`}
      role="region"
      aria-label={t('terminal.title')}
      style={maximized ? undefined : { height: collapsed ? undefined : `${height}px` }}
    >
      {!maximized && (
        <div
          className="ide-panel__resizer"
          role="separator"
          aria-orientation="horizontal"
          aria-label={t('panel.resize')}
          aria-valuenow={height}
          aria-valuemin={MIN_HEIGHT}
          aria-valuemax={Math.max(MIN_HEIGHT, window.innerHeight - RESIZE_MARGIN)}
          tabIndex={0}
          onPointerDown={startDrag}
          onDoubleClick={() => onHeightChange(clamp(320))}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') { e.preventDefault(); onHeightChange(clamp(height + 24)); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); onHeightChange(clamp(height - 24)); }
          }}
        />
      )}

      <header className="ide-panel__bar">
        <button
          type="button"
          className="panel-tab is-active"
          aria-expanded={!collapsed}
          onClick={onCollapseToggle}
          title={t(collapsed ? 'panel.expand' : 'panel.collapse')}
        >
          <TerminalSquare size={13} aria-hidden="true" />
          <span>{t('panel.terminal')}</span>
          {term.sessions.length > 0 && <span className="panel-tab-count">{aliveCount}</span>}
        </button>

        {!collapsed && term.sessions.length > 0 && (
          <div className="term-session-tabs" role="tablist" aria-label={t('terminal.sessions')}>
            {term.sessions.map((s, i) => (
              <div key={s.view.id} className={`term-session-tab-row${s.view.id === term.activeId ? ' is-active' : ''}`}>
                <button
                  type="button"
                  role="tab"
                  id={`term-tab-${s.view.id}`}
                  aria-selected={s.view.id === term.activeId}
                  aria-controls={PANE_ID}
                  className="term-session-tab"
                  onClick={() => term.setActiveId(s.view.id)}
                  title={`${s.view.shell.displayName} · ${s.view.cwd}`}
                >
                  <span className="term-session-dot" data-alive={!s.exited} aria-hidden="true" />
                  {`${i + 1} · ${s.view.shell.displayName}`}
                  {s.exited ? ` (${t('terminal.dead')})` : ''}
                </button>
                {s.exited ? (
                  <button
                    type="button"
                    className="term-session-act"
                    onClick={() => term.dismissSession(s.view.id)}
                    aria-label={t('panel.closeTab')}
                    title={t('panel.closeTab')}
                  >
                    <X size={11} aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="term-session-act"
                    onClick={() => term.killSession(s.view.id)}
                    aria-label={t('terminal.kill')}
                    title={t('terminal.kill')}
                  >
                    <Square size={10} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <span className="panel-spacer" />

        <button
          type="button"
          className="panel-act"
          onClick={requestNewSession}
          disabled={term.disabled || term.busy || atCap}
          aria-label={t('terminal.new')}
          title={atCap ? t('terminal.atCap', { n: term.maxSessions }) : t('terminal.new')}
        >
          <Plus size={13} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="panel-act"
          onClick={onMaximizeToggle}
          aria-pressed={maximized}
          aria-label={t(maximized ? 'panel.restore' : 'panel.maximize')}
          title={t(maximized ? 'panel.restore' : 'panel.maximize')}
        >
          {maximized ? <Minimize2 size={13} aria-hidden="true" /> : <Maximize2 size={13} aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="panel-act"
          onClick={onCollapseToggle}
          aria-label={t(collapsed ? 'panel.expand' : 'panel.collapse')}
          title={t(collapsed ? 'panel.expand' : 'panel.collapse')}
        >
          {collapsed ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="panel-act"
          onClick={onClose}
          aria-label={t('panel.close')}
          title={t('panel.close')}
        >
          <X size={13} aria-hidden="true" />
        </button>
      </header>

      {!collapsed && (
        <div className="ide-panel__body">
          {term.disabled ? (
            <p className="term-error" role="alert">{t('terminal.disabled')}</p>
          ) : term.sessions.length === 0 ? (
            <div className="term-empty">
              <p>{t('terminal.empty')}</p>
              <button type="button" className="btn btn--small" onClick={requestNewSession} disabled={term.busy}>
                <Plus size={12} aria-hidden="true" /> {t('terminal.new')}
              </button>
              <p className="term-note">{t('terminal.note')}</p>
            </div>
          ) : (
            <div
              className="term-pane"
              id={PANE_ID}
              role="tabpanel"
              aria-labelledby={term.activeId !== null ? `term-tab-${term.activeId}` : undefined}
            >
              <div className="term-scroll" ref={scrollRef} tabIndex={0} aria-live="polite" aria-label={t('terminal.output')}>
                <pre className="term-pre">{term.active !== null ? term.active.buffer : ''}</pre>
              </div>
              {term.error !== null && <p className="term-error" role="alert">{term.error}</p>}
              <div className="term-input-row">
                <span className="term-prompt" aria-hidden="true">›</span>
                <input
                  ref={inputRef}
                  type="text"
                  className="term-input"
                  disabled={term.active === null || term.active.exited}
                  placeholder={t('terminal.inputPlaceholder')}
                  aria-label={t('terminal.inputLabel')}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    const el = e.currentTarget;
                    const line = el.value;
                    el.value = '';
                    term.send(line);
                  }}
                />
              </div>
              <p className="term-note term-note--compact" title={t('terminal.note')}>{t('terminal.note')}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
