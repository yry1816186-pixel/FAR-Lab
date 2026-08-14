import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

  it('渲染导航项（含完整性信任根、广度榜、法庭、竞技场、版本比较、验证向导、规划门禁入口）', () => {
    render(<App />);
    const nav = screen.getByTestId('main-nav');
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(17); // 14 原有 + research 工作台（Track-1A 主流程）
    // 使用 getByRole 验证导航链接存在（"证据链" 等标签在 sm 断点下可见）
    expect(within(nav).getByRole('link', { name: /Overview/ })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /Integrity/ })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /Leaderboard/ })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /About/ })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /Planning/ })).toBeInTheDocument();
  });

  it('导航两分组信息架构：Research 主分组在前，工具分组带小号 caption 降级', () => {
    render(<App />);
    const nav = screen.getByTestId('main-nav');
    const links = within(nav).getAllByRole('link');
    // 主分组（Research）排最前：工作台 · 规划 · 版本比较 · 事件 · 报告。
    expect(links[0]).toHaveTextContent(/^Research/);
    const labels = links.map((l) => l.textContent ?? '');
    expect(labels.indexOf('Report')).toBeLessThan(labels.indexOf('Court'));
    expect(labels.indexOf('Live Events')).toBeLessThan(labels.indexOf('Overview'));
    // 次级分组的小号 'tools' caption 存在（视觉降级·不删任何链接）。
    expect(within(nav).getAllByTestId('nav-tools-caption').length).toBeGreaterThan(0);
  });

  it('渲染主题切换按钮', () => {
    render(<App />);
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
  });

  it('默认路由 / 渲染科研工作台（research 为唯一主路径）', async () => {
    render(<App />);
    await waitFor(() => screen.getByTestId('research-workbench')); // wait for lazy chunk
    expect(screen.getByTestId('research-workbench')).toBeInTheDocument();
  });

  it('点击"Research"导航到 /research 工作台', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByTestId('main-nav')).getByRole('link', { name: /^Research$/ }));
    await waitFor(() => screen.getByTestId('research-workbench')); // wait for the lazy-loaded route chunk
    expect(screen.getByTestId('research-workbench')).toBeInTheDocument();
  });

  it('/overview 渲染 OverviewPage', async () => {
    const user = userEvent.setup();
    render(<App />);
    // R-03: OverviewPage 工作台新增同名快速入口链接,导航点击须限定在 main-nav 内,
    // 避免 getByRole 因多个同名链接抛 "multiple elements"。
    await user.click(within(screen.getByTestId('main-nav')).getByRole('link', { name: /Overview/ }));
    await waitFor(() => screen.getByTestId('overview-page'));
    expect(screen.getByTestId('overview-page')).toBeInTheDocument();
  });

  it('点击"证据链"导航到 /viz', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByTestId('main-nav')).getByRole('link', { name: /Evidence Chain/ }));
    await waitFor(() => screen.getByTestId('viz-page')); // wait for the lazy-loaded route chunk
    expect(screen.getByTestId('viz-page')).toBeInTheDocument();
  });

  it('点击"诚信墙"导航到 /honesty', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByTestId('main-nav')).getByRole('link', { name: /Honesty Wall/ }));
    await waitFor(() => screen.getByTestId('honesty-page')); // wait for the lazy-loaded route chunk
    expect(screen.getByTestId('honesty-page')).toBeInTheDocument();
  });

  it('点击"完整性"导航到 /integrity', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByTestId('main-nav')).getByRole('link', { name: /Integrity/ }));
    await waitFor(() => screen.getByTestId('integrity-page')); // wait for the lazy-loaded route chunk
    expect(screen.getByTestId('integrity-page')).toBeInTheDocument();
  });

  it('点击"广度榜"导航到 /leaderboard', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByTestId('main-nav')).getByRole('link', { name: /Leaderboard/ }));
    await waitFor(() => screen.getByTestId('leaderboard-page')); // wait for the lazy-loaded route chunk
    expect(screen.getByTestId('leaderboard-page')).toBeInTheDocument();
  });

  it('点击"关于"导航到 /about', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByTestId('main-nav')).getByRole('link', { name: /About/ }));
    await waitFor(() => screen.getByTestId('about-page')); // wait for the lazy-loaded route chunk
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

  it('移动菜单按钮展开/收起移动导航抽屉', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.queryByTestId('mobile-nav')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('mobile-menu-toggle'));
    expect(screen.getByTestId('mobile-nav')).toBeInTheDocument();
    const mobileNav = screen.getByTestId('mobile-nav');
    expect(within(mobileNav).getAllByRole('link')).toHaveLength(17);
    await user.click(screen.getByTestId('mobile-menu-toggle'));
    expect(screen.queryByTestId('mobile-nav')).not.toBeInTheDocument();
  });

  it('移动抽屉中点击导航后自动关闭', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId('mobile-menu-toggle'));
    expect(screen.getByTestId('mobile-nav')).toBeInTheDocument();
    await user.click(within(screen.getByTestId('mobile-nav')).getByRole('link', { name: /Integrity/ }));
    expect(screen.queryByTestId('mobile-nav')).not.toBeInTheDocument();
    await waitFor(() => screen.getByTestId('integrity-page'));
    expect(screen.getByTestId('integrity-page')).toBeInTheDocument();
  });

  it('按 Escape 键关闭移动抽屉并恢复焦点到 toggle 按钮', async () => {
    const user = userEvent.setup();
    render(<App />);
    const toggle = screen.getByTestId('mobile-menu-toggle');
    await user.click(toggle);
    expect(screen.getByTestId('mobile-nav')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('mobile-nav')).not.toBeInTheDocument();
    // a11y: focus restores to the toggle button so the keyboard user isn't stranded
    expect(toggle).toHaveFocus();
  });

  it('打开抽屉时焦点自动移入菜单第一个链接', async () => {
    const user = userEvent.setup();
    render(<App />);
    const toggle = screen.getByTestId('mobile-menu-toggle');
    await user.click(toggle);
    const mobileNav = screen.getByTestId('mobile-nav');
    const firstLink = within(mobileNav).getAllByRole('link')[0];
    expect(firstLink).toHaveFocus();
  });

  it('渲染 skip-to-content 链接(键盘用户可跳过主导航)', () => {
    render(<App />);
    const skip = screen.getByTestId('skip-to-content');
    expect(skip).toBeInTheDocument();
    expect(skip).toHaveAttribute('href', '#main-content');
  });

  it('主内容区有可聚焦锡点(id=main-content, tabindex=-1)', () => {
    render(<App />);
    const main = screen.getByTestId('main-content');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(main).toHaveAttribute('tabindex', '-1');
  });
});
