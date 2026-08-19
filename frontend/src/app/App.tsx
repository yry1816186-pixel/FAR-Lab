import { Suspense, lazy } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { AppShell } from './AppShell.tsx';
import { RouteErrorBoundary } from './ErrorBoundary.tsx';
import { RouteEffects } from './RouteEffects.tsx';
import { createQueryClient } from '@/shared/api/queryClient.ts';
import { I18nProvider, useT } from '@/shared/i18n/index.tsx';
import { ThemeProvider } from '@/shared/theme/ThemeProvider.tsx';

// Route-level code splitting: every surface loads on demand so the initial
// bundle stays small (the mission workspace is the landing surface).
const HomePage = lazy(() => import('@/features/home/HomePage.tsx'));
const MissionsPage = lazy(() => import('@/features/missions/MissionsPage.tsx'));
const MissionWorkspacePage = lazy(() => import('@/features/missions/MissionWorkspacePage.tsx'));
const AssayPage = lazy(() => import('@/features/assay/AssayPage.tsx'));
const VerifyPage = lazy(() => import('@/features/verify/VerifyPage.tsx'));
const ReceiptPage = lazy(() => import('@/features/verify/ReceiptPage.tsx'));
const EvidencePage = lazy(() => import('@/features/evidence/EvidencePage.tsx'));
const EventsPage = lazy(() => import('@/features/events/EventsPage.tsx'));
const BenchmarkPage = lazy(() => import('@/features/benchmark/BenchmarkPage.tsx'));
const AboutPage = lazy(() => import('@/features/about/AboutPage.tsx'));

const queryClient = createQueryClient();

function RouteFallback() {
  const t = useT();
  return (
    <div className="flex items-center justify-center py-24" data-testid="route-fallback">
      <div className="far-spinner h-6 w-6 rounded-full border-2 border-borderStrong border-t-accent" role="status" aria-label={t('app.loadingPage')} />
    </div>
  );
}

function NotFoundPage() {
  const t = useT();
  return (
    <div className="mx-auto max-w-lg py-20 text-center" data-testid="not-found-page">
      <p className="font-mono text-sm font-semibold text-accent">404</p>
      <h1 className="mt-2 text-2xl font-bold text-ink">{t('app.notFound.title')}</h1>
      <p className="mt-2 text-sm text-ink2">{t('app.notFound.body')}</p>
      <a href="/" className="mt-4 inline-block rounded border border-borderStrong px-3 py-2 text-sm text-ink hover:bg-surface2 focus-visible:ring-2 focus-visible:ring-accent">
        {t('app.notFound.back')}
      </a>
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
                    <Route path="/" element={<HomePage />} />
                    <Route path="/missions" element={<MissionsPage />} />
                    {/* The mission workspace is one object with seven views —
                        scientific context, not seven top-level features. */}
                    <Route path="/missions/:runId" element={<MissionWorkspacePage />} />
                    <Route path="/missions/:runId/:view" element={<MissionWorkspacePage />} />
                    <Route path="/assay" element={<AssayPage />} />
                    <Route path="/verify" element={<VerifyPage />} />
                    <Route path="/receipts/:receiptId" element={<ReceiptPage />} />
                    <Route path="/evidence" element={<EvidencePage />} />
                    <Route path="/events" element={<EventsPage />} />
                    <Route path="/benchmark" element={<BenchmarkPage />} />
                    <Route path="/about" element={<AboutPage />} />
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
