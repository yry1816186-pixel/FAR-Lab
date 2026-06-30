/**
 * health 路由测试——GET /health + GET /ready（24§5.3 / 17 Epic K-01）。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/24_API网关与接口规范_API_GATEWAY.md §0.3 / §5.3.
 *
 * 覆盖：
 *   - GET /health 返回 200 + status='ok' + service='far-chain-api' + ISO timestamp
 *   - GET /ready 返回 200 + status='ready' 当 DB ping 成功
 *   - GET /ready 返回 503 + status='not_ready' 当 DB ping 失败
 *   - 健康路由裸根（不挂 /api/v1 前缀·24§0.3 探针豁免）
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

test('GET /health returns 200 with status=ok', async () => {
  const db = openDb();
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(response.statusCode, 200);
    const body = response.json() as { status: string; service: string; timestamp: string };
    assert.equal(body.status, 'ok');
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /health returns service=far-chain-api', async () => {
  const db = openDb();
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({ method: 'GET', url: '/health' });
    const body = response.json() as { service: string };
    assert.equal(body.service, 'far-chain-api');
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /health returns ISO 8601 timestamp', async () => {
  const db = openDb();
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({ method: 'GET', url: '/health' });
    const body = response.json() as { timestamp: string };
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    assert.match(body.timestamp, isoRegex);
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /ready returns 200 + status=ready when DB ok', async () => {
  const db = openDb();
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({ method: 'GET', url: '/ready' });
    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      status: string;
      checks: { database: string };
    };
    assert.equal(body.status, 'ready');
    assert.equal(body.checks.database, 'ok');
  } finally {
    await app.close();
    db.close();
  }
});

test('GET /ready returns 503 + status=not_ready when DB fails', async () => {
  const db = openDb();
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    db.close();
    const response = await app.inject({ method: 'GET', url: '/ready' });
    assert.equal(response.statusCode, 503);
    const body = response.json() as {
      status: string;
      checks: { database: string };
    };
    assert.equal(body.status, 'not_ready');
    assert.equal(body.checks.database, 'fail');
  } finally {
    await app.close();
  }
});
