// tests/api/monitor_routes.test.ts
// /api/v1/monitor/* 端点判别测试（架构 §3.3 · census §4-4 空数据红线）。
//
// 判别力：空缓冲 → sample:null + "No data available"（不 500 不空屏）·
// 有样本 → latest 带 evaluateAlerts 真实判定 · history limit 边界（NaN/正常/超界）·
// 端点挂在 Fastify 实例上真实路由（inject 实测，非 mock）。

import Fastify from 'fastify';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { registerMonitorRoutes } from '../../src/api/routes/monitor.ts';
import { Sampler } from '../../src/monitor/sampler.ts';
import type { SystemSample } from '../../src/monitor/collect.ts';

function makeSample(cpu: number | null, mem = 50): SystemSample {
  return {
    timestamp: '2026-08-19T00:00:00.000Z',
    platform: 'test',
    arch: 'x64',
    cpu: { cores: 8, percentBusy: cpu, loadAvg: [0, 0, 0] },
    memory: { totalMiB: 1000, usedMiB: mem * 10, usedPercent: mem },
    uptimeSec: 1,
  };
}

async function buildApp(sampler: Sampler) {
  const app = Fastify();
  await app.register(async (v1) => {
    await registerMonitorRoutes(v1, { sampler });
  }, { prefix: '/api/v1' });
  return app;
}

test('monitor/latest: 空缓冲 → sample:null + No data available（红线：不 500 不空屏）', async () => {
  const app = await buildApp(new Sampler({ collectFn: () => makeSample(10) }));
  const res = await app.inject({ method: 'GET', url: '/api/v1/monitor/latest' });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { sample: unknown; note?: string; samplerRunning: boolean };
  assert.equal(body.sample, null, '空缓冲必须如实 null');
  assert.ok(body.note?.includes('No data available'), '空数据必须显式提示（红线）');
  assert.equal(body.samplerRunning, false);
  await app.close();
});

test('monitor/latest: 有样本 → evaluateAlerts 真实判定（CPU 95 触发 warn / 50 不触发）', async () => {
  const hot = new Sampler({ collectFn: () => makeSample(95) });
  hot.start();
  hot.stop();
  const appHot = await buildApp(hot);
  const resHot = await appHot.inject({ method: 'GET', url: '/api/v1/monitor/latest' });
  const bodyHot = resHot.json() as { alerts: Array<{ metric: string }>; sample: { cpu: { percentBusy: number } } };
  assert.equal(bodyHot.sample.cpu.percentBusy, 95);
  assert.equal(bodyHot.alerts.length, 1, 'CPU 95>80 必须触发告警');
  assert.equal(bodyHot.alerts[0]?.metric, 'cpu');
  await appHot.close();

  const cool = new Sampler({ collectFn: () => makeSample(50) });
  cool.start();
  cool.stop();
  const appCool = await buildApp(cool);
  const resCool = await appCool.inject({ method: 'GET', url: '/api/v1/monitor/latest' });
  const bodyCool = resCool.json() as { alerts: unknown[] };
  assert.equal(bodyCool.alerts.length, 0, 'CPU 50 不得误报');
  await appCool.close();
});

test('monitor/history: limit 边界——NaN 按全部、正常值截取、空缓冲带 note', async () => {
  const s = new Sampler({ collectFn: () => makeSample(10) });
  s.start();
  await new Promise((r) => setTimeout(r, 0));
  s.stop();
  const app = await buildApp(s);

  const nan = await app.inject({ method: 'GET', url: '/api/v1/monitor/history?limit=abc' });
  assert.equal(nan.statusCode, 200);
  const nanBody = nan.json() as { count: number };
  assert.ok(nanBody.count >= 1, 'NaN limit 不得 500，按全部处理');

  const capped = await app.inject({ method: 'GET', url: '/api/v1/monitor/history?limit=1' });
  const cappedBody = capped.json() as { count: number };
  assert.equal(cappedBody.count, 1, 'limit=1 必须恰取 1 条');

  await app.close();

  const empty = await buildApp(new Sampler({ collectFn: () => makeSample(10) }));
  const resEmpty = await empty.inject({ method: 'GET', url: '/api/v1/monitor/history' });
  const bodyEmpty = resEmpty.json() as { count: number; note?: string };
  assert.equal(bodyEmpty.count, 0);
  assert.ok(bodyEmpty.note?.includes('No data available'));
  await empty.close();
});


// ---------------------------------------------------------------------------
// GET /monitor/stream（SSE 实时推送 · 架构 §3.1 决策修正：SSE 替代 WebSocket）
// 判别力：content-type/首帧 JSON 可解析/连接即收最新快照/tick 帧持续推进/关闭即退订。
// 经真实 listen（ephemeral 端口）验证——inject 无法诚实测流式连接。
// ---------------------------------------------------------------------------

import { get } from 'node:http';

test('monitor/stream: SSE 首帧含最新快照，tick 帧持续到达，关闭清理', async () => {
  const s = new Sampler({ intervalMs: 30, collectFn: () => makeSample(42) });
  s.start(); // 首 tick 同步——连接时应已有快照
  const app = await buildApp(s);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0;

  const frames: Array<Record<string, unknown>> = [];
  let contentType = '';
  await new Promise<void>((resolve, reject) => {
    const req = get(`http://127.0.0.1:${port}/api/v1/monitor/stream`, (res) => {
      contentType = String(res.headers['content-type'] ?? '');
      let buf = '';
      res.on('data', (chunk: Buffer) => {
        buf += chunk.toString('utf8');
        // SSE 帧以 \n\n 分隔
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const p of parts) {
          const line = p.trim();
          if (line.startsWith('data: ')) {
            frames.push(JSON.parse(line.slice(6)) as Record<string, unknown>);
          }
        }
        if (frames.length >= 2) {
          req.destroy(); // 收到首帧 + 至少一个 tick 帧即关闭
          resolve();
        }
      });
      res.on('error', reject);
    });
    req.on('error', (err) => {
      // destroy 引起的 socket 错误属预期关闭路径
      if (frames.length >= 2) resolve();
      else reject(err);
    });
    setTimeout(() => reject(new Error(`SSE 超时：仅 ${frames.length} 帧`)), 5000);
  });

  assert.ok(contentType.includes('text/event-stream'), `content-type: ${contentType}`);
  const first = frames[0] as { sample?: { cpu?: { percentBusy?: number } } };
  assert.ok(first.sample !== undefined, '首帧必须携带最新快照（连接即得，不等下个 tick）');
  assert.equal(first.sample?.cpu?.percentBusy, 42);
  const second = frames[1] as { sample?: unknown; alerts?: unknown };
  assert.ok(second.sample !== undefined && second.alerts !== undefined, 'tick 帧必须 sample+alerts');

  s.stop();
  await app.close();
});

test('monitor/stream: 空缓冲首帧为 No data available note（红线不空屏）', async () => {
  const s = new Sampler({ collectFn: () => makeSample(10) }); // 不 start——缓冲为空
  const app = await buildApp(s);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0;

  const note = await new Promise<string>((resolve, reject) => {
    let buf = '';
    const req = get(`http://127.0.0.1:${port}/api/v1/monitor/stream`, (res) => {
      res.on('data', (chunk: Buffer) => {
        buf += chunk.toString('utf8');
        if (buf.includes('\n\n')) {
          req.destroy();
          resolve(buf);
        }
      });
    });
    req.on('error', () => resolve(buf));
    setTimeout(() => reject(new Error('SSE 首帧超时')), 3000);
  });

  const payload = JSON.parse(note.trim().replace(/^data: /, '')) as { note?: string };
  assert.ok(payload.note?.includes('No data available'), `空缓冲首帧必须显式提示: ${note}`);
  await app.close();
});
