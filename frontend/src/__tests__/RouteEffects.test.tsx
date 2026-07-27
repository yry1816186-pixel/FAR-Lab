import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RouteEffects } from '@/components/RouteEffects';

/**
 * RouteEffects 测试 — 路由级副作用（document.title + scroll-to-top）。
 *
 * 覆盖：
 *   1. 已知路由 → 对应 segment title
 *   2. 首页 → Overview title
 *   3. 未知路由 → 完整基础 title 回退
 *   4. 每次 pathname 变化调用 window.scrollTo(0, 0)
 */

const FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]} future={FUTURE}>
      <RouteEffects />
      <Routes>
        <Route path="*" element={<div>page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RouteEffects', () => {
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

  it('首页 / 设置 Overview 标题', () => {
    renderAt('/');
    expect(document.title).toBe('Overview · FAR-Lab');
  });

  it('未知路由回退到完整基础标题', () => {
    renderAt('/some/unknown/path');
    expect(document.title).toBe('FAR-Lab · Falsifiable · Auditable · Reproducible');
  });

  it('每次渲染调用 window.scrollTo(0, 0) 回到顶部', () => {
    const spy = vi.spyOn(window, 'scrollTo');
    renderAt('/viz');
    expect(spy).toHaveBeenCalledWith(0, 0);
    spy.mockRestore();
  });
});
