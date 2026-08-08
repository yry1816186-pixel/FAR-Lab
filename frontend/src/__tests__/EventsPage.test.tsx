// frontend/src/__tests__/EventsPage.test.tsx
// 测 EventsPage：mock EventSource（SSE）→ 渲染实时事件流 + 连接状态 + 过滤/暂停/清空控件。

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import EventsPage from '@/pages/EventsPage';

interface FakeEventSource {
  listeners: Record<string, Array<(evt: { data: string }) => void>>;
  close: Mock;
  addEventListener: Mock;
  removeEventListener: Mock;
}

function installEventSourceMock(): FakeEventSource {
  const fake: FakeEventSource = {
    listeners: {},
    close: vi.fn(),
    addEventListener: vi.fn((type: string, cb: (evt: { data: string }) => void) => {
      const arr = fake.listeners[type] ?? [];
      arr.push(cb);
      fake.listeners[type] = arr;
    }),
    removeEventListener: vi.fn(),
  };
  const Ctor = vi.fn().mockImplementation(() => fake);
  vi.stubGlobal('EventSource', Ctor);
  return fake;
}

function emit(fake: FakeEventSource, type: string, data: unknown) {
  act(() => {
    const handlers = fake.listeners[type] ?? [];
    for (const h of handlers) {
      h({ data: JSON.stringify(data) });
    }
  });
}

describe('EventsPage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('空状态：无事件时展示 empty 提示 + connecting 徽章', () => {
    installEventSourceMock();
    render(<EventsPage />);
    expect(screen.getByTestId('conn-connecting')).toBeInTheDocument();
    expect(screen.getByTestId('events-empty')).toBeInTheDocument();
  });

  it('收到 run_started + stage_started 后渲染事件行并切换 live', () => {
    const fake = installEventSourceMock();
    render(<EventsPage />);

    emit(fake, 'run_started', {
      type: 'run_started',
      runId: 'run-abc-123',
      ts: '2026-08-07T10:00:01.000Z',
      researchInputHash: 'a'.repeat(64),
      maxIterations: 3,
      verdictDriven: true,
    });
    emit(fake, 'stage_started', {
      type: 'stage_started',
      runId: 'run-abc-123',
      iteration: 1,
      stageId: 'stage1_understanding',
      ts: '2026-08-07T10:00:02.000Z',
    });

    expect(screen.getByTestId('conn-live')).toBeInTheDocument();
    expect(screen.getByTestId('evt-run_started')).toBeInTheDocument();
    expect(screen.getByTestId('evt-stage_started')).toBeInTheDocument();
    expect(screen.getByTestId('events-count')).toHaveTextContent('2 events');
    // runId 过滤器输入框存在
    expect(screen.getByTestId('events-runid-input')).toBeInTheDocument();
  });

  it('iteration_completed 带 verdict 时渲染 VerdictBadge', () => {
    const fake = installEventSourceMock();
    render(<EventsPage />);

    emit(fake, 'iteration_completed', {
      type: 'iteration_completed',
      runId: 'run-abc-123',
      iteration: 2,
      tokensConsumed: 1234,
      continueIteration: true,
      verdict: 'INCONCLUSIVE',
      decisiveRuleId: 'R4_SCOPE_MISMATCH_NONCRITICAL',
      ts: '2026-08-07T10:00:03.000Z',
    });

    expect(screen.getByTestId('evt-iteration_completed')).toBeInTheDocument();
    expect(screen.getByTestId('verdict-badge-inconclusive')).toBeInTheDocument();
  });

  it('clear 按钮清空事件列表', () => {
    const fake = installEventSourceMock();
    render(<EventsPage />);

    emit(fake, 'stage_held', {
      type: 'stage_held',
      runId: 'run-abc-123',
      iteration: 1,
      stageId: 'stage2_integration',
      ts: '2026-08-07T10:00:04.000Z',
    });
    expect(screen.getByTestId('evt-stage_held')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('events-clear-button'));
    expect(screen.queryByTestId('evt-stage_held')).not.toBeInTheDocument();
    expect(screen.getByTestId('events-empty')).toBeInTheDocument();
  });

  it('组件卸载时关闭 EventSource', () => {
    const fake = installEventSourceMock();
    const { unmount } = render(<EventsPage />);
    unmount();
    expect(fake.close).toHaveBeenCalledTimes(1);
  });
});
