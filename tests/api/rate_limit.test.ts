/**
 * rate_limit 测试——@fastify/rate-limit 限流（24§4）。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/24_API网关与接口规范_API_GATEWAY.md §4.
 *
 * 覆盖：
 *   - 超过 max 请求数后返回 429
 *   - 429 响应含 RATE_LIMITED error_code
 *   - 429 响应含 source_anchor（24 红线·错误响应必含 source_anchor）
 *
 * 测试策略：
 *   - rateLimitMax=3 触发限流（第 4 个请求返回 429）
 *   - 用独立 server 实例（避免与其他测试限流窗口冲突）
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { runMigrations } from '../../src/db/index.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { buildServer } from '../../src/api/server.ts';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

test('rate limit returns 429 after exceeding max requests', async () => {
  const db = openDb();
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    rateLimitMax: 3,
    logger: false,
  });
  try {
    const r1 = await app.inject({ method: 'GET', url: '/health' });
    const r2 = await app.inject({ method: 'GET', url: '/health' });
    const r3 = await app.inject({ method: 'GET', url: '/health' });
    const r4 = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(r1.statusCode, 200);
    assert.equal(r2.statusCode, 200);
    assert.equal(r3.statusCode, 200);
    assert.equal(r4.statusCode, 429);
  } finally {
    await app.close();
    db.close();
  }
});

test('429 response contains RATE_LIMITED error_code', async () => {
  const db = openDb();
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    rateLimitMax: 2,
    logger: false,
  });
  try {
    await app.inject({ method: 'GET', url: '/health' });
    await app.inject({ method: 'GET', url: '/health' });
    const r3 = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(r3.statusCode, 429);
    const body = r3.json() as { error_code: string };
    assert.equal(body.error_code, 'RATE_LIMITED');
  } finally {
    await app.close();
    db.close();
  }
});

test('429 response includes source_anchor', async () => {
  const db = openDb();
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    rateLimitMax: 1,
    logger: false,
  });
  try {
    await app.inject({ method: 'GET', url: '/health' });
    const r2 = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(r2.statusCode, 429);
    const body = r2.json() as {
      error_code: string;
      source_anchor: {
        fileId: string | null;
        stageId: string | null;
        callRecordId: string | null;
      };
    };
    assert.ok(body.source_anchor !== undefined);
    assert.equal(body.source_anchor.fileId, null);
    assert.equal(body.source_anchor.stageId, null);
    assert.equal(body.source_anchor.callRecordId, null);
  } finally {
    await app.close();
    db.close();
  }
});
