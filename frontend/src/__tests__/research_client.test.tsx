/**
 * research_client.test.tsx —— Track-1A 异步研究客户端（202 契约）单测。
 *
 * 覆盖：
 *   - useStartResearch：202 信封 → {runId, statusUrl, eventsUrl}（不含冻结 run）
 *   - useResearchRuns：GET /research 列表
 *   - useResearchStatus：非终态按 1.5s 轮询；终态后停止轮询（refetchInterval 返回 false）
 *   - useCancelResearch：POST cancel → 响应形状 + 请求 URL
 *   - subscribeResearchEvents：EventSource 接线（URL / state+research 帧 / 畸形帧忽略 / 退订 close）
 *   - 无原生 EventSource 时：onError 一次 + no-op 退订（诚实降级·轮询兜底）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  isTerminalRunState,
  subscribeResearchEvents,
  useCancelResearch,
  useResearchRuns,
  useResearchStatus,
  useStartResearch,
  type ResearchStatusDto,
  type ResearchStreamFrame,
  type StartResearchAcceptedDto,
} from '@/lib/research_client';

// ---------- fixtures ----------

const RUN_ID = 'run-client-1';
const HEADERS = { 'Content-Type': 'application/json' };

const ACCEPTED: StartResearchAcceptedDto = {
  runId: RUN_ID,
  state: 'CREATED',
  statusUrl: `/api/v1/research/${RUN_ID}/status`,
  eventsUrl: `/api/v1/research/${RUN_ID}/events`,
};

function statusDto(state: ResearchStatusDto['state']): ResearchStatusDto {
  return {
    runId: RUN_ID,
    question: 'Does stellar activity inflate hot Jupiter radii?',
    profile: 'offline_replay',
    state,
    completedStages: state === 'COMPLETED' ? ['validate_question'] : [],
    remainingStages: state === 'COMPLETED' ? [] : ['validate_question', 'retrieve_literature'],
    startedAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:01.000Z',
    completedAt: state === 'COMPLETED' ? '2026-08-14T00:00:30.000Z' : null,
    error: null,
    errorKind: null,
    runReady: state === 'COMPLETED',
  };
}

function v1(body: unknown, status = 200): Response {
  return new Response(JSON.stringify({ ok: true, data: body }), { status, headers: HEADERS });
}

function wrapper(): (props: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function W({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

// ---------- 可控 EventSource 假实现 ----------

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, Array<(evt: { data: string }) => void>>();
  closed = false;
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, listener: (evt: { data: string }) => void): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(listener);
    this.listeners.set(type, arr);
  }
  removeEventListener(type: string, listener: (evt: { data: string }) => void): void {
    const arr = this.listeners.get(type) ?? [];
    this.listeners.set(type, arr.filter((l) => l !== listener));
  }
  close(): void {
    this.closed = true;
  }
  dispatch(type: string, data: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data });
    }
  }
}

describe('research_client（异步 202 契约）', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('isTerminalRunState：COMPLETED/FAILED/CANCELLED 为终态', () => {
    expect(isTerminalRunState('CREATED')).toBe(false);
    expect(isTerminalRunState('RETRIEVING')).toBe(false);
    expect(isTerminalRunState('PLANNING')).toBe(false);
    expect(isTerminalRunState('COMPLETED')).toBe(true);
    expect(isTerminalRunState('FAILED')).toBe(true);
    expect(isTerminalRunState('CANCELLED')).toBe(true);
  });

  it('useStartResearch：POST /research → 202 信封返回运行句柄（runId + 两个 URL）', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(v1(ACCEPTED, 202));

    const { result } = renderHook(() => useStartResearch(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ question: 'q?', profile: 'offline_replay' });
    });
    // react-query v5：mutateAsync resolve 后 hook 的 data 状态需一次 re-render 才可见。
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.runId).toBe(RUN_ID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] as [RequestInfo, RequestInit | undefined];
    // 默认相对基址（same-origin）：POST 同源 /api/v1/research（dev 走 vite proxy）。
    expect(input.toString()).toBe('/api/v1/research');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ question: 'q?', profile: 'offline_replay' });
  });

  it('useStartResearch：profile 只发 auto/offline_replay（auto 为 live 解析·后端契约）', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(v1(ACCEPTED, 202));

    const { result } = renderHook(() => useStartResearch(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ question: 'q?', profile: 'auto' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, init] = fetchMock.mock.calls[0] as [RequestInfo, RequestInit | undefined];
    expect(JSON.parse(String(init?.body))).toEqual({ question: 'q?', profile: 'auto' });
  });

  it('useResearchRuns：GET /research → runs 列表', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      v1({ runs: [{ runId: RUN_ID, question: 'q?', state: 'COMPLETED', startedAt: 't0', updatedAt: 't1', error: null }] }),
    );
    const { result } = renderHook(() => useResearchRuns(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.runs).toHaveLength(1);
    expect(result.current.data?.runs[0]?.state).toBe('COMPLETED');
  });

  it('useResearchStatus：非终态持续轮询（1.5s 间隔产生第二次请求）', async () => {
    let statusCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      if (input.toString().includes('/status')) {
        statusCalls += 1;
        return v1(statusDto('RETRIEVING'));
      }
      throw new Error(`unexpected fetch ${input.toString()}`);
    });

    const { result } = renderHook(() => useResearchStatus(RUN_ID, true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data?.state).toBe('RETRIEVING'));
    expect(statusCalls).toBe(1);

    // 轮询间隔由 TanStack 内部计时器驱动（无注入点），等待第二次轮询到达。
    await waitFor(() => expect(statusCalls).toBeGreaterThanOrEqual(2), { timeout: 4000 });
  });

  it('useResearchStatus：终态后停止轮询（不再发出后续请求）', async () => {
    let statusCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      if (input.toString().includes('/status')) {
        statusCalls += 1;
        return v1(statusDto('COMPLETED'));
      }
      throw new Error(`unexpected fetch ${input.toString()}`);
    });

    const { result } = renderHook(() => useResearchStatus(RUN_ID, true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data?.state).toBe('COMPLETED'));
    expect(statusCalls).toBe(1);

    // 若轮询未停止，下一个 1.5s 周期会发出第二次 /status 请求。
    // 此处的等待即被测条件本身（TanStack refetchInterval 内部计时器不可注入），故用真实时钟。
    await new Promise((resolve) => setTimeout(resolve, 1900));
    expect(statusCalls).toBe(1);
  });

  it('useResearchStatus：enabled=false 时不发请求', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    renderHook(() => useResearchStatus(RUN_ID, false), { wrapper: wrapper() });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('useCancelResearch：POST /research/:runId/cancel → {runId, cancelled, state}', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(v1({ runId: RUN_ID, cancelled: true, state: 'CANCELLED' }));

    const { result } = renderHook(() => useCancelResearch(RUN_ID), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync();
    });
    // react-query v5：mutateAsync resolve 后 hook 的 data 状态需一次 re-render 才可见。
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ runId: RUN_ID, cancelled: true, state: 'CANCELLED' });
    const [input, init] = fetchMock.mock.calls[0] as [RequestInfo, RequestInit | undefined];
    expect(input.toString()).toBe(`/api/v1/research/${RUN_ID}/cancel`);
    expect(init?.method).toBe('POST');
  });

  describe('subscribeResearchEvents（SSE 接线）', () => {
    it('连接 eventsUrl · state/research 帧解码 · 畸形帧忽略 · 退订 close', () => {
      vi.stubGlobal('EventSource', FakeEventSource);
      const frames: ResearchStreamFrame[] = [];

      const unsubscribe = subscribeResearchEvents(RUN_ID, (frame) => frames.push(frame));

      const es = FakeEventSource.instances[FakeEventSource.instances.length - 1];
      expect(es).toBeDefined();
      expect(es.url).toBe(`/api/v1/research/${RUN_ID}/events`);
      expect(es.closed).toBe(false);

      // 首帧 event: state —— 完整 status payload。
      es.dispatch('state', JSON.stringify(statusDto('RETRIEVING')));
      expect(frames).toHaveLength(1);
      expect(frames[0]?.kind).toBe('state');
      expect(frames[0]?.kind === 'state' && frames[0].status.state).toBe('RETRIEVING');

      // event: research —— 生命周期事件。
      es.dispatch(
        'research',
        JSON.stringify({
          type: 'stage_started',
          runId: RUN_ID,
          at: '2026-08-14T00:00:05.000Z',
          seq: 3,
          stageId: 'retrieve_literature',
        }),
      );
      expect(frames).toHaveLength(2);
      const research = frames[1];
      expect(research?.kind).toBe('research');
      expect(research?.kind === 'research' && research.event.type).toBe('stage_started');
      expect(research?.kind === 'research' && research.event.stageId).toBe('retrieve_literature');
      expect(research?.kind === 'research' && research.event.seq).toBe(3);

      // 非 JSON 帧（心跳/畸形 payload）被忽略，不中断流。
      es.dispatch('research', 'not-json');
      expect(frames).toHaveLength(2);

      // 退订 → close。
      unsubscribe();
      expect(es.closed).toBe(true);
    });

    it('onError 透传 EventSource 连接错误', () => {
      vi.stubGlobal('EventSource', FakeEventSource);
      const errors: number[] = [];
      subscribeResearchEvents(RUN_ID, () => {}, () => errors.push(1));
      const es = FakeEventSource.instances[FakeEventSource.instances.length - 1];
      es.dispatch('error', '');
      es.dispatch('error', '');
      expect(errors).toHaveLength(2);
    });

    it('无原生 EventSource → onError 一次 + no-op 退订（诚实降级）', () => {
      // jsdom 不实现 EventSource —— 正是本分支的天然测试环境。
      expect(typeof EventSource).toBe('undefined');
      let errors = 0;
      const unsubscribe = subscribeResearchEvents(RUN_ID, () => {}, () => {
        errors += 1;
      });
      expect(errors).toBe(1);
      expect(() => unsubscribe()).not.toThrow();
    });
  });
});
