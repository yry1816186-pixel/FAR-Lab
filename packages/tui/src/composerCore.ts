/**
 * Composer core (pure, deterministic — tested with node:test).
 * Patterns from Scout B: Enter submits, Ctrl+J inserts a newline (terminal
 * Shift+Enter is not deliverable), bracketed-paste payloads insert verbatim
 * (paste can never be interpreted as command keys — Codex paste_burst
 * semantics), and multi-char CJK payloads arriving from an IME insert as
 * text, never as per-char commands.
 */
export interface ComposerState {
  lines: string[];
  row: number;
  col: number;
}

export const emptyComposer = (): ComposerState => ({ lines: [''], row: 0, col: 0 });

export const PASTE_START = '\x1b[200~';
export const PASTE_END = '\x1b[201~';

/** Extract a bracketed-paste payload; null when the chunk is not a paste. */
export function extractPaste(input: string): string | null {
  const start = input.indexOf(PASTE_START);
  if (start === -1) return null;
  const end = input.indexOf(PASTE_END, start);
  const body = end === -1 ? input.slice(start + PASTE_START.length) : input.slice(start + PASTE_START.length, end);
  return body.replace(/\r/g, '');
}

/** Strip terminal control sequences that must never become buffer text. */
export function sanitizeText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z~]/g, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

export function insertText(st: ComposerState, text: string): ComposerState {
  const lines = [...st.lines];
  const current = lines[st.row] ?? '';
  const before = current.slice(0, st.col);
  const after = current.slice(st.col);
  if (text.includes('\n')) {
    const parts = text.split('\n');
    lines.splice(st.row, 1, before + parts[0]!, ...parts.slice(1, -1), parts[parts.length - 1]! + after);
    return { lines, row: st.row + parts.length - 1, col: parts[parts.length - 1]!.length };
  }
  lines[st.row] = before + text + after;
  return { lines, row: st.row, col: st.col + text.length };
}

export function newline(st: ComposerState): ComposerState {
  return insertText(st, '\n');
}

export function backspace(st: ComposerState): ComposerState {
  const lines = [...st.lines];
  const current = lines[st.row] ?? '';
  if (st.col > 0) {
    lines[st.row] = current.slice(0, st.col - 1) + current.slice(st.col);
    return { lines, row: st.row, col: st.col - 1 };
  }
  if (st.row === 0) return st;
  const prev = lines[st.row - 1]!;
  lines.splice(st.row - 1, 2, prev + current);
  return { lines, row: st.row - 1, col: prev.length };
}

export const composerText = (st: ComposerState): string => st.lines.join('\n');
export const composerReady = (st: ComposerState): boolean => composerText(st).trim().length > 0;
