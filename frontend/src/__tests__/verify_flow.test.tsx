/**
 * Verify flow — paste/upload an envelope → six-dimension verification →
 * optional persist. Client-side JSON validation never burns a request; a
 * backend contract drift surfaces as RESPONSE_SCHEMA_MISMATCH, not a corrupt
 * render; the persisted list reflects real stored receipts.
 */

import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import VerifyPage from '@/features/verify/VerifyPage.tsx';
import { okJson, renderWithProviders, stubFetch } from './helpers.tsx';

const DIMENSIONS = {
  provenance: { dimension: 'provenance', outcome: 'PASS', reasonCodes: [], detail: 'chain intact' },
  reproducibility: { dimension: 'reproducibility', outcome: 'PASS', reasonCodes: [], detail: 'recompute matches' },
  schema: { dimension: 'schema', outcome: 'WARN', reasonCodes: ['minor_drift'], detail: 'field order' },
  integrity: { dimension: 'integrity', outcome: 'PASS', reasonCodes: [], detail: 'hashes match' },
  policy: { dimension: 'policy', outcome: 'NOT_APPLICABLE', reasonCodes: [], detail: 'no policy' },
  review: { dimension: 'review', outcome: 'SKIP', reasonCodes: [], detail: 'not requested' },
} as const;

const VERIFICATION = {
  resultVersion: 1,
  resultId: 'res-1',
  receiptId: 'rcpt-1',
  verificationPolicyId: 'policy-v1',
  evaluatedAt: '2026-08-18T02:00:00Z',
  dimensions: DIMENSIONS,
  receiptStanding: 'VALID',
  preservationStatus: 'PRESERVED',
  reviewSummary: 'six dimensions evaluated',
};

const ENVELOPE = JSON.stringify({
  proofHash: 'ph-abc',
  schemaVersion: '2',
  claimId: 'claim-1',
  claimText: 'Claim text',
  verdict: 'CONFIRMED',
});

function verifyRoutes() {
  return (
    <Routes>
      <Route path="/verify" element={<VerifyPage />} />
      <Route path="/receipts/:receiptId" element={<div>receipt-detail-marker</div>} />
    </Routes>
  );
}

function stubBaseline(fetchLog?: string[]) {
  return stubFetch((url, init) => {
    fetchLog?.push(`${init?.method ?? 'GET'} ${url}`);
    if (url.startsWith('/api/v2/receipts?')) return okJson({ receipts: [], total: 0, limit: 20, offset: 0 });
    return undefined;
  });
}

describe('VerifyPage', () => {
  it('rejects invalid JSON client-side without touching the network', async () => {
    const log: string[] = [];
    stubBaseline(log);
    renderWithProviders(verifyRoutes(), ['/verify']);

    fireEvent.change(screen.getByLabelText('证明包 JSON'), { target: { value: 'this is not json' } });
    await userEvent.click(screen.getByRole('button', { name: '执行验证' }));

    expect(await screen.findByTestId('verify-client-error')).toHaveTextContent('不是合法 JSON');
    expect(log.filter((entry) => entry.includes('/api/v2/receipts/verify'))).toHaveLength(0);
  });

  it('verifies a valid envelope and renders all six dimensions with outcomes', async () => {
    stubFetch((url, init) => {
      if (url.startsWith('/api/v2/receipts?')) return okJson({ receipts: [], total: 0, limit: 20, offset: 0 });
      if (url === '/api/v2/receipts/verify' && init?.method === 'POST') {
        return okJson({ verification: VERIFICATION, display: 'rendered' });
      }
      return undefined;
    });
    renderWithProviders(verifyRoutes(), ['/verify']);

    fireEvent.change(screen.getByLabelText('证明包 JSON'), { target: { value: ENVELOPE } });
    await userEvent.click(screen.getByRole('button', { name: '执行验证' }));

    const result = await screen.findByTestId('verify-result');
    expect(result).toHaveTextContent('VALID');
    expect(result).toHaveTextContent('provenance');
    expect(result).toHaveTextContent('minor_drift');
    // Outcome badges are text, not color alone.
    expect(screen.getAllByText('通过').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('警告')).toBeInTheDocument();
    expect(screen.getByText('跳过')).toBeInTheDocument();
    expect(screen.getByText('不适用')).toBeInTheDocument();
  });

  it('persists a verified envelope (idempotent by proofHash) and links to the receipt', async () => {
    const persisted: string[] = [];
    stubFetch((url, init) => {
      if (url.startsWith('/api/v2/receipts?')) return okJson({ receipts: [], total: 0, limit: 20, offset: 0 });
      if (url === '/api/v2/receipts/verify' && init?.method === 'POST') {
        return okJson({ verification: VERIFICATION, display: 'rendered' });
      }
      if (url === '/api/v2/receipts' && init?.method === 'POST') {
        persisted.push(String(init.body));
        return okJson({ receiptId: 'rcpt-1', idempotent: false });
      }
      return undefined;
    });
    renderWithProviders(verifyRoutes(), ['/verify']);

    fireEvent.change(screen.getByLabelText('证明包 JSON'), { target: { value: ENVELOPE } });
    await userEvent.click(screen.getByRole('button', { name: '执行验证' }));
    await screen.findByTestId('verify-result');

    await userEvent.click(screen.getByRole('button', { name: '保存该收据' }));
    const done = await screen.findByTestId('verify-persisted');
    expect(done).toHaveTextContent('rcpt-1');
    expect(persisted).toHaveLength(1);
    const body = JSON.parse(persisted[0] ?? '{}') as { proofHash: string; claimId: string; verdict: string };
    expect(body.proofHash).toBe('ph-abc');
    expect(body.claimId).toBe('claim-1');
    expect(body.verdict).toBe('CONFIRMED');
  });

  it('turns a backend contract drift into a loud schema-mismatch error', async () => {
    stubFetch((url, init) => {
      if (url.startsWith('/api/v2/receipts?')) return okJson({ receipts: [], total: 0, limit: 20, offset: 0 });
      if (url === '/api/v2/receipts/verify' && init?.method === 'POST') {
        return okJson({ verification: { bogus: true }, display: 'x' });
      }
      return undefined;
    });
    renderWithProviders(verifyRoutes(), ['/verify']);

    fireEvent.change(screen.getByLabelText('证明包 JSON'), { target: { value: ENVELOPE } });
    await userEvent.click(screen.getByRole('button', { name: '执行验证' }));

    const err = await screen.findByTestId('verify-error');
    expect(err).toHaveTextContent('RESPONSE_SCHEMA_MISMATCH');
  });

  it('lists persisted receipts with verdict and standing', async () => {
    stubFetch((url) => {
      if (url.startsWith('/api/v2/receipts?')) {
        return okJson({
          receipts: [
            {
              id: 'rcpt-1',
              claimId: 'claim-1',
              claimText: 'Stored claim',
              verdict: 'REFUTED',
              proofHash: 'ph-abc',
              schemaVersion: '2',
              createdAt: '2026-08-17T10:00:00Z',
              receiptStanding: 'VALID',
              preservationStatus: 'PRESERVED',
            },
          ],
          total: 1,
          limit: 20,
          offset: 0,
        });
      }
      return undefined;
    });
    renderWithProviders(verifyRoutes(), ['/verify']);

    expect(await screen.findByText('Stored claim')).toBeInTheDocument();
    expect(screen.getByText('REFUTED')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '打开' })).toHaveAttribute('href', '/receipts/rcpt-1');
  });

  it('shows the honest empty state when no receipts are stored', async () => {
    stubBaseline();
    renderWithProviders(verifyRoutes(), ['/verify']);
    expect(await screen.findByText(/暂无已保存收据/)).toBeInTheDocument();
  });
});
