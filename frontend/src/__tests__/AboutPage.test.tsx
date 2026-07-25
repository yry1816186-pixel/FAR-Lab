import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AboutPage from '@/pages/AboutPage';

/**
 * AboutPage 测试 — 验证充实后的结构化内容渲染。
 *
 * 覆盖：根容器、使命段落、三大支柱卡片、信任边界、技术栈、诚实声明。
 */

describe('AboutPage', () => {
  it('渲染页面根容器', () => {
    render(<AboutPage />);
    expect(screen.getByTestId('about-page')).toBeInTheDocument();
  });

  it('渲染使命段落', () => {
    render(<AboutPage />);
    expect(screen.getByTestId('about-mission')).toBeInTheDocument();
  });

  it('渲染三大支柱卡片', () => {
    render(<AboutPage />);
    const pillars = screen.getAllByTestId(/about-pillar-/);
    expect(pillars).toHaveLength(3);
  });

  it('渲染信任边界卡片', () => {
    render(<AboutPage />);
    expect(screen.getByTestId('about-trust')).toBeInTheDocument();
  });

  it('渲染技术栈卡片', () => {
    render(<AboutPage />);
    expect(screen.getByTestId('about-stack')).toBeInTheDocument();
  });

  it('渲染诚实声明', () => {
    render(<AboutPage />);
    expect(screen.getByTestId('about-honesty')).toBeInTheDocument();
  });
});
