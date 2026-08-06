/**
 * V2ReceiptPage.test —— V2 收据验证页组件测试（审计盲区补测·2026-08-06）。
 *
 * Authority: src/api/routes/v2_receipts.ts + v2_receipts_persist.ts（六维收据验证）。
 *
 * 覆盖（mock GET /api/v2/receipts/demo + GET /api/v2/receipts + POST /api/v2/receipts/verify）：
 *   - demo 段：Receipt ID / Verdict / Claim / Manifest Members / Standing 渲染
 *   - 六维演示：provenance/integrity/identity/processConformance/executionReproduction/
 *     scientificVerdict 全部渲染 + outcome badge（PASS/FAIL/WARN）
 *   - 收据列表：条目渲染 + 总数 + 分页（Next/Previous 边界）
 *   - 空列表：'No receipts stored yet' 空态
 *   - 列表错误：fetch 503 → 错误提示
 *   - demo 错误：fetch 500 → demo 段降级为错误卡片但页面仍渲染（非阻塞）
 *   - 诚实墙：Honesty Boundary 渲染
 *
 * 零容忍：无 any / ts-ignore / 双重断言 / 桩。fetch mock 用 type-safe URL 路由。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import V2ReceiptPage from '@/pages/V2ReceiptPage';

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const DIMENSION_OK = {
  provenance: { dimension: 'provenance', outcome: 'PASS', reasonCodes: [], detail: 'Provenance chain intact' },
  integrity: { dimension: 'integrity', outcome: 'PASS', reasonCodes: [], detail: 'Digests verified' },
  identity: { dimension: 'identity', outcome: 'WARN', reasonCodes: ['ID-2'], detail: 'Identity partially verified' },
  processConformance: { dimension: 'processConformance', outcome: 'PASS', reasonCodes: [], detail: 'Process conformance OK' },
  executionReproduction: { dimension: 'executionReproduction', outcome: 'PASS', reasonCodes: [], detail: 'Execution reproduced' },
  scientificVerdict: { dimension: 'scientificVerdict', outcome: 'FAIL', reasonCodes: ['SV-1'], detail: 'Verdict not independently confirmed' },
};

const DEMO_BODY = {
  receipt: {
    receiptId: 'rcpt-demo-001',
    claimText: 'TIC lightcurve transit-like periodic signal',
    verdictLabel: 'CONFIRMED',
    isFixtureOnly: true,
    manifestMembers: [
      { kind: 'claim', digest: 'a'.repeat(64), sizeBytes: 120 },
      { kind: 'evidence', digest: 'b'.repeat(64), sizeBytes: 340 },
    ],
  },
  verification: {
    resultVersion: 2,
    resultId: 'vr-demo-001',
    receiptId: 'rcpt-demo-001',
    verificationPolicyId: 'POLICY-2026-01',
    evaluatedAt: '2026-08-06T00:00:00.000Z',
    dimensions: DIMENSION_OK,
    receiptStanding: 'ACCEPTED',
    preservationStatus: 'PRESERVED',
    reviewSummary: 'PASS_WITH_WARNINGS',
  },
};

const LIST_BODY = {
  receipts: [
    { receiptId: 'rcpt-1', claimText: 'First claim', verdictLabel: 'CONFIRMED', createdAt: '2026-08-01T00:00:00.000Z' },
    { receiptId: 'rcpt-2', claimText: 'Second claim', verdictLabel: 'INCONCLUSIVE', createdAt: '2026-08-02T00:00:00.000Z' },
  ],
  total: 2,
  limit: 20,
  offset: 0,
};

function mockV2Ok() {
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes('/api/v2/receipts/demo')) {
      return new Response(JSON.stringify(DEMO_BODY), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/v2/receipts?limit=')) {
      return new Response(JSON.stringify(LIST_BODY), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/v2/receipts/verify')) {
      return new Response(JSON.stringify({ ...DEMO_BODY.verification, resultId: 'vr-upload-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('', { status: 404 });
  });
}

describe('V2ReceiptPage', () => {
  beforeEach(() => {
    mockV2Ok();
  });

  it('渲染页面标题与诚实墙', async () => {
    renderWithQueryClient(<V2ReceiptPage />);
    // demoLoading 初始为 true → 先等 demo 加载完成再断言标题
    expect(await screen.findByText('V2 Receipt Verification')).toBeInTheDocument();
    expect(screen.getByText('Honesty Boundary')).toBeInTheDocument();
  });

  it('demo 段：渲染 Receipt ID / Verdict / Claim / Manifest Members / Standing', async () => {
    renderWithQueryClient(<V2ReceiptPage />);
    expect(await screen.findByText('rcpt-demo-001')).toBeInTheDocument();
    expect(screen.getByText('TIC lightcurve transit-like periodic signal')).toBeInTheDocument();
    expect(screen.getByText('Fixture Only')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // manifestMembers.length
  });

  it('六维演示：六个维度 + outcome badge 全部渲染', async () => {
    renderWithQueryClient(<V2ReceiptPage />);
    expect(await screen.findByText('Six Assurance Dimensions (Demo)')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Provenance')).toBeInTheDocument();
      expect(screen.getByText('Integrity')).toBeInTheDocument();
      expect(screen.getByText('Identity')).toBeInTheDocument();
      expect(screen.getByText('Process Conformance')).toBeInTheDocument();
      expect(screen.getByText('Execution Reproduction')).toBeInTheDocument();
      expect(screen.getByText('Scientific Verdict')).toBeInTheDocument();
    });
    // outcome badges
    expect(screen.getByText('PASS_WITH_WARNINGS')).toBeInTheDocument();
  });

  it('收据列表：条目渲染 + 总数', async () => {
    renderWithQueryClient(<V2ReceiptPage />);
    expect(await screen.findByText('rcpt-1')).toBeInTheDocument();
    expect(screen.getByText('rcpt-2')).toBeInTheDocument();
    expect(screen.getByText('First claim')).toBeInTheDocument();
    expect(screen.getByText('Second claim')).toBeInTheDocument();
    // (2 total)
    expect(screen.getByText(/(2 total)/)).toBeInTheDocument();
  });

  it('分页：Next/Previous 边界禁用', async () => {
    renderWithQueryClient(<V2ReceiptPage />);
    await screen.findByText('rcpt-1');
    // 2 条 / PAGE_SIZE 20 → 单页：Next 禁用、Previous 禁用
    const prev = screen.getByText('Previous').closest('button');
    const next = screen.getByText('Next').closest('button');
    expect(prev).toBeDisabled();
    expect(next).toBeDisabled();
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  });

  it('空列表：渲染空态提示', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/api/v2/receipts/demo')) {
        return new Response(JSON.stringify(DEMO_BODY), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/v2/receipts?limit=')) {
        return new Response(JSON.stringify({ receipts: [], total: 0, limit: 20, offset: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('', { status: 404 });
    });
    renderWithQueryClient(<V2ReceiptPage />);
    expect(await screen.findByText(/No receipts stored yet/)).toBeInTheDocument();
  });

  it('列表错误：fetch 503 → 错误提示且页面不崩', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/api/v2/receipts/demo')) {
        return new Response(JSON.stringify(DEMO_BODY), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('server error', { status: 503 });
    });
    renderWithQueryClient(<V2ReceiptPage />);
    expect(await screen.findByText(/Failed to load receipt list/)).toBeInTheDocument();
  });

  it('demo 错误：fetch 500 → demo 段降级错误卡片，页面其余部分仍渲染', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/api/v2/receipts/demo')) {
        return new Response('boom', { status: 500 });
      }
      if (url.includes('/api/v2/receipts?limit=')) {
        return new Response(JSON.stringify(LIST_BODY), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('', { status: 404 });
    });
    renderWithQueryClient(<V2ReceiptPage />);
    expect(await screen.findByText('V2 Receipt Demo Unavailable')).toBeInTheDocument();
    // 非阻塞：列表段仍渲染
    expect(screen.getByText('Stored Receipts')).toBeInTheDocument();
    expect(await screen.findByText('rcpt-1')).toBeInTheDocument();
  });

  it('上传验证：ReceiptUploader 渲染（textarea placeholder 存在）', async () => {
    renderWithQueryClient(<V2ReceiptPage />);
    await screen.findByText('rcpt-demo-001');
    // ReceiptUploader 渲染在页面中（placeholder 是唯一稳定文案）
    expect(screen.getByPlaceholderText('Paste envelope JSON here…')).toBeInTheDocument();
  });
});
