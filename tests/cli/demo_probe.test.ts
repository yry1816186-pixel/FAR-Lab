/**
 * demo 环境探测与 GV 重试测试。
 *
 * 背景（findings S1）：demo 关键路径零超时保护——better-sqlite3 native 加载异常或
 * Node 版本不符（<24 无原生 type stripping）时进程可能永不 exit（用户面前死等）；
 * GV 失败即 exit 7 硬终止（后续 PHASE2/3 精彩内容全看不到）。
 * 修复契约：
 *   1. probeEnvironment 对 Node 主版本 <24 → ok=false + 可读错误（含版本指引）。
 *   2. probeEnvironment 对 better-sqlite3 加载/打开失败 → ok=false + 可读错误（含 Docker 后备指引）。
 *   3. 正常环境 → ok=true（零行为变化）。
 *   4. retryGoldenOnce：首次失败第二次成功 → 返回成功（消除瞬时漂移现场死亡）。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  probeEnvironment,
  retryGoldenOnce,
} from '../../src/cli/commands/demo_probe.ts';

test('P0-3: probeEnvironment rejects Node <24 with readable guidance', () => {
  const result = probeEnvironment({ nodeVersion: 'v22.14.0' });
  assert.equal(result.ok, false, 'Node 22 must be rejected (type stripping needs >=24)');
  assert.ok(
    result.error !== null && /Node/i.test(result.error) && /\d+/.test(result.error),
    'error must mention Node version requirement',
  );
});

test('P0-3: probeEnvironment catches better-sqlite3 load failure with Docker fallback guidance', () => {
  const result = probeEnvironment({
    nodeVersion: 'v24.14.0',
    sqliteLoad: () => {
      throw new Error('dlopen failed: better_sqlite3.node is not a valid Win32 application');
    },
  });
  assert.equal(result.ok, false, 'native module failure must fail the probe');
  assert.ok(
    result.error !== null && /docker|container|Docker/i.test(result.error),
    'error must carry Docker fallback guidance (S1 现场后备)',
  );
});

test('P0-3: probeEnvironment passes on a healthy environment', () => {
  const result = probeEnvironment({ nodeVersion: 'v24.14.0', sqliteLoad: () => {} });
  assert.equal(result.ok, true);
  assert.equal(result.error, null);
});

test('P0-3: retryGoldenOnce returns success when the first run fails and the retry passes', () => {
  let calls = 0;
  const exit = retryGoldenOnce(() => {
    calls += 1;
    return calls === 1 ? 7 : 0;
  });
  assert.equal(exit, 0, 'retry must recover from a transient GV failure');
  assert.equal(calls, 2);
});

test('P0-3: retryGoldenOnce fails when both runs fail (bounded retry)', () => {
  const exit = retryGoldenOnce(() => 7);
  assert.equal(exit, 7, 'bounded single retry must not mask persistent failure');
});
