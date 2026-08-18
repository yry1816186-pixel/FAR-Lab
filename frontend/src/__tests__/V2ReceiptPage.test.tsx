/**
 * V2 Receipt production-surface contract tests.
 *
 * These tests intentionally exclude the legacy /api/v2/receipts/demo endpoint from
 * the page data flow. Reference fixtures may exist for deterministic self-tests,
 * but the production Web surface must consume persisted receipts and returned
 * verification payloads only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import V2ReceiptPage from '@/pages/V2ReceiptPage';

function renderPage(initialEntries: readonly string[] = ['/v2-receipt']) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[...initialEntries]}>
        <V2ReceiptPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const DIMENSIONS = {
  provenance: { dimension: 'provenance', outcome: 'PASS', reasonCodes: [], detail: 'Provenance chain intact' },
  integrity: { dimension: 'integrity', outcome: 'PASS', reasonCodes: [], detail: 'Digests verified' },
  identity: { dimension: 'identity', outcome: 'WARN', reasonCodes: ['ID-2'], detail: 'Identity partially verified' },
  processConformance: { dimension: 'processConformance', outcome: 'PASS', reasonCodes: [], detail: 'Process conformance OK' },
  executionReproduction: { dimension: 'executionReproduction', outcome: 'PASS', reasonCodes: [], detail: 'Execution reproduced' },
  scientificVerdict: { dimension: 'scientificVerdict', outcome: 'FAIL', reasonCodes: ['SV-1'], detail: 'Verdict not independently confirmed' },
} as const;

const VERIFICATION = {
  resultVersion: 2,
  resultId: 'vr-upload-1',
  receiptId: 'rcpt-upload-1',
  verificationPolicyId: 'POLICY-2026-01',
  evaluatedAt: '2026-08-18T00:00:00.000Z',
  dimensions: DIMENSIONS,
  receiptStanding: 'ACCEPTED',
  preservationStatus: 'PRESERVED',
  reviewSummary: 'PASS_WITH_WARNINGS',
};

const LIST_BODY = {
  receipts: [
    {
      id: 'rcpt-1',
      claimId: 'claim-1',
      claimText: 'First persisted claim',
      verdict: 'CONFIRMED',
      proofHash: 'a'.repeat(64),
      schemaVersion: 'far-wizard-v1',
      createdAt: '2026-08-01T00:00:00.000Z',
      receiptStanding: 'ACTIVE',
      preservationStatus: 'AVAILABLE',
    },
    {
      id: 'rcpt-2',
      claimId: 'claim-2',
      claimText: 'Second persisted claim',
      verdict: 'INCONCLUSIVE',
      proofHash: 'b'.repeat(64),
      schemaVersion: 'far-wizard-v1',
      createdAt: '2026-08-02T00:00:00.000Z',
      receiptStanding: 'ACTIVE',
      preservationStatus: 'AVAILABLE',
    },
  ],
  total: 2,
  limit: 20,
  offset: 0,
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installDefaultFetch() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes('/api/v2/receipts/demo')) {
      throw new Error('production V2ReceiptPage must not request the legacy demo endpoint');
    }
    if (url.includes('/api/v2/receipts/verify')) {
      return json({ ok: true, data: { verification: VERIFICATION, display: '(display)' } });
    }
    if (url.includes('/api/v2/receipts?limit=')) {
      return json({ ok: true, data: LIST_BODY });
    }
    return new Response('', { status: 404 });
  }));
}

describe('V2ReceiptPage — production receipt workspace', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installDefaultFetch();
  });

  it('renders the real workspace immediately and never requests the demo endpoint', async () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'V2 Receipt Verification' })).toBeInTheDocument();
    expect(screen.getByText('Assurance Scope')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Paste envelope JSON here…')).toBeInTheDocument();
    expect(await screen.findByText('rcpt-1')).toBeInTheDocument();
    expect(screen.getByText('First persisted claim')).toBeInTheDocument();

    const urls = vi.mocked(fetch).mock.calls.map(([input]) => input.toString());
    expect(urls.some((url) => url.includes('/api/v2/receipts/demo'))).toBe(false);
  });

  it('renders persisted receipt list state and pagination boundaries', async () => {
    renderPage();
    expect(await screen.findByText('rcpt-1')).toBeInTheDocument();
    expect(screen.getByText('rcpt-2')).toBeInTheDocument();
    expect(screen.getByText(/2 total/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  });

  it('renders a useful empty state when there are no persisted receipts', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/api/v2/receipts?limit=')) {
        return json({ ok: true, data: { receipts: [], total: 0, limit: 20, offset: 0 } });
      }
      return new Response('', { status: 404 });
    }));

    renderPage();
    expect(await screen.findByText(/No receipts stored yet/)).toBeInTheDocument();
  });

  it('keeps the page usable when the persisted receipt list fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/api/v2/receipts?limit=')) return new Response('service unavailable', { status: 503 });
      return new Response('', { status: 404 });
    }));

    renderPage();
    const errorAlert = await screen.findByRole('alert');
    expect(errorAlert).toHaveTextContent('Failed to load receipt list:');
    expect(errorAlert).toHaveTextContent('service unavailable');
    expect(screen.getByPlaceholderText('Paste envelope JSON here…')).toBeInTheDocument();
    expect(screen.getByText('Assurance Scope')).toBeInTheDocument();
  });

  it('verifies an uploaded envelope and renders all returned assurance dimensions', async () => {
    renderPage();
    await screen.findByText('rcpt-1');

    fireEvent.change(screen.getByPlaceholderText('Paste envelope JSON here…'), {
      target: { value: JSON.stringify({ schemaVersion: 'far.envelope.v2', proofHash: 'c'.repeat(64) }) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify Envelope' }));

    expect(await screen.findByText('vr-upload-1')).toBeInTheDocument();
    expect(screen.getByText('Verification Result')).toBeInTheDocument();
    for (const label of [
      'Provenance',
      'Integrity',
      'Identity',
      'Process Conformance',
      'Execution Reproduction',
      'Scientific Verdict',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('PASS_WITH_WARNINGS')).toBeInTheDocument();
  }, 15000);

  it('surfaces verification contract drift instead of crashing or inventing success', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/api/v2/receipts/verify')) {
        return json({ ok: true, data: { display: 'missing verification payload' } });
      }
      if (url.includes('/api/v2/receipts?limit=')) return json({ ok: true, data: LIST_BODY });
      return new Response('', { status: 404 });
    }));

    renderPage();
    await screen.findByText('rcpt-1');
    fireEvent.change(screen.getByPlaceholderText('Paste envelope JSON here…'), {
      target: { value: JSON.stringify({ schemaVersion: 'far.envelope.v2', proofHash: 'd'.repeat(64) }) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify Envelope' }));

    expect(await screen.findByText(/does not match the expected schema/i)).toBeInTheDocument();
    expect(screen.queryByText('vr-upload-1')).not.toBeInTheDocument();
  }, 15000);
});

describe('V2ReceiptPage — shared run deep links', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves runId to a persisted receipt, manifest, and real verification action', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/api/v2/receipts?limit=') && url.includes('claimId=run-abc')) {
        return json({
          ok: true,
          data: {
            receipts: [{
              id: 'rcpt-shared-1',
              claimId: 'run-abc',
              claimText: 'Shared claim from wizard',
              verdict: 'INCONCLUSIVE',
              proofHash: 'e'.repeat(64),
              schemaVersion: 'far-wizard-v1',
              createdAt: '2026-08-08T00:00:00.000Z',
              receiptStanding: 'ACTIVE',
              preservationStatus: 'AVAILABLE',
            }],
            total: 1,
            limit: 20,
            offset: 0,
          },
        });
      }
      if (url.endsWith('/api/v2/receipts/rcpt-shared-1')) {
        return json({
          ok: true,
          data: {
            receipt: {
              id: 'rcpt-shared-1',
              claimId: 'run-abc',
              claimText: 'Shared claim from wizard',
              verdict: 'INCONCLUSIVE',
              proofHash: 'e'.repeat(64),
              schemaVersion: 'far-wizard-v1',
              createdAt: '2026-08-08T00:00:00.000Z',
              receiptStanding: 'ACTIVE',
              preservationStatus: 'AVAILABLE',
            },
            manifestMembers: [{ kind: 'claim', digest: 'f'.repeat(64), sizeBytes: 100 }],
            latestVerification: null,
          },
        });
      }
      if (url.includes('/api/v2/receipts?limit=')) {
        return json({ ok: true, data: { receipts: [], total: 0, limit: 20, offset: 0 } });
      }
      return new Response('', { status: 404 });
    }));

    renderPage(['/v2-receipt?runId=run-abc']);
    expect(await screen.findByText('Shared Receipt')).toBeInTheDocument();
    expect(screen.getByText(/Run ID: run-abc/)).toBeInTheDocument();
    expect(await screen.findByText('rcpt-shared-1')).toBeInTheDocument();
    expect(screen.getByText('Shared claim from wizard')).toBeInTheDocument();
    expect(await screen.findByText('claim')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Re-verify/ })).toBeInTheDocument();
  });

  it('reports an unavailable shared receipt without guessing a relationship', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/api/v2/receipts?limit=')) {
        return json({ ok: true, data: { receipts: [], total: 0, limit: 20, offset: 0 } });
      }
      return new Response('', { status: 404 });
    }));

    renderPage(['/v2-receipt?runId=missing-run']);
    expect(await screen.findByText(/No receipt found for this run/)).toBeInTheDocument();
  });
});
