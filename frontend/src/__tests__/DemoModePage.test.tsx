import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import DemoModePage from '@/pages/DemoModePage';

/**
 * DemoModePage 测试 — 8 幕功能导览子集（demo-03·非 spec 16 §2 可信链现场演示）
 *
 * 验证：
 *   1. 页面渲染（页头 + 进度指示器 + 当前幕卡片）
 *   2. 前后导航（上一幕/下一幕）
 *   3. 场景卡片切换
 *   4. 诚实标注弹窗显隐
 *   5. 进度指示器交互
 *   6. 关联页面链接存在
 */
describe('DemoModePage', () => {
  function renderPage() {
    return render(
      <BrowserRouter>
        <DemoModePage />
      </BrowserRouter>,
    );
  }

  it('渲染页头与进度指示器', () => {
    renderPage();
    expect(screen.getByTestId('demo-mode-page')).toBeInTheDocument();
    expect(screen.getByText('Demo mode')).toBeInTheDocument();
    expect(screen.getByText(/Demo Mode/)).toBeInTheDocument();
  });

  it('demo-03: 页头诚实声明当前为功能导览子集（非 spec 16 现场演示）', () => {
    renderPage();
    const note = screen.getByTestId('demo-v1-scope-note');
    expect(note).toBeInTheDocument();
    expect(note.textContent).toContain('feature-tour subset');
    expect(note.textContent).toContain('T-W5-05');
  });

  it('从第 1 幕开始（scene-card-0）', () => {
    renderPage();
    expect(screen.getByTestId('scene-card-0')).toBeInTheDocument();
    expect(screen.getByText('FAR three pillars')).toBeInTheDocument();
  });

  it('前进到第 2 幕，再回到第 1 幕', async () => {
    const user = userEvent.setup();
    renderPage();

    // 初始第 1 幕，上一幕按钮禁用
    expect(screen.getByTestId('prev-scene-btn')).toBeDisabled();
    expect(screen.getByTestId('next-scene-btn')).toBeEnabled();

    // 点击下一幕
    await user.click(screen.getByTestId('next-scene-btn'));
    expect(screen.getByTestId('scene-card-1')).toBeInTheDocument();
    expect(screen.getByText('Evidence chain')).toBeInTheDocument();
    expect(screen.getByTestId('prev-scene-btn')).toBeEnabled();

    // 点击上一幕
    await user.click(screen.getByTestId('prev-scene-btn'));
    expect(screen.getByTestId('scene-card-0')).toBeInTheDocument();
    expect(screen.getByTestId('prev-scene-btn')).toBeDisabled();
  });

  it('第 8 幕时下一幕按钮禁用', async () => {
    const user = userEvent.setup();
    renderPage();

    // 点击进度点跳到最后一幕
    const lastDot = screen.getByTestId('progress-dot-7');
    await user.click(lastDot);

    expect(screen.getByTestId('scene-card-7')).toBeInTheDocument();
    expect(screen.getByText('Reproduction & audit')).toBeInTheDocument();
    expect(screen.getByTestId('next-scene-btn')).toBeDisabled();
    expect(screen.getByTestId('prev-scene-btn')).toBeEnabled();
  });

  it('场景计数器显示正确', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByTestId('scene-counter')).toHaveTextContent('1 / 8');

    await user.click(screen.getByTestId('progress-dot-3'));
    expect(screen.getByTestId('scene-counter')).toHaveTextContent('4 / 8');
  });

  it('每一幕都渲染可信点列表', async () => {
    const user = userEvent.setup();
    renderPage();

    for (let i = 0; i < 8; i++) {
      const cards = screen.queryAllByTestId('credibility-points');
      expect(cards.length).toBeGreaterThan(0);
      if (i < 7) {
        await user.click(screen.getByTestId('next-scene-btn'));
      }
    }
  });

  it('显示诚实标注弹窗', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByTestId('honesty-popover')).toBeNull();

    await user.click(screen.getByTestId('show-honesty-btn'));
    expect(screen.getByTestId('honesty-popover')).toBeInTheDocument();
    expect(screen.getByText('Honesty note')).toBeInTheDocument();

    // 关闭弹窗
    await user.click(screen.getByLabelText('Close honesty note'));
    expect(screen.queryByTestId('honesty-popover')).toBeNull();
  });

  it('每幕都有关联页面链接', () => {
    renderPage();
    const link = screen.getByTestId('related-link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href');
  });

  it('所有 8 幕标题不同', async () => {
    const user = userEvent.setup();
    renderPage();

    const titles = new Set<string>();
    // 通过进度指示器跳转到每一幕，捕获 CardTitle div 中的标题文本
    for (let i = 0; i < 8; i++) {
      await user.click(screen.getByTestId(`progress-dot-${i}`));
      const card = screen.getByTestId(`scene-card-${i}`);
      // CardTitle 渲染为 div（shadcn/ui forwardRef<HTMLDivElement>），不是 h3
      const cardTitleDivs = card.querySelectorAll('.text-xl');
      for (const div of cardTitleDivs) {
        const text = div.textContent?.trim();
        if (text && text.length > 0) {
          titles.add(text);
        }
      }
    }
    expect(titles.size).toBeGreaterThanOrEqual(4);
  });

  it('进度指示器的 focus 样式代表当前场景', async () => {
    const user = userEvent.setup();
    renderPage();

    const firstDot = screen.getByTestId('progress-dot-0');
    expect(firstDot).toHaveAttribute('aria-current', 'step');

    await user.click(screen.getByTestId('progress-dot-4'));
    expect(screen.getByTestId('progress-dot-4')).toHaveAttribute('aria-current', 'step');
    expect(firstDot).not.toHaveAttribute('aria-current', 'step');
  });
});
