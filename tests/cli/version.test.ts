// tests/cli/version.test.ts
// far version --json 契约判别测试（CLI_JSON_CONTRACT_CENSUS P2-1 修复锁定）。
//
// 缺陷背景：修复前 runVersion 不接收参数，`far version --json` 被静默忽略——
// stdout 人读文本 + exit 0，是普查中唯一实证的 fail-open（静默忽略）违规。
// 契约（census §4）：--json → stdout 纯 JSON + banner 抑制；未知参数 → stderr usage + exit 2。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runVersion } from '../../src/cli/commands/version.ts';

/** 捕获 stdout/stderr 的最小探针（与 tests/cli/demo.test.ts 同惯例）。 */
function captureStreams(fn: () => number): { code: number; out: string; err: string } {
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  let out = '';
  let err = '';
  process.stdout.write = ((chunk: unknown): boolean => {
    out += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown): boolean => {
    err += String(chunk);
    return true;
  }) as typeof process.stderr.write;
  try {
    const code = fn();
    return { code, out, err };
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
}

test('version --json: stdout 是可解析的纯 JSON 且含 name/version/gitCommit 三键', () => {
  const { code, out, err } = captureStreams(() => runVersion(['--json']));
  assert.equal(code, 0);
  assert.equal(err, '', '--json 成功路径不得写 stderr');
  const parsed = JSON.parse(out) as Record<string, unknown>; // 非纯 JSON 将在此抛错（判别）
  assert.equal(typeof parsed.name, 'string');
  assert.match(parsed.version as string, /^\d+\.\d+\.\d+$/);
  assert.ok(parsed.gitCommit === null || typeof parsed.gitCommit === 'string');
});

test('version --json: banner 被抑制（人读装饰严禁混入 stdout）', () => {
  const { out } = captureStreams(() => runVersion(['--json']));
  assert.ok(!out.includes('Falsification-Anchored'), 'banner 泄漏进 JSON 输出');
  assert.ok(!out.includes('· git'), '人读格式泄漏进 JSON 输出');
  assert.equal(out.trim().split('\n').length, 1, 'JSON 输出必须单文档单行');
});

test('version 无参数: 人读输出保持原契约（不得因 --json 新增而回归）', () => {
  const { code, out } = captureStreams(() => runVersion([]));
  assert.equal(code, 0);
  assert.ok(out.includes('· git'), '人读格式丢失');
  assert.ok(out.includes('Falsification-Anchored'), 'banner 丢失');
});

test('version 未知参数: fail-closed —— exit 2 + stderr usage，stdout 零输出', () => {
  const { code, out, err } = captureStreams(() => runVersion(['--bogus']));
  assert.equal(code, 2, '未知参数必须 usage 错误退出码');
  assert.equal(out, '', '错误路径 stdout 必须干净（census §4-1 流分离）');
  assert.ok(err.includes('usage'), 'stderr 必须给 usage 指引');
  assert.ok(err.includes('--bogus'), 'stderr 必须点名未知参数');
});

test('version --json 与未知参数并存: 仍 fail-closed（--json 不得为未知参数开脱）', () => {
  const { code, out } = captureStreams(() => runVersion(['--json', '--bogus']));
  assert.equal(code, 2);
  assert.equal(out, '', '错误路径不得泄漏 JSON');
});
