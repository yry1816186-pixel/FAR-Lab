/**
 * Home + receipt detail: the landing surface answers "what can I do" with
 * real recent missions; the receipt page renders stored detail, an honest
 * "never verified" state, and a working re-verify round-trip.
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import HomePage from '@/features/home/HomePage.tsx';
import ReceiptPage from '@/features/verify/ReceiptPage.tsx';
import { okJson, renderWithProviders, stubFetch } from './helpers.tsx';

const RUN_ROW = {
  runId: 'run-1',
  question: 'Does microplastic exposure alter soil microbiomes?',
  state: 'COMPLETED',
  startedAt: '2026-08-18T01:00:00Z',
  updatedAt: '2026-08-18T01:05:00Z',
  error: null,
};

describe('HomePage', () => {
  it('renders the claim workbench and a real recent-checks list', async () => {
    stubFetch((url) => (url === '/api/v1/research' ? okJson({ runs: [RUN_ROW] }) : undefined));
    renderWithProviders(<HomePage />, ['/']);

    // 工作台主角：断言输入 + 运行判定（产品链 flow-web F1 契约——首屏即干活）
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-submit')).toBeInTheDocument();
    // 最近核验发丝线流水：真实数据 + 真实路由
    expect(await screen.findByText(RUN_ROW.question)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Does microplastic/ })).toHaveAttribute('href', '/missions/run-1');
  });

  it('shows the honest empty state for a fresh store', async () => {
    stubFetch((url) => (url === '/api/v1/research' ? okJson({ runs: [] }) : undefined));
    renderWithProviders(<HomePage />, ['/']);
    expect(await screen.findByText(/还没有核验记录/)).toBeInTheDocument();
  });
});

const STORED = {
  id: 'rcpt-1',
  claimId: 'claim-1',
  claimText: 'Stored claim text',
  verdict: 'CONFIRMED',
  proofHash: 'ab'.repeat(32),
  schemaVersion: '2',
  createdAt: '2026-08-17T10:00:00Z',
  receiptStanding: 'VALID',
  preservationStatus: 'PRESERVED',
};

const REVERIFY_RESULT = {
  resultVersion: 1,
  resultId: 'res-2',
  receiptId: 'rcpt-1',
  verificationPolicyId: 'policy-v1',
  evaluatedAt: '2026-08-18T03:00:00Z',
  dimensions: {
    integrity: { dimension: 'integrity', outcome: 'PASS', reasonCodes: [], detail: 'hashes match' },
  },
  receiptStanding: 'VALID',
  preservationStatus: 'PRESERVED',
  reviewSummary: 're-check ok',
};

function receiptRoutes() {
  return (
    <Routes>
      <Route path="/receipts/:receiptId" element={<ReceiptPage />} />
    </Routes>
  );
}

describe('ReceiptPage', () => {
  it('renders stored detail, manifest, and the never-verified state honestly', async () => {
    stubFetch((url) => {
      if (url === '/api/v2/receipts/rcpt-1') {
        return okJson({
          receipt: STORED,
          manifestMembers: [{ kind: 'proof', digest: 'cd'.repeat(32), sizeBytes: 128 }],
          latestVerification: null,
        });
      }
      return undefined;
    });
    renderWithProviders(receiptRoutes(), ['/receipts/rcpt-1']);

    expect(await screen.findByText('Stored claim text')).toBeInTheDocument();
    expect(screen.getByText('proof')).toBeInTheDocument();
    expect(screen.getByText(/尚未在服务端复检/)).toBeInTheDocument();
  });

  it('re-verify runs the round-trip and renders the fresh result', async () => {
    stubFetch((url) => {
      if (url === '/api/v2/receipts/rcpt-1/verify') {
        return okJson({ verification: REVERIFY_RESULT, display: 'rendered', allPass: true });
      }
      if (url === '/api/v2/receipts/rcpt-1') {
        return okJson({
          receipt: STORED,
          manifestMembers: [],
          latestVerification: {
            id: 1,
            receiptId: 'rcpt-1',
            policyId: 'policy-v1',
            evaluatedAt: '2026-08-18T02:00:00Z',
            result: REVERIFY_RESULT,
            allPass: true,
          },
        });
      }
      return undefined;
    });
    renderWithProviders(receiptRoutes(), ['/receipts/rcpt-1']);

    expect(await screen.findByTestId('receipt-allpass')).toHaveTextContent('六维全部通过');
    await userEvent.click(screen.getByTestId('reverify'));
    expect(await screen.findByTestId('reverify-result')).toHaveTextContent('integrity');
  });
});
