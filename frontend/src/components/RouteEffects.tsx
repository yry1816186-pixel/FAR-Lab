/**
 * RouteEffects — cross-cutting side effects tied to the current route.
 *
 * Two standard SPA affordances that every mature product needs but that are
 * easy to forget per-page:
 *
 *   1. Scroll-to-top on navigation. Without this, navigating from a long page
 *      (e.g. Ablation) to a short one keeps the scroll position, so the user
 *      sees a blank lower half. We reset to the top on every pathname change.
 *
 *   2. Per-route document.title. The browser tab / history / bookmarks should
 *      reflect the current section, not stay frozen on the static index.html
 *      title. Unknown paths fall back to the base title.
 *
 * Rendered once inside <BrowserRouter> (App.tsx); returns no visible output.
 */

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const BASE_TITLE = 'FAR-Lab';
const BASE_TITLE_FULL = 'FAR-Lab · Falsifiable · Auditable · Reproducible';

/** Maps each known route to a short label used in the document title. */
const ROUTE_TITLES: Readonly<Record<string, string>> = {
  '/': 'Research', // research workbench is the default/landing route
  '/research': 'Research',
  '/viz': 'Evidence Chain',
  '/integrity': 'Integrity',
  '/leaderboard': 'Leaderboard',
  '/court': 'Court',
  '/arena': 'Arena',
  '/honesty': 'Honesty Wall',
  '/ablation': 'Ablation',
  '/report': 'Report',
  '/about': 'About',
};

export function RouteEffects(): null {
  const { pathname } = useLocation();

  useEffect(() => {
    // Scroll-to-top: use the standard window.scrollTo. jsdom provides a no-op
    // stub (mocked in test-setup.ts) so this is safe in the test environment.
    window.scrollTo(0, 0);

    const segment = ROUTE_TITLES[pathname];
    document.title =
      segment !== undefined ? `${segment} · ${BASE_TITLE}` : BASE_TITLE_FULL;
  }, [pathname]);

  return null;
}
