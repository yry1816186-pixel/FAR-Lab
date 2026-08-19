/**
 * route_effects — 路由级副作用（document.title + scroll + focus 管理）的判别性测试。
 *
 * 覆盖（v2 恢复版·手法移植自 805592e 树旧测试）：
 *   1. 已知路由（含参数化子树 /missions/:id 与 /receipts/:id）→ 对应分段 title
 *   2. 未知路由 → 完整基础 title 回退（WCAG 2.4.2 每页有标题）
 *   3. PUSH 导航 → scrollTo(0, 0) 回顶
 *   4. 初始加载不挪焦点（保持浏览器原生行为）
 *   5. nav 链接触发的客户端导航 → 焦点移入 #main-content（键盘/SR 换页锚点）
 *   6. 迟到的懒加载解析不抢焦点（同 pathname 效应重跑幂等）
 *   7. POP（后退/前进）→ 恢复记忆的滚动位置而非无条件回顶
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RouteEffects } from '@/app/RouteEffects.tsx';
import { I18nProvider } from '@/shared/i18n/index.tsx';

function renderAt(path: string) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <RouteEffects />
        <Routes>
          <Route path="*" element={<div>page</div>} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

afterEach(() => {
  document.title = '';
});

describe('RouteEffects — document.title（NAV 单一派生源）', () => {
  // jsdom 的 scrollTo 未实现会打日志；标题用例不关心滚动，统一置哑。
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  it.each([
    ['/', '首页'],
    ['/missions', '研究任务'],
    ['/missions/01M0B3C0TG/execution', '研究任务'],
    ['/assay', '断言检验'],
    ['/verify', '验证'],
    ['/receipts/rcpt-1', '已保存收据'],
    ['/evidence', '证据'],
    ['/benchmark', '基准'],
    ['/about', '关于'],
  ])('已知路由 %s → %s · FAR-Lab', (path, segment) => {
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
    vi.restoreAllMocks();
  });

  it('PUSH 导航调用 window.scrollTo(0, 0) 回到顶部', () => {
    const spy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    renderAt('/missions');
    expect(spy).toHaveBeenCalledWith(0, 0);
  });

  it('初始加载不挪动焦点（无 main-content 抢焦）', () => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/missions']}>
          <RouteEffects />
          <main id="main-content" tabIndex={-1} />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(document.getElementById('main-content')).not.toHaveFocus();
  });

  it('nav 链接触发的导航把焦点移入 #main-content（键盘/SR 换页锚点）', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/a']}>
          <RouteEffects />
          <nav>
            <Link to="/b">go-b</Link>
          </nav>
          <Routes>
            <Route path="*" element={<main id="main-content" tabIndex={-1} />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(document.getElementById('main-content')).not.toHaveFocus();
    await user.click(screen.getByRole('link', { name: 'go-b' }));
    await waitFor(() => expect(document.getElementById('main-content')).toHaveFocus());
  });

  it('迟到的懒加载解析不抢走用户当前焦点（焦点仅随 nav 链接触发移动）', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/a']}>
          <RouteEffects />
          <nav>
            <Link to="/b">go-b</Link>
          </nav>
          <main id="main-content" tabIndex={-1} />
          <Routes>
            <Route path="*" element={<div>page</div>} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
    await user.click(screen.getByRole('link', { name: 'go-b' }));
    await waitFor(() => expect(document.getElementById('main-content')).toHaveFocus());
    // 用户随后聚焦了别的控件；同 pathname 的效应重跑不得再抢焦点。
    const outside = document.createElement('button');
    outside.textContent = 'later-control';
    document.body.appendChild(outside);
    outside.focus();
    expect(outside).toHaveFocus();
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

    /** MemoryRouter 用内存 history，window.history.back() 不生效——经 useNavigate 驱动 POP。 */
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
      <I18nProvider>
        <MemoryRouter initialEntries={['/a']}>
          <RouteEffects />
          <NavHarness />
          <Routes>
            <Route path="*" element={<div>page</div>} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
    // 用户在 /a 滚动到 120px：
    scrollY = 120;
    window.dispatchEvent(new Event('scroll'));

    // PUSH 到 /b（回顶），再在 /b 滚动到 432px：
    await user.click(screen.getByRole('link', { name: 'go-b' }));
    scrollY = 432;
    window.dispatchEvent(new Event('scroll'));

    // POP 后退到 /a：恢复记忆的 120（而非无条件回顶的 0）。
    await user.click(screen.getByRole('button', { name: 'back' }));
    await waitFor(() => expect(scrollToSpy).toHaveBeenCalledWith(0, 120));

    // POP 前进回 /b：恢复记忆的 432 —— 与「无条件回顶」的判别性断言。
    await user.click(screen.getByRole('button', { name: 'forward' }));
    await waitFor(() => expect(scrollToSpy).toHaveBeenCalledWith(0, 432));
  });
});
