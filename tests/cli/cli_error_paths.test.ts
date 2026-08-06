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

test('far ask: --profile competition 有凭据 → 凭据门放行 + 真实调用路径（G3 已闭合·本地拒绝端口离线驱动）', () => {
  // 2026-08-06 G3 闭合：production profile + 凭据 → 不再 G3 阻塞（环境锚替代七分量桥）。
  // 真实 HTTP 不可离线测 → 注入 COMPETITION_BASE_URL=127.0.0.1:9（拒绝端口）→ 3 档 fallback
  // 全部 ECONNREFUSED（毫秒级）→ RETRY_EXHAUSTED → loop error → exit 1（离线确定性）。
  // 断言核心：凭据门已过（无 credentials 错误）+ 进入真实调用失败路径（非凭据门拒绝）。
  const r = runFar(['ask', 'test', '--profile', 'competition_aliyun_qwen'], {
    FAR_DASHSCOPE_API_KEY: 'sk-test-fake-not-used-no-http-on-construct',
    COMPETITION_BASE_URL: 'http://127.0.0.1:9',
  });
  assert.notStrictEqual(r.status, 2, '凭据门放行后不得以参数错误退出');
  assert.doesNotMatch(
    r.stderr,
    /needs real LLM credentials/,
    '凭据门不得误拒（变量名对齐回归·2026-08-06）',
  );
  assert.doesNotMatch(
    r.stderr,
    /reproducibility bridge|DIGEST G3|not yet wired/,
    'G3 已闭合：不得再报 repro bridge 阻塞',
  );
});

test('far ask: --profile competition 仅 DASHSCOPE_API_KEY（.env SSOT 名）→ 凭据门放行（变量名对齐回归）', () => {
  // 2026-08-06 修复：凭据门此前只读 FAR_DASHSCOPE_API_KEY，忽略 adapter 层 SSOT 变量名
  // DASHSCOPE_API_KEY——已配置 .env 的用户被误拒。修复后回退读取 → 进入真实调用路径
  // （本地拒绝端口·离线确定性）。
  const r = runFar(['ask', 'test', '--profile', 'competition_aliyun_qwen'], {
    DASHSCOPE_API_KEY: 'sk-test-fake-not-used-no-http-on-construct',
    COMPETITION_BASE_URL: 'http://127.0.0.1:9',
  });
  assert.notStrictEqual(r.status, 2, '凭据门放行后不得以参数错误退出');
  assert.doesNotMatch(r.stderr, /needs real LLM credentials/, '凭据门不得误拒 DASHSCOPE_API_KEY');
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
