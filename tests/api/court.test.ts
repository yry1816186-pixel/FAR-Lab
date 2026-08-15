// tests/api/court.test.ts
// 法庭路由契约：罐头 /court/demo 端点已删除（404）；回放行为仅经显式注入网关的 POST /court 可达。

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
    gateway: createLlmGateway([createOfflineReplayAdapter({ modelId: 'court-test-model' })]),
    profile: 'offline_replay',
    logger: false,
  });
}

test('GET /court/demo: 已删除（预制罐头演示面清零）→ 404', async () => {
  const app = await buildApp();
  try {
    const res = await app.inject({ method: 'GET', url: '/api/v1/court/demo' });
    assert.equal(res.statusCode, 404);
  } finally {
    await app.close();
  }
});

test('POST /court（显式回放网关）: 返回 ReliabilityCertificate（3 模型 · unanimous）', async () => {
  const app = await buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/court',
      payload: {
        claim: 'C-ASTRO-0001: TIC lightcurve exhibits a transit-like periodic signal (existence claim)',
        models: ['court-persona-alpha', 'court-persona-beta', 'court-persona-gamma'],
      },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body).data;
    // ReliabilityCertificate 最小 shape。
    assert.equal(typeof body.certificateId, 'string');
    assert.match(body.certificateId, /^01/); // ULID 前缀
    assert.equal(body.modelCount, 3);
    assert.equal(Array.isArray(body.verdicts), true);
    assert.equal(body.verdicts.length, 3);
    // 每个模型裁决条目。
    for (const v of body.verdicts) {
      assert.equal(typeof v.model, 'string');
      assert.equal(typeof v.verdict, 'string'); // 回放必有 verdict（非 null）
    }
    // 回放同 fixture → unanimous。
    assert.equal(body.agreement, 'unanimous');
    // 诚实声明在场。
    assert.equal(typeof body.honestNote, 'string');
    assert.ok(body.honestNote.length > 0);
  } finally {
    await app.close();
  }
});

test('POST /court（显式回放网关）: 两次请求各自新跑（无罐头缓存）', async () => {
  const app = await buildApp();
  try {
    const payload = {
      claim: 'C-ASTRO-0001: TIC lightcurve exhibits a transit-like periodic signal (existence claim)',
      models: ['court-persona-alpha', 'court-persona-beta', 'court-persona-gamma'],
    };
    const res1 = await app.inject({ method: 'POST', url: '/api/v1/court', payload });
    const res2 = await app.inject({ method: 'POST', url: '/api/v1/court', payload });
    assert.equal(res1.statusCode, 200);
    assert.equal(res2.statusCode, 200);
    // 无单例缓存：两次是独立 session（不同 certificateId——非罐头复用）。
    assert.notEqual(
      JSON.parse(res2.body).data.certificateId,
      JSON.parse(res1.body).data.certificateId,
    );
  } finally {
    await app.close();
  }
});
