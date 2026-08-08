import { Suspense, lazy } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { AppShell } from '@/components/layout/AppShell';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RouteEffects } from '@/components/RouteEffects';
import { I18nProvider } from '@/lib/i18n';

// Route-level code splitting. HeroDemoPage is the default/landing route — competition
// judges must see the 60-second tamper-detection "WOW" experience within 3 seconds.
// It is a self-contained offline page (Web Crypto, no API dependency) so first paint
// is instant. OverviewPage (the system dashboard) is moved to /overview. Every route
// is code-split (React.lazy) so heavy dependencies (d3 ~280kB) are isolated to the
// pages that use them (Viz, Ablation) and never enter the initial bundle. Vendor libs
// are further split via vite.config.ts manualChunks so they cache independently.
const HeroDemoPage = lazy(() => import('@/pages/HeroDemoPage'));
const OverviewPage = lazy(() => import('@/pages/OverviewPage'));
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
const WizardPage = lazy(() => import('@/pages/WizardPage'));
const V2ReceiptPage = lazy(() => import('@/pages/V2ReceiptPage'));
const EventsPage = lazy(() => import('@/pages/EventsPage'));

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
                    <Route path="/" element={<HeroDemoPage />} />
                    <Route path="/overview" element={<OverviewPage />} />
                    <Route path="/viz" element={<VizPage />} />
                    <Route path="/integrity" element={<IntegrityPage />} />
                    <Route path="/leaderboard" element={<LeaderboardPage />} />
                    <Route path="/court" element={<CourtPage />} />
                    <Route path="/arena" element={<ArenaPage />} />
                    <Route path="/honesty" element={<HonestyWallPage />} />
                    <Route path="/ablation" element={<AblationPage />} />
                    <Route path="/report" element={<ReportPage />} />
                    <Route path="/demo" element={<DemoModePage />} />
                    <Route path="/hero" element={<HeroDemoPage />} />
                    <Route path="/about" element={<AboutPage />} />
                    <Route path="/versions" element={<VersionDiffPage />} />
                    <Route path="/wizard" element={<WizardPage />} />
                    <Route path="/v2-receipt" element={<V2ReceiptPage />} />
                    <Route path="/events" element={<EventsPage />} />
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
