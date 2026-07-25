import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton 测试 — 验证占位骨架的基础类与尺寸透传。
 */
describe('Skeleton', () => {
  it('渲染带 animate-pulse + bg-muted 基础类的占位元素', () => {
    render(<Skeleton data-testid="sk" className="h-4 w-64" />);
    const el = screen.getByTestId('sk');
    expect(el.className).toContain('animate-pulse');
    expect(el.className).toContain('bg-muted');
    expect(el.className).toContain('rounded-md');
  });

  it('透传自定义尺寸类', () => {
    render(<Skeleton data-testid="sk" className="h-8 w-72" />);
    const el = screen.getByTestId('sk');
    expect(el.className).toContain('h-8');
    expect(el.className).toContain('w-72');
  });
});
