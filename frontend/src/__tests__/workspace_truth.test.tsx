/**
 * Workspace truthfulness — the core honesty contract:
 *   - a non-terminal run shows live state and NEVER pretends a frozen result;
 *   - a 409 from the frozen-run endpoint is a lifecycle answer, not an error;
 *   - a RECORDED_REPLAY run reads as replay — never as "live".
 */

import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { ResearchRunDto, ResearchRunStatusSummary } from '@/entities/dtos.ts';
import MissionWorkspacePage from '@/features/missions/MissionWorkspacePage.tsx';
import { okJson, problemJson, renderWithProviders, stubFetch } from './helpers.tsx';

function makeStatus(overrides: Partial<ResearchRunStatusSummary>): ResearchRunStatusSummary {
  return {
    runId: 'run-1',
    question: 'Is X correlated with Y?',
    profile: 'auto',
    state: 'COMPLETED',
    completedStages: ['researchability_gate', 'grounding'],
    remainingStages: [],
    startedAt: '2026-08-18T01:00:00Z',
    updatedAt: '2026-08-18T01:06:00Z',
    completedAt: '2026-08-18T01:06:00Z',
    error: null,
    errorKind: null,
    runReady: true,
    ...overrides,
  };
}

function makeRun(overrides: Partial<ResearchRunDto>): ResearchRunDto {
  return {
    runId: 'run-1',
    question: 'Is X correlated with Y?',
    gateReport: {
      question: 'Is X correlated with Y?',
      verdict: 'RESEARCHABLE',
      reasons: [],
      safetyRisks: [],
      scope: { domain: null, domainHints: [], questionLength: 24 },
      decomposition: null,
      requiresEthicsGate: false,
      assessedAt: '2026-08-18T01:00:30Z',
      schemaVersion: 1,
    },
    corpus: {
      snapshotId: 'snap-1',
      rootHash: 'ab'.repeat(32),
      documentCount: 0,
      createdAt: '2026-08-18T01:01:00Z',
      sourceQueries: [],
      documents: [],
    },
    hypotheses: [],
    bindings: {},
    critiques: {},
    scorecards: {},
    discovery: null,
    plan: {
      objectives: [],
      primaryHypothesisId: 'h-1',
      alternativeHypothesisIds: [],
      preregisteredPredictions: [],
      dataRequirements: [],
      inclusionExclusionCriteria: [],
      variables: [],
      design: '',
      analysisDag: [],
      tools: [],
      statisticalMethods: [],
      sampleSizeRationale: '',
      multiplicityHandling: '',
      missingOutlierStrategy: '',
      stoppingConditions: [],
      checkpoints: [],
      budget: '',
      risks: [],
      reproducibility: [],
      nextRoundDecisionRules: [],
      humanApprovalRequired: [],
    },
    revisions: [],
    observations: [],
    stageReceipts: [],
    citationGate: {
      boundRate: 1,
      totalCited: 0,
      boundCount: 0,
      unboundEvidenceCount: 0,
      resolvedViaRetrieval: [],
      perHypothesis: {},
      primaryRequiresAllBound: true,
      primaryAllBound: true,
      gateVerdict: 'PASS',
    },
    falsifiabilityGate: { perHypothesis: {}, allPassed: true },
    environment: {
      gitCommit: null,
      gitDirty: null,
      nodeVersion: 'v22.0.0',
      platform: 'win32',
      lockfileHash: null,
      packageVersion: null,
    },
    modes: {
      modelExecutionMode: 'replay',
      retrievalExecutionMode: 'replay',
      experimentExecutionMode: 'replay',
    },
    runMode: 'RECORDED_REPLAY',
    startedAt: '2026-08-18T01:00:00Z',
    schemaVersion: 1,
    ...overrides,
  };
}

function workspaceRoutes() {
  return (
    <Routes>
      <Route path="/missions/:runId" element={<MissionWorkspacePage />} />
      <Route path="/missions/:runId/:view" element={<MissionWorkspacePage />} />
    </Routes>
  );
}

describe('MissionWorkspacePage truthfulness', () => {
  it('a running mission shows live state and never fetches the frozen run', async () => {
    const requested: string[] = [];
    stubFetch((url) => {
      requested.push(url);
      if (url === '/api/v1/research/run-1/status') {
        return okJson(makeStatus({
          state: 'GENERATING_HYPOTHESES',
          completedStages: ['researchability_gate', 'grounding'],
          remainingStages: ['hypothesis_generation', 'citation_binding', 'falsifiability_gate', 'critique', 'scoring', 'plan'],
          completedAt: null,
        }));
      }
      return undefined;
    });
    renderWithProviders(workspaceRoutes(), ['/missions/run-1']);

    expect(await screen.findByText(/任务尚未完成/)).toBeInTheDocument();
    expect(screen.getByTestId('cancel-run')).toBeInTheDocument();
    // The frozen run endpoint is never queried while the run is live.
    expect(requested).not.toContain('/api/v1/research/run-1');
    // No error banner: "running" is a state, not a failure.
    expect(screen.queryByTestId('run-error')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a 409 from the frozen-run endpoint renders as not-completed, not an error', async () => {
    stubFetch((url) => {
      if (url === '/api/v1/research/run-1/status') return okJson(makeStatus({}));
      if (url === '/api/v1/research/run-1') {
        return problemJson(409, 'research_run_not_completed', 'run is not completed yet');
      }
      return undefined;
    });
    renderWithProviders(workspaceRoutes(), ['/missions/run-1']);

    expect(await screen.findAllByText(/任务尚未完成/)).not.toHaveLength(0);
    expect(screen.queryByTestId('run-error')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a replay-mode run is labelled verbatim and never reads as LIVE', async () => {
    stubFetch((url) => {
      if (url === '/api/v1/research/run-1/status') return okJson(makeStatus({}));
      if (url === '/api/v1/research/run-1') return okJson(makeRun({}));
      return undefined;
    });
    renderWithProviders(workspaceRoutes(), ['/missions/run-1']);

    expect(await screen.findByText('RECORDED_REPLAY')).toBeInTheDocument();
    expect(screen.getByTestId('runmode-note')).toBeInTheDocument();
    expect(screen.queryByText('LIVE')).toBeNull();
  });

  it('a frozen LIVE run carries the LIVE badge without the replay note', async () => {
    stubFetch((url) => {
      if (url === '/api/v1/research/run-1/status') return okJson(makeStatus({}));
      if (url === '/api/v1/research/run-1') {
        return okJson(makeRun({
          runMode: 'LIVE',
          modes: { modelExecutionMode: 'live', retrievalExecutionMode: 'live', experimentExecutionMode: 'live' },
        }));
      }
      return undefined;
    });
    renderWithProviders(workspaceRoutes(), ['/missions/run-1']);

    expect(await screen.findByText('LIVE')).toBeInTheDocument();
    expect(screen.queryByTestId('runmode-note')).toBeNull();
  });

  it('a status-endpoint failure is a real error surface with retry', async () => {
    stubFetch((url) => {
      if (url === '/api/v1/research/run-1/status') return problemJson(500, 'internal_error', 'store offline');
      return undefined;
    });
    renderWithProviders(workspaceRoutes(), ['/missions/run-1']);

    const alert = await screen.findByTestId('status-error');
    expect(alert).toHaveTextContent('internal_error');
    expect(screen.queryByText(/任务尚未完成/)).toBeNull();
  });
});
