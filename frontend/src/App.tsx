import { Suspense, lazy } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { AppShell } from '@/components/layout/AppShell';
import { RouteErrorBoundary } from '@/components/ErrorBoundary';
import { RouteEffects } from '@/components/RouteEffects';
import { I18nProvider, useI18n, useT } from '@/lib/i18n';

// Route-level code splitting. The research workbench is the default/landing route —
// the research workflow (question → run → frozen run) is the unambiguous primary
// path; the system dashboard stays reachable at /overview. Every route is
// code-split (React.lazy) so heavy dependencies (d3 ~280kB) are isolated to the
// pages that use them (Viz, Ablation) and never enter the initial bundle. Vendor libs
// are further split via vite.config.ts manualChunks so they cache independently.
const ResearchWorkbenchPage = lazy(() => import('@/pages/ResearchWorkbenchPage'));
const OverviewPage = lazy(() => import('@/pages/OverviewPage'));
const VizPage = lazy(() => import('@/pages/VizPage'));
const IntegrityPage = lazy(() => import('@/pages/IntegrityPage'));
const LeaderboardPage = lazy(() => import('@/pages/LeaderboardPage'));
const HonestyWallPage = lazy(() => import('@/pages/HonestyWallPage'));
const AblationPage = lazy(() => import('@/pages/AblationPage'));
const ReportPage = lazy(() => import('@/pages/ReportPage'));
const AboutPage = lazy(() => import('@/pages/AboutPage'));
const CourtPage = lazy(() => import('@/pages/CourtPage'));
const ArenaPage = lazy(() => import('@/pages/ArenaPage'));
const VersionDiffPage = lazy(() => import('@/pages/VersionDiffPage'));
const WizardPage = lazy(() => import('@/pages/WizardPage'));
const V2ReceiptPage = lazy(() => import('@/pages/V2ReceiptPage'));
const EventsPage = lazy(() => import('@/pages/EventsPage'));
const AuditTracePage = lazy(() => import('@/pages/AuditTracePage'));
const PlanningPage = lazy(() => import('@/pages/PlanningPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

/** Suspense fallback shown while a lazy-loaded route chunk downloads on first navigation. */
function RouteFallback() {
  const t = useT();
  return (
    <div className="flex items-center justify-center py-24" data-testid="route-fallback">
      <div
        className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary"
        role="status"
        aria-label={t('app.loadingPage')}
      />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <ThemeProvider>
          <BrowserRouter>
            <RouteEffects />
            <AppShell>
              <RouteErrorBoundary>
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    {/* '/' redirects to the canonical /research so the workbench
                        NavLink shows its active state on landing and deep links,
                        history and shares have a single canonical URL. */}
                    <Route path="/" element={<Navigate to="/research" replace />} />
                    <Route path="/research" element={<ResearchWorkbenchPage />} />
                    <Route path="/overview" element={<OverviewPage />} />
                    <Route path="/viz" element={<VizPage />} />
                    <Route path="/integrity" element={<IntegrityPage />} />
                    <Route path="/leaderboard" element={<LeaderboardPage />} />
                    <Route path="/court" element={<CourtPage />} />
                    <Route path="/arena" element={<ArenaPage />} />
                    <Route path="/honesty" element={<HonestyWallPage />} />
                    <Route path="/ablation" element={<AblationPage />} />
                    <Route path="/report" element={<ReportPage />} />
                    <Route path="/about" element={<AboutPage />} />
                    <Route path="/planning" element={<PlanningPage />} />
                    <Route path="/versions" element={<VersionDiffPage />} />
                    <Route path="/wizard" element={<WizardPage />} />
                    <Route path="/v2-receipt" element={<V2ReceiptPage />} />
                    <Route path="/events" element={<EventsPage />} />
                    <Route path="/audit" element={<AuditTracePage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </Suspense>
              </RouteErrorBoundary>
            </AppShell>
          </BrowserRouter>
        </ThemeProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

function NotFoundPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-lg py-20 text-center" data-testid="not-found-page">
      <p className="font-mono text-sm font-semibold text-primary">404</p>
      <h1 className="mt-2 text-2xl font-bold">{t('notFound.title')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('notFound.description')}</p>
    </div>
  );
}
