// tests/monitor/sampler.test.ts
// Sampler 常驻采样器判别测试（v3.0 指令 Phase 3.3「每 5 秒采集一次」）。
//
// 判别力：5s 默认节律与 720 容量锁定（改动即红）· 环形缓冲截断（超容量保最新 N 条）·
// start/stop 幂等 · 采集异常被吞且计数（守护永不倒灌故障）· latest/history 语义。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { DEFAULT_CAPACITY, DEFAULT_INTERVAL_MS, Sampler } from '../../src/monitor/sampler.ts';
import type { SystemSample } from '../../src/monitor/collect.ts';

let seq = 0;
function fakeSample(): SystemSample {
  seq += 1;
  return {
    timestamp: `2026-08-19T00:00:${String(seq % 60).padStart(2, '0')}.000Z`,
    platform: 'test',
    arch: 'x64',
    cpu: { cores: 8, percentBusy: seq, loadAvg: [0, 0, 0] },
    memory: { totalMiB: 1000, usedMiB: 500, usedPercent: 50 },
    uptimeSec: seq,
  };
}

test('Sampler: 指令默认值锁定——5s 节律 / 720 容量（1h 历史）', () => {
  assert.equal(DEFAULT_INTERVAL_MS, 5000, '指令「每 5 秒采集一次」');
  assert.equal(DEFAULT_CAPACITY, 720, '720 × 5s = 1h 环形缓冲');
});

test('Sampler: start 立即采首 tick 且幂等（重复 start 不叠加定时器）', async () => {
  const s = new Sampler({ intervalMs: 15, collectFn: () => fakeSample() });
  s.start();
  assert.equal(s.running, true);
  assert.ok(s.latest() !== null, 'start 应立即采首 tick');
  s.start(); // 幂等——不得叠加
  s.stop();
  assert.equal(s.running, false);
  s.stop(); // 幂等——不得抛
  const n = s.history().length;
  assert.ok(n >= 1 && n <= 3, `15ms 节律短窗口采样数异常: ${n}`);
});

test('Sampler: 常驻节律真实推进（间隔倍数增长）', async () => {
  const s = new Sampler({ intervalMs: 20, collectFn: () => fakeSample() });
  s.start();
  await new Promise((r) => setTimeout(r, 75));
  s.stop();
  const n = s.history().length;
  assert.ok(n >= 3 && n <= 6, `75ms / 20ms 节律应得 4±1 条: ${n}`);
});

test('Sampler: 环形缓冲超容量截断保最新（cap=3 采 5 条留后 3 条）', () => {
  const s = new Sampler({ intervalMs: 10, capacity: 3, collectFn: () => fakeSample() });
  s.start();
  // start 同步采首 tick；手动再推 4 tick 经 history 观察需真实节律——改为直接等
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      s.stop();
      const h = s.history();
      assert.equal(h.length, 3, `环形缓冲必须恰保容量: ${h.length}`);
      const latest = s.latest();
      assert.equal(latest, h[h.length - 1] ?? null, 'latest 必须是缓冲末位');
      assert.ok((latest?.uptimeSec ?? 0) > (h[0]?.uptimeSec ?? 0), '保留的必须是最新窗口');
      resolve();
    }, 60);
  });
});

test('Sampler: 采集异常被吞且计数（守护永不倒灌故障到宿主）', () => {
  let calls = 0;
  const s = new Sampler({
    intervalMs: 10,
    collectFn: () => {
      calls += 1;
      throw new Error('boom');
    },
  });
  s.start();
  s.stop();
  assert.equal(s.failureCount, 1, '异常必须计数');
  assert.equal(s.history().length, 0, '失败 tick 不得写入缓冲');
  assert.ok(calls >= 1);
});

test('Sampler: history(limit) 语义——负/零/超界全部，正常值取最近 N 条（升序）', async () => {
  const s = new Sampler({ intervalMs: 12, collectFn: () => fakeSample() });
  s.start();
  await new Promise((r) => setTimeout(r, 50));
  s.stop();
  const all = s.history();
  assert.ok(all.length >= 2, `需 ≥2 条样本: ${all.length}`);
  assert.deepEqual(s.history(0), all);
  assert.deepEqual(s.history(-5), all);
  assert.deepEqual(s.history(9999), all);
  const two = s.history(2);
  assert.equal(two.length, 2);
  assert.deepEqual(two, all.slice(-2), 'limit 必须取最近窗口且保持升序');
});


// ---------------------------------------------------------------------------
// subscribe（SSE 推送挂点）
// ---------------------------------------------------------------------------

test('Sampler.subscribe: 每 tick 推送样本，退订后不再收到', async () => {
  const s = new Sampler({ intervalMs: 12, collectFn: () => fakeSample() });
  const received: number[] = [];
  const unsubscribe = s.subscribe((sample) => {
    received.push(sample.uptimeSec);
  });
  s.start(); // start 同步采首 tick——订阅在前，必须收到
  await new Promise((r) => setTimeout(r, 40));
  unsubscribe();
  const countAtUnsub = received.length;
  await new Promise((r) => setTimeout(r, 40));
  s.stop();
  assert.ok(countAtUnsub >= 2, `订阅期应收 ≥2 帧: ${countAtUnsub}`);
  assert.equal(received.length, countAtUnsub, '退订后不得再收到帧');
});

test('Sampler.subscribe: 监听器抛异常不拖垮采样节律（守护纪律）', async () => {
  const s = new Sampler({ intervalMs: 12, collectFn: () => fakeSample() });
  let good = 0;
  s.subscribe(() => {
    throw new Error('listener boom');
  });
  s.subscribe(() => {
    good += 1;
  });
  s.start();
  await new Promise((r) => setTimeout(r, 40));
  s.stop();
  assert.ok(good >= 2, `坏监听器不得阻断好监听器: ${good}`);
  assert.ok(s.history().length >= 2, '坏监听器不得阻断缓冲写入');
  assert.equal(s.failureCount, 0, '监听器异常不计入采集失败（责任域分离）');
});
