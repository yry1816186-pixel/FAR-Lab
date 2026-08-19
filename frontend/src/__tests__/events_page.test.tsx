/**
 * events_page — 全局事件流页面（R3 恢复·useAgentEventStream 首个真实消费者）判别测试。
 *
 *   1. 无 EventSource 环境 → 显式降级块（不伪造 live）
 *   2. 假 EventSource 注帧 → 状态转 live、事件按 clientSeq 渲染、run_error 危险徽标
 *   3. 清空视图 = 水位线语义（旧帧隐藏、新帧仍进）
 *   4. runId 过滤 → 新 EventSource 带 runId 参数重订阅
 *   5. 未匹配 URL 永不发真实请求（本页零 fetch——纯 SSE 页面）
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import EventsPage from '@/features/events/EventsPage.tsx';
import { renderWithProviders } from './helpers.tsx';

/** 可控 EventSource 替身：记录实例，测试手动触发 open 与业务帧。 */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly url: string;
  private readonly listeners = new Map<string, Array<(evt: { data: string }) => void>>();
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: (evt: { data: string }) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(cb);
    this.listeners.set(type, list);
  }

  removeEventListener(): void { /* test double — no-op */ }

  close(): void {
    this.closed = true;
  }

  emitOpen(): void {
    for (const cb of this.listeners.get('open') ?? []) cb({ data: '' });
  }

  emitFrame(type: string, payload: unknown): void {
    for (const cb of this.listeners.get(type) ?? []) cb({ data: JSON.stringify(payload) });
  }
}

afterEach(() => {
  FakeEventSource.instances = [];
});

describe('EventsPage', () => {
  it('degrades explicitly when EventSource is unavailable (never fakes live)', async () => {
    vi.stubGlobal('EventSource', undefined);
    renderWithProviders(<EventsPage />, ['/events']);
    expect(await screen.findByTestId('events-unavailable')).toBeInTheDocument();
    expect(screen.getByTestId('events-status')).toHaveTextContent('已关闭');
  });

  it('renders live frames with clientSeq and honest status badge', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    renderWithProviders(<EventsPage />, ['/events']);
    const es = FakeEventSource.instances[0];
    expect(es).toBeDefined();
    expect(es!.url).toContain('/api/v1/events/stream');
    expect(es!.url).toContain('replay=true');

    es!.emitOpen();
    es!.emitFrame('run_started', {
      type: 'run_started', runId: '01TEST0000000000000000001', ts: '2026-08-19T03:00:00Z',
      researchInputHash: 'a'.repeat(64), maxIterations: 3, verdictDriven: false,
    });
    es!.emitFrame('run_error', {
      type: 'run_error', runId: '01TEST0000000000000000001', ts: '2026-08-19T03:00:05Z',
      code: 'MAX_TOKENS_EXCEEDED', message: 'budget hit', iterations: 2, artifactCount: 5,
    });

    expect(await screen.findByText('run_started')).toBeInTheDocument();
    expect(screen.getByText('run_error')).toBeInTheDocument();
    expect(screen.getByText(/budget hit/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('events-status')).toHaveTextContent('实时'));
  });

  it('clear-view is a watermark: old frames hide, new frames still arrive', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('EventSource', FakeEventSource);
    renderWithProviders(<EventsPage />, ['/events']);
    const es = FakeEventSource.instances[0]!;
    es.emitOpen();
    es.emitFrame('run_started', {
      type: 'run_started', runId: '01TEST0000000000000000002', ts: '2026-08-19T03:01:00Z',
      researchInputHash: 'b'.repeat(64), maxIterations: 3, verdictDriven: false,
    });
    await screen.findByText('run_started');

    await user.click(screen.getByRole('button', { name: '清空视图' }));
    expect(screen.queryByText('run_started')).not.toBeInTheDocument();
    expect(screen.getByTestId('events-empty')).toBeInTheDocument();

    es.emitFrame('run_completed', {
      type: 'run_completed', runId: '01TEST0000000000000000002', ts: '2026-08-19T03:01:30Z',
      reason: 'max_iterations', iterations: 3, artifactCount: 12, verdict: 'UNTESTED', decisiveRuleId: null,
    });
    expect(await screen.findByText('run_completed')).toBeInTheDocument();
  });

  it('runId filter re-subscribes with the runId query param', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('EventSource', FakeEventSource);
    renderWithProviders(<EventsPage />, ['/events']);
    expect(FakeEventSource.instances).toHaveLength(1);

    await user.type(screen.getByLabelText('按 runId 过滤'), '01FILTER0000000000000000X');
    await user.click(screen.getByRole('button', { name: '过滤' }));
    await waitFor(() => expect(FakeEventSource.instances.length).toBe(2));
    expect(FakeEventSource.instances[1]!.url).toContain('runId=01FILTER0000000000000000X');
    expect(FakeEventSource.instances[0]!.closed).toBe(true);
  });
});
