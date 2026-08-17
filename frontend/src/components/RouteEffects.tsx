/**
 * RouteEffects — cross-cutting side effects tied to the current route.
 *
 * Four SPA affordances every mature product needs but that are easy to forget
 * per-page (all bound here, once):
 *
 *   1. Scroll-to-top on PUSH/REPLACE navigation — a long page must not leave
 *      the next page scrolled into blank space. POP navigations (browser
 *      Back/Forward) instead RESTORE the remembered position, so a researcher
 *      comparing two pages keeps their reading position (WCAG 2.4.3-adjacent).
 *
 *   2. Per-route document.title, derived from the single nav table
 *      (NAV_TITLE_BY_PATH) — no second hand-maintained route→title map that
 *      drifts stale as routes are added. Locale-aware: titles follow the
 *      active i18n locale.
 *
 *   3. Focus management (WCAG 2.4.3): after navigation, focus moves to
 *      #main-content (tabIndex=-1) so keyboard/screen-reader users get a
 *      deterministic "new page starts here" anchor instead of the virtual
 *      cursor staying on the nav link they activated.
 *
 *   4. Scroll memory: a passive scroll listener remembers each pathname's
 *      last position for POP restore (session-scoped, module-local).
 *
 * Rendered once inside <BrowserRouter> (App.tsx); returns no visible output.
 */

import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { useT } from '@/lib/i18n';
import { NAV_TITLE_BY_PATH } from '@/components/layout/AppShell';

const BASE_TITLE = 'FAR-Lab';
const BASE_TITLE_FULL = 'FAR-Lab · Falsifiable · Auditable · Reproducible';

/** Last-seen scroll position per pathname (module-local session memory). */
const scrollMemory = new Map<string, number>();

export function RouteEffects(): null {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const t = useT();
  const isFirstRender = useRef(true);
  // Focus is moved to main-content only for a NOT-YET-CONSUMED pathname: a
  // lazy-route chunk resolving late re-runs this effect with an unchanged
  // pathname, and re-focusing then would steal focus from wherever the user
  // already is (e.g. a nav toggle they just closed a panel with).
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
    // link (keyboard/SR users get a "new page starts here" anchor at the link
    // they activated). NOT moved when: initial load (native behavior), or the
    // navigation completes late (suspended lazy chunk) after the user already
    // moved focus elsewhere — stealing it back would strand them (e.g. yank
    // focus off the toggle they just closed a panel with).
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
    const labelKey = NAV_TITLE_BY_PATH[pathname];
    document.title =
      labelKey !== undefined ? `${t(labelKey)} · ${BASE_TITLE}` : BASE_TITLE_FULL;
  }, [pathname, navigationType, t]);

  return null;
}
