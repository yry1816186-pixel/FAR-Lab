/**
 * error_handler 测试——统一错误响应格式（RFC 7807 子集·24§0.6）。
 *
 *
 * 覆盖：
 *   - ApiError 携带 source_anchor（fileId/stageId/callRecordId 三元定位·24 红线）
 *   - notFound helper 构造 404 错误
 *   - badRequest helper 构造 400 错误
 *   - internalError helper 构造 500 错误
 *   - 错误响应使用 application/problem+json 内容类型
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { runMigrations } from '../../src/db/index.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { buildServer } from '../../src/api/server.ts';
import {
  ApiError,
  badRequest,
  internalError,
  notFound,
} from '../../src/api/errors/error_handler.ts';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

test('ApiError carries source_anchor with fileId/stageId/callRecordId', () => {
  const err = new ApiError({
    statusCode: 404,
    errorCode: 'NOT_FOUND',
    message: 'evidence not found',
    sourceAnchor: {
      fileId: 'evidence_log.ts',
      stageId: 'stage3_hypothesis',
      callRecordId: 'rec-001',
    },
  });
  assert.equal(err.statusCode, 404);
  assert.equal(err.errorCode, 'NOT_FOUND');
  assert.equal(err.sourceAnchor.fileId, 'evidence_log.ts');
  assert.equal(err.sourceAnchor.stageId, 'stage3_hypothesis');
  assert.equal(err.sourceAnchor.callRecordId, 'rec-001');
});

test('notFound helper builds 404 ApiError', () => {
  const err = notFound('evidence', 'ev-001');
  assert.equal(err.statusCode, 404);
  assert.equal(err.errorCode, 'NOT_FOUND');
  assert.match(err.message, /evidence/);
  assert.match(err.message, /ev-001/);
});

test('badRequest helper builds 400 ApiError', () => {
  const err = badRequest('invalid hash format', { hash: 'short' });
  assert.equal(err.statusCode, 400);
  assert.equal(err.errorCode, 'BAD_REQUEST');
  assert.match(err.message, /invalid hash format/);
  assert.ok(err.detail !== undefined);
});

test('internalError helper builds 500 ApiError', () => {
  const cause = new Error('underlying cause');
  const err = internalError('database connection lost', cause);
  assert.equal(err.statusCode, 500);
  assert.equal(err.errorCode, 'INTERNAL_ERROR');
  assert.match(err.message, /database connection lost/);
});

test('error response uses application/problem+json content type', async () => {
  const db = openDb();
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/evidence/nonexistent',
    });
    assert.equal(response.statusCode, 404);
    assert.match(response.headers['content-type'] ?? '', /application\/problem\+json/);
    const body = response.json() as {
      error_code: string;
      message: string;
      source_anchor: {
        fileId: string | null;
        stageId: string | null;
        callRecordId: string | null;
      };
    };
    assert.equal(body.error_code, 'NOT_FOUND');
    assert.ok(body.source_anchor !== undefined);
    assert.equal(body.source_anchor.fileId, null);
    assert.equal(body.source_anchor.stageId, null);
    assert.equal(body.source_anchor.callRecordId, null);
  } finally {
    await app.close();
    db.close();
  }
});
