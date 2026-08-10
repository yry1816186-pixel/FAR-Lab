/**
 * metrics_alert.mjs 测试（阶段 7 1124 · P2-B 首步）。
 *
 * 覆盖：
 *   1. parseMetrics 解析 Prometheus 文本格式（含 label）
 *   2. 不可达端点 → CRITICAL 告警 exit 1（子进程实测）
 *   3. 正常指标 → ok exit 0（临时 http 服务实测）
 *
 * 诚实边界：脚本为离线本机阈值检查；生产告警通道为 V2（metrics_alert 是
 * "告警存在"的首步真实实现）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(here, '..', '..');
const script = join(repoRoot, 'scripts', 'metrics_alert.mjs');

/**
 * 异步 spawn：spawnSync 会阻塞本进程事件循环，导致同进程内的临时 http server
 * 无法响应子进程请求（Windows 实测 abort）。改用 spawn + Promise。
 */
function runAlert(port) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [script, '--port', String(port), '--timeout-ms', '5000'],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => resolve({ status: code, stdout, stderr }));
  });
}

test('metrics_alert: 端点不可达 → CRITICAL exit 1（可观测面故障告警）', async () => {
  const result = await runAlert(48999); // 无服务监听端口
  assert.equal(result.status, 1, '不可达必须 exit 1');
  assert.match(result.stdout, /metrics_endpoint_unreachable/, '必须报端点不可达告警');
});

test('metrics_alert: 正常指标 → ok exit 0（阈值内）', async () => {
  const server = createServer((_req, res) => {
    res.setHeader('content-type', 'text/plain');
    res.end([
      'far_lab_verdict_total 10',
      'far_lab_degraded_scope_verdict_total 1',
      'far_lab_degradation_total 5',
      'far_lab_uptime_seconds 42',
      '',
    ].join('\n'));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const result = await runAlert(port);
    assert.equal(result.status, 0, `阈值内必须 exit 0\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
    assert.match(result.stdout, /metrics_alert: ok/, '必须输出 ok');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('metrics_alert: degraded_scope 占比 > 50% → WARNING exit 1', async () => {
  const server = createServer((_req, res) => {
    res.setHeader('content-type', 'text/plain');
    res.end([
      'far_lab_verdict_total 10',
      'far_lab_degraded_scope_verdict_total 8', // 80% > 50%
      'far_lab_degradation_total 5',
      '',
    ].join('\n'));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const result = await runAlert(port);
    assert.equal(result.status, 1, '占比超限必须 exit 1');
    assert.match(result.stdout, /degraded_scope_dominance/, '必须报降级占比告警');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
