// tests/cli/cli_error_paths.test.ts
// CLI 命令 fail-closed 验证：错误输入不静默通过（exit 2 + stderr 指引）。
//
// 验证每个命令的参数校验 + 凭据门 + 文件门。证明 CLI 是 fail-closed（错误输入明确报错退出，
// 不静默跑出错误结果）。这是反剧场红线的产品层落地。

import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert';

function runFar(args: readonly string[], env?: NodeJS.ProcessEnv): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const r = spawnSync(process.execPath, ['src/cli/far.ts', ...args], {
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, ...env },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('far ask: 缺 question → exit 2 + 指引', () => {
  const r = runFar(['ask']);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /missing question/);
});

test('far ask: --profile competition 无凭据 → exit 2 fail-closed（凭据门）', () => {
  const r = runFar(['ask', 'test', '--profile', 'competition_aliyun_qwen'], {
    FAR_DASHSCOPE_API_KEY: '',
  });
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /credentials|FAR_DASHSCOPE_API_KEY/);
});

test('far ask: --mode 非法值 → exit 非 0（参数校验）', () => {
  const r = runFar(['ask', 'test', '--mode', 'invalid']);
  assert.notStrictEqual(r.status, 0);
});

test('far stream: 缺 question → exit 2', () => {
  const r = runFar(['stream']);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /missing question/);
});

test('far court: 缺 claim → exit 2', () => {
  const r = runFar(['court']);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /missing claim/);
});

test('far arena: 缺 hypothesis → exit 2', () => {
  const r = runFar(['arena']);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /missing hypothesis/);
});

test('far init: 缺 domain → exit 非 0（参数校验）', () => {
  const r = runFar(['init']);
  assert.notStrictEqual(r.status, 0);
});

test('far replay: 缺 --db/--bundle → exit 非 0（参数校验）', () => {
  const r = runFar(['replay']);
  assert.notStrictEqual(r.status, 0);
});

test('far replay: --db 不存在文件 → exit 非 0（fileMustExist 门）', () => {
  const r = runFar(['replay', '--db', '/nonexistent/path/does-not-exist.db']);
  assert.notStrictEqual(r.status, 0);
});

test('far ask: 未知参数 → exit 非 0（不静默吞）', () => {
  const r = runFar(['ask', 'test', '--bogus-flag']);
  assert.notStrictEqual(r.status, 0);
});
