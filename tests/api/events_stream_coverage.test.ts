/**
 * events_stream_coverage.test.ts —— src/api/routes/events.ts 分支补充测试（L2 coverage-batch2）。
 *
 * 目标：src/api/routes/events.ts branch ≥75%（Z16 门禁）。
 * 补齐既有 events_stream.test.ts 未覆盖的分支：
 *   - heartbeatMs 注入分支（opts.heartbeatMs ?? 15_000 的 defined 分支）+ 心跳注释帧（128）
 *   - 连接关闭 → cleanup（退订 + clearInterval + raw.end 条件分支·132-138）
 *   - 连接已关闭后 emit → sendFrame 跳过写（!raw.writableEnded && !raw.destroyed 为 false）
 *
 * 说明（设计上不可达·不硬凑）：isStreamQuery 的三个 false 分支（43-44 47-48 50-51）
 * 被路由 schema（runId: string / replay: enum）前置保证——非法 query 在 schema 校验
 * 即返回 400 VALIDATION_FAILED（errorHandler），handler 不会收到非法 query。
 * 该 type guard 是防御性双保险（R10 风格），HTTP 路径不可达。
 *
 * 铁律：测试期望基于源码实际行为；无空断言。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';

import { AgentEventBus, type AgentLoopEvent } from '../../src/agent_loop/events.ts';
import { registerEventsStreamRoute } from '../../src/api/routes/events.ts';

function makeEvent(runId: string, ts: string): AgentLoopEvent {
  return {
    type: 'run_started',
    runId,
    ts,
    researchInputHash: 'abc',
    maxIterations: 3,
    verdictDriven: false,
  };
}

interface RunningServer {
  base: string;
  close: () => Promise<void>;
}

async function startSseServer(
  opts: { readonly bus: AgentEventBus; readonly heartbeatMs: number },
): Promise<RunningServer> {
  const app = Fastify();
  registerEventsStreamRoute(app, { bus: opts.bus, heartbeatMs: opts.heartbeatMs });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') {
    await app.close();
    throw new Error('events_stream_coverage: expected TCP address');
  }
  return {
    base: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await app.close();
    },
  };
}


test('events/stream: heartbeatMs 注入 → 心跳注释帧按间隔输出', async () => {
  const bus = new AgentEventBus();
  const { base, close } = await startSseServer({ bus, heartbeatMs: 25 });
  try {
    const controller = new AbortController();
    const res = await fetch(`${base}/events/stream`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]),
    });
    assert.equal(res.status, 200);
    assert.match(
      res.headers.get('content-type') ?? '',
      /^text\/event-stream/,
    );
    if (res.body === null) {
      throw new Error('events_stream_coverage: body null');
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (!buf.includes(': heartbeat')) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
    }
    assert.ok(buf.includes(': heartbeat'), 'heartbeatMs 注入后须周期性输出心跳注释行');
    assert.ok(buf.includes(': connected'), '连接注释帧仍存在');
    controller.abort(); // 主动断开，避免 close() 等待连接超时
  } finally {
    await close();
  }
});


test('events/stream: 连接关闭 → cleanup 自动退订（防事件泄漏）', async () => {
  const bus = new AgentEventBus();
  // 长心跳避免心跳帧干扰断言；heartbeatMs 显式传入覆盖 ?? 15_000 的 defined 分支
  const { base, close } = await startSseServer({ bus, heartbeatMs: 60_000 });
  try {
    const controller = new AbortController();
    const res = await fetch(`${base}/events/stream`, { signal: controller.signal });
    assert.equal(res.status, 200);
    if (res.body === null) {
      throw new Error('events_stream_coverage: body null');
    }
    void res.body.getReader();

    // 等待订阅建立
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(bus.subscriberCount, 1, '连接建立后须已订阅 bus');

    controller.abort(); // 客户端断开 → 服务端 raw close → cleanup
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(bus.subscriberCount, 0, '连接关闭后须自动退订（cleanup·防泄漏）');

    // 关闭后 emit：handler 仍被调用但 sendFrame 跳过写（raw 已关闭·不抛错）
    const evt = makeEvent('r-late', '2026-08-07T00:00:00.000Z');
    assert.doesNotThrow(() => bus.emit(evt), '连接关闭后 emit 不得抛错（sendFrame 跳过写）');
  } finally {
    await close();
  }
});
