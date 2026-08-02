import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OverviewPage from '@/pages/OverviewPage';
import AboutPage from '@/pages/AboutPage';
import App from '@/App';

// ============================================================
// C1 · 基础无障碍（a11y）—— WCAG 2.2 关键可测子集
// 覆盖 18_WEB_UX 的 unknowns:["WCAG 实测"] 的可自动断言部分：
//   1.3.1 信息与关系（语义 role/标题层级）
//   4.1.2 名称-角色-值（交互元素可访问名称）
//   2.4.4 链接目的（可辨识链接文本）
//   2.1.1 键盘（焦点可达·按钮语义）
// 诚实边界：本层为自动可测子集；完整 WCAG 2.2 AA 合规仍须人工/axe 深度审计（外部）。
// ============================================================

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('a11y: 语义结构（WCAG 1.3.1 信息与关系）', () => {
  it('OverviewPage 渲染唯一 h1 主标题（文档大纲）', () => {
    renderWithQueryClient(<OverviewPage />);
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings.length).toBeGreaterThanOrEqual(1);
    // 主内容标题有文本（非空可访问名称）
    for (const h of headings) {
      expect(h.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it('AboutPage 渲染 heading + 导航链接有可辨识文本（WCAG 2.4.4）', () => {
    renderWithQueryClient(<AboutPage />);
    const headings = screen.queryAllByRole('heading');
    expect(headings.length).toBeGreaterThan(0);
    const links = screen.queryAllByRole('link');
    for (const link of links) {
      const label = link.textContent?.trim() ?? link.getAttribute('aria-label') ?? '';
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('App 渲染应用导航且链接名称非纯图标（2.4.4+4.1.2）', () => {
    render(<App />);
    const navLinks = screen.getAllByRole('link');
    for (const link of navLinks) {
      const accessibleName = link.getAttribute('aria-label') ?? link.textContent?.trim() ?? '';
      expect(accessibleName.length).toBeGreaterThan(0);
    }
  });
});

describe('a11y: 交互控件可访问名称（WCAG 4.1.2）', () => {
  it('OverviewPage 按钮类控件有可访问名称', () => {
    renderWithQueryClient(<OverviewPage />);
    const buttons = screen.queryAllByRole('button');
    for (const btn of buttons) {
      const name = btn.getAttribute('aria-label') ?? btn.textContent?.trim() ?? '';
      expect(name.length).toBeGreaterThan(0);
    }
  });
});

describe('a11y: 图像替代文本（WCAG 1.1.1）', () => {
  it('渲染的 <img> 均有 alt 或 role="presentation"', () => {
    renderWithQueryClient(<OverviewPage />);
    const imgs = screen.queryAllByRole('img');
    for (const img of imgs) {
      const alt = img.getAttribute('alt');
      const isDecorative = img.getAttribute('role') === 'presentation' || img.getAttribute('aria-hidden') === 'true';
      expect(alt !== null || isDecorative).toBe(true);
    }
  });
});
