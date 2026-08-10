/**
 * VersionDiffPage 测试（IC-15 T2' · 赛题"版本比较"关键词）。
 *
 * 覆盖：
 *   1. 空状态（无 hash 提交）→ 显示 empty-state Alert
 *   2. 无效 hash → 显示错误提示
 *   3. 加载中 → 显示 Skeleton
 *   4. API 成功且 timeline.length=0 → 显示"no verdicts"
 *   5. API 成功且 timeline 含多版本 → 渲染版本卡片 + verdict changed 标识
 *   6. Honesty 边界卡片始终渲染
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import VersionDiffPage from '@/pages/VersionDiffPage';

vi.mock('@/lib/api_client', () => ({
  useEvidenceChain: vi.fn(),
}));

import { useEvidenceChain } from '@/lib/api_client';

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <VersionDiffPage />
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

const VALID_HASH = 'a'.repeat(64);

describe('VersionDiffPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('初始渲染：显示 empty-state + honesty 卡片', () => {
    vi.mocked(useEvidenceChain).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    renderWithProviders();

    expect(screen.getByTestId('version-diff-page')).toBeInTheDocument();
    expect(screen.getByTestId('version-diff-empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('version-diff-honesty')).toBeInTheDocument();
    expect(screen.getByTestId('version-diff-input-card')).toBeInTheDocument();
  });

  it('无效 hash（非 64 字符）→ 显示错误提示，不发请求', async () => {
    const user = userEvent.setup();
    vi.mocked(useEvidenceChain).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    renderWithProviders();
    const input = screen.getByTestId('version-diff-hash-input') as HTMLInputElement;
    const submit = screen.getByTestId('version-diff-submit');

    await user.type(input, 'short-hash');
    await user.click(submit);

    expect(screen.getByTestId('version-diff-hash-error')).toBeInTheDocument();
  });

  it('加载中 → 显示 Skeleton', async () => {
    const user = userEvent.setup();
    vi.mocked(useEvidenceChain).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as never);

    renderWithProviders();
    const input = screen.getByTestId('version-diff-hash-input') as HTMLInputElement;
    await user.type(input, VALID_HASH);
    await user.click(screen.getByTestId('version-diff-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('version-diff-loading')).toBeInTheDocument();
    });
  });

  it('API 错误 → 显示 destructive Alert', async () => {
    const user = userEvent.setup();
    vi.mocked(useEvidenceChain).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('network down'),
    } as never);

    renderWithProviders();
    const input = screen.getByTestId('version-diff-hash-input') as HTMLInputElement;
    await user.type(input, VALID_HASH);
    await user.click(screen.getByTestId('version-diff-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('version-diff-error')).toBeInTheDocument();
      expect(screen.getByText('network down')).toBeInTheDocument();
    });
  });

  it('API 成功但无裁决节点 → 显示 "no verdicts" 提示', async () => {
    const user = userEvent.setup();
    vi.mocked(useEvidenceChain).mockReturnValue({
      data: {
        headHash: VALID_HASH,
        callRecord: null,
        graphSubtree: {
          rootId: 'root-1',
          nodes: [],
          edges: [],
        },
      },
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    renderWithProviders();
    const input = screen.getByTestId('version-diff-hash-input') as HTMLInputElement;
    await user.type(input, VALID_HASH);
    await user.click(screen.getByTestId('version-diff-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('version-diff-no-verdicts')).toBeInTheDocument();
    });
  });

  it('多版本 timeline → 渲染版本卡片并标识 verdict 变化', async () => {
    const user = userEvent.setup();
    vi.mocked(useEvidenceChain).mockReturnValue({
      data: {
        headHash: VALID_HASH,
        callRecord: null,
        graphSubtree: {
          rootId: 'root-1',
          nodes: [
            {
              nodeId: 'v1',
              evidenceId: 'ev1',
              parentNodeId: null,
              nodeKind: 'root',
              decision: 'REFUTED',
              metricValue: null,
              conflictingEvidenceCount: 0,
              scopeSlipText: null,
              untestedReason: null,
              createdAt: '2026-07-27T10:00:00Z',
            },
            {
              nodeId: 'v2',
              evidenceId: 'ev2',
              parentNodeId: 'v1',
              nodeKind: 'root',
              decision: 'CONFIRMED',
              metricValue: null,
              conflictingEvidenceCount: 0,
              scopeSlipText: null,
              untestedReason: null,
              createdAt: '2026-07-27T11:00:00Z',
            },
          ],
          edges: [],
        },
      },
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    renderWithProviders();
    const input = screen.getByTestId('version-diff-hash-input') as HTMLInputElement;
    await user.type(input, VALID_HASH);
    await user.click(screen.getByTestId('version-diff-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('version-diff-timeline')).toBeInTheDocument();
      expect(screen.getByTestId('version-diff-card-0')).toBeInTheDocument();
      expect(screen.getByTestId('version-diff-card-1')).toBeInTheDocument();
      // 第二张卡 verdict 与第一张不同 → 显示 changed 标识
      expect(screen.getByTestId('version-diff-changed-1')).toBeInTheDocument();
    });
  });
});
