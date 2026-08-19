// tests/monitor/collect_alerts.test.ts
// monitor 采集器 v1 判别测试（v3.0 指令 Phase 3.3）。
//
// 判别力设计：
//   · computeCpuPercent 纯函数：已知时间片差分 → 精确百分比（改错公式即红）；
//     首次采样/同 tick 重采样 → null（fail-closed 分支，防"编造 0%"回归）；
//     越界钳制（时钟回绕/VM 计时异常 → 仍落 [0,100]）。
//   · evaluateAlerts 边界语义：严格大于（指令原文 "CPU > 80%"——80.0 不触发，80.1 触发）；
//     null CPU（首次采样）→ 零告警（宁可沉默不误报）。
//   · collectSample 真实采集：范围断言（非精确值——环境无关可重复）。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { collectSample, computeCpuPercent, readCpuTimes, type CpuTimes, type SystemSample } from '../../src/monitor/collect.ts';
import { DEFAULT_THRESHOLDS, evaluateAlerts } from '../../src/monitor/alerts.ts';

// ---------------------------------------------------------------------------
// computeCpuPercent（纯函数）
// ---------------------------------------------------------------------------

test('computeCpuPercent: 全忙差分 → 100%，全闲差分 → 0%（公式方向判别）', () => {
  const prev: CpuTimes = { idle: 100, total: 1000 };
  assert.equal(computeCpuPercent(prev, { idle: 100, total: 2000 }), 100, 'idle 零增长 = 全忙');
  assert.equal(computeCpuPercent(prev, { idle: 1100, total: 2000 }), 0, 'delta 全 idle = 全闲');
});

test('computeCpuPercent: 25% 忙 → 精确 25.0（含四舍五入口径）', () => {
  const prev: CpuTimes = { idle: 0, total: 0 };
  // delta: total 400，idle 300 → busy 100/400 = 25%
  assert.equal(computeCpuPercent(prev, { idle: 300, total: 400 }), 25);
});

test('computeCpuPercent: fail-closed——首次采样(null)与同 tick(totalDelta=0)均返 null', () => {
  assert.equal(computeCpuPercent(null, { idle: 0, total: 100 }), null, '无前值必须未知而非编造');
  const t: CpuTimes = { idle: 50, total: 500 };
  assert.equal(computeCpuPercent(t, t), null, '计时不准前进必须未知而非 0%');
});

test('computeCpuPercent: 异常差分钳制 [0,100]（时钟回绕不得产出越界值）', () => {
  const prev: CpuTimes = { idle: 1000, total: 1000 };
  // idle 倒退（回绕）：busy 公式 >100 → 钳 100
  assert.equal(computeCpuPercent(prev, { idle: 0, total: 2000 }), 100);
});

// ---------------------------------------------------------------------------
// evaluateAlerts（纯函数 · 边界语义锁定）
// ---------------------------------------------------------------------------

function fakeSample(cpuPercent: number | null, memPercent: number): SystemSample {
  return {
    timestamp: '2026-08-19T00:00:00.000Z',
    platform: 'test',
    arch: 'x64',
    cpu: { cores: 8, percentBusy: cpuPercent, loadAvg: [0, 0, 0] },
    memory: { totalMiB: 1000, usedMiB: Math.round(memPercent * 10), usedPercent: memPercent },
    uptimeSec: 1,
  };
}

test('evaluateAlerts: 指令边界——CPU 80.0 不触发，80.1 触发 warn（严格大于）', () => {
  assert.equal(evaluateAlerts(fakeSample(80.0, 0)).length, 0, '80.0 不得触发（指令原文 >80）');
  const fired = evaluateAlerts(fakeSample(80.1, 0));
  assert.equal(fired.length, 1);
  assert.equal(fired[0]?.metric, 'cpu');
  assert.equal(fired[0]?.level, 'warn');
  assert.equal(fired[0]?.threshold, DEFAULT_THRESHOLDS.cpuPercent);
});

test('evaluateAlerts: fail-closed——CPU null（首次采样）零告警', () => {
  assert.equal(evaluateAlerts(fakeSample(null, 0)).length, 0, '未知指标宁可沉默不误报');
});

test('evaluateAlerts: 内存阈值独立判定 + 双指标同警', () => {
  assert.equal(evaluateAlerts(fakeSample(0, 90.0)).length, 0, '内存 90.0 不得触发');
  const both = evaluateAlerts(fakeSample(95, 95));
  assert.equal(both.length, 2, 'CPU+内存双超阈值应双警');
  assert.deepEqual(both.map((a) => a.metric), ['cpu', 'memory']);
});

test('evaluateAlerts: 阈值可覆写（非硬编码 80）', () => {
  const strict = { cpuPercent: 50, memoryPercent: 50 };
  const fired = evaluateAlerts(fakeSample(60, 0), strict);
  assert.equal(fired.length, 1);
  assert.equal(fired[0]?.threshold, 50);
});

// ---------------------------------------------------------------------------
// collectSample（真实采集 · 范围断言）
// ---------------------------------------------------------------------------

test('collectSample: 真实采集范围自洽（环境无关可重复）', () => {
  const first = collectSample(null);
  assert.equal(first.cpu.percentBusy, null, '首次采样 CPU 必须 fail-closed null');
  assert.ok(first.cpu.cores >= 1);
  assert.ok(first.memory.totalMiB > 0);
  assert.ok(first.memory.usedMiB <= first.memory.totalMiB, 'used 不得超 total');
  assert.ok(first.memory.usedPercent >= 0 && first.memory.usedPercent <= 100);
  assert.equal(first.cpu.loadAvg.length, 3);
  assert.ok(first.uptimeSec >= 0);
  assert.ok(first.timestamp.includes('T'), 'ISO 时间戳');

  const second = collectSample(readCpuTimes());
  assert.ok(
    second.cpu.percentBusy === null ||
      (second.cpu.percentBusy >= 0 && second.cpu.percentBusy <= 100),
    `差分利用率越界: ${second.cpu.percentBusy}`,
  );
});
