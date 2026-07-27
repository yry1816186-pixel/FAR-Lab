// tests/api/server_fail_closed.test.ts
//
// F-5-10-005 RED→GREEN: startServer 非 loopback host + 无 jwtSecret → fail-closed throw。
// 防匿名暴露 /hypothesize（触发真实百炼计费/DoS）。安全默认 host=127.0.0.1。
//
// Authority: 评委10 F-5-10-005 + src/api/server.ts startServer。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openFarDb } from '../../src/db/open.ts';
import { startServer } from '../../src/api/server.ts';
import { parseApiArgs } from '../../src/cli/commands/api.ts';

test('startServer: 非 loopback host(0.0.0.0) + jwtSecret=null → fail-closed throw（不监听）', async () => {
  const db = openFarDb(':memory:');
  try {
    // port=1 不可能监听成功，但 fail-closed 在 listen 前抛，根本不会到达 listen
    await assert.rejects(
      () => startServer({ db, gitCommitSha: 'a'.repeat(40), jwtSecret: null }, 1, '0.0.0.0'),
      /fail-closed/,
    );
  } finally {
    db.close();
  }
});

test('startServer: 非 loopback host + 有 jwtSecret → 不 throw（受保护模式允许公开）', async () => {
  const db = openFarDb(':memory:');
  // 用随机高端口真监听一次验证"有 jwt 时不 fail-closed"，然后立即关
  const port = 49000 + Math.floor(Math.random() * 1000);
  let app: { close: () => Promise<void> } | null = null;
  try {
    app = await startServer(
      { db, gitCommitSha: 'a'.repeat(40), jwtSecret: 'test-secret-not-for-prod' },
      port,
      '127.0.0.1',
    );
    assert.notEqual(app, null, '受保护模式（有 jwtSecret）须成功启动');
  } finally {
    if (app !== null) {
      await app.close();
    }
    db.close();
  }
});

test('parseApiArgs: 默认 host=127.0.0.1（安全默认·F-5-10-005）', () => {
  const args = parseApiArgs([]);
  assert.equal(args.host, '127.0.0.1', '默认 host 须为 loopback（安全默认）');
});

test('parseApiArgs: --host 0.0.0.0 透传', () => {
  const args = parseApiArgs(['--host', '0.0.0.0']);
  assert.equal(args.host, '0.0.0.0');
});

test('parseApiArgs: --host 与 --protected 组合', () => {
  // 设置环境变量供 --protected 读取
  const prev = process.env.FAR_JWT_SECRET;
  process.env.FAR_JWT_SECRET = 'env-secret';
  try {
    const args = parseApiArgs(['--host', '0.0.0.0', '--protected']);
    assert.equal(args.host, '0.0.0.0');
    assert.equal(args.jwtSecret, 'env-secret');
  } finally {
    if (prev === undefined) {
      delete process.env.FAR_JWT_SECRET;
    } else {
      process.env.FAR_JWT_SECRET = prev;
    }
  }
});
