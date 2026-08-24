import { useCallback, useEffect, useRef } from 'react';

/**
 * Hash-based shareable route (S3, product-critique #5): `#run/<runId>/<tab>`
 * survives refresh and can be linked to colleagues — run/tab state used to be
 * useState-only and evaporated on reload. No history-API routing: the SPA is
 * served from a static file server, and hash routes need no server support.
 *
 * R2-01: conversations are first-class routes too. `#conv/<convId>` addresses
 * a full-view conversation; a conversation docked beside an open research view
 * is carried as `#run/<runId>/<tab>?conv=<convId>` so the paired layout
 * (objects + dialogue) survives refresh — the leave-and-resume journey no
 * longer drops the researcher's conversation context.
 */

export interface HashRoute {
  runId: string | null;
  tab: string | null;
  /** Conversation shown full-view (`#conv/<id>`) or docked (`?conv=` on a run route). */
  convId: string | null;
}

const RUN_RE = /^run_[0-9a-z]{20,32}$/;
const CONV_RE = /^conv_[0-9a-z]{20,32}$/;

/** Parse `#run/<runId>/<tab>` / `#conv/<convId>` (run routes may carry `?conv=`);
 * anything malformed yields empty (never throws on user-typed URLs). */
export function parseHash(hash: string): HashRoute {
  const convMatch = /^#conv\/([0-9a-z_]+)/.exec(hash);
  if (convMatch !== null) {
    return CONV_RE.test(convMatch[1]!)
      ? { runId: null, tab: null, convId: convMatch[1]! }
      : { runId: null, tab: null, convId: null };
  }
  const m = /^#run\/([0-9a-z_]+)(?:\/([a-z_]+))?(?:\?conv=([0-9a-z_]+))?/.exec(hash);
  if (m === null || !RUN_RE.test(m[1]!)) return { runId: null, tab: null, convId: null };
  const convId = m[3] !== undefined && CONV_RE.test(m[3]!) ? m[3]! : null;
  return { runId: m[1]!, tab: m[2] ?? null, convId };
}

export function buildHash(runId: string | null, tab: string | null, convId: string | null = null): string {
  if (runId === null) return convId !== null ? `#conv/${convId}` : '';
  const base = tab !== null ? `#run/${runId}/${tab}` : `#run/${runId}`;
  return convId !== null ? `${base}?conv=${convId}` : base;
}

export function useHashRoute(
  currentRunId: string | null,
  currentTab: string | null,
  onHashRoute: (route: HashRoute) => void,
  currentConvId: string | null = null,
): void {
  // Expose the latest handler to the listeners without re-subscribing on every render.
  const handlerRef = useRefLatest(onHashRoute);

  // External navigation (back/forward, typed URL, colleague's link) -> app state.
  useEffect(() => {
    const onHashChange = (): void => {
      const route = parseHash(window.location.hash);
      handlerRef.current(route);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [handlerRef]);

  // App state -> URL. Suppress the echo of our own write (hashchange fires on
  // programmatic changes too in some browsers; guard by comparing intent).
  const write = useCallback((): void => {
    const wanted = buildHash(currentRunId, currentTab, currentConvId);
    if (window.location.hash !== wanted) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search + wanted);
    }
  }, [currentRunId, currentTab, currentConvId]);
  useEffect(() => { write(); }, [write]);
}

// Minimal latest-ref helper (avoids re-subscribing listeners every render).
function useRefLatest<T>(value: T): { current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
