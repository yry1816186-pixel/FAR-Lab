import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OverviewPage from '@/pages/OverviewPage';
import type { HealthResponse } from '@/lib/types';

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

// GET /health → { status, service, timestamp } (spec 24 health probe shape).
function mockHealth(body: HealthResponse) {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

const HEALTH_OK: HealthResponse = {
  status: 'ok',
  service: 'far-chain-api',
  timestamp: '2026-06-27T00:00:00Z',
};

describe('OverviewPage', () => {
  it('renders the page container and title', () => {
    mockHealth(HEALTH_OK);
    renderWithQueryClient(<OverviewPage />);
    expect(screen.getByTestId('overview-page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'FAR-Chain', level: 1 })).toBeInTheDocument();
  });

  it('renders the three pillars (Falsifiable / Tamper-Evident / Independently Re-computable)', () => {
    mockHealth(HEALTH_OK);
    renderWithQueryClient(<OverviewPage />);
    const pillars = screen.getByTestId('pillars');
    expect(pillars).toHaveTextContent('Falsifiable');
    expect(pillars).toHaveTextContent('Tamper-Evident');
    expect(pillars).toHaveTextContent('Independently Re-computable');
  });

  it('renders the run-command list', () => {
    mockHealth(HEALTH_OK);
    renderWithQueryClient(<OverviewPage />);
    const cmds = screen.getByTestId('run-commands');
    expect(cmds).toHaveTextContent('npm run dev');
    expect(cmds).toHaveTextContent('npm run build');
    expect(cmds).toHaveTextContent('npm run test');
  });

  it('health card shows status data (status / service / timestamp) after fetch succeeds', async () => {
    mockHealth(HEALTH_OK);
    renderWithQueryClient(<OverviewPage />);
    await waitFor(() => {
      expect(screen.getByTestId('health-data')).toBeInTheDocument();
    });
    expect(screen.getByTestId('health-status')).toHaveTextContent('ok');
    expect(screen.getByTestId('health-data')).toHaveTextContent('far-chain-api');
    expect(screen.getByTestId('health-data')).toHaveTextContent('2026-06-27');
  });
});
