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
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import V2ReceiptPage from '@/pages/V2ReceiptPage';

function renderWithQueryClient(ui: React.ReactElement, initialEntries?: readonly string[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries as string[] | undefined}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
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
  // 应然契约 V2StoredReceipt: id / verdict (非过渡期 receiptId / verdictLabel)。
  // 后端 backend-architect 完成 R-05/R-15 统一后此即真实形态。
  // counter-case 3:ReceiptDtoSchema 要求全部字段,mock 必须对齐(zod parse 会校验)。
  receipts: [
    { id: 'rcpt-1', claimId: 'claim-1', claimText: 'First claim', verdict: 'CONFIRMED', proofHash: 'a'.repeat(64), schemaVersion: 'far-wizard-v1', createdAt: '2026-08-01T00:00:00.000Z', receiptStanding: 'ACTIVE', preservationStatus: 'AVAILABLE' },
    { id: 'rcpt-2', claimId: 'claim-2', claimText: 'Second claim', verdict: 'INCONCLUSIVE', proofHash: 'b'.repeat(64), schemaVersion: 'far-wizard-v1', createdAt: '2026-08-02T00:00:00.000Z', receiptStanding: 'ACTIVE', preservationStatus: 'AVAILABLE' },
  ],
  total: 2,
  limit: 20,
  offset: 0,
};

function mockV2Ok() {
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes('/api/v2/receipts/demo')) {
      // counter-case 2/3:后端统一信封 { ok: true, data: T }。
      return new Response(JSON.stringify({ ok: true, data: DEMO_BODY }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/v2/receipts?limit=')) {
      return new Response(JSON.stringify({ ok: true, data: LIST_BODY }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/v2/receipts/verify')) {
      // counter-case 2/3:后端统一信封 { ok: true, data: { verification, display } }。
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            verification: { ...DEMO_BODY.verification, resultId: 'vr-upload-1' },
            display: '(display mock)',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('', { status: 404 });
  });
}

describe('V2ReceiptPage', () => {
  beforeEach(() => {
    mockV2Ok();
  });

  it('渲染页面标题与保障范围(R-07: Honesty Boundary → Assurance Scope)', async () => {
    renderWithQueryClient(<V2ReceiptPage />);
    // demoLoading 初始为 true → 先等 demo 加载完成再断言标题
    expect(await screen.findByText('V2 Receipt Verification')).toBeInTheDocument();
    // R-07: 旧否定式 "Honesty Boundary" 改为专业 "Assurance Scope"。
    expect(screen.getByText('Assurance Scope')).toBeInTheDocument();
  });

  it('demo 段：渲染 Receipt ID / Verdict / Claim / Manifest Members / Standing', async () => {
    renderWithQueryClient(<V2ReceiptPage />);
    expect(await screen.findByText('rcpt-demo-001')).toBeInTheDocument();
    expect(screen.getByText('TIC lightcurve transit-like periodic signal')).toBeInTheDocument();
    // R-02: isFixtureOnly 徽标由 "Fixture Only" 改为产品语言 "Reference"。
    expect(screen.getByText('Reference')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // manifestMembers.length
  });

  it('六维演示：六个维度 + outcome badge 全部渲染', async () => {
    renderWithQueryClient(<V2ReceiptPage />);
    // R-02: 标题由 "Six Assurance Dimensions (Demo)" 改为 "Six Assurance Dimensions"。
    expect(await screen.findByText('Six Assurance Dimensions')).toBeInTheDocument();
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
    // 2 条 / PAGE_SIZE 20 → 单页：Previous 禁用、Next 禁用
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
        return new Response(JSON.stringify({ ok: true, data: DEMO_BODY }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/v2/receipts?limit=')) {
        return new Response(JSON.stringify({ ok: true, data: { receipts: [], total: 0, limit: 20, offset: 0 } }), {
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
        return new Response(JSON.stringify({ ok: true, data: DEMO_BODY }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('server error', { status: 503 });
    });
    renderWithQueryClient(<V2ReceiptPage />);
    // R-08: 页面 i18n 化后错误文案走默认 en 目录键 v2.listLoadFailed。
    expect(await screen.findByText(/Failed to load receipt list/)).toBeInTheDocument();
  });

  it('demo 错误：fetch 500 → demo 段降级错误卡片，页面其余部分仍渲染', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/api/v2/receipts/demo')) {
        return new Response('boom', { status: 500 });
      }
      if (url.includes('/api/v2/receipts?limit=')) {
        return new Response(JSON.stringify({ ok: true, data: LIST_BODY }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('', { status: 404 });
    });
    renderWithQueryClient(<V2ReceiptPage />);
    // R-02/R-08: 错误卡片标题 v2.refReceiptUnavailable（默认 en）。
    expect(await screen.findByText('Reference Receipt Unavailable')).toBeInTheDocument();
    // 非阻塞：列表段仍渲染（v2.storedReceipts）
    expect(screen.getByText('Stored Receipts')).toBeInTheDocument();
    expect(await screen.findByText('rcpt-1')).toBeInTheDocument();
  });

  it('上传验证：ReceiptUploader 渲染（textarea placeholder 存在）', async () => {
    renderWithQueryClient(<V2ReceiptPage />);
    await screen.findByText('rcpt-demo-001');
    // ReceiptUploader 渲染在页面中（placeholder 是唯一稳定文案）
    expect(screen.getByPlaceholderText('Paste envelope JSON here…')).toBeInTheDocument();
  });

  it('上传验证：粘贴 envelope → 点 Verify → 渲染 Verification Result 卡片 + 六维', async () => {
    // 回归 bug：旧 ReceiptUploader 把整个后端响应 { ok, verification, display } 直接
    // 当作 VerificationResult 上抛 → V2ReceiptPage 中 Object.entries(uploadResult.dimensions)
    // 取到 undefined → TypeError → 组件白屏崩溃。修复后必须解构 .verification 字段。
    renderWithQueryClient(<V2ReceiptPage />);
    await screen.findByText('rcpt-demo-001'); // 等 demo 加载完成

    const textarea = screen.getByPlaceholderText(
      'Paste envelope JSON here…',
    ) as HTMLTextAreaElement;
    await fireEvent.change(textarea, {
      target: { value: JSON.stringify({ schemaVersion: 'far.envelope.v2', proofHash: 'a'.repeat(64) }) },
    });

    const verifyBtn = screen.getByRole('button', { name: 'Verify Envelope' });
    await fireEvent.click(verifyBtn);

    // 上传成功后渲染 Verification Result 卡片;resultId 'vr-upload-1' 区别于 demo 的 'vr-demo-001'。
    // 旧代码会因 dimensions undefined 抛 TypeError,findByText 会 timeout 失败。
    expect(await screen.findByText('vr-upload-1')).toBeInTheDocument();
    // Verification Result 卡片标题（R-08: v2.verificationResult，默认 en）
    expect(screen.getByText('Verification Result')).toBeInTheDocument();
  }, 15000);

  it('上传验证：后端返回 ok:false 或缺 verification 字段 → 显示错误而非崩溃', async () => {
    // 防御性：若后端契约漂移（如返回 { ok:false, error } 但 HTTP 200），组件应显示错误。
    // counter-case 3:zod parse 在边界拦截契约漂移,抛 ApiError(RESPONSE_SCHEMA_MISMATCH)。
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/api/v2/receipts/demo')) {
        return new Response(JSON.stringify({ ok: true, data: DEMO_BODY }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/v2/receipts?limit=')) {
        return new Response(JSON.stringify({ ok: true, data: LIST_BODY }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/v2/receipts/verify')) {
        // 故意在 data 内缺 verification 字段 —— zod parse 应拦截
        return new Response(JSON.stringify({ ok: true, data: { display: 'x' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('', { status: 404 });
    });

    renderWithQueryClient(<V2ReceiptPage />);
    await screen.findByText('rcpt-demo-001');

    const textarea = screen.getByPlaceholderText(
      'Paste envelope JSON here…',
    ) as HTMLTextAreaElement;
    await fireEvent.change(textarea, {
      target: { value: JSON.stringify({ schemaVersion: 'far.envelope.v2', proofHash: 'a'.repeat(64) }) },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Verify Envelope' }));

    // zod parse 拦截契约漂移:错误信息包含 schema 不匹配提示,而非白屏崩溃
    expect(await screen.findByText(/does not match the expected schema/i)).toBeInTheDocument();
    // 不应渲染 vr-upload-1
    expect(screen.queryByText('vr-upload-1')).not.toBeInTheDocument();
  }, 15000);
});

// ===========================================================================
// 分享链接闭环（P0-1：Wizard 生成 /v2-receipt?runId=xxx → 本页按 runId 定位收据）
// ===========================================================================

describe('V2ReceiptPage shared-link deep link (?runId=)', () => {
  beforeEach(() => {
    mockV2Ok();
  });

  it('有 runId 时按 claimId 过滤定位共享收据并渲染详情区块', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/api/v2/receipts/demo')) {
        return new Response(JSON.stringify({ ok: true, data: DEMO_BODY }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // claimId 过滤列表（share-link 定位）
      if (url.includes('/api/v2/receipts?limit=') && url.includes('claimId=run-abc')) {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              receipts: [
                {
                  id: 'rcpt-shared-1',
                  claimId: 'run-abc',
                  claimText: 'Shared claim from wizard',
                  verdict: 'INCONCLUSIVE',
                  proofHash: 'c'.repeat(64),
                  schemaVersion: 'far-wizard-v1',
                  createdAt: '2026-08-08T00:00:00.000Z',
                  receiptStanding: 'ACTIVE',
                  preservationStatus: 'AVAILABLE',
                },
              ],
              total: 1,
              limit: 20,
              offset: 0,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      // 普通列表（无 claimId）→ 空
      if (url.includes('/api/v2/receipts?limit=')) {
        return new Response(
          JSON.stringify({ ok: true, data: { receipts: [], total: 0, limit: 20, offset: 0 } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      // 详情 + manifest
      if (url.includes('/api/v2/receipts/rcpt-shared-1') && !url.endsWith('/verify')) {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              receipt: {
                id: 'rcpt-shared-1',
                claimId: 'run-abc',
                claimText: 'Shared claim from wizard',
                verdict: 'INCONCLUSIVE',
                proofHash: 'c'.repeat(64),
                schemaVersion: 'far-wizard-v1',
                createdAt: '2026-08-08T00:00:00.000Z',
                receiptStanding: 'ACTIVE',
                preservationStatus: 'AVAILABLE',
              },
              manifestMembers: [{ kind: 'claim', digest: 'd'.repeat(64), sizeBytes: 100 }],
              latestVerification: null,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('', { status: 404 });
    });

    renderWithQueryClient(<V2ReceiptPage />, ['/v2-receipt?runId=run-abc']);

    // 共享收据区块渲染（v2.sharedReceipt + 运行 ID + 收据内容）
    expect(await screen.findByText('Shared Receipt')).toBeInTheDocument();
    expect(screen.getByText(/Run ID: run-abc/)).toBeInTheDocument();
    expect(await screen.findByText('rcpt-shared-1')).toBeInTheDocument();
    expect(screen.getByText('Shared claim from wizard')).toBeInTheDocument();
    // manifest 表格渲染
    expect(screen.getByText('claim')).toBeInTheDocument();
  });

  it('runId 无匹配收据 → 显示未找到提示（引导发起方先保存）', async () => {
    // 无 claimId 匹配：list 返回空（与默认 LIST_BODY 区分）
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/api/v2/receipts/demo')) {
        return new Response(JSON.stringify({ ok: true, data: DEMO_BODY }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/v2/receipts?limit=')) {
        return new Response(
          JSON.stringify({ ok: true, data: { receipts: [], total: 0, limit: 20, offset: 0 } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('', { status: 404 });
    });

    renderWithQueryClient(<V2ReceiptPage />, ['/v2-receipt?runId=missing-run']);

    // 无 claimId 匹配 → sharedNotFound 文案
    expect(
      await screen.findByText(/No receipt found for this run/),
    ).toBeInTheDocument();
  });

  it('无 runId 参数 → 不渲染共享收据区块（正常列表页）', async () => {
    renderWithQueryClient(<V2ReceiptPage />);
    await screen.findByText('rcpt-demo-001');
    expect(screen.queryByText('Shared Receipt')).not.toBeInTheDocument();
  });
});
