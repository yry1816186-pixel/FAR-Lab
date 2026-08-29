import { randomUUID } from 'node:crypto';
import { detectLoginShell, killTree, spawnSessionShell, type LoginShell } from '../shared/login-shell.js';

/**
 * Terminal sessions (extensibility lane): persistent login-shell REPLs behind
 * the API — the researcher's real shell, profile-loaded, in the workspace.
 *
 * Honest model:
 * - Line-based stdio pipes (NO PTY): commands, output streaming and REPL
 *   workflows are real; full-screen TUI programs (vim/htop) are not usable
 *   and the UI says so — no fake interactivity.
 * - Bounded by design: max concurrent sessions, idle TTL with sweep, output
 *   ring buffer with eviction notes (dropped-count surfaced, not hidden).
 * - Kill switch: FARLAB_TERMINAL=off disables the whole surface (403 at the
 *   API boundary); FARLAB_SHELL pins the shell program.
 * - Trust: the session runs with the server process's own privileges on the
 *   researcher's machine (same documented trust model as plugin hosts — see
 *   SECURITY.md). The server binds loopback by default.
 */

export interface TerminalSessionView {
  id: string;
  shell: { program: string; displayName: string };
  cwd: string;
  createdAt: string;
  lastActivityAt: string;
  alive: boolean;
  exited: boolean;
  exitCode: number | null;
}

interface RingBuffer {
  push(chunk: string): void;
  replay(): string;
  droppedChars: number;
}

const makeRing = (maxChars: number): RingBuffer => {
  let buf = '';
  let dropped = 0;
  return {
    push(chunk: string): void {
      buf += chunk;
      if (buf.length > maxChars) {
        dropped += buf.length - maxChars;
        buf = buf.slice(buf.length - maxChars);
      }
    },
    replay(): string { return buf; },
    get droppedChars(): number { return dropped; },
  };
};

interface LiveSession {
  id: string;
  shell: LoginShell;
  cwd: string;
  child: ReturnType<typeof spawnSessionShell>;
  ring: RingBuffer;
  createdAt: string;
  lastActivityAt: string;
  exited: boolean;
  exitCode: number | null;
  listeners: Set<(event: TerminalEvent) => void>;
}

export type TerminalEvent =
  | { type: 'out'; data: string }
  | { type: 'exit'; code: number | null };

const MAX_SESSIONS = 6;
const IDLE_TTL_MS = 30 * 60_000;
const RING_CHARS = 256 * 1024;

export class TerminalManager {
  private readonly sessions = new Map<string, LiveSession>();
  private sweeper: NodeJS.Timeout | null = null;

  enabled(): boolean {
    return process.env.FARLAB_TERMINAL !== 'off';
  }

  /** Start a login-shell session rooted at `cwd` (caller confines the path). */
  create(cwd: string): TerminalSessionView {
    if (!this.enabled()) throw new Error('terminal disabled: FARLAB_TERMINAL=off');
    this.sweepIdle();
    if (this.sessions.size >= MAX_SESSIONS) {
      throw new Error(`terminal session cap reached (${MAX_SESSIONS}) — close one first`);
    }
    const shell = detectLoginShell();
    const child = spawnSessionShell(shell, cwd);
    const session: LiveSession = {
      id: randomUUID(),
      shell,
      cwd,
      child,
      ring: makeRing(RING_CHARS),
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      exited: false,
      exitCode: null,
      listeners: new Set(),
    };
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => this.onOutput(session, chunk));
    child.stderr?.on('data', (chunk: string) => this.onOutput(session, chunk));
    child.on('exit', (code) => {
      session.exited = true;
      session.exitCode = code;
      for (const l of session.listeners) l({ type: 'exit', code });
      session.listeners.clear();
      // Keep the corpse briefly so the UI can read the exit state; sweep removes it.
      setTimeout(() => { this.sessions.delete(session.id); }, 60_000).unref?.();
    });
    this.sessions.set(session.id, session);
    if (shell.sessionUtf8Prelude.length > 0) this.write(session.id, shell.sessionUtf8Prelude);
    return this.view(session);
  }

  list(): TerminalSessionView[] {
    return [...this.sessions.values()].map((s) => this.view(s));
  }

  get(id: string): TerminalSessionView | null {
    const s = this.sessions.get(id);
    return s === undefined ? null : this.view(s);
  }

  /** Send raw keystrokes/lines to the session's stdin (caller may append '\n'). */
  write(id: string, text: string): void {
    const s = this.sessions.get(id);
    if (s === undefined || s.exited) throw new Error(`terminal session not writable: ${id}`);
    if (text.length > 8000) throw new Error('input chunk over 8000 chars');
    s.child.stdin?.write(text);
    s.lastActivityAt = new Date().toISOString();
  }

  /** Replay the ring buffer, then stream live events until the listener unsubscribes. */
  subscribe(id: string, onEvent: (event: TerminalEvent) => void): { droppedChars: number } | null {
    const s = this.sessions.get(id);
    if (s === undefined) return null;
    if (s.ring.replay().length > 0) onEvent({ type: 'out', data: s.ring.replay() });
    if (s.exited) { onEvent({ type: 'exit', code: s.exitCode }); return { droppedChars: s.ring.droppedChars }; }
    s.listeners.add(onEvent);
    return { droppedChars: s.ring.droppedChars };
  }

  unsubscribe(id: string, onEvent: (event: TerminalEvent) => void): void {
    this.sessions.get(id)?.listeners.delete(onEvent);
  }

  kill(id: string): boolean {
    const s = this.sessions.get(id);
    if (s === undefined) return false;
    killTree(s.child);
    s.lastActivityAt = new Date().toISOString();
    return true;
  }

  closeAll(): void {
    for (const s of this.sessions.values()) killTree(s.child);
    this.sessions.clear();
    if (this.sweeper !== null) { clearInterval(this.sweeper); this.sweeper = null; }
  }

  private onOutput(session: LiveSession, chunk: string): void {
    session.ring.push(chunk);
    for (const l of session.listeners) l({ type: 'out', data: chunk });
  }

  private view(s: LiveSession): TerminalSessionView {
    return {
      id: s.id,
      shell: { program: s.shell.program, displayName: s.shell.displayName },
      cwd: s.cwd,
      createdAt: s.createdAt,
      lastActivityAt: s.lastActivityAt,
      alive: !s.exited,
      exited: s.exited,
      exitCode: s.exitCode,
    };
  }

  /** Idle sessions (no activity, no listeners) are killed after IDLE_TTL_MS. */
  private sweepIdle(): void {
    if (this.sweeper === null) {
      this.sweeper = setInterval(() => { this.sweepIdle(); }, 60_000);
      this.sweeper.unref?.();
    }
    const now = Date.now();
    for (const s of this.sessions.values()) {
      if (s.exited || s.listeners.size > 0) continue;
      if (now - Date.parse(s.lastActivityAt) > IDLE_TTL_MS) {
        killTree(s.child);
        this.sessions.delete(s.id);
      }
    }
  }
}
