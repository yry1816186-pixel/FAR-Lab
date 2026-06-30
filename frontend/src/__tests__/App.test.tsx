import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';

/**
 * App 路由与导航测试。
 * App 内部已包含 QueryClientProvider + ThemeProvider + BrowserRouter，可直接渲染 <App />。
 */
describe('App 路由与导航', () => {
  beforeEach(() => {
    // 按 URL 路由 mock：/health（OverviewPage）+ 3 个 /integrity 端点（IntegrityPage）。
    // 后端契约：IntegrityRootDto.chainHeadHash 为 string|null，不可缺字段（缺字段→undefined→slice 崩溃）。
    // proof 用单叶树（siblings:[]·leaf===expectedRoot）使浏览器 verifyInclusionProof 返回 ok=true。
    const HEALTH = { status: 'ok', service: 'far-chain-api', timestamp: '2026-06-27T00:00:00Z' };
    const HEADERS = { 'Content-Type': 'application/json' };
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith('/integrity/root')) {
        return new Response(
          JSON.stringify({ merkleRoot: 'a'.repeat(64), leafCount: 1, chainHeadSeq: 1, chainHeadHash: 'b'.repeat(64) }),
          { status: 200, headers: HEADERS },
        );
      }
      if (url.includes('/integrity/proof/')) {
        return new Response(
          JSON.stringify({
            seq: 1,
            leafIndex: 0,
            leaf: 'a'.repeat(64),
            siblings: [],
            expectedRoot: 'a'.repeat(64),
            leafCount: 1,
          }),
          { status: 200, headers: HEADERS },
        );
      }
      if (url.endsWith('/integrity/receipt')) {
        return new Response(
          JSON.stringify({
            schemaVersion: 1,
            merkleRoot: 'a'.repeat(64),
            leafCount: 1,
            chainHeadSeq: 1,
            chainHeadHash: 'b'.repeat(64),
            gitCommitSha: 'c'.repeat(40),
            generatedAt: '2026-06-30T00:00:00.000Z',
          }),
          { status: 200, headers: HEADERS },
        );
      }
      if (url.endsWith('/benchmark')) {
        return new Response(
          JSON.stringify({
            schemaVersion: 1,
            generatedAt: '2026-06-29T00:00:00.000Z',
            problemCount: 0,
            entries: [],
            suiteIntegrityRoot: 'a'.repeat(64),
            totalLeaves: 0,
            verdictDistribution: {
              CONFIRMED: 0,
              REFUTED: 0,
              INCONCLUSIVE: 0,
              DEGRADED_SCOPE: 0,
              UNTESTED: 0,
            },
            domainDistribution: {},
            gitCommitSha: null,
            honestyNotes: [],
          }),
          { status: 200, headers: HEADERS },
        );
      }
      return new Response(JSON.stringify(HEALTH), { status: 200, headers: HEADERS });
    });
  });

  it('无崩溃渲染：含主导航与主内容区', () => {
    render(<App />);
    expect(screen.getByTestId('main-nav')).toBeInTheDocument();
    expect(screen.getByTestId('main-content')).toBeInTheDocument();
  });

  it('渲染 9 个导航项（含完整性信任根与广度榜入口）', () => {
    render(<App />);
    const nav = screen.getByTestId('main-nav');
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(9);
    // 使用 getByRole 验证导航链接存在（"证据链" 等标签在 sm 断点下可见）
    expect(within(nav).getByRole('link', { name: /总览/ })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /演示/ })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /完整性/ })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /广度榜/ })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /关于/ })).toBeInTheDocument();
  });

  it('渲染主题切换按钮', () => {
    render(<App />);
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
  });

  it('默认路由 / 渲染 OverviewPage', () => {
    render(<App />);
    expect(screen.getByTestId('overview-page')).toBeInTheDocument();
  });

  it('点击"证据链"导航到 /viz', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('link', { name: /证据链/ }));
    expect(screen.getByTestId('viz-page')).toBeInTheDocument();
  });

  it('点击"演示"导航到 /demo', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('link', { name: /演示/ }));
    expect(screen.getByTestId('demo-mode-page')).toBeInTheDocument();
  });

  it('点击"诚信墙"导航到 /honesty', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('link', { name: /诚信墙/ }));
    expect(screen.getByTestId('honesty-page')).toBeInTheDocument();
  });

  it('点击"完整性"导航到 /integrity', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('link', { name: /完整性/ }));
    expect(screen.getByTestId('integrity-page')).toBeInTheDocument();
  });

  it('点击"广度榜"导航到 /leaderboard', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('link', { name: /广度榜/ }));
    expect(screen.getByTestId('leaderboard-page')).toBeInTheDocument();
  });

  it('点击"关于"导航到 /about', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('link', { name: /关于/ }));
    expect(screen.getByTestId('about-page')).toBeInTheDocument();
  });

  it('点击主题切换按钮切换暗色模式', async () => {
    const user = userEvent.setup();
    render(<App />);
    const toggle = screen.getByTestId('theme-toggle');
    // 初始为 light 模式
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    await user.click(toggle);
    // 切换后应为 dark 模式
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    await user.click(toggle);
    // 再次切换回 light
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
