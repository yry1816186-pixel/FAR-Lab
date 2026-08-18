/**
 * Missions surface: the run inventory renders real backend rows, the empty
 * state is honest, errors carry the machine code with a working retry, and
 * the creation form posts a real CreateResearchRequest then navigates.
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import MissionsPage from '@/features/missions/MissionsPage.tsx';
import { okJson, problemJson, renderWithProviders, stubFetch } from './helpers.tsx';

const RUN_ROW = {
  runId: 'run-abc',
  question: 'Does exoplanet radius correlate with stellar irradiation?',
  state: 'COMPLETED',
  startedAt: '2026-08-18T01:00:00Z',
  updatedAt: '2026-08-18T01:05:00Z',
  error: null,
};

function missionsRoutes() {
  return (
    <Routes>
      <Route path="/missions" element={<MissionsPage />} />
      <Route path="/missions/:runId" element={<div>mission-detail-marker</div>} />
    </Routes>
  );
}

describe('MissionsPage', () => {
  it('renders run rows from the backend with links into the workspace', async () => {
    stubFetch((url) => (url === '/api/v1/research' ? okJson({ runs: [RUN_ROW] }) : undefined));
    renderWithProviders(missionsRoutes(), ['/missions']);
    expect(await screen.findByText(RUN_ROW.question)).toBeInTheDocument();
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: RUN_ROW.question })).toHaveAttribute('href', '/missions/run-abc');
  });

  it('shows the honest empty state when no runs exist', async () => {
    stubFetch((url) => (url === '/api/v1/research' ? okJson({ runs: [] }) : undefined));
    renderWithProviders(missionsRoutes(), ['/missions']);
    expect(await screen.findByText('暂无研究任务。')).toBeInTheDocument();
  });

  it('surfaces a backend failure with its machine code and retries on demand', async () => {
    let calls = 0;
    stubFetch((url) => {
      if (url === '/api/v1/research') {
        calls += 1;
        return calls === 1
          ? problemJson(500, 'internal_error', 'database unavailable')
          : okJson({ runs: [RUN_ROW] });
      }
      return undefined;
    });
    renderWithProviders(missionsRoutes(), ['/missions']);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('internal_error');
    await userEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText(RUN_ROW.question)).toBeInTheDocument();
  });

  it('creates a mission with the typed request body and navigates to it', async () => {
    const seenBodies: string[] = [];
    stubFetch((url, init) => {
      if (url === '/api/v1/research' && init?.method === 'POST') {
        seenBodies.push(String(init.body));
        return okJson({ runId: 'run-new', state: 'CREATED', statusUrl: '/api/v1/research/run-new/status', eventsUrl: '/x' });
      }
      if (url === '/api/v1/research') return okJson({ runs: [] });
      return undefined;
    });
    renderWithProviders(missionsRoutes(), ['/missions']);

    await userEvent.type(screen.getByLabelText('科学问题'), '  Is X correlated with Y?  ');
    await userEvent.click(screen.getByRole('button', { name: '启动任务' }));

    await screen.findByText('mission-detail-marker');
    expect(seenBodies).toHaveLength(1);
    const body = JSON.parse(seenBodies[0] ?? '{}') as { question: string; profile: string; sources: string[] };
    expect(body.question).toBe('Is X correlated with Y?'); // trimmed
    expect(body.profile).toBe('auto');
    expect(body.sources).toEqual(['openalex']);
  });

  it('keeps the submit button disabled for an empty question', async () => {
    stubFetch((url) => (url === '/api/v1/research' ? okJson({ runs: [] }) : undefined));
    renderWithProviders(missionsRoutes(), ['/missions']);
    await screen.findByText('暂无研究任务。');
    expect(screen.getByRole('button', { name: '启动任务' })).toBeDisabled();
  });

  it('shows a fail-closed 503 verbatim (never masked as a generic error)', async () => {
    stubFetch((url, init) => {
      if (url === '/api/v1/research' && init?.method === 'POST') {
        return problemJson(503, 'research_live_profile_unavailable', 'no live profile', {
          guidance: 'Set FAR_LLM_API_KEY or choose offline replay.',
        });
      }
      if (url === '/api/v1/research') return okJson({ runs: [] });
      return undefined;
    });
    renderWithProviders(missionsRoutes(), ['/missions']);
    await userEvent.type(screen.getByLabelText('科学问题'), 'Q');
    await userEvent.click(screen.getByRole('button', { name: '启动任务' }));
    const alert = await screen.findByTestId('start-error');
    expect(alert).toHaveTextContent('research_live_profile_unavailable');
    expect(alert).toHaveTextContent('Set FAR_LLM_API_KEY or choose offline replay.');
    await waitFor(() => expect(screen.queryByText('mission-detail-marker')).toBeNull());
  });
});
