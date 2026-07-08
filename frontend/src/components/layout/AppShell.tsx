/**
 * AppShell — main application shell with sidebar navigation + top bar + content area.
 *
 * Extracted from App.tsx. Wraps page content with:
 *   - Top navigation bar (FAR-Chain branding + nav links)
 *   - Theme toggle button
 *   - Main content area
 */

import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Network, ShieldAlert, ShieldCheck, FlaskConical, FileText, Info, Play, Sun, Moon, Trophy, Gavel, Swords } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme/ThemeProvider';

export interface AppShellProps {
  readonly children: ReactNode;
}

const NAV_ITEMS: ReadonlyArray<{
  readonly to: string;
  readonly label: string;
  readonly icon: typeof LayoutDashboard;
}> = [
  { to: '/', label: '总览', icon: LayoutDashboard },
  { to: '/demo', label: '演示', icon: Play },
  { to: '/viz', label: '证据链', icon: Network },
  { to: '/integrity', label: '完整性', icon: ShieldCheck },
  { to: '/leaderboard', label: '广度榜', icon: Trophy },
  { to: '/court', label: '法庭', icon: Gavel },
  { to: '/arena', label: '竞技场', icon: Swords },
  { to: '/honesty', label: '诚信墙', icon: ShieldAlert },
  { to: '/ablation', label: '消融实验', icon: FlaskConical },
  { to: '/report', label: '研究报告', icon: FileText },
  { to: '/about', label: '关于', icon: Info },
];

/** Theme toggle button. Uses the ThemeProvider context to toggle between light/dark. */
function ThemeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      aria-label={resolvedTheme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
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

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Top navigation bar */}
      <nav
        className="sticky top-0 z-40 border-b bg-card"
        aria-label="主导航"
        data-testid="main-nav"
      >
        <div className="container flex h-14 items-center gap-4 px-4">
          {/* Brand */}
          <span className="font-mono text-sm font-bold tracking-tight shrink-0">
            FAR-Chain
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
                  <span className="hidden sm:inline">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>

          {/* Theme toggle */}
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
