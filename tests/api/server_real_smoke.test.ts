/**
 * server_real_smoke —— DEF-13 偿还：真实长驻 server（端口绑定）+ 真实 HTTP 健康探针。
 *
 * 与 health.test.ts 的区别：health.test.ts 用 fastify `inject()`（进程内·不走真实 TCP 栈）。
 * DEF-13（DEFERRAL_REGISTER）明确要求「长驻 server 启动 + 健康检查」实跑证据——即证明 server
 * 真实 bind 端口、走完整 TCP/HTTP 栈、/health 与 /ready 端到端可达。本测试用 app.listen({port:0})
 * 取 OS 分配临时端口，用全局 fetch 真打 HTTP，闭合该证据缺口。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。端口 0 = OS 分配·无冲突。
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

/** 绑定 OS 临时端口（port 0）启动真实 server，返回 base URL + 关闭句柄。 */
async function startRealServer(): Promise<{ base: string; close: () => Promise<void> }> {
  const db = openDb();
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('server_real_smoke: expected TCP address from app.listen');
  }
  const port = address.port;
  return {
    base: `http://127.0.0.1:${port}`,
    close: async () => {
      await app.close();
      db.close();
    },
  };
}

test('DEF-13: 真实长驻 server 启动 + GET /health 经完整 TCP/HTTP 栈返回 200', async () => {
  const { base, close } = await startRealServer();
  try {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200, '/health must return 200 over real HTTP');
    const body = (await res.json()) as { status: string; service: string; timestamp: string };
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'far-chain-api');
    assert.match(body.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, 'ISO 8601 timestamp');
  } finally {
    await close();
  }
});

test('DEF-13: 真实长驻 server + GET /ready 经完整 TCP/HTTP 栈返回 200 + DB ok', async () => {
  const { base, close } = await startRealServer();
  try {
    const res = await fetch(`${base}/ready`);
    assert.equal(res.status, 200, '/ready must return 200 over real HTTP when DB ok');
    const body = (await res.json()) as {
      status: string;
      checks: { database: string };
    };
    assert.equal(body.status, 'ready');
    assert.equal(body.checks.database, 'ok');
  } finally {
    await close();
  }
});

test('DEF-13: 未知路径经真实 HTTP 栈返回 404（证明路由层完整接线·非全通配）', async () => {
  const { base, close } = await startRealServer();
  try {
    const res = await fetch(`${base}/api/v1/this-route-does-not-exist`);
    assert.equal(res.status, 404, 'unknown route must 404 (proves real routing, not catch-all)');
  } finally {
    await close();
  }
});
