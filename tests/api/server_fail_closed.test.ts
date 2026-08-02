// tests/api/server_fail_closed.test.ts
//
// FIX-R6-002: startServer 撤销 R5 的 host-inference fail-closed，改 opt-in 鉴权设计。
//   - 匿名（jwtSecret=null）是默认，任意 host 均可启动（恢复 README 背书的 `docker compose up far-api` demo）
//   - --protected/--jwt-secret <非空> opt-in 强制 JWT 鉴权
//   - 空 secret 由 FIX-R6-001 拒绝（→null→offline），关闭 "" 伪造 admin 漏洞
//
// R5 的 fail-closed throw 测试已过时（设计变更）；本测试改为验证 opt-in 设计 + 空 secret guard。
//
// Authority: 评委03/11(F-R6 回归 demo 路径) + 评委09(F-R6-09-01 空 secret 绕过) + 评委13(答辩 unblock)。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openFarDb } from '../../src/db/open.ts';
import { startServer } from '../../src/api/server.ts';
import { parseApiArgs } from '../../src/cli/commands/api.ts';

test('FIX-R6-002: startServer 非 loopback(0.0.0.0) + jwtSecret=null → 启动成功（opt-in 匿名默认,不再 throw）', async () => {
  const db = openFarDb(':memory:');
  const port = 0; // OS-assigned ephemeral port — never EACCES on Windows-reserved ranges (49100-50199 可被 Hyper-V/WSL/Docker 预留)
  let app: { close: () => Promise<void> } | null = null;
  try {
    // 匿名（无 jwtSecret）+ 0.0.0.0 须成功启动（恢复 Docker demo 路径·R5 fail-closed 已撤销）
    app = await startServer({ db, gitCommitSha: 'a'.repeat(40), jwtSecret: null }, port, '0.0.0.0');
    assert.notEqual(app, null, 'opt-in 设计: 匿名 + 任意 host 须启动（不再 fail-closed throw）');
  } finally {
    if (app !== null) {
      await app.close();
    }
    db.close();
  }
});

test('startServer: 有 jwtSecret → 启动成功（受保护模式 opt-in）', async () => {
  const db = openFarDb(':memory:');
  const port = 0; // OS-assigned ephemeral port — never EACCES on Windows-reserved ranges (49100-50199 可被 Hyper-V/WSL/Docker 预留)
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

test('parseApiArgs: 默认 host=127.0.0.1（安全默认）', () => {
  const args = parseApiArgs([]);
  assert.equal(args.host, '127.0.0.1', '默认 host 须为 loopback（安全默认）');
});

test('parseApiArgs: --host 0.0.0.0 透传', () => {
  const args = parseApiArgs(['--host', '0.0.0.0']);
  assert.equal(args.host, '0.0.0.0');
});

test('parseApiArgs: --host 与 --protected 组合（非空 env）', () => {
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

test('FIX-R6-001: parseApiArgs --protected + FAR_JWT_SECRET="" → jwtSecret=null（空 secret 被拒,关伪造 admin）', () => {
  const prev = process.env.FAR_JWT_SECRET;
  process.env.FAR_JWT_SECRET = '';
  try {
    const args = parseApiArgs(['--host', '0.0.0.0', '--protected']);
    // 空 secret 须被拒为 null（R5 的 ?? null 只接 undefined 不接 ""，会致 HS256 空 key 可伪造 admin JWT）
    assert.equal(args.jwtSecret, null, '空 "" secret 须被拒（FIX-R6-001），不得产生可伪造的空 key');
  } finally {
    if (prev === undefined) {
      delete process.env.FAR_JWT_SECRET;
    } else {
      process.env.FAR_JWT_SECRET = prev;
    }
  }
});

test('FIX-R6-001: parseApiArgs --protected + 无 env → jwtSecret=null（缺失 secret 也被拒）', () => {
  const prev = process.env.FAR_JWT_SECRET;
  delete process.env.FAR_JWT_SECRET;
  try {
    const args = parseApiArgs(['--host', '0.0.0.0', '--protected']);
    assert.equal(args.jwtSecret, null, '缺失 secret 须为 null（offline 匿名默认）');
  } finally {
    if (prev === undefined) {
      delete process.env.FAR_JWT_SECRET;
    } else {
      process.env.FAR_JWT_SECRET = prev;
    }
  }
});
