/**
 * AuditTracePage 测试。
 *
 * 覆盖：
 *   1. 路由可达：/audit 渲染标题 + 追溯输入框。
 *   2. 输入 ID + 追溯 → 发起三路 API 请求（verdict/evidence chain/lifecycle events）。
 *   3. 无数据 → 「未找到追溯数据」诚实提示（非 404 伪装）。
 *   4. 生命周期事件渲染（修正通知·BA3-3 联动）。
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch / 桩。
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test, vi, afterEach } from 'vitest';

import AuditTracePage from '@/pages/AuditTracePage';

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/audit']}>
        <Routes>
          <Route path="/audit" element={<AuditTracePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AuditTracePage — BW4 Gap-7 全链路追溯', () => {
  test('renders heading and trace input on /audit', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /Audit Trace/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('hypothesis ID to trace')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'run trace' })).toBeDisabled();
  });

  test('submitting an ID issues the three trace queries (verdict/chain/lifecycle)', async () => {
    const user = userEvent.setup();
    renderPage();

    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const path = String(url);
      if (path.includes('/lifecycle/events')) {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              targetKind: 'claim',
              targetId: 'hypo-1',
              events: [
                {
                  eventId: 'ev-1',
                  targetKind: 'claim',
                  targetId: 'hypo-1',
                  fromState: 'active',
                  toState: 'corrected',
                  actor: 'researcher-001',
                  reason: 're-verification corrected the claim (BA3-3 notice)',
                  prevHash: 'a'.repeat(64),
                  currentHash: 'b'.repeat(64),
                  createdAt: '2026-08-09T00:00:00.000Z',
                },
              ],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (path.includes('/verdict/by_hypothesis')) {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              verdictId: 'v-1',
              evidenceId: 'e-1',
              parentNodeId: null,
              nodeKind: 'root',
              decision: 'CONFIRMED',
              falsificationSpec: { specKind: 'not_applicable' },
              thresholdSpec: null,
              metricValue: null,
              conflictingEvidenceCount: 0,
              scopeSlipText: null,
              untestedReason: null,
              sourceAnchor: null,
              prevHash: '0'.repeat(64),
              currentHash: 'c'.repeat(64),
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (path.includes('/evidence/chain')) {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              headHash: 'd'.repeat(64),
              callRecord: {
                seq: 1,
                stageId: 'stage3_hypothesis',
                payloadKind: 'hypothesis',
                purposeTag: 'hypothesis',
                modelId: 'offline-replay-fixture',
                reproHash: 'a'.repeat(64),
                gitCommitSha: 'b'.repeat(40),
                isoTimestamp: '2026-08-09T00:00:00.000Z',
                finishReason: 'stop',
                usageTokensTotal: 0,
                prevHash: 'e'.repeat(64),
                currentHash: 'f'.repeat(64),
              },
              graphSubtree: null,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`unexpected fetch: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await user.type(screen.getByLabelText('hypothesis ID to trace'), 'hypo-1');
    await user.click(screen.getByRole('button', { name: 'run trace' }));

    // 三路 API 全部命中。
    await screen.findByText('Verdict Node');
    expect(screen.getByText('CONFIRMED')).toBeInTheDocument();
    expect(await screen.findAllByText('Evidence Chain')).toHaveLength(2); // badge + card title
    await screen.findByText(/Lifecycle Events/);
    // 生命周期修正通知可见（BA3-3）。
    expect(
      screen.getByText('re-verification corrected the claim (BA3-3 notice)'),
    ).toBeInTheDocument();
    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes('/verdict/by_hypothesis/hypo-1'))).toBe(true);
    expect(calls.some((u) => u.includes('/evidence/chain/hypo-1'))).toBe(true);
    expect(calls.some((u) => u.includes('/lifecycle/events?targetKind=claim&targetId=hypo-1'))).toBe(true);
  });

  test('unknown ID shows honest empty-state (no fabricated trace)', async () => {
    const user = userEvent.setup();
    renderPage();
    // 服务端 200 但无数据（honest empty：verdict 404 由后端 notFound 抛错 → error；
    // 这里模拟「无 trace 数据」= 三个端点都返回空/错误 → 页面展示诚实空态）。
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL) => {
        const path = String(url);
        if (path.includes('/lifecycle/events')) {
          return new Response(
            JSON.stringify({
              ok: true,
              data: { targetKind: 'claim', targetId: 'ghost-id', events: [] },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (path.includes('/verdict/by_hypothesis')) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: { error_code: 'NOT_FOUND', message: 'no verdict node for ghost-id' },
            }),
            { status: 404, headers: { 'content-type': 'application/json' } },
          );
        }
        if (path.includes('/evidence/chain')) {
          return new Response(
            JSON.stringify({ ok: false, error: { error_code: 'NOT_FOUND' } }),
            { status: 404, headers: { 'content-type': 'application/json' } },
          );
        }
        throw new Error(`unexpected fetch: ${path}`);
      }),
    );
    await user.type(screen.getByLabelText('hypothesis ID to trace'), 'ghost-id');
    await user.click(screen.getByRole('button', { name: 'run trace' }));
    // verdict 404 → 追溯失败 Alert；lifecycle 空数组 → 无伪造 trace（诚实空态文案）。
    expect(await screen.findByText(/no verdict node for ghost-id/)).toBeInTheDocument();
  });
});
