import type { Store } from '../persistence/store.js';
import type { RunEvent } from '../domain/run.js';

/**
 * Research query plane (AVO fusion G5/G6).
 *
 * G6 — Events query API: NOOA's EventsApi (arXiv:2607.20709) gives agents a
 * typed QUERY surface over append-only history instead of replaying it into
 * context. FAR-Lab already persists the spine and indexes tags; this module is
 * the model-facing wrapper with honest bounds.
 *
 * G5 — Pass-by-reference: oversized tool outputs/artifacts must not be
 * re-serialized into context on every turn. previewFor returns { ref, preview,
 * chars, truncated } — the caller keeps the ref, shows the bounded preview,
 * and expands the full payload only when explicitly needed.
 */

export interface EventQueryInput {
  runId: string;
  /** Event kinds to include (closed vocabulary of RunEvent['type']). */
  kinds: readonly string[];
  /** Max events returned; hard-clamped to keep the model view bounded. */
  limit?: number;
}

export interface EventQueryResult {
  events: RunEvent[];
  truncated: boolean;
  limit: number;
}

const HARD_LIMIT = 50;

/**
 * Kind-filtered, bounded event query for agent consumption. Read-only over
 * the store. Empty `kinds` throws — an unbounded "give me everything" call is
 * a context-budget bug, not a query.
 */
export const queryRunEvents = (store: Store, input: EventQueryInput): EventQueryResult => {
  if (!Array.isArray(input.kinds) || input.kinds.length === 0) {
    throw new Error('queryRunEvents requires at least one event kind (unbounded queries are refused)');
  }
  const limit = Math.max(1, Math.min(input.limit ?? 20, HARD_LIMIT));

  // listEvents returns oldest-first for the run; filter by kind then take the
  // TAIL (most recent) — recency matters most for steering, and the truncated
  // flag discloses what was dropped. Never crosses runs (store scopes by id).
  const all = store.listEvents(input.runId).filter((e) => input.kinds.includes(e.type));
  const start = Math.max(0, all.length - limit);
  return {
    events: all.slice(start),
    truncated: all.length > limit,
    limit,
  };
};

// ---- pass-by-reference previews (G5) ----

export interface PreviewSource {
  /** Stable reference the model can expand later (artifact sha256 ref, row id...). */
  ref: string;
  kind: string;
  payload: unknown;
}

export interface BoundedPreview {
  ref: string;
  kind: string;
  chars: number;
  preview: string;
  truncated: boolean;
}

/** Serialize any payload deterministically for previewing. */
const serialize = (payload: unknown): string => {
  if (typeof payload === 'string') return payload;
  try {
    return JSON.stringify(payload) ?? String(payload);
  } catch {
    return String(payload);
  }
};

/**
 * Build a bounded preview with a stable ref. The FULL payload is deliberately
 * absent from the return value — callers hold the reference; expansion is an
 * explicit follow-up (NOOA pass-by-reference semantics, head-truncation marker
 * compatible with the compaction layer's stub shape).
 */
export const previewFor = (source: PreviewSource, opts: { maxChars: number }): BoundedPreview => {
  const text = serialize(source.payload);
  const maxChars = Math.max(1, opts.maxChars);
  if (text.length <= maxChars) {
    return { ref: source.ref, kind: source.kind, chars: text.length, preview: text, truncated: false };
  }
  // Reserve room for the expansion marker so the TOTAL preview stays <= maxChars.
  const marker = `…[+${text.length - maxChars} chars; expand ${source.ref}]`;
  return {
    ref: source.ref,
    kind: source.kind,
    chars: text.length,
    preview: `${text.slice(0, Math.max(0, maxChars - marker.length))}${marker}`,
    truncated: true,
  };
};
