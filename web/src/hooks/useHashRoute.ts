import { useCallback, useEffect, useRef } from 'react';

/**
 * Hash-based shareable route (S3, product-critique #5): routes survive
 * refresh and can be linked to colleagues. No history-API routing: the SPA is
 * served from a static file server, and hash routes need no server support.
 *
 * HX Research Experience Architecture (2026-08): the product's primary
 * surfaces are the lab home (`#/`), the study map (`#study/<runId>`) and
 * research formation (`#lab/new`). Legacy routes stay addressable:
 * `#run/<runId>/<tab>` (deep tools inside a study) and `#conv/<convId>`
 * (conversations as a tool, full-view or docked beside a study via `?conv=`).
 * `#lab/map/<runId>` and `#lab/home` are skeleton-era aliases that keep old
 * links working.
 */

export interface HashRoute {
  runId: string | null;
  tab: string | null;
  /** Conversation shown full-view (`#conv/<id>`) or docked (`?conv=` on a run route). */
  convId: string | null;
  /** True on `#study/<runId>` (and the `#lab/map/<runId>` alias): the map view. */
  study: boolean;
  /** True on `#lab/new`: the research-formation screen. */
  newResearch: boolean;
}

const RUN_RE = /^run_[0-9a-z]{20,32}$/;
const CONV_RE = /^conv_[0-9a-z]{20,32}$/;

const EMPTY: HashRoute = { runId: null, tab: null, convId: null, study: false, newResearch: false };

/** Parse the route families above; anything malformed yields empty (never
 * throws on user-typed URLs). */
export function parseHash(hash: string): HashRoute {
  if (hash === '#lab/new') return { ...EMPTY, newResearch: true };
  if (hash === '#lab' || hash.startsWith('#lab/home')) return EMPTY;
  const convMatch = /^#conv\/([0-9a-z_]+)/.exec(hash);
  if (convMatch !== null) {
    return CONV_RE.test(convMatch[1]!)
      ? { ...EMPTY, convId: convMatch[1]! }
      : EMPTY;
  }
  // Study map: canonical #study/<runId> + legacy #lab/map/<runId> alias.
  const studyMatch = /^#(?:study|lab\/map)\/([0-9a-z_]+)(?:\?conv=([0-9a-z_]+))?/.exec(hash);
  if (studyMatch !== null && RUN_RE.test(studyMatch[1]!)) {
    const convId = studyMatch[2] !== undefined && CONV_RE.test(studyMatch[2]!) ? studyMatch[2]! : null;
    return { ...EMPTY, runId: studyMatch[1]!, convId, study: true };
  }
  const m = /^#run\/([0-9a-z_]+)(?:\/([a-z_]+))?(?:\?conv=([0-9a-z_]+))?/.exec(hash);
  if (m === null || !RUN_RE.test(m[1]!)) return EMPTY;
  const convId = m[3] !== undefined && CONV_RE.test(m[3]!) ? m[3]! : null;
  return { ...EMPTY, runId: m[1]!, tab: m[2] ?? null, convId };
}

export function buildHash(runId: string | null, tab: string | null, convId: string | null = null, study = false, newResearch = false): string {
  if (newResearch) return '#lab/new';
  if (runId === null) return convId !== null ? `#conv/${convId}` : '';
  const base = study
    ? `#study/${runId}`
    : tab !== null ? `#run/${runId}/${tab}` : `#run/${runId}`;
  return convId !== null ? `${base}?conv=${convId}` : base;
}

export function useHashRoute(
  currentRunId: string | null,
  currentTab: string | null,
  onHashRoute: (route: HashRoute) => void,
  currentConvId: string | null = null,
  currentStudy = false,
  currentNewResearch = false,
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
    const wanted = buildHash(currentRunId, currentTab, currentConvId, currentStudy, currentNewResearch);
    if (window.location.hash !== wanted) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search + wanted);
    }
  }, [currentRunId, currentTab, currentConvId, currentStudy, currentNewResearch]);
  useEffect(() => { write(); }, [write]);
}

// Minimal latest-ref helper (avoids re-subscribing listeners every render).
function useRefLatest<T>(value: T): { current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
