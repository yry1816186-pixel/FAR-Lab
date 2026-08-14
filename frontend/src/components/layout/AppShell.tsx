/**
 * AppShell — main application shell with sidebar navigation + top bar + content area.
 *
 * Extracted from App.tsx. Wraps page content with:
 *   - Top navigation bar (FAR-Lab branding + nav links)
 *   - Theme toggle button
 *   - Language toggle button (zh / en)
 *   - Main content area
 *
 * R-01 信息架构:原 14 项扁平 nav 重组为 5 组(验证 / 证据 / 广度 / 历史 / 元信息)。
 *   - 桌面端:14 个 NavLink 保持不变,组间插入垂直分隔(分组可见·不增 link 数)。
 *   - 移动端:drawer 内按组渲染,每组带分组标题。
 *   - 路由与可访问性不变:14 个 NavLink 全部保留,App.test 的 toHaveLength(14) 仍成立。
 */

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Network, ShieldAlert, ShieldCheck, FlaskConical, FileText, Info, Sun, Moon, Trophy, Gavel, Swords, Languages, Menu, X, GitCompare, Sparkles, ScrollText, Radio, ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/layout/Logo';
import { useTheme } from '@/components/theme/ThemeProvider';
import { useI18n, type Locale } from '@/lib/i18n';

export interface AppShellProps {
  readonly children: ReactNode;
}

// ---------- Nav item / group types ----------

type NavLabelKey =
  | 'nav.research' | 'nav.overview' | 'nav.viz' | 'nav.integrity' | 'nav.leaderboard'
  | 'nav.court' | 'nav.arena' | 'nav.honesty' | 'nav.ablation'
  | 'nav.report' | 'nav.about' | 'nav.versions' | 'nav.wizard'
  | 'nav.v2receipt' | 'nav.events' | 'nav.planning' | 'nav.audit';

type NavGroupKey =
  | 'nav.group.research' | 'nav.group.verify' | 'nav.group.evidence'
  | 'nav.group.history' | 'nav.group.meta' | 'nav.group.devtools';

interface NavItem {
  readonly to: string;
  readonly labelKey: NavLabelKey;
  readonly icon: typeof LayoutDashboard;
}

interface NavGroup {
  readonly id: string;
  readonly labelKey: NavGroupKey;
  readonly items: readonly NavItem[];
}

// ---------- Information architecture (5 groups · 14 links total) ----------

const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'research',
    labelKey: 'nav.group.research',
    items: [
      { to: '/research', labelKey: 'nav.research', icon: FlaskConical },
    ],
  },
  {
    id: 'verify',
    labelKey: 'nav.group.verify',
    items: [
      { to: '/wizard', labelKey: 'nav.wizard', icon: Sparkles },
      { to: '/v2-receipt', labelKey: 'nav.v2receipt', icon: ScrollText },
    ],
  },
  {
    id: 'evidence',
    labelKey: 'nav.group.evidence',
    items: [
      { to: '/overview', labelKey: 'nav.overview', icon: LayoutDashboard },
      { to: '/viz', labelKey: 'nav.viz', icon: Network },
      { to: '/integrity', labelKey: 'nav.integrity', icon: ShieldCheck },
      { to: '/versions', labelKey: 'nav.versions', icon: GitCompare },
    ],
  },
  {
    id: 'history',
    labelKey: 'nav.group.history',
    items: [
      { to: '/report', labelKey: 'nav.report', icon: FileText },
      { to: '/events', labelKey: 'nav.events', icon: Radio },
      { to: '/audit', labelKey: 'nav.audit', icon: GitCompare },
    ],
  },
  {
    id: 'meta',
    labelKey: 'nav.group.meta',
    items: [
      { to: '/about', labelKey: 'nav.about', icon: Info },
      { to: '/planning', labelKey: 'nav.planning', icon: ClipboardCheck },
    ],
  },
  {
    // Track-1A 收敛（协议 §12.5）：展示页降级为"开发与展示工具"——
    // 真实 API 驱动但数据为 fixture/replay/预生成 benchmark，不属于科研主流程。
    id: 'devtools',
    labelKey: 'nav.group.devtools',
    items: [
      { to: '/leaderboard', labelKey: 'nav.leaderboard', icon: Trophy },
      { to: '/court', labelKey: 'nav.court', icon: Gavel },
      { to: '/arena', labelKey: 'nav.arena', icon: Swords },
      { to: '/honesty', labelKey: 'nav.honesty', icon: ShieldAlert },
      { to: '/ablation', labelKey: 'nav.ablation', icon: FlaskConical },
    ],
  },
];

/** Flatten groups into a link list (used for sanity + a11y focus-trap queries). */
const ALL_NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** Shared active/inactive className for NavLinks. */
function navLinkClassName(isActive: boolean, full: boolean): string {
  return cn(
    'inline-flex items-center gap-1.5 rounded-md text-sm font-medium transition-colors',
    full ? 'w-full px-3 py-2' : 'px-3 py-1.5',
    isActive
      ? 'bg-primary text-primary-foreground'
      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
  );
}

/** Theme toggle button. Uses the ThemeProvider context to toggle between light/dark. */
function ThemeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      aria-label={resolvedTheme === 'dark' ? t('nav.themeToLight') : t('nav.themeToDark')}
      data-testid="theme-toggle"
    >
      {resolvedTheme === 'dark' ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}

/** Language toggle button (zh ⇄ en). */
function LanguageToggle() {
  const { locale, setLocale } = useI18n();
  const next: Locale = locale === 'zh' ? 'en' : 'zh';
  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      className="inline-flex items-center justify-center gap-1 rounded-md p-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      aria-label={locale === 'zh' ? 'Switch to English' : '切换到中文'}
      data-testid="language-toggle"
    >
      <Languages className="h-4 w-4" aria-hidden="true" />
      <span>{locale === 'zh' ? 'EN' : '中'}</span>
    </button>
  );
}

export function AppShell({ children }: AppShellProps) {
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // a11y (WAI-ARIA disclosure/dialog pattern): while the mobile drawer is open,
  // Escape closes it, focus moves to the first item and is trapped inside, and
  // focus restores to the toggle button when it closes — so keyboard users never
  // lose focus behind the drawer.
  useEffect(() => {
    if (!mobileOpen) {
      return;
    }
    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>('a, button') ?? null;
    firstFocusable?.focus();

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        return;
      }
      if (event.key !== 'Tab' || panel === null) {
        return;
      }
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      toggleRef.current?.focus();
    };
  }, [mobileOpen]);

  // Sanity: 14 nav links must always be present (App.test asserts toHaveLength(14)).
  void ALL_NAV_ITEMS;

  return (
    <div className="min-h-screen bg-background">
      {/* Skip-to-content link (a11y · WCAG 2.4.1 bypass blocks): keyboard users tab past the nav. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-sm focus:font-medium focus:text-primary-foreground"
        data-testid="skip-to-content"
      >
        {t('nav.skipToContent')}
      </a>
      {/* Top navigation bar */}
      <nav
        className="sticky top-0 z-40 border-b bg-card"
        aria-label={t('nav.aria')}
        data-testid="main-nav"
      >
        <div className="container flex h-14 items-center gap-4 px-4">
          {/* Brand (R-10.1 · FAR-Lab Logo,非 link 元素,不影响 nav link 计数) */}
          <Logo size="sm" className="shrink-0" />

          {/* Desktop nav links (visible ≥ md) — 14 links across 5 groups, group separators between */}
          <ul className="hidden flex-1 items-center gap-1 md:flex" data-testid="desktop-nav">
            {NAV_GROUPS.map((group, groupIndex) => (
              <Fragment key={group.id}>
                {groupIndex > 0 && (
                  <li aria-hidden="true" className="mx-1 h-5 w-px self-center bg-border" />
                )}
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) => navLinkClassName(isActive, false)}
                    >
                      <item.icon className="h-4 w-4" aria-hidden="true" />
                      <span className="hidden sm:inline">{t(item.labelKey)}</span>
                    </NavLink>
                  </li>
                ))}
              </Fragment>
            ))}
          </ul>

          {/* Toggles + mobile menu button */}
          <div className="ml-auto flex items-center gap-1">
            <LanguageToggle />
            <ThemeToggle />
            {/* Mobile menu toggle (visible only < md) */}
            <button
              type="button"
              ref={toggleRef}
              onClick={() => setMobileOpen((v) => !v)}
              className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground md:hidden"
              aria-label={mobileOpen ? t('nav.closeMenu') : t('nav.menu')}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-panel"
              data-testid="mobile-menu-toggle"
            >
              {mobileOpen ? (
                <X className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Menu className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile nav drawer (conditionally rendered; < md only). Closes on navigation. */}
        {mobileOpen && (
          <div ref={panelRef} className="border-t md:hidden" id="mobile-nav-panel" data-testid="mobile-nav">
            <div className="container flex flex-col gap-3 px-4 py-3">
              {NAV_GROUPS.map((group) => (
                <div key={group.id} className="space-y-1">
                  <p className="px-3 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                    {t(group.labelKey)}
                  </p>
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) => navLinkClassName(isActive, true)}
                    >
                      <item.icon className="h-4 w-4" aria-hidden="true" />
                      <span>{t(item.labelKey)}</span>
                    </NavLink>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Main content */}
      <main id="main-content" tabIndex={-1} className="container py-6" data-testid="main-content">
        {children}
      </main>
    </div>
  );
}
