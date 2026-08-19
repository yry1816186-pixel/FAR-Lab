/**
 * app/RouteEffects — route-bound cross-cutting side effects, bound once here.
 *
 * Provenance: ported from v1 `components/RouteEffects.tsx` (805592e tree — lost in
 * the v2 rewrite, restored R2). Same four affordances, same focus-stealing guard:
 *
 *   1. Scroll-to-top on PUSH/REPLACE navigation — a long page must not leave the
 *      next page scrolled into blank space. POP navigations (browser Back/Forward)
 *      instead RESTORE the remembered position (researchers comparing two pages
 *      keep their reading position).
 *
 *   2. Per-route document.title derived from the single nav table (NAV_ITEMS) —
 *      no second hand-maintained route→title map that drifts stale. Parameterized
 *      routes resolve by first segment; unknown routes get the full base title
 *      (WCAG 2.4.2: every page is titled).
 *
 *   3. Focus management (WCAG 2.4.3): after a nav-link-triggered navigation, focus
 *      moves to #main-content (tabIndex=-1) so keyboard/screen-reader users get a
 *      deterministic "new page starts here" anchor.
 *
 *   4. Scroll memory: passive scroll listener remembers each pathname's last
 *      position for POP restore (session-scoped, module-local).
 *
 * Rendered once inside <BrowserRouter> (App.tsx); returns no visible output.
 */

import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

import { NAV_ITEMS } from './AppShell.tsx';
import { useT, type MessageKey } from '@/shared/i18n/index.tsx';

const BASE_TITLE = 'FAR-Lab';
const BASE_TITLE_FULL = 'FAR-Lab · Falsifiable · Auditable · Reproducible';

/** Last-seen scroll position per pathname (module-local session memory). */
const scrollMemory = new Map<string, number>();

/**
 * Resolve the title key for a pathname from the nav table (SSOT) by first
 * segment, so `/missions/<id>` inherits the missions title and adding a nav
 * item automatically titles its subtree. `/receipts/:id` has no nav entry of
 * its own (it hangs off the verify flow) and maps to the receipts list title.
 */
function titleKeyFor(pathname: string): MessageKey | undefined {
  if (pathname === '/') return 'nav.home';
  const first = pathname.split('/')[1];
  const hit = NAV_ITEMS.find((item) => item.to === `/${first}`);
  if (hit !== undefined) return hit.key;
  if (first === 'receipts') return 'receipts.title';
  return undefined;
}

export function RouteEffects(): null {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const t = useT();
  const isFirstRender = useRef(true);
  // Focus is moved to main-content only for a NOT-YET-CONSUMED pathname: a
  // lazy-route chunk resolving late re-runs this effect with an unchanged
  // pathname, and re-focusing then would steal focus from wherever the user
  // already is.
  const lastFocusedPath = useRef<string | null>(null);

  // Remember the scroll position of the current page (passive — never on the
  // interaction critical path). The effect's closure captures THIS render's
  // pathname: reading a ref here would lag one effect-cycle and write the new
  // page's scroll position into the old page's memory slot.
  useEffect(() => {
    const onScroll = (): void => {
      scrollMemory.set(pathname, window.scrollY);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      scrollMemory.set(pathname, window.scrollY);
    };
  }, [pathname]);

  useEffect(() => {
    // Focus: move to main content when the navigation was triggered by a nav
    // link. NOT moved when: initial load (native behavior), or the navigation
    // completes late (suspended lazy chunk) after the user already moved focus
    // elsewhere — stealing it back would strand them.
    if (isFirstRender.current) {
      isFirstRender.current = false;
    } else if (lastFocusedPath.current !== pathname) {
      const active = document.activeElement;
      const isNavTrigger =
        active instanceof HTMLAnchorElement &&
        active.closest('nav') !== null &&
        active.getAttribute('href') === pathname;
      if (isNavTrigger) {
        document.getElementById('main-content')?.focus({ preventScroll: true });
      }
      lastFocusedPath.current = pathname;
    }

    // Scroll: Back/Forward restores where the user was; new navigations start
    // at the top.
    if (navigationType === 'POP') {
      window.scrollTo(0, scrollMemory.get(pathname) ?? 0);
    } else {
      window.scrollTo(0, 0);
    }

    // Title: derived from the nav table so it can never drift from the IA.
    const labelKey = titleKeyFor(pathname);
    document.title =
      labelKey !== undefined ? `${t(labelKey)} · ${BASE_TITLE}` : BASE_TITLE_FULL;
  }, [pathname, navigationType, t]);

  return null;
}
