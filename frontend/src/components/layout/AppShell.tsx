/**
 * AppShell — main application shell with sidebar navigation + top bar + content area.
 *
 * Extracted from App.tsx. Wraps page content with:
 *   - Top navigation bar (FAR-Chain branding + nav links)
 *   - Theme toggle button
 *   - Language toggle button (zh / en)
 *   - Main content area
 */

import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Network, ShieldAlert, ShieldCheck, FlaskConical, FileText, Info, Play, Sun, Moon, Trophy, Gavel, Swords, Languages } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme/ThemeProvider';
import { useI18n, type Locale } from '@/lib/i18n';

export interface AppShellProps {
  readonly children: ReactNode;
}

const NAV_ITEMS: ReadonlyArray<{
  readonly to: string;
  readonly labelKey: 'nav.overview' | 'nav.demo' | 'nav.viz' | 'nav.integrity' | 'nav.leaderboard' | 'nav.court' | 'nav.arena' | 'nav.honesty' | 'nav.ablation' | 'nav.report' | 'nav.about';
  readonly icon: typeof LayoutDashboard;
}> = [
  { to: '/', labelKey: 'nav.overview', icon: LayoutDashboard },
  { to: '/demo', labelKey: 'nav.demo', icon: Play },
  { to: '/viz', labelKey: 'nav.viz', icon: Network },
  { to: '/integrity', labelKey: 'nav.integrity', icon: ShieldCheck },
  { to: '/leaderboard', labelKey: 'nav.leaderboard', icon: Trophy },
  { to: '/court', labelKey: 'nav.court', icon: Gavel },
  { to: '/arena', labelKey: 'nav.arena', icon: Swords },
  { to: '/honesty', labelKey: 'nav.honesty', icon: ShieldAlert },
  { to: '/ablation', labelKey: 'nav.ablation', icon: FlaskConical },
  { to: '/report', labelKey: 'nav.report', icon: FileText },
  { to: '/about', labelKey: 'nav.about', icon: Info },
];

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
  return (
    <div className="min-h-screen bg-background">
      {/* Top navigation bar */}
      <nav
        className="sticky top-0 z-40 border-b bg-card"
        aria-label={t('nav.aria')}
        data-testid="main-nav"
      >
        <div className="container flex h-14 items-center gap-4 px-4">
          {/* Brand */}
          <span className="font-mono text-sm font-bold tracking-tight shrink-0">
            {t('nav.brand')}
          </span>

          {/* Nav links */}
          <ul className="flex flex-1 items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )
                  }
                >
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{t(item.labelKey)}</span>
                </NavLink>
              </li>
            ))}
          </ul>

          {/* Toggles */}
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </nav>

      {/* Main content */}
      <main className="container py-6" data-testid="main-content">
        {children}
      </main>
    </div>
  );
}
