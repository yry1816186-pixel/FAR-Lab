/**
 * Evidence & benchmark surfaces — the ledger, the trust root, and the
 * pre-generated Science-125 report with its honesty notes and accessible
 * distribution bars (role=img + text labels, no chart library).
 */

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import BenchmarkPage from '@/features/benchmark/BenchmarkPage.tsx';
import EvidencePage from '@/features/evidence/EvidencePage.tsx';
import { okJson, renderWithProviders, stubFetch } from './helpers.tsx';

const VERDICT_ROW = {
  verdictId: 'v-1',
  evidenceId: 'e-1',
  parentNodeId: null,
  nodeKind: 'hypothesis',
  decision: 'CONFIRMED',
  falsificationSpec: { prediction: 'p', metric: 'm', falsificationThreshold: 0.05, thresholdSemantics: 'lt' },
  thresholdSpec: null,
  metricValue: 0.01,
  conflictingEvidenceCount: 0,
  scopeSlipText: null,
  untestedReason: null,
  sourceAnchor: null,
  prevHash: 'aa'.repeat(32),
  currentHash: 'bb'.repeat(32),
  createdAt: '2026-08-18T01:00:00Z',
  updatedAt: '2026-08-18T01:00:00Z',
  decisionTrace: null,
};

const ROOT = {
  merkleRoot: 'cd'.repeat(32),
  leafCount: 7,
  chainHeadSeq: 7,
  chainHeadHash: 'ef'.repeat(32),
};

describe('EvidencePage', () => {
  it('renders the trust root and the verdict ledger from real endpoints', async () => {
    stubFetch((url) => {
      if (url === '/api/v1/integrity/root') return okJson(ROOT);
      if (url === '/api/v1/integrity/receipt') {
        return okJson({ schemaVersion: 1, ...ROOT, gitCommitSha: null, generatedAt: '2026-08-18T02:00:00Z' });
      }
      if (url.startsWith('/api/v1/verdict?')) return okJson({ items: [VERDICT_ROW], count: 1, limit: 25, offset: 0 });
      return undefined;
    });
    renderWithProviders(<EvidencePage />, ['/evidence']);

    // Trust root values are rendered (full, untruncated hashes).
    expect((await screen.findAllByText(ROOT.merkleRoot)).length).toBeGreaterThan(0);
    // Ledger row with the machine verdict.
    expect(await screen.findByText('CONFIRMED')).toBeInTheDocument();
    // First page: previous is disabled.
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
  });

  it('shows the honest empty ledger state', async () => {
    stubFetch((url) => {
      if (url === '/api/v1/integrity/root') return okJson(ROOT);
      if (url === '/api/v1/integrity/receipt') {
        return okJson({ schemaVersion: 1, ...ROOT, gitCommitSha: null, generatedAt: '2026-08-18T02:00:00Z' });
      }
      if (url.startsWith('/api/v1/verdict?')) return okJson({ items: [], count: 0, limit: 25, offset: 0 });
      return undefined;
    });
    renderWithProviders(<EvidencePage />, ['/evidence']);
    expect(await screen.findByText(/台账为空/)).toBeInTheDocument();
  });
});

const BENCH_ENTRY = {
  problemId: 'P-001',
  problemTitle: 'Exoplanet radius vs irradiation',
  domain: 'astronomy',
  science125Tag: 'planetary-science',
  verdict: 'CONFIRMED',
  integrityRoot: 'ab'.repeat(32),
  leafCount: 5,
  reproHash: 'cd'.repeat(32),
  stagesCompleted: 8,
  converged: true,
  chainVerified: true,
  sourceId: 'fixture',
};

describe('BenchmarkPage', () => {
  it('renders the report with honesty notes and accessible distribution bars', async () => {
    stubFetch((url) =>
      url === '/api/v1/benchmark'
        ? okJson({
            schemaVersion: 1,
            generatedAt: '2026-08-15T00:00:00Z',
            problemCount: 1,
            entries: [BENCH_ENTRY],
            suiteIntegrityRoot: 'ef'.repeat(32),
            totalLeaves: 5,
            verdictDistribution: { CONFIRMED: 3, REFUTED: 1, INCONCLUSIVE: 2, DEGRADED_SCOPE: 0, UNTESTED: 1 },
            domainDistribution: { astronomy: 4, biology: 3 },
            gitCommitSha: 'deadbeef',
            honestyNotes: ['本报告由离线夹具生成，非真实科学裁决。'],
          })
        : undefined,
    );
    renderWithProviders(<BenchmarkPage />, ['/benchmark']);

    // Honesty notes are displayed verbatim, prominently.
    expect(await screen.findByTestId('honesty-notes')).toHaveTextContent('本报告由离线夹具生成，非真实科学裁决。');

    // Distribution bars carry text labels (role=img + aria-label with counts).
    const confirmedBar = screen.getByRole('img', { name: 'CONFIRMED: 3' });
    expect(confirmedBar).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'astronomy: 4' })).toBeInTheDocument();
    // Every distribution row is labelled, including zero counts.
    expect(screen.getByRole('img', { name: 'DEGRADED_SCOPE: 0' })).toBeInTheDocument();

    // Entries table renders the problem row.
    expect(screen.getByText('Exoplanet radius vs irradiation')).toBeInTheDocument();
  });

  it('shows the honest empty state when the report has no entries', async () => {
    stubFetch((url) =>
      url === '/api/v1/benchmark'
        ? okJson({
            schemaVersion: 1,
            generatedAt: '2026-08-15T00:00:00Z',
            problemCount: 0,
            entries: [],
            suiteIntegrityRoot: 'ef'.repeat(32),
            totalLeaves: 0,
            verdictDistribution: { CONFIRMED: 0, REFUTED: 0, INCONCLUSIVE: 0, DEGRADED_SCOPE: 0, UNTESTED: 0 },
            domainDistribution: {},
            gitCommitSha: null,
            honestyNotes: [],
          })
        : undefined,
    );
    renderWithProviders(<BenchmarkPage />, ['/benchmark']);
    expect(await screen.findByText('基准报告尚未生成。')).toBeInTheDocument();
  });
});
