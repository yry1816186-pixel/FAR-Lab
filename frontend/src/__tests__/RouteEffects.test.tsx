import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { RouteEffects } from '@/components/RouteEffects';

/**
 * RouteEffects 测试 — 路由级副作用（document.title + scroll + focus 管理）。
 *
 * 覆盖：
 *   1. 全部已知路由（含 primary 组新成员）→ 对应 segment title
 *   2. 未知路由 → 完整基础 title 回退
 *   3. PUSH 导航 → scrollTo(0, 0) 回顶 + 焦点移入 #main-content
 *   4. 初始加载不挪焦点（保持浏览器原生行为）
 *   5. POP 导航（浏览器后退/前进）→ 恢复记忆的滚动位置
 */

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RouteEffects />
      <Routes>
        <Route path="*" element={<div>page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RouteEffects — document.title（单一 NAV 派生源）', () => {
  afterEach(() => {
    document.title = '';
  });

  it('已知路由 /viz 设置 Evidence Chain 标题', () => {
    renderAt('/viz');
    expect(document.title).toBe('Evidence Chain · FAR-Lab');
  });

  it('已知路由 /integrity 设置 Integrity 标题', () => {
    renderAt('/integrity');
    expect(document.title).toBe('Integrity · FAR-Lab');
  });

  it('首页 /（科研工作台）设置 Research 标题', () => {
    renderAt('/');
    expect(document.title).toBe('Research · FAR-Lab');
  });

  it.each([
    ['/planning', 'Planning'],
    ['/versions', 'Versions'],
    ['/events', 'Live Events'],
    ['/overview', 'Overview'],
    ['/wizard', 'Wizard'],
    ['/v2-receipt', 'V2 Receipt'],
    ['/audit', 'Audit Trace'],
  ])('此前缺 title 的路由 %s → %s 标题（审计 F4 修复）', (path, segment) => {
    renderAt(path);
    expect(document.title).toBe(`${segment} · FAR-Lab`);
  });

  it('未知路由回退到完整基础标题', () => {
    renderAt('/some/unknown/path');
    expect(document.title).toBe('FAR-Lab · Falsifiable · Auditable · Reproducible');
  });
});

describe('RouteEffects — 滚动与焦点管理', () => {
  afterEach(() => {
    document.title = '';
    vi.restoreAllMocks();
  });

  it('PUSH 导航调用 window.scrollTo(0, 0) 回到顶部', () => {
    const spy = vi.spyOn(window, 'scrollTo');
    renderAt('/viz');
    expect(spy).toHaveBeenCalledWith(0, 0);
  });

  it('初始加载不挪动焦点（无 main-content 抢焦）', () => {
    render(
      <MemoryRouter initialEntries={['/viz']}>
        <RouteEffects />
        <main id="main-content" tabIndex={-1} />
      </MemoryRouter>,
    );
    expect(document.getElementById('main-content')).not.toHaveFocus();
  });

  it('客户端导航后焦点移入 #main-content（键盘/SR 换页锚点·由 nav 链接触发）', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/a']}>
        <RouteEffects />
        <nav>
          <Link to="/b">go-b</Link>
        </nav>
        <Routes>
          <Route path="*" element={<main id="main-content" tabIndex={-1} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(document.getElementById('main-content')).not.toHaveFocus();
    await user.click(screen.getByRole('link', { name: 'go-b' }));
    await waitFor(() => expect(document.getElementById('main-content')).toHaveFocus());
  });

  it('迟到的懒加载路由解析不抢走用户当前焦点（审计 F8 边界:焦点仅随 nav 链接触发移动）', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/a']}>
        <RouteEffects />
        <nav>
          <Link to="/b">go-b</Link>
        </nav>
        <main id="main-content" tabIndex={-1} />
        <Routes>
          <Route path="*" element={<div>page</div>} />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('link', { name: 'go-b' }));
    await waitFor(() => expect(document.getElementById('main-content')).toHaveFocus());
    // 用户随后聚焦了别的控件(如面板开关),同 pathname 的效应重跑不得再抢焦点。
    const outside = document.createElement('button');
    outside.textContent = 'later-control';
    document.body.appendChild(outside);
    outside.focus();
    expect(outside).toHaveFocus();
    // 模拟效应因 chunk 解析重跑(同 pathname): dispatch popstate 触发 re-render 而非新导航。
    window.dispatchEvent(new PopStateEvent('popstate'));
    await new Promise((r) => setTimeout(r, 50));
    expect(outside).toHaveFocus();
    outside.remove();
  });

  it('浏览器后退/前进（POP）恢复记忆的滚动位置而非无条件回顶', async () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    // jsdom 的 scrollY 恒 0 —— getter 注入让滚动记忆能记下非零位置。
    let scrollY = 0;
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY });

    /** MemoryRouter 用内存 history,window.history.back() 不生效——经 useNavigate 驱动 POP。 */
    function NavHarness() {
      const navigate = useNavigate();
      return (
        <>
          <nav><Link to="/b">go-b</Link></nav>
          <button type="button" onClick={() => navigate(-1)}>back</button>
          <button type="button" onClick={() => navigate(1)}>forward</button>
        </>
      );
    }

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/a']}>
        <RouteEffects />
        <NavHarness />
        <Routes>
          <Route path="*" element={<div>page</div>} />
        </Routes>
      </MemoryRouter>,
    );
    // 用户在 /a 滚动到 120px:
    scrollY = 120;
    window.dispatchEvent(new Event('scroll'));

    // PUSH 到 /b（回顶）,再在 /b 滚动到 432px:
    await user.click(screen.getByRole('link', { name: 'go-b' }));
    scrollY = 432;
    window.dispatchEvent(new Event('scroll'));

    // POP 后退到 /a：恢复记忆的 120（而非无条件回顶的 0）。
    await user.click(screen.getByRole('button', { name: 'back' }));
    await waitFor(() => expect(scrollToSpy).toHaveBeenCalledWith(0, 120));

    // POP 前进回 /b：恢复记忆的 432 —— 与"无条件回顶"的判别性断言。
    await user.click(screen.getByRole('button', { name: 'forward' }));
    await waitFor(() => expect(scrollToSpy).toHaveBeenCalledWith(0, 432));
  });
});
