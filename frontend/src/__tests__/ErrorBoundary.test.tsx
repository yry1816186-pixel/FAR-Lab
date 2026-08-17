import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from '@/components/ErrorBoundary';

/**
 * ErrorBoundary 测试 — 验证未捕获渲染错误的降级与恢复。
 *
 * 覆盖：
 *   1. 无错误时正常渲染子组件
 *   2. 子组件抛错时捕获并显示 fallback（role=alert + 错误消息）
 *   3. retry 按钮重置边界，子组件恢复后重新渲染
 */

// Module-level flag lets a test flip the child from throwing to healthy, then
// exercise the retry path (which re-mounts the subtree via resetKey).
let shouldThrow = false;

function ThrowingChild() {
  if (shouldThrow) {
    throw new Error('child boom');
  }
  return <div data-testid="healthy-child">Healthy</div>;
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    shouldThrow = false;
    vi.restoreAllMocks();
  });

  it('无错误时正常渲染子组件', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('healthy-child')).toBeInTheDocument();
    expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument();
  });

  it('捕获子组件渲染错误并显示 fallback UI', () => {
    // Suppress React's expected-throw noise so the test output stays clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    shouldThrow = true;
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/child boom/)).toBeInTheDocument();
    expect(screen.getByTestId('error-boundary-retry')).toBeInTheDocument();
    expect(screen.getByTestId('error-boundary-reload')).toBeInTheDocument();
  });

  it('点击 retry 重置边界并重新渲染已恢复的子组件', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    shouldThrow = true;
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    // Flip the child to healthy, then retry — the subtree re-mounts and renders.
    shouldThrow = false;
    await user.click(screen.getByTestId('error-boundary-retry'));
    expect(screen.getByTestId('healthy-child')).toBeInTheDocument();
    expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument();
  });

  it('resetOn 变化（路由切换）清除错误并渲染新子树——单页崩溃不再冻结全部路由（审计 P0-4）', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    shouldThrow = true;
    const { rerender } = render(
      <ErrorBoundary resetOn="/crashed-page">
        <ThrowingChild />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();

    // 用户点击顶栏导航离开崩溃页：pathname 变化,子树换成健康页。
    shouldThrow = false;
    rerender(
      <ErrorBoundary resetOn="/healthy-page">
        <ThrowingChild />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('healthy-child')).toBeInTheDocument();
    expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument();
  });

  it('resetOn 不变时不重置（同路由内错误持续显示,不闪烁）', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    shouldThrow = true;
    const { rerender } = render(
      <ErrorBoundary resetOn="/same">
        <ThrowingChild />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    shouldThrow = false;
    rerender(
      <ErrorBoundary resetOn="/same">
        <ThrowingChild />
      </ErrorBoundary>,
    );
    // 路由未变:错误保持——需要显式 Try again,不会自动消失。
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
  });
});
