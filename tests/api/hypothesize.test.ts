/**
 * hypothesize 路由测试——POST /api/v1/hypothesize（24§5 / 17 Epic K-01）。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/24_API网关与接口规范_API_GATEWAY.md §5 / 17 Epic K-01.
 *
 * 覆盖：
 *   - 成功路径：返回 200 + loopState + graphSubtree + honestVerdict + reproHash
 *   - 400 on empty researchInput
 *   - 400 on missing researchInput
 *   - 400 on researchInput > 2000 chars
 *   - 400 on invalid mode value
 *   - 400 on invalid dialogueMode value
 *   - 成功路径返回的 reproHash 为 64 字符 hex
 *   - quick 模式 loopState.terminated === true
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

async function withServer<T>(
  fn: (app: import('fastify').FastifyInstance) => Promise<T>,
): Promise<T> {
  const db = openDb();
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    return await fn(app);
  } finally {
    await app.close();
    db.close();
  }
}

test('POST /api/v1/hypothesize success returns 200 with full response shape', async () => {
  await withServer(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/hypothesize',
      payload: {
        researchInput: '观察现象：室温下水滴 10 分钟未蒸发',
        mode: 'quick',
        dialogueMode: 'disabled',
      },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      loopState: { terminated: boolean };
      graphSubtree: { rootId: string; nodes: readonly unknown[]; edges: readonly unknown[] };
      honestVerdict: unknown;
      reproHash: string;
    };
    assert.equal(typeof body.loopState.terminated, 'boolean');
    assert.equal(typeof body.graphSubtree.rootId, 'string');
    assert.ok(Array.isArray(body.graphSubtree.nodes));
    assert.ok(Array.isArray(body.graphSubtree.edges));
    assert.equal(typeof body.reproHash, 'string');
  });
});

test('POST /api/v1/hypothesize returns 400 on empty researchInput', async () => {
  await withServer(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/hypothesize',
      payload: { researchInput: '', mode: 'quick' },
    });
    assert.equal(response.statusCode, 400);
    const body = response.json() as { error_code: string };
    assert.equal(body.error_code, 'VALIDATION_FAILED');
  });
});

test('POST /api/v1/hypothesize returns 400 on missing researchInput', async () => {
  await withServer(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/hypothesize',
      payload: { mode: 'quick' },
    });
    assert.equal(response.statusCode, 400);
    const body = response.json() as { error_code: string };
    assert.equal(body.error_code, 'VALIDATION_FAILED');
  });
});

test('POST /api/v1/hypothesize returns 400 on researchInput > 2000 chars', async () => {
  await withServer(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/hypothesize',
      payload: { researchInput: 'x'.repeat(2001), mode: 'quick' },
    });
    assert.equal(response.statusCode, 400);
    const body = response.json() as { error_code: string };
    assert.equal(body.error_code, 'VALIDATION_FAILED');
  });
});

test('POST /api/v1/hypothesize returns 400 on invalid mode value', async () => {
  await withServer(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/hypothesize',
      payload: {
        researchInput: '测试输入',
        mode: 'invalid_mode_value',
      },
    });
    assert.equal(response.statusCode, 400);
    const body = response.json() as { error_code: string };
    assert.equal(body.error_code, 'VALIDATION_FAILED');
  });
});

test('POST /api/v1/hypothesize returns 400 on invalid dialogueMode value', async () => {
  await withServer(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/hypothesize',
      payload: {
        researchInput: '测试输入',
        mode: 'quick',
        dialogueMode: 'yes',
      },
    });
    assert.equal(response.statusCode, 400);
    const body = response.json() as { error_code: string };
    assert.equal(body.error_code, 'VALIDATION_FAILED');
  });
});

test('POST /api/v1/hypothesize success reproHash is 64-character hex', async () => {
  await withServer(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/hypothesize',
      payload: {
        researchInput: '测试假设输入',
        mode: 'quick',
      },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json() as { reproHash: string };
    assert.match(body.reproHash, /^[0-9a-f]{64}$/);
  });
});

test('POST /api/v1/hypothesize quick mode loopState.terminated === true', async () => {
  await withServer(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/hypothesize',
      payload: {
        researchInput: '假设：温度对反应速率的影响',
        mode: 'quick',
      },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      loopState: { terminated: boolean; terminationReason?: string };
    };
    assert.equal(body.loopState.terminated, true);
  });
});
