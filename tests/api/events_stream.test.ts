/**
 * P0-4 事件流 SSE 端点测试（2026-08-07 落地）。
 *
 * 真实长驻 server（app.listen port 0）+ 全局 fetch，经完整 TCP/HTTP 栈验证：
 *   1. GET /api/v1/events/stream 返回 text/event-stream + 事件帧可达
 *   2. 实时推送：连接建立后 emit 事件 → SSE 帧收到（事件帧内容 = JSON 序列化）
 *   3. runId 过滤：订阅 run-a → run-b 事件不推送
 *   4. replay=true：历史快照先重放（含旧 run 事件）再实时
 *   5. 无 eventBus 注入 → /events/stream 不注册（404·可选端点为 off-by-default）
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。端口 0 = OS 分配。
 */

import { runMigrations } from '../../src/db/index.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { buildServer } from '../../src/api/server.ts';
import { AgentEventBus, type AgentLoopEvent } from '../../src/agent_loop/events.ts';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

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

async function startServerWithBus(
  bus: AgentEventBus | undefined,
): Promise<RunningServer> {
  const db = openDb();
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
    ...(bus !== undefined ? { eventBus: bus } : {}),
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') {
    await app.close();
    db.close();
    throw new Error('events_stream: expected TCP address');
  }
  return {
    base: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await app.close();
      db.close();
    },
  };
}

/** 读取 SSE 流直到满足收集条件或超时。 */
async function collectSse(
  url: string,
  opts: { readonly until: (lines: readonly string[]) => boolean; readonly timeoutMs?: number },
): Promise<readonly string[]> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  assert.equal(res.status, 200, 'SSE 端点须返回 200');
  assert.match(
    res.headers.get('content-type') ?? '',
    /^text\/event-stream/,
    'Content-Type 须为 text/event-stream',
  );
  if (res.body === null) {
    throw new Error('events_stream: SSE body null');
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const lines: string[] = [];
  const seen: string[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const part of chunk.split('\n')) {
      if (part.length > 0) {
        lines.push(part);
      }
    }
    if (opts.until(lines)) {
      seen.push(...lines);
      break;
    }
  }
  return seen;
}

test('P0-4: /events/stream 经真实 TCP/HTTP 栈返回 200 + text/event-stream', async () => {
  const bus = new AgentEventBus();
  const { base, close } = await startServerWithBus(bus);
  try {
    // 连接后立即收到连接注释行（: connected）
    const lines = await collectSse(`${base}/api/v1/events/stream`, {
      until: (l) => l.includes(': connected'),
    });
    assert.ok(lines.some((l) => l === ': connected'), '连接帧 :connected 可达');
  } finally {
    await close();
  }
});

test('P0-4: 实时事件推送——emit 后 SSE 帧包含序列化事件', async () => {
  const bus = new AgentEventBus();
  const { base, close } = await startServerWithBus(bus);
  try {
    // 启动 fetch（不 await 结束·流持续打开），先建立连接
    const controller = new AbortController();
    const resPromise = fetch(`${base}/api/v1/events/stream`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
    });
    const res = await resPromise;
    assert.equal(res.status, 200);
    if (res.body === null) {
      throw new Error('events_stream: body null');
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    // 等连接建立（bus 订阅后 emit）
    await new Promise((resolve) => setTimeout(resolve, 50));
    const evt = makeEvent('run-live', '2026-08-07T10:00:00.000Z');
    bus.emit(evt);

    const buf: string[] = [];
    let gotData = false;
    while (!gotData) {
      const { done, value } = await reader.read();
      if (done) break;
      buf.push(decoder.decode(value, { stream: true }));
      if (buf.join('').includes(`"runId":"run-live"`)) {
        gotData = true;
      }
    }
    controller.abort();
    assert.ok(gotData, 'emit 的事件须实时到达 SSE 客户端');
  } finally {
    await close();
  }
});

test('P0-4: runId 过滤——run-b 事件不推送给 run-a 订阅', async () => {
  const bus = new AgentEventBus();
  const { base, close } = await startServerWithBus(bus);
  try {
    const controller = new AbortController();
    const resPromise = fetch(`${base}/api/v1/events/stream?runId=run-a`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
    });
    const res = await resPromise;
    assert.equal(res.status, 200);
    if (res.body === null) {
      throw new Error('events_stream: body null');
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    await new Promise((resolve) => setTimeout(resolve, 50));
    bus.emit(makeEvent('run-b', '2026-08-07T11:00:00.000Z'));
    bus.emit(makeEvent('run-a', '2026-08-07T12:00:00.000Z'));

    let received = '';
    while (!received.includes('"runId":"run-a"')) {
      const { done, value } = await reader.read();
      if (done) break;
      received += decoder.decode(value, { stream: true });
    }
    controller.abort();
    assert.ok(received.includes('"runId":"run-a"'), 'run-a 事件须送达');
    assert.ok(!received.includes('"runId":"run-b"'), 'run-b 事件不得送达（过滤生效）');
  } finally {
    await close();
  }
});

test('P0-4: replay=true 先重放历史快照再实时推送', async () => {
  const bus = new AgentEventBus();
  // 连接前先有历史
  bus.emit(makeEvent('run-hist', '2026-08-07T00:00:00.000Z'));

  const { base, close } = await startServerWithBus(bus);
  try {
    const lines = await collectSse(`${base}/api/v1/events/stream?replay=true`, {
      until: (l) => l.some((x) => x.includes('"runId":"run-hist"')),
    });
    const joined = lines.join('\n');
    assert.ok(joined.includes('"runId":"run-hist"'), '历史事件须在 replay 时送达');
    assert.ok(joined.includes('event: run_started'), 'SSE event: 行须存在');
  } finally {
    await close();
  }
});

test('P0-4: 未注入 eventBus → /events/stream 不注册（404·off-by-default）', async () => {
  const { base, close } = await startServerWithBus(undefined);
  try {
    const res = await fetch(`${base}/api/v1/events/stream`);
    assert.equal(res.status, 404, '无 eventBus 时 SSE 端点不得暴露（默认关闭）');
  } finally {
    await close();
  }
});
