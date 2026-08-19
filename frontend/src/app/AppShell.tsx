import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

import { useHealth, useLlmStatus } from '@/shared/api/endpoints.ts';
import { useI18n, useT, type MessageKey } from '@/shared/i18n/index.tsx';
import { useTheme } from '@/shared/theme/ThemeProvider.tsx';
import { Badge } from '@/shared/ui/Badge.tsx';
import { cx } from '@/shared/ui/cx.ts';

export const NAV_ITEMS: readonly { readonly to: string; readonly key: MessageKey; readonly end?: boolean }[] = [
  { to: '/', key: 'nav.home', end: true },
  { to: '/evidence', key: 'nav.evidence' },
  { to: '/missions', key: 'nav.missions' },
  { to: '/verify', key: 'nav.verify' },
];

/** 系统深层（产品链 sitemap：工程/评审向入口收折叠层——可见性≠权限，URL/⌘K 永远可达）。 */
export const SYSTEM_NAV_ITEMS: readonly { readonly to: string; readonly key: MessageKey }[] = [
  { to: '/benchmark', key: 'nav.benchmark' },
  { to: '/events', key: 'nav.events' },
  { to: '/assay', key: 'nav.assay' },
  { to: '/about', key: 'nav.about' },
];

function NavLinks({ onNavigate }: { readonly onNavigate?: () => void }) {
  const t = useT();
  const linkClass = ({ isActive }: { isActive: boolean }): string =>
    cx(
      'rounded px-2.5 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
      isActive ? 'font-semibold text-ink underline decoration-accent decoration-2 underline-offset-4' : 'text-ink2 hover:bg-surface2 hover:text-ink',
    );
  return (
    <>
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end ?? false} onClick={onNavigate} className={linkClass}>
          {t(item.key)}
        </NavLink>
      ))}
      {/* 系统深层折叠层：工程/评审向入口（基准/事件/断言检验/关于） */}
      <details className="group relative">
        <summary className="cursor-pointer list-none rounded px-2.5 py-1.5 text-sm text-ink2 hover:bg-surface2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
          {t('nav.system')} ▾
        </summary>
        <div className="absolute left-0 top-full z-50 mt-1 min-w-36 rounded border border-border bg-surface py-1 shadow-lg">
          {SYSTEM_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cx(
                  'block px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-accent',
                  isActive ? 'font-semibold text-ink' : 'text-ink2 hover:bg-surface2 hover:text-ink',
                )
              }
            >
              {t(item.key)}
            </NavLink>
          ))}
        </div>
      </details>
    </>
  );
}

/** Honest runtime strip: API liveness + LLM configuration, as reported by the backend. */
function RuntimeIndicators() {
  const t = useT();
  const health = useHealth();
  const llm = useLlmStatus();

  const apiTone = health.isError ? 'danger' : health.data?.status === 'ok' ? 'ok' : 'warn';
  const apiLabel = health.isError
    ? t('shell.runtime.apiDown')
    : health.data?.status === 'ok'
      ? t('shell.runtime.apiOk')
      : health.data !== undefined
        ? t('shell.runtime.apiDegraded')
        : t('state.loading');

  const llmTone = llm.isError ? 'muted' : llm.data?.keyConfigured === true ? 'ok' : 'warn';
  const llmLabel = llm.isError
    ? t('shell.runtime.llmUnknown')
    : llm.data === undefined
      ? t('state.loading')
      : llm.data.keyConfigured
        ? `${t('shell.runtime.llmLive')}${llm.data.profile !== null ? ` · ${llm.data.profile}` : ''}`
        : t('shell.runtime.llmOffline');

  return (
    <div className="flex items-center gap-2 text-xs" aria-label={t('home.runtimeTitle')}>
      <Badge tone={apiTone} data-testid="runtime-api">
        {t('shell.runtime.api')}: {apiLabel}
      </Badge>
      <Badge tone={llmTone} data-testid="runtime-llm">
        {t('shell.runtime.llm')}: {llmLabel}
      </Badge>
    </div>
  );
}

/**
 * Application shell: top bar with product mark, primary nav, runtime
 * indicators, locale & theme toggles; a skip link; the <main> landmark.
 * Mobile collapses the nav into a disclosure menu (Escape / outside-click /
 * focus-return semantics).
 */
export function AppShell({ children }: { readonly children: ReactNode }) {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the mobile menu on navigation.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (evt: globalThis.KeyboardEvent): void => {
      if (evt.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    const onPointerDown = (evt: PointerEvent): void => {
      if (menuRef.current !== null && !menuRef.current.contains(evt.target as Node) && !menuButtonRef.current?.contains(evt.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [menuOpen]);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="skip-link">
        {t('shell.skipToContent')}
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-page items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-baseline gap-2 rounded focus-visible:ring-2 focus-visible:ring-accent">
            <span className="font-mono text-base font-bold tracking-tight text-ink">FAR-Lab</span>
            <span className="hidden text-xs text-ink3 lg:inline">{t('shell.productTagline')}</span>
          </Link>

          <nav aria-label={t('shell.nav.primary')} className="hidden items-center gap-0.5 md:flex">
            <NavLinks />
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:block">
              <RuntimeIndicators />
            </div>
            <button
              type="button"
              onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
              className="rounded border border-borderStrong px-2 py-1 font-mono text-xs text-ink2 hover:bg-surface2 focus-visible:ring-2 focus-visible:ring-accent"
              aria-label={locale === 'zh' ? t('shell.locale.toEn') : t('shell.locale.toZh')}
            >
              {locale === 'zh' ? 'EN' : '中'}
            </button>
            <button
              type="button"
              onClick={toggle}
              className="rounded border border-borderStrong px-2 py-1 text-xs text-ink2 hover:bg-surface2 focus-visible:ring-2 focus-visible:ring-accent"
              aria-label={theme === 'dark' ? t('shell.theme.toLight') : t('shell.theme.toDark')}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <button
              ref={menuButtonRef}
              type="button"
              className="rounded border border-borderStrong px-2 py-1 text-sm text-ink2 hover:bg-surface2 focus-visible:ring-2 focus-visible:ring-accent md:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? t('shell.menu.close') : t('shell.menu.open')}
              onClick={() => setMenuOpen((v) => !v)}
            >
              ≡
            </button>
          </div>
        </div>

        {menuOpen ? (
          <div id="mobile-nav" ref={menuRef} className="border-t border-border bg-bg px-4 py-3 md:hidden">
            <nav className="flex flex-col gap-1" aria-label={t('shell.nav.primary')}>
              <NavLinks onNavigate={() => setMenuOpen(false)} />
            </nav>
            <div className="mt-3 border-t border-border pt-3">
              <RuntimeIndicators />
            </div>
          </div>
        ) : null}
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-page flex-1 px-4 py-6 focus-visible:outline-none sm:px-6">
        {children}
      </main>

      <footer className="border-t border-border py-3">
        <div className="mx-auto flex max-w-page items-center justify-between px-4 text-xs text-ink3 sm:px-6">
          <span>FAR-Lab · {t('shell.productTagline')}</span>
          <span className="font-mono">R0–R9 kernel · Merkle-chained evidence</span>
        </div>
      </footer>
    </div>
  );
}
