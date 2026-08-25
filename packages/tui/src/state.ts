/**
 * Persistent CLIENT state for the TUI (v3): which view the researcher left,
 * which run detail / conversation they had open. This is terminal-client
 * state, NOT workspace truth — the server owns all research data. The file
 * lives under the user's home (overridable with FARLAB_TUI_STATE) so a
 * remote TUI against FAR_URL keeps its own session memory.
 *
 * Failure discipline: corrupt/missing/unwritable state degrades to defaults
 * and never crashes the TUI — restoring a session is a convenience, not a
 * correctness invariant.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface TuiState {
  lastView?: 'runs' | 'conversations';
  lastRunId?: string;
  lastConversationId?: string;
}

export function statePath(): string {
  return process.env.FARLAB_TUI_STATE ?? path.join(os.homedir(), '.far-lab', 'tui-state.json');
}

export function loadState(file: string = statePath()): TuiState {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return {}; // missing/unreadable: fresh client
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return {};
    const src = parsed as Record<string, unknown>;
    const out: TuiState = {};
    if (src.lastView === 'runs' || src.lastView === 'conversations') out.lastView = src.lastView;
    if (typeof src.lastRunId === 'string') out.lastRunId = src.lastRunId;
    if (typeof src.lastConversationId === 'string') out.lastConversationId = src.lastConversationId;
    return out;
  } catch {
    return {}; // corrupt: fresh client, never fatal
  }
}

/** Merge-write (read-modify-write on the SAME path loadState uses by default). */
export function saveState(patch: TuiState, file: string = statePath()): void {
  try {
    const merged = { ...loadState(file), ...patch };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(merged, null, 2) + '\n');
  } catch (e) {
    // Client-state persistence is best-effort; surface on stderr, never crash.
    process.stderr.write(`far-tui: 会话状态保存失败（不影响使用）: ${e instanceof Error ? e.message : String(e)}\n`);
  }
}

/** Test/CI helper — drop the file entirely. */
export function clearState(file: string = statePath()): void {
  try { fs.rmSync(file, { force: true }); } catch { /* nothing to clean */ }
}
