import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { AppShell } from '@/components/layout/AppShell';

import OverviewPage from '@/pages/OverviewPage';
import VizPage from '@/pages/VizPage';
import IntegrityPage from '@/pages/IntegrityPage';
import LeaderboardPage from '@/pages/LeaderboardPage';
import HonestyWallPage from '@/pages/HonestyWallPage';
import AblationPage from '@/pages/AblationPage';
import ReportPage from '@/pages/ReportPage';
import DemoModePage from '@/pages/DemoModePage';
import AboutPage from '@/pages/AboutPage';
import CourtPage from '@/pages/CourtPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AppShell>
            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/viz" element={<VizPage />} />
              <Route path="/integrity" element={<IntegrityPage />} />
              <Route path="/leaderboard" element={<LeaderboardPage />} />
              <Route path="/court" element={<CourtPage />} />
              <Route path="/honesty" element={<HonestyWallPage />} />
              <Route path="/ablation" element={<AblationPage />} />
              <Route path="/report" element={<ReportPage />} />
              <Route path="/demo" element={<DemoModePage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </AppShell>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function NotFoundPage() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-2xl font-bold">404</h1>
      <p className="mt-2 text-muted-foreground">页面未找到</p>
    </div>
  );
}
