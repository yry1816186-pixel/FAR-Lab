// tests/api/court.test.ts
// 测 GET /court/demo 端点：返回 ReliabilityCertificate（offline_replay 3 模型·unanimous）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/index.ts';
import { buildServer } from '../../src/api/server.ts';

function buildApp() {
  return buildServer({
    db: makeDb(),
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
}

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  return db;
}

test('GET /court/demo: 返回 ReliabilityCertificate（3 模型 · unanimous · offline）', async () => {
  const app = await buildApp();
  try {
    const res = await app.inject({ method: 'GET', url: '/api/v1/court/demo' });
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
        assert.equal(typeof v.verdict, 'string'); // offline_replay 必有 verdict（非 null）
      }
      // offline_replay 同 fixture → unanimous。
      assert.equal(body.agreement, 'unanimous');
      // 诚实声明在场。
      assert.match(body.honestNote, /offline_replay/);
    } finally {
      await app.close();
    }
});

test('GET /court/demo: 第二次请求命中缓存（同 certificateId）', async () => {
  const app = await buildApp();
  try {
    const res1 = await app.inject({ method: 'GET', url: '/api/v1/court/demo' });
    const res2 = await app.inject({ method: 'GET', url: '/api/v1/court/demo' });
    const body1 = JSON.parse(res1.body);
    const body2 = JSON.parse(res2.body);
    // 模块级缓存：certificateId 固定（demo 锚·确定性）。
    assert.equal(body2.certificateId, body1.certificateId);
  } finally {
    await app.close();
  }
});
