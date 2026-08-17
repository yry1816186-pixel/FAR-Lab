/**
 * UX-CLI-001 测试族：TTY/非 TTY、pipe、cancel（两阶段 SIGINT）。
 *
 * 覆盖：
 *   1. ansiEnabled 决策矩阵：TTY×NO_COLOR×force×disable（NO_COLOR 最高优先·disable 次之·
 *      force 强开·非 TTY 默认关）；
 *   2. pipe 集成：spawnSync `far --help`（stdout 管道 = 非 TTY）→ exit 0 且输出零 ANSI 转义；
 *   3. 两阶段 SIGINT：第一次 = cancelRun + 提示、不 kill；第二次 = 摘除监听 + re-raise。
 *
 * 权威：src/cli/render.ts ansiEnabled + src/cli/two_phase_sigint.ts。零容忍合规。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ansiEnabled } from '../../src/cli/render.ts';
import { SIGINT_GRACEFUL_MESSAGE, createTwoPhaseSigintHandler } from '../../src/cli/two_phase_sigint.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

function withNoColor<T>(value: string | undefined, fn: () => T): T {
  const prev = process.env.NO_COLOR;
  if (value === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = prev;
  }
}

const ttyLike = { isTTY: true };
const nonTty = { isTTY: false };

test('ansiEnabled: 非 TTY 默认关闭，TTY 默认开启', () => {
  withNoColor(undefined, () => {
    assert.equal(ansiEnabled({ stream: nonTty }), false, 'pipe/重定向场景不得输出 ANSI');
    assert.equal(ansiEnabled({ stream: ttyLike }), true, '真实终端默认着色');
  });
});

test('ansiEnabled: NO_COLOR 规范最高优先（压过 force 与 TTY）', () => {
  withNoColor('1', () => {
    assert.equal(ansiEnabled({ stream: ttyLike }), false, 'NO_COLOR + TTY → 关');
    assert.equal(ansiEnabled({ stream: ttyLike, force: true }), false, 'NO_COLOR 须压过 force');
  });
  withNoColor('', () => {
    assert.equal(ansiEnabled({ stream: ttyLike }), true, '空 NO_COLOR 按规范视为未设置');
  });
});

test('ansiEnabled: disable 压过 TTY；force 对非 TTY 强开（显式意图优先于探测）', () => {
  withNoColor(undefined, () => {
    assert.equal(ansiEnabled({ stream: ttyLike, disable: true }), false, 'disable + TTY → 关');
    assert.equal(ansiEnabled({ stream: nonTty, force: true }), true, 'force + pipe → 开（CI 日志高亮场景）');
  });
});

test('pipe 集成：far --help 管道输出 → exit 0 且零 ANSI 转义', () => {
  const result = spawnSync(process.execPath, [join(repoRoot, 'src', 'cli', 'far.ts'), '--help'], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.equal(result.status, 0, `help 须退出 0（stderr: ${result.stderr}）`);
  assert.doesNotMatch(result.stdout, /\u001b\[/, '非 TTY（管道）输出不得含 ANSI 转义序列');
  assert.ok(result.stdout.includes('far'), 'help 文本非空');
});

test('两阶段 SIGINT：第一次优雅取消 + 提示，不自杀', () => {
  const calls: string[] = [];
  let removed: (() => void) | null = null;
  const handler = createTwoPhaseSigintHandler({
    cancelRun: () => calls.push('cancel'),
    notify: (m) => {
      calls.push(`notify:${m}`);
    },
    killSelf: () => calls.push('kill'),
    removeListener: (fn) => {
      removed = fn;
      calls.push('remove');
    },
  });
  handler();
  assert.deepEqual(calls, ['cancel', `notify:${SIGINT_GRACEFUL_MESSAGE}`], '第一阶段只取消+提示');
  assert.equal(removed, null, '第一阶段不得摘除监听');
});

test('两阶段 SIGINT：第二次摘除自身并 re-raise（拿到的是同一函数引用）', () => {
  const calls: string[] = [];
  let removed: (() => void) | null = null;
  const handler = createTwoPhaseSigintHandler({
    cancelRun: () => calls.push('cancel'),
    notify: () => calls.push('notify'),
    killSelf: () => calls.push('kill'),
    removeListener: (fn) => {
      removed = fn;
      calls.push('remove');
    },
  });
  handler();
  handler();
  assert.deepEqual(calls, ['cancel', 'notify', 'remove', 'kill'], '第二阶段 = 摘除 + 终止');
  assert.strictEqual(removed, handler, '摘除的必须是注册的同一处理器引用（否则默认行为不会恢复）');
});
