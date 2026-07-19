/**
 * IntegrityPage.test —— 完整性信任根交互式演示的组件测试。
 *
 * Authority: Task #7（演示惊艳）+ spec 09 §4 / 23 §5.2（integrity trust root）。
 *
 * 覆盖（mock 3 个 /integrity 端点 + 浏览器 Web Crypto 真算·由 test-setup 注入 Node WebCrypto）：
 *   - Hero 整链根：merkleRoot + leafCount 渲染
 *   - Live Reproof：拉取包含证明 + 浏览器独立重算通过（ok=true·真实密码学一致性）
 *   - Tamper Theatre：篡改叶 → 根不匹配 + 篡改已检测；恢复 → 再次通过
 *   - CrossLang：默认 golden 叶对 → 浏览器 combine 与 golden 字节相等
 *   - WholeChain：浏览器重建整链根 === golden + golden 证明验证通过
 *   - Repro Receipt：展示 + 下载触发 createObjectURL（stubGlobal URL·放最末避免污染）
 *   - HonestyWall：诚实声明条目渲染
 *
 * 零容忍：无 any / ts-ignore / 双重断言 / 桩。fetch mock 用 type-safe URL 路由。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import IntegrityPage from '@/pages/IntegrityPage';
import {
  GOLDEN_LEAVES,
  GOLDEN_MERKLE_ROOT,
  GOLDEN_PROOF_LEAF0,
} from '@/lib/integrity-golden';
import type { IntegrityProofDto, IntegrityRootDto, ReproReceipt } from '@/lib/types';

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const CHAIN_HEAD_HASH = GOLDEN_LEAVES[8]?.expectedHex ?? '';

const ROOT_BODY: IntegrityRootDto = {
  merkleRoot: GOLDEN_MERKLE_ROOT,
  leafCount: 9,
  chainHeadSeq: 9,
  chainHeadHash: CHAIN_HEAD_HASH,
};

const PROOF_1: IntegrityProofDto = {
  seq: 1,
  leafIndex: GOLDEN_PROOF_LEAF0.leafIndex,
  leaf: GOLDEN_PROOF_LEAF0.leaf,
  siblings: [...GOLDEN_PROOF_LEAF0.siblings],
  expectedRoot: GOLDEN_PROOF_LEAF0.expectedRoot,
  leafCount: 9,
};

const RECEIPT_BODY: ReproReceipt = {
  schemaVersion: 1,
  merkleRoot: GOLDEN_MERKLE_ROOT,
  leafCount: 9,
  chainHeadSeq: 9,
  chainHeadHash: CHAIN_HEAD_HASH,
  gitCommitSha: 'a'.repeat(40),
  generatedAt: '2026-06-30T00:00:00.000Z',
};

/** 按 URL 路由 mock 3 个 integrity 端点（type-safe·禁 as）。 */
function mockIntegrityEndpoints() {
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const url = input.toString();
    const headers = { 'Content-Type': 'application/json' };
    if (url.endsWith('/integrity/root')) {
      return new Response(JSON.stringify(ROOT_BODY), { status: 200, headers });
    }
    if (url.includes('/integrity/proof/')) {
      return new Response(JSON.stringify(PROOF_1), { status: 200, headers });
    }
    if (url.endsWith('/integrity/receipt')) {
      return new Response(JSON.stringify(RECEIPT_BODY), { status: 200, headers });
    }
    return new Response('', { status: 404 });
  });
}

describe('IntegrityPage', () => {
  beforeEach(() => {
    mockIntegrityEndpoints();
  });

  it('渲染页面容器与标题', () => {
    renderWithQueryClient(<IntegrityPage />);
    expect(screen.getByTestId('integrity-page')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Integrity trust root', level: 1 }),
    ).toBeInTheDocument();
  });

  it('Hero 整链根：fetch 成功后展示 merkleRoot + leafCount', async () => {
    renderWithQueryClient(<IntegrityPage />);
    await waitFor(() => {
      expect(screen.getByTestId('hero-facts')).toBeInTheDocument();
    });
    expect(screen.getByTestId('merkle-root')).toHaveTextContent(GOLDEN_MERKLE_ROOT);
    expect(screen.getByTestId('leaf-count')).toHaveTextContent('9');
  });

  it('Live Reproof：拉取证明 + 浏览器 Web Crypto 独立重算通过（ok=true）', async () => {
    renderWithQueryClient(<IntegrityPage />);
    await waitFor(() => {
      expect(screen.getByTestId('proof-detail')).toBeInTheDocument();
    });
    expect(screen.getByTestId('siblings-list')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('verify-result')).toHaveTextContent('Inclusion proof verified');
    });
  });

  it('Tamper Theatre：篡改叶 → 根不匹配 + 篡改已检测；恢复 → 再次通过', async () => {
    renderWithQueryClient(<IntegrityPage />);
    await waitFor(() => {
      expect(screen.getByTestId('verify-result')).toHaveTextContent('Inclusion proof verified');
    });

    fireEvent.click(screen.getByTestId('tamper-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('verify-result')).toHaveTextContent('Root mismatch');
    });
    expect(screen.getByTestId('tamper-detected')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('restore-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('verify-result')).toHaveTextContent('Inclusion proof verified');
    });
  });

  it('CrossLang：默认 golden 叶对 → 浏览器 combine 与 Node/Python golden 字节相等', async () => {
    renderWithQueryClient(<IntegrityPage />);
    await waitFor(() => {
      expect(screen.getByTestId('golden-compare')).toBeInTheDocument();
    });
    expect(screen.getByTestId('golden-compare')).toHaveTextContent('Byte-equal');
  });

  it('WholeChain：浏览器从 9 叶重建整链根 === golden + golden 证明验证通过', async () => {
    renderWithQueryClient(<IntegrityPage />);
    await waitFor(() => {
      expect(screen.getByTestId('root-matches-golden')).toBeInTheDocument();
    });
    expect(screen.getByTestId('golden-proof-ok')).toBeInTheDocument();
    expect(screen.getByTestId('recomputed-root')).toHaveTextContent(GOLDEN_MERKLE_ROOT);
  });

  it('HonestyWall：诚实声明条目渲染（已知边界如实标注）', () => {
    renderWithQueryClient(<IntegrityPage />);
    expect(screen.getByTestId('honesty-wall')).toBeInTheDocument();
    expect(screen.getByTestId('honesty-wall')).toHaveTextContent('Verdict re-entry not yet implemented');
    expect(screen.getByTestId('honesty-wall')).toHaveTextContent('Known gaps remain in the cross-language numeric domain');
  });

  // 放最末：stubGlobal URL 仅本用例生效·不污染前序用例的 fetch stub。
  it('Repro Receipt：展示 merkleRoot + 下载触发 createObjectURL/revokeObjectURL', async () => {
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    // 拦截 a.click() 避免触发 jsdom 未实现的导航（download 属性下载·生产浏览器正常）。
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    renderWithQueryClient(<IntegrityPage />);
    await waitFor(() => {
      expect(screen.getByTestId('receipt-detail')).toBeInTheDocument();
    });
    expect(screen.getByTestId('receipt-merkle-root')).toHaveTextContent(GOLDEN_MERKLE_ROOT);

    fireEvent.click(screen.getByTestId('receipt-download'));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });
});
