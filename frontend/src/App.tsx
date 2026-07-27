import { Suspense, lazy } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { AppShell } from '@/components/layout/AppShell';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RouteEffects } from '@/components/RouteEffects';
import { I18nProvider } from '@/lib/i18n';

// Route-level code splitting. OverviewPage is the default/landing route and is loaded
// eagerly so first paint has zero Suspense delay. Every other route is code-split
// (React.lazy) so heavy dependencies (d3 ~280kB) are isolated to the pages that use
// them (Viz, Ablation) and never enter the initial bundle. Vendor libs are further
// split via vite.config.ts manualChunks so they cache independently across deploys.
import OverviewPage from '@/pages/OverviewPage';
const VizPage = lazy(() => import('@/pages/VizPage'));
const IntegrityPage = lazy(() => import('@/pages/IntegrityPage'));
const LeaderboardPage = lazy(() => import('@/pages/LeaderboardPage'));
const HonestyWallPage = lazy(() => import('@/pages/HonestyWallPage'));
const AblationPage = lazy(() => import('@/pages/AblationPage'));
const ReportPage = lazy(() => import('@/pages/ReportPage'));
const DemoModePage = lazy(() => import('@/pages/DemoModePage'));
const AboutPage = lazy(() => import('@/pages/AboutPage'));
const CourtPage = lazy(() => import('@/pages/CourtPage'));
const ArenaPage = lazy(() => import('@/pages/ArenaPage'));
const VersionDiffPage = lazy(() => import('@/pages/VersionDiffPage'));

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
  return (
    <div className="flex items-center justify-center py-24" data-testid="route-fallback">
      <div
        className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary"
        role="status"
        aria-label="Loading page"
      />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <ThemeProvider>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <RouteEffects />
            <AppShell>
              <ErrorBoundary>
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    <Route path="/" element={<OverviewPage />} />
                    <Route path="/viz" element={<VizPage />} />
                    <Route path="/integrity" element={<IntegrityPage />} />
                    <Route path="/leaderboard" element={<LeaderboardPage />} />
                    <Route path="/court" element={<CourtPage />} />
                    <Route path="/arena" element={<ArenaPage />} />
                    <Route path="/honesty" element={<HonestyWallPage />} />
                    <Route path="/ablation" element={<AblationPage />} />
                    <Route path="/report" element={<ReportPage />} />
                    <Route path="/demo" element={<DemoModePage />} />
                    <Route path="/about" element={<AboutPage />} />
                    <Route path="/versions" element={<VersionDiffPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </Suspense>
              </ErrorBoundary>
            </AppShell>
          </BrowserRouter>
        </ThemeProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

function NotFoundPage() {
  return (
    <div className="py-20 text-center" data-testid="not-found-page">
      <h1 className="text-2xl font-bold">404</h1>
      <p className="mt-2 text-muted-foreground">Page not found</p>
    </div>
  );
}
