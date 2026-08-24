/**
 * Live-core (pure, deterministic — node:test). Three concerns for the TUI live
 * mode, no I/O anywhere:
 *  1. Incremental SSE wire parsing (frames can split across TCP chunks; the
 *     parser keeps unparsed tail state).
 *  2. Reconnect backoff policy (pure function of attempt count; capped).
 *  3. Incremental event -> stage-row merge, the same L1 semantics as
 *     narrative.deriveStages but applied one event at a time.
 */
import type { RunEvent } from './api.ts';
import type { StageRow } from './narrative.ts';

// ---- 1. SSE wire parser ----------------------------------------------------

export interface SseMessage {
  id?: number;
  event?: string;
  data: string;
}

export interface SseParseState {
  /** Unparsed tail of the previous chunk (a frame may split anywhere). */
  tail: string;
  /** Field state of the frame currently being assembled — must survive chunk
   *  boundaries (`id: 12\n` + later `data: …`), so it lives here, not in
   *  parser locals (the original bug: cut-between-id-and-data lost the id). */
  pendingId?: number;
  pendingEvent?: string;
  pendingData: string[];
}

export const emptySseState = (): SseParseState => ({ tail: '', pendingData: [] });

/**
 * Feed one transport chunk; returns completed messages. Follows the SSE spec
 * shape we actually emit server-side (`id:`, `event:`, `data:` fields, `:`
 * comments, blank line dispatch, CR stripped). Multi-line `data:` joins with \n.
 */
export function parseSseChunk(state: SseParseState, chunk: string): { messages: SseMessage[]; state: SseParseState } {
  const text = state.tail + chunk.replace(/\r\n/g, '\n');
  const messages: SseMessage[] = [];
  let id = state.pendingId;
  let event = state.pendingEvent;
  const dataLines = [...state.pendingData];

  const flush = (): void => {
    if (dataLines.length > 0 || id !== undefined || event !== undefined) {
      messages.push({
        ...(id !== undefined ? { id } : {}),
        ...(event !== undefined ? { event } : {}),
        data: dataLines.join('\n'),
      });
    }
    id = undefined;
    event = undefined;
    dataLines.length = 0;
  };

  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) !== 10 /* \n */) continue;
    const line = text.slice(start, i);
    start = i + 1;
    if (line.length === 0) {
      flush();
      continue;
    }
    if (line.startsWith(':')) continue; // comment / keep-alive ping
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const rawValue = colon === -1 ? '' : line.slice(colon + 1);
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;
    if (field === 'data') dataLines.push(value);
    else if (field === 'event') event = value;
    else if (field === 'id') {
      const n = Number.parseInt(value, 10);
      if (Number.isFinite(n) && n >= 0) id = n;
    }
    // unknown fields are ignored per spec
  }
  // Whatever is left has no trailing newline yet — keep as tail (fields AND
  // partially assembled frame state). A COMPLETE message always ends with a
  // blank line, so nothing is lost by holding the final partial line back.
  return {
    messages,
    state: {
      tail: text.slice(start),
      pendingId: id,
      pendingEvent: event,
      pendingData: dataLines,
    },
  };
}

// ---- 2. Reconnect backoff --------------------------------------------------

export const MAX_BACKOFF_MS = 8_000;
export const BASE_BACKOFF_MS = 500;

/** 500ms, 1s, 2s, 4s, 8s (capped). Deterministic; jitter belongs to the caller. */
export function backoffDelayMs(attempt: number): number {
  const a = Math.max(0, attempt);
  return Math.min(BASE_BACKOFF_MS * 2 ** a, MAX_BACKOFF_MS);
}

// ---- 3. Incremental stage merge ---------------------------------------------

const TRANSITIONS = new Set(['stage_started', 'stage_done', 'stage_failed', 'stage_skipped']);

/**
 * Apply ONE run event to the stage map (same newest-transition-wins semantics
 * as narrative.deriveStages; summary keeps the last non-empty value).
 * Returns a NEW map — pure, no mutation of the input.
 */
export function applyEventToStages(map: ReadonlyMap<string, StageRow>, e: RunEvent): Map<string, StageRow> {
  if (!TRANSITIONS.has(e.type) || e.stage === undefined) return new Map(map);
  const status: StageRow['status'] = e.type === 'stage_done' ? 'done'
    : e.type === 'stage_failed' ? 'failed'
    : e.type === 'stage_skipped' ? 'skipped' : 'started';
  const summary = typeof e.detail?.summary === 'string' ? e.detail.summary : undefined;
  const next = new Map(map);
  const prev = next.get(e.stage);
  next.set(e.stage, {
    stage: e.stage,
    status,
    at: e.at,
    ...(summary !== undefined ? { summary } : prev?.summary !== undefined ? { summary: prev.summary } : {}),
  });
  return next;
}

/** Map -> newest-first rows (the display order the web feed and v2 TUI use). */
export function stageRows(map: ReadonlyMap<string, StageRow>): StageRow[] {
  return [...map.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** Build the initial map from a snapshot fetch (used before attaching the stream). */
export function stagesFromEvents(events: readonly RunEvent[]): Map<string, StageRow> {
  let map = new Map<string, StageRow>();
  for (const e of events) map = applyEventToStages(map, e);
  return map;
}
