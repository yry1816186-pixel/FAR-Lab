import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import {
  createTerminalSession, killTerminalSession, listTerminalSessions,
  terminalEventsUrl, writeTerminalInput, type TerminalSessionView,
} from '../api/endpoints';

/**
 * Terminal session state for the GLOBAL panel (IDE panel parity: the panel is
 * part of the shell, so sessions survive every workspace navigation).
 *
 * Two deliberate differences from a "one active stream" terminal:
 * - EVERY session keeps its own SSE subscription, so a background session
 *   keeps filling its transcript while another tab is shown (the server
 *   replays its ring buffer on connect, so nothing already printed is lost).
 * - Output carries a stream offset (`pos`). Reconnects (the server caps a
 *   stream at 30 min, and SSE auto-reconnects) replay the ring; the offset
 *   makes that replay idempotent instead of duplicating the transcript.
 */

const BUFFER_CAP = 200_000; // client-side transcript cap (server ring is 256K)

export interface TerminalSessionState {
  view: TerminalSessionView;
  buffer: string;
  /** Server-stream offset already consumed; null until the first sync. */
  received: number | null;
  exited: boolean;
  exitCode: number | null;
}

export interface TerminalController {
  sessions: TerminalSessionState[];
  activeId: string | null;
  active: TerminalSessionState | null;
  /** Any terminal request in flight — the composer disables briefly. */
  busy: boolean;
  /** A session create is in flight (the "+" disables; the shortcut does NOT
   *  bail on this — dropping a requested session is worse than a fast double). */
  creating: boolean;
  error: string | null;
  /** FARLAB_TERMINAL=off: the surface is off, surfaced instead of hidden. */
  disabled: boolean;
  /** Server-side concurrent session cap (the "+" disables at the cap). */
  maxSessions: number;
  setActiveId: (id: string) => void;
  newSession: () => void;
  killSession: (id: string) => void;
  /** Remove an exited session's tab (transcript is gone — it was killed). */
  dismissSession: (id: string) => void;
  /** Send one command line; echoes locally (no PTY => no shell echo). */
  send: (line: string) => void;
}

export function useTerminalSessions(enabled: boolean): TerminalController {
  const [sessions, setSessions] = useState<TerminalSessionState[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Two distinct in-flight flags: a session CREATE must never be dropped just
  // because a keystroke happens to be in flight (the old single `busy` did
  // exactly that — a Ctrl+Shift+` during a send silently did nothing).
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [maxSessions, setMaxSessions] = useState(6);
  const sourcesRef = useRef(new Map<string, EventSource>());
  const loadedRef = useRef(false);

  const patch = useCallback((id: string, fn: (s: TerminalSessionState) => TerminalSessionState): void => {
    setSessions((cur) => cur.map((s) => (s.view.id === id ? fn(s) : s)));
  }, []);

  /** Append output, de-duplicating ring replays via the server stream offset. */
  const appendOut = useCallback((id: string, chunk: string, pos: number | undefined): void => {
    if (chunk.length === 0) return;
    patch(id, (s) => {
      let text = chunk;
      let received = s.received;
      if (pos !== undefined) {
        if (received === null) received = pos + chunk.length; // first sync: adopt the replay
        else if (pos + chunk.length <= received) return s; // replay of output already shown
        else if (pos < received) { text = chunk.slice(received - pos); received = pos + chunk.length; }
        else {
          // Live gap: output the server ring dropped before we could read it.
          const lost = pos - received;
          text = `… 已丢失 ${lost} 字符输出（超出服务端缓冲区）\n${chunk}`;
          received = pos + chunk.length;
        }
      }
      let buffer = s.buffer + text;
      if (buffer.length > BUFFER_CAP) buffer = buffer.slice(buffer.length - BUFFER_CAP);
      return { ...s, buffer, received };
    });
  }, [patch]);

  // One SSE subscription per session (not just the active one): background
  // sessions stay live and keep their transcript.
  useEffect(() => {
    if (!enabled) return;
    const map = sourcesRef.current;
    const live = new Set<string>();
    for (const s of sessions) {
      live.add(s.view.id);
      if (map.has(s.view.id) || s.exited) continue;
      const id = s.view.id;
      const es = new EventSource(terminalEventsUrl(id));
      es.addEventListener('terminal-out', (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent<string>).data) as { data?: string; pos?: number };
          if (typeof data.data === 'string') appendOut(id, data.data, typeof data.pos === 'number' ? data.pos : undefined);
        } catch { /* malformed frame: skip, the stream continues */ }
      });
      es.addEventListener('terminal-exit', (ev) => {
        let code: number | null = null;
        try { code = (JSON.parse((ev as MessageEvent<string>).data) as { code?: number | null }).code ?? null; } catch { code = null; }
        map.delete(id);
        es.close();
        patch(id, (s) => (s.exited
          ? s
          : { ...s, exited: true, exitCode: code, buffer: `${s.buffer}${s.buffer.endsWith('\n') || s.buffer.length === 0 ? '' : '\n'}… 进程已退出（退出码 ${code ?? '?' }）\n` }));
      });
      es.onerror = () => { /* EventSource auto-reconnects; the exit event closes it */ };
      map.set(id, es);
    }
    for (const [id, es] of [...map.entries()]) {
      if (live.has(id)) continue;
      es.close();
      map.delete(id);
    }
  }, [enabled, sessions, appendOut, patch]);

  // First panel open adopts the sessions already RUNNING on this server (a
  // reload must not kill work). Exited sessions are corpses the server is
  // about to sweep — adopting them would resurrect dead tabs on every load.
  useEffect(() => {
    if (!enabled || loadedRef.current) return;
    loadedRef.current = true;
    void listTerminalSessions()
      .then(({ sessions: views, maxSessions: max }) => {
        setMaxSessions(max);
        const alive = views.filter((v) => v.alive);
        setSessions(alive.map((view) => ({ view, buffer: '', received: null, exited: false, exitCode: null })));
        setActiveId((cur) => cur ?? alive[0]?.id ?? null);
      })
      .catch((e: unknown) => {
        loadedRef.current = false;
        if (e instanceof ApiError && (e.status === 403 || e.code === 'feature_disabled')) setDisabled(true);
        else setError(e instanceof ApiError ? e.message : String(e));
      });
  }, [enabled]);

  const newSession = useCallback((): void => {
    setCreating(true);
    setError(null);
    void createTerminalSession()
      .then((view) => {
        setSessions((cur) => [...cur, { view, buffer: '', received: null, exited: false, exitCode: null }]);
        setActiveId(view.id);
      })
      .catch((e: unknown) => { setError(e instanceof ApiError ? e.message : String(e)); })
      .finally(() => { setCreating(false); });
  }, []);

  const killSession = useCallback((id: string): void => {
    setError(null);
    void killTerminalSession(id)
      .then(() => { patch(id, (s) => ({ ...s, exited: true })); })
      .catch((e: unknown) => { setError(e instanceof ApiError ? e.message : String(e)); });
  }, [patch]);

  const dismissSession = useCallback((id: string): void => {
    sourcesRef.current.get(id)?.close();
    sourcesRef.current.delete(id);
    setSessions((cur) => cur.filter((s) => s.view.id !== id));
    setActiveId((cur) => {
      if (cur !== id) return cur;
      return null;
    });
  }, []);

  // Keep the active id honest after a dismissal.
  useEffect(() => {
    if (activeId === null) return;
    if (!sessions.some((s) => s.view.id === activeId)) {
      const next = sessions.find((s) => !s.exited) ?? sessions[0];
      setActiveId(next !== undefined ? next.view.id : null);
    }
  }, [sessions, activeId]);

  const send = useCallback((line: string): void => {
    const id = activeId;
    if (id === null || line.length === 0) return;
    setSending(true);
    // No TTY => the shell does not echo; the client shows the sent line so the
    // transcript reads like a session. This is OUR input, not shell output.
    patch(id, (s) => ({ ...s, buffer: s.buffer.length === 0 || s.buffer.endsWith('\n') ? `${s.buffer}${line}\n` : `${s.buffer}\n${line}\n` }));
    void writeTerminalInput(id, `${line}\n`)
      .catch((e: unknown) => { setError(e instanceof ApiError ? e.message : String(e)); })
      .finally(() => { setSending(false); });
  }, [activeId, patch]);

  const active = sessions.find((s) => s.view.id === activeId) ?? null;
  return {
    sessions, activeId, active, busy: creating || sending, creating, error, disabled, maxSessions,
    setActiveId, newSession, killSession, dismissSession, send,
  };
}
