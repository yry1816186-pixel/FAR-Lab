/**
 * AppShell — main application shell with top navigation + content area.
 *
 * 信息架构（两分组）:科研主流程为唯一主路径,信任与验证工具折叠进 disclosure 面板。
 *   - Research（主分组·常驻单行）:工作台 · 规划 · 版本比较 · 事件流 · 报告。
 *   - Trust & verification tools（次级·Tools disclosure）:验证向导 · 收据 · 证据链 ·
 *     完整性 · 法庭 · 竞技场 · 诚信墙 · 消融 · 广度榜 · 审计 · 仪表盘 · 关于。
 *   - 路由与可访问性不变:全部 17 个 NavLink 保留（桌面 Tools 面板 + 移动抽屉各可达）,
 *     不删除任何页面。
 *
 * 布局红线(P0 修复 2026-08-18):17 链接平铺单行在 768–2000px 全部视口产生全局横向
 * 滚动(实测 1026px 视口 ul=1759px)。科研 5 链接 + Tools 折叠后单行 ≤~700px,
 * md(768px) 起即可完整容纳;容器加 min-w-0 防未来链接数增长再破版。
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Network, ShieldAlert, ShieldCheck, FlaskConical, FileText, Info, Sun, Moon, Trophy, Gavel, Swords, Languages, Menu, X, GitCompare, Sparkles, ScrollText, Radio, ClipboardCheck, ChevronDown } from 'lucide-react';
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

type NavGroupKey = 'nav.group.research' | 'nav.group.tools';

interface NavItem {
  readonly to: string;
  readonly labelKey: NavLabelKey;
  readonly icon: typeof LayoutDashboard;
}

interface NavGroup {
  readonly id: string;
  readonly labelKey: NavGroupKey;
  /** primary = 科研主流程（常驻单行）；tools = 信任与验证工具（折叠进 Tools 面板）。 */
  readonly kind: 'primary' | 'tools';
  readonly items: readonly NavItem[];
}

// ---------- Information architecture (2 groups · all links preserved) ----------

const NAV_GROUPS: readonly NavGroup[] = [
  {
    // 科研主流程闭环：工作台（新建/运行/冻结视图）· 规划 · 版本比较（修订）· 事件流 · 报告。
    id: 'research',
    labelKey: 'nav.group.research',
    kind: 'primary',
    items: [
      { to: '/research', labelKey: 'nav.research', icon: FlaskConical },
      { to: '/planning', labelKey: 'nav.planning', icon: ClipboardCheck },
      { to: '/versions', labelKey: 'nav.versions', icon: GitCompare },
      { to: '/events', labelKey: 'nav.events', icon: Radio },
      { to: '/report', labelKey: 'nav.report', icon: FileText },
    ],
  },
  {
    // 信任与验证工具（次级·Tools 面板折叠）：交互验证工具 + 展示页。
    // 全部保留（不删除任何页面/路由），仅从主路径降级。
    id: 'tools',
    labelKey: 'nav.group.tools',
    kind: 'tools',
    items: [
      { to: '/overview', labelKey: 'nav.overview', icon: LayoutDashboard },
      { to: '/wizard', labelKey: 'nav.wizard', icon: Sparkles },
      { to: '/v2-receipt', labelKey: 'nav.v2receipt', icon: ScrollText },
      { to: '/viz', labelKey: 'nav.viz', icon: Network },
      { to: '/integrity', labelKey: 'nav.integrity', icon: ShieldCheck },
      { to: '/court', labelKey: 'nav.court', icon: Gavel },
      { to: '/arena', labelKey: 'nav.arena', icon: Swords },
      { to: '/leaderboard', labelKey: 'nav.leaderboard', icon: Trophy },
      { to: '/honesty', labelKey: 'nav.honesty', icon: ShieldAlert },
      { to: '/ablation', labelKey: 'nav.ablation', icon: FlaskConical },
      { to: '/audit', labelKey: 'nav.audit', icon: GitCompare },
      { to: '/about', labelKey: 'nav.about', icon: Info },
    ],
  },
];

const PRIMARY_ITEMS: readonly NavItem[] = NAV_GROUPS[0].items;
const TOOLS_ITEMS: readonly NavItem[] = NAV_GROUPS[1].items;

/**
 * Single source of route → nav label key. RouteEffects derives document titles
 * from this map so the tab/history title can never drift from the information
 * architecture (no second hand-maintained route→title table).
 */
export const NAV_TITLE_BY_PATH: Readonly<Record<string, NavLabelKey>> = {
  // '/' redirects to /research, but the title must be correct even on the
  // pre-redirect frame.
  '/': 'nav.research',
  ...Object.fromEntries(
    NAV_GROUPS.flatMap((group) => group.items.map((item) => [item.to, item.labelKey] as const)),
  ),
};

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
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const toolsToggleRef = useRef<HTMLButtonElement>(null);
  const toolsPanelRef = useRef<HTMLDivElement>(null);

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

  // Tools disclosure panel — same a11y contract as the mobile drawer (Escape,
  // focus in + trap + restore), plus click-outside to close because it floats
  // over page content on desktop.
  useEffect(() => {
    if (!toolsOpen) {
      return;
    }
    const panel = toolsPanelRef.current;
    panel?.querySelector<HTMLElement>('a, button')?.focus();

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setToolsOpen(false);
        return;
      }
      if (event.key !== 'Tab' || panel === null) {
        return;
      }
      const focusable = panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
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

    function onPointerDown(event: PointerEvent): void {
      const target = event.target as Node;
      if (
        panel !== null &&
        !panel.contains(target) &&
        toolsToggleRef.current !== null &&
        !toolsToggleRef.current.contains(target)
      ) {
        setToolsOpen(false);
      }
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      toolsToggleRef.current?.focus();
    };
  }, [toolsOpen]);

  // Route change closes whichever panel is open (link clicks inside the panel
  // rely on this too) and keeps at most one panel open at a time.
  useEffect(() => {
    setToolsOpen(false);
    setMobileOpen(false);
  }, [location.pathname]);

  // The Tools disclosure must light up when the current route lives inside the
  // tools group — otherwise 12 routes would lose their "you are here" signal.
  const toolsActive = TOOLS_ITEMS.some(
    (item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`),
  );

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
        <div className="container flex h-14 min-w-0 items-center gap-4 px-4">
          {/* Brand (R-10.1 · FAR-Lab Logo,非 link 元素,不影响 nav link 计数) */}
          <Logo size="sm" className="shrink-0" />

          {/* Desktop nav (visible ≥ md): primary research workflow inline — one
              row that fits every laptop viewport — with the 12 trust/verification
              tools behind a disclosure so the bar can never force page overflow. */}
          <ul className="hidden min-w-0 items-center gap-1 md:flex" data-testid="desktop-nav">
            {PRIMARY_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) => navLinkClassName(isActive, false)}
                >
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{t(item.labelKey)}</span>
                </NavLink>
              </li>
            ))}
            <li aria-hidden="true" className="mx-1 h-5 w-px self-center bg-border" />
            <li>
              <button
                type="button"
                ref={toolsToggleRef}
                onClick={() => setToolsOpen((v) => !v)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  toolsActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
                aria-haspopup="true"
                aria-expanded={toolsOpen}
                aria-controls="tools-nav-panel"
                aria-current={toolsActive ? 'page' : undefined}
                data-testid="tools-toggle"
              >
                {t('nav.toolsButton')}
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', toolsOpen && 'rotate-180')}
                  aria-hidden="true"
                />
              </button>
            </li>
          </ul>

          {/* Toggles + mobile menu button */}
          <div className="ml-auto flex shrink-0 items-center gap-1">
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

        {/* Tools dropdown (≥ md): 12 secondary routes, same focus contract as the
            mobile drawer. Never rendered inline — rendering it inline is the P0
            overflow this layout replaced. */}
        {toolsOpen && (
          <div
            ref={toolsPanelRef}
            className="absolute right-4 top-full z-50 w-80 max-h-[calc(100vh-3.5rem)] overflow-y-auto border bg-card shadow-lg md:block"
            id="tools-nav-panel"
            data-testid="tools-nav-panel"
          >
            <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
              {t('nav.group.tools')}
            </p>
            <div className="flex flex-col gap-0.5 px-2 pb-2">
              {TOOLS_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => navLinkClassName(isActive, true)}
                >
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                  <span>{t(item.labelKey)}</span>
                </NavLink>
              ))}
            </div>
          </div>
        )}

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
