import { useCallback, useEffect, useRef } from 'react';

/**
 * Hash-based shareable route (S3, product-critique #5): `#run/<runId>/<tab>`
 * survives refresh and can be linked to colleagues — run/tab state used to be
 * useState-only and evaporated on reload. No history-API routing: the SPA is
 * served from a static file server, and hash routes need no server support.
 */

export interface HashRoute {
  runId: string | null;
  tab: string | null;
}

const RUN_RE = /^run_[0-9a-z]{20,32}$/;

/** Parse `#run/<runId>/<tab>`; anything malformed yields empty (never throws on user-typed URLs). */
export function parseHash(hash: string): HashRoute {
  const m = /^#run\/([0-9a-z_]+)(?:\/([a-z_]+))?/.exec(hash);
  if (m === null || !RUN_RE.test(m[1]!)) return { runId: null, tab: null };
  return { runId: m[1]!, tab: m[2] ?? null };
}

export function buildHash(runId: string | null, tab: string | null): string {
  if (runId === null) return '';
  return tab !== null ? `#run/${runId}/${tab}` : `#run/${runId}`;
}

export function useHashRoute(
  currentRunId: string | null,
  currentTab: string | null,
  onHashRoute: (route: HashRoute) => void,
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
    const wanted = buildHash(currentRunId, currentTab);
    if (window.location.hash !== wanted) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search + wanted);
    }
  }, [currentRunId, currentTab]);
  useEffect(() => { write(); }, [write]);
}

// Minimal latest-ref helper (avoids re-subscribing listeners every render).
function useRefLatest<T>(value: T): { current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
