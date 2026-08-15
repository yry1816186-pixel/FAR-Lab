// tests/api/arena.test.ts
// 竞技场路由契约：罐头 /arena/demo 端点已删除（404）；回放行为仅经显式注入网关的 POST /arena 可达。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/index.ts';
import { buildServer } from '../../src/api/server.ts';
import { createLlmGateway } from '../../src/llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  return db;
}

function buildApp() {
  // 显式离线回放网关（测试接线 opt-in——服务层无网关时已 503 fail-closed）
  return buildServer({
    db: makeDb(),
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    gateway: createLlmGateway([createOfflineReplayAdapter({ modelId: 'arena-test-model' })]),
    profile: 'offline_replay',
    logger: false,
  });
}

test('GET /arena/demo: 已删除（预制罐头演示面清零）→ 404', async () => {
  const app = await buildApp();
  try {
    const res = await app.inject({ method: 'GET', url: '/api/v1/arena/demo' });
    assert.equal(res.statusCode, 404);
  } finally {
    await app.close();
  }
});

test('POST /arena（显式回放网关）: 返回 ArenaResult（proponent + 3 refuter · robust · 每请求新跑）', async () => {
  const app = await buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/arena',
      payload: {
        hypothesis: 'C-ASTRO-0001: TIC lightcurve exhibits a transit-like periodic signal (existence claim)',
        refuters: ['scope-launderer', 'post-hoc-threshold', 'dataset-drift'],
      },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body).data;
    assert.match(body.arenaId, /^01/); // ULID
    assert.equal(typeof body.originalVerdict, 'string'); // 回放必有原始裁决
    assert.equal(Array.isArray(body.attempts), true);
    assert.equal(body.attempts.length, 3);
    // 回放同 fixture → 无有效攻击 → robust。
    assert.equal(body.robust, true);
    assert.equal(body.landedCount, 0);
    // 每 refuter 尝试。
    for (const a of body.attempts) {
      assert.equal(typeof a.refuter, 'string');
      assert.equal(a.attackLanded, false); // 回放同 fixture
    }
    assert.equal(typeof body.honestNote, 'string');
    assert.ok(body.honestNote.length > 0);
  } finally {
    await app.close();
  }
});

test('POST /arena（显式回放网关）: 两次请求各自新跑（无罐头缓存）', async () => {
  const app = await buildApp();
  try {
    const payload = {
      hypothesis: 'C-ASTRO-0001: TIC lightcurve exhibits a transit-like periodic signal (existence claim)',
      refuters: ['scope-launderer', 'post-hoc-threshold', 'dataset-drift'],
    };
    const res1 = await app.inject({ method: 'POST', url: '/api/v1/arena', payload });
    const res2 = await app.inject({ method: 'POST', url: '/api/v1/arena', payload });
    assert.equal(res1.statusCode, 200);
    assert.equal(res2.statusCode, 200);
    // 无单例缓存：两次是独立 session（不同 arenaId——非罐头复用）。
    assert.notEqual(JSON.parse(res2.body).data.arenaId, JSON.parse(res1.body).data.arenaId);
  } finally {
    await app.close();
  }
});
