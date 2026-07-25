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
});
