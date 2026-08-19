// tests/monitor/run_command.test.ts
// far monitor 命令入口判别测试（v3.0 指令 Phase 3.3 + census §4 输出契约）。
//
// 判别力：--json 纯度（banner 混入即 JSON.parse 抛错）· result↔exit 自洽 ·
// 人读路径非空屏非罐头 · 双采样差分真实发生（percentBusy 非 null——与 collectSample(null)
// 的 fail-closed 首采样语义相反，命令层必须给出真实数值）。
//
// 工程说明：采用 spawnSync 真实子进程（与 tests/cli/doctor.test.ts 同惯例）——
// 进程内 patch process.stdout.write 会截留 node:test reporter 的输出帧
// （后续测试的 ok 行被前一测试的 capture 吞掉，注册计数失真），子进程路径天然免疫。

import { spawnSync } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

function runFarMonitor(args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, ['src/cli/far.ts', 'monitor', ...args], {
    encoding: 'utf8',
    timeout: 60000,
    env: process.env,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('far monitor --json: stdout 单文档纯 JSON，sample/alerts/thresholds 结构齐备', () => {
  const r = runFarMonitor(['--json']);
  assert.ok(r.status === 0 || r.status === 2, `exit 必须 0(无警)/2(有警): ${r.status}`);
  const doc = JSON.parse(r.stdout) as {
    tool: string;
    sample: {
      cpu: { percentBusy: number | null; cores: number };
      memory: { usedPercent: number; totalMiB: number };
    };
    alerts: Array<{ metric: string; level: string }>;
    thresholds: { cpuPercent: number };
    result: string;
  }; // banner 混入将在此抛错——判别
  assert.equal(doc.tool, 'far monitor');
  assert.equal(doc.thresholds.cpuPercent, 80, '指令阈值 CPU>80% 必须默认生效');
  assert.ok(doc.sample.cpu.cores >= 1);
  assert.ok(doc.sample.memory.totalMiB > 0);
  assert.ok(Array.isArray(doc.alerts));
  assert.equal(r.stdout.includes('─────'), false, '人读分隔线泄漏');
});

test('far monitor --json: result 字段与 exit code 自洽（0=ok / 2=warn）', () => {
  const r = runFarMonitor(['--json']);
  const doc = JSON.parse(r.stdout) as { result: string; alerts: unknown[] };
  assert.equal(doc.result, r.status === 0 ? 'ok' : 'warn');
  assert.equal(doc.alerts.length > 0, r.status === 2, 'alerts 非空 ⇔ exit 2');
});

test('far monitor 人读路径: 含真实数值且非空屏非罐头', () => {
  const r = runFarMonitor([]);
  assert.ok(r.status === 0 || r.status === 2);
  assert.ok(r.stdout.includes('far monitor (system health snapshot)'), '标题缺失');
  assert.match(r.stdout, /memory\s+: \d+ \/ \d+ MiB/, '内存行必须真实数值');
  assert.match(r.stdout, /cpu\s+: (unknown \(first sample\)|[\d.]+%)/, 'CPU 行必须真实值或如实 unknown');
  assert.ok(r.stdout.includes('no alerts') || r.stdout.includes('[WARN]'), '告警结论缺失');
});

test('far monitor 双采样差分: 命令层 CPU% 给出数值（非首采样 null 透传）', () => {
  const r = runFarMonitor(['--json']);
  const doc = JSON.parse(r.stdout) as { sample: { cpu: { percentBusy: number | null } } };
  // 命令层做了 1s 双采样——正常环境下必须产出数值；null 仅允许极端计时异常
  assert.ok(doc.sample.cpu.percentBusy !== null, '双采样后仍 null = 差分未真实发生');
});
