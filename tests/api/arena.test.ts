// tests/api/arena.test.ts
// 测 GET /arena/demo 端点：返回 ArenaResult（offline_replay proponent + 3 refuter·robust）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/index.ts';
import { buildServer } from '../../src/api/server.ts';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  return db;
}

function buildApp() {
  return buildServer({
    db: makeDb(),
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
}

test('GET /arena/demo: 返回 ArenaResult（proponent + 3 refuter · robust · offline）', async () => {
  const app = await buildApp();
  try {
    const res = await app.inject({ method: 'GET', url: '/api/v1/arena/demo' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.match(body.arenaId, /^01/); // ULID
    assert.equal(typeof body.originalVerdict, 'string'); // offline_replay 必有原始裁决
    assert.equal(Array.isArray(body.attempts), true);
    assert.equal(body.attempts.length, 3);
    // offline_replay 同 fixture → 无有效攻击 → robust。
    assert.equal(body.robust, true);
    assert.equal(body.landedCount, 0);
    // 每 refuter 尝试。
    for (const a of body.attempts) {
      assert.equal(typeof a.refuter, 'string');
      assert.equal(a.attackLanded, false); // offline 同 fixture
    }
    assert.match(body.honestNote, /offline_replay/);
  } finally {
    await app.close();
  }
});

test('GET /arena/demo: 第二次请求命中缓存（同 arenaId）', async () => {
  const app = await buildApp();
  try {
    const res1 = await app.inject({ method: 'GET', url: '/api/v1/arena/demo' });
    const res2 = await app.inject({ method: 'GET', url: '/api/v1/arena/demo' });
    assert.equal(JSON.parse(res2.body).arenaId, JSON.parse(res1.body).arenaId);
  } finally {
    await app.close();
  }
});
