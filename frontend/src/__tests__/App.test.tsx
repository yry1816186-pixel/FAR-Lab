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
    // BrowserRouter 从 window.location 初始化,而 jsdom 的 location 跨测试持久——
    // 上一测试 pushState 导航后,本测试会从残留路径挂载。显式归位到 '/',把
    // "每测试起始路由为 /" 这一隐含契约变成明契约。
    window.history.replaceState({}, '', '/');
    // 同理:localStorage 的语言/主题偏好跨测试持久(切换语言的测试会把 zh 留给
    // 后续测试,导致英文名查询失败)。归位到 en。
    window.localStorage.removeItem('far-lang');
    document.documentElement.lang = 'en';
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

  it('桌面导航 IA：科研主流程 5 链接常驻单行，工具 12 链接折叠进 Tools 面板', async () => {
    const user = userEvent.setup();
    render(<App />);
    // 主分组常驻：工作台 · 规划 · 版本比较 · 事件 · 报告（单行容纳,不产生全局横向滚动）。
    const primary = within(screen.getByTestId('desktop-nav')).getAllByRole('link');
    expect(primary).toHaveLength(5);
    expect(primary[0]).toHaveTextContent(/^Research/);
    expect(within(screen.getByTestId('desktop-nav')).getByRole('link', { name: /Planning/ })).toBeInTheDocument();
    // 工具组折叠：面板初始关闭,Tools 按钮披露 12 个次级路由（17 个 NavLink 全保留）。
    expect(screen.queryByTestId('tools-nav-panel')).not.toBeInTheDocument();
    const toolsToggle = screen.getByTestId('tools-toggle');
    expect(toolsToggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toolsToggle);
    const panel = screen.getByTestId('tools-nav-panel');
    expect(within(panel).getAllByRole('link')).toHaveLength(12);
    expect(within(panel).getByRole('link', { name: /Overview/ })).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: /Integrity/ })).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: /Leaderboard/ })).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: /About/ })).toBeInTheDocument();
    expect(within(panel).getByText(/Trust & verification tools/)).toBeInTheDocument();
  });

  it('Tools 面板 a11y：Escape 关闭并归还焦点到 Tools 按钮', async () => {
    const user = userEvent.setup();
    render(<App />);
    const toolsToggle = screen.getByTestId('tools-toggle');
    await user.click(toolsToggle);
    const panel = screen.getByTestId('tools-nav-panel');
    expect(toolsToggle).toHaveAttribute('aria-expanded', 'true');
    // 打开后焦点进入面板首链接（与移动抽屉同契约）
    expect(within(panel).getAllByRole('link')[0]).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('tools-nav-panel')).not.toBeInTheDocument();
    expect(toolsToggle).toHaveFocus();
  });

  it('Tools 按钮在工具组路由激活时携带 aria-current（"you are here" 信号）', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId('tools-toggle'));
    await user.click(within(screen.getByTestId('tools-nav-panel')).getByRole('link', { name: /Integrity/ }));
    await waitFor(() => screen.getByTestId('integrity-page'));
    const toolsToggle = screen.getByTestId('tools-toggle');
    expect(toolsToggle).toHaveAttribute('aria-current', 'page');
  });

  it('Cmd/Ctrl+K 快速导航只暴露真实路由并支持键盘打开', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard('{Control>}k{/Control}');
    const dialog = screen.getByRole('dialog', { name: /Go to/i });
    expect(dialog).toBeInTheDocument();
    const search = within(dialog).getByPlaceholderText(/Search pages and tools/i);
    await user.type(search, 'integrity');
    expect(within(dialog).getByRole('option', { name: /Integrity/ })).toBeInTheDocument();
    await user.keyboard('{Enter}');
    await waitFor(() => screen.getByTestId('integrity-page'));
    expect(window.location.pathname).toBe('/integrity');
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

  it('/ 重定向到规范 URL /research 且导航高亮 Research（单一 canonical·审计 F3/F19）', async () => {
    render(<App />);
    await waitFor(() => screen.getByTestId('research-workbench'));
    expect(window.location.pathname).toBe('/research');
    const researchLink = within(screen.getByTestId('desktop-nav')).getByRole('link', { name: /^Research/ });
    expect(researchLink).toHaveAttribute('aria-current', 'page');
  });

  it('客户端导航后焦点移入 #main-content（换页锚点·审计 F8）', async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => screen.getByTestId('research-workbench'));
    expect(screen.getByTestId('main-content')).not.toHaveFocus();
    await user.click(within(screen.getByTestId('desktop-nav')).getByRole('link', { name: /^Planning/ }));
    await waitFor(() => expect(screen.getByTestId('main-content')).toHaveFocus());
  });

  it('中文界面 <html lang> 同步为 zh（审计 F7）', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId('language-toggle'));
    expect(document.documentElement.lang).toBe('zh');
    // zh 字典补全后导航不再混语（此前 Report/Overview 等 10 项回退英文）
    await user.click(screen.getByTestId('tools-toggle'));
    const panel = screen.getByTestId('tools-nav-panel');
    expect(within(panel).getByRole('link', { name: /仪表盘/ })).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: /完整性/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(document.documentElement.lang).toBe('zh');
  });

  it('点击"Research"导航到 /research 工作台', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByTestId('main-nav')).getByRole('link', { name: /^Research$/ }));
    await waitFor(() => screen.getByTestId('research-workbench')); // wait for the lazy-loaded route chunk
    expect(screen.getByTestId('research-workbench')).toBeInTheDocument();
  });

  /** 打开 Tools 面板并返回其容器（工具组 12 链接的查询范围）。 */
  async function openToolsPanel(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
    await user.click(screen.getByTestId('tools-toggle'));
    return screen.getByTestId('tools-nav-panel');
  }

  it('/overview 渲染 OverviewPage', async () => {
    const user = userEvent.setup();
    render(<App />);
    const panel = await openToolsPanel(user);
    await user.click(within(panel).getByRole('link', { name: /Overview/ }));
    await waitFor(() => screen.getByTestId('overview-page'));
    expect(screen.getByTestId('overview-page')).toBeInTheDocument();
  });

  it('点击"证据链"导航到 /viz', async () => {
    const user = userEvent.setup();
    render(<App />);
    const panel = await openToolsPanel(user);
    await user.click(within(panel).getByRole('link', { name: /Evidence Chain/ }));
    await waitFor(() => screen.getByTestId('viz-page')); // wait for the lazy-loaded route chunk
    expect(screen.getByTestId('viz-page')).toBeInTheDocument();
  });

  it('点击"诚信墙"导航到 /honesty', async () => {
    const user = userEvent.setup();
    render(<App />);
    const panel = await openToolsPanel(user);
    await user.click(within(panel).getByRole('link', { name: /Honesty Wall/ }));
    await waitFor(() => screen.getByTestId('honesty-page')); // wait for the lazy-loaded route chunk
    expect(screen.getByTestId('honesty-page')).toBeInTheDocument();
  });

  it('点击"完整性"导航到 /integrity', async () => {
    const user = userEvent.setup();
    render(<App />);
    const panel = await openToolsPanel(user);
    await user.click(within(panel).getByRole('link', { name: /Integrity/ }));
    await waitFor(() => screen.getByTestId('integrity-page')); // wait for the lazy-loaded route chunk
    expect(screen.getByTestId('integrity-page')).toBeInTheDocument();
  });

  it('点击"广度榜"导航到 /leaderboard', async () => {
    const user = userEvent.setup();
    render(<App />);
    const panel = await openToolsPanel(user);
    await user.click(within(panel).getByRole('link', { name: /Leaderboard/ }));
    await waitFor(() => screen.getByTestId('leaderboard-page')); // wait for the lazy-loaded route chunk
    expect(screen.getByTestId('leaderboard-page')).toBeInTheDocument();
  });

  it('点击"关于"导航到 /about', async () => {
    const user = userEvent.setup();
    render(<App />);
    const panel = await openToolsPanel(user);
    await user.click(within(panel).getByRole('link', { name: /About/ }));
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
