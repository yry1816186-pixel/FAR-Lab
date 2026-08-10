/**
 * hypothesize_coverage.test.ts —— POST /hypothesize 错误路径补充测试（L2 coverage-batch2）。
 *
 * 目标：src/api/routes/hypothesize.ts branch ≥75%（Z16 门禁）。
 * 补齐既有 hypothesize.test.ts 未覆盖的分支（line 142-149·executeLoop 失败清理）：
 *   - executeLoop throw + 无 idempotencyKey → catch 仅 rethrow → 500（不残留占位）
 *   - executeLoop throw + 有 idempotencyKey → catch 删 pending 占位 + rethrow → 500
 *     （占位清理后同 key 可重试——断言 DB 中无残留记录）
 *
 * 触发方式（源码实证）：HypothesizeRequestSchema 只校验 researchInput 长度 ≥1，
 * 而 executeLoop（loop_runner.ts:171-173）要求 researchInput.trim() 非空——
 * 传入纯空格 ' ' 通过 zod 但 executeLoop 抛错 → 命中 hypothesize.ts catch 分支。
 *
 * 铁律：测试期望基于源码实际行为；无空断言。
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

test('POST /hypothesize: executeLoop 失败（trim 空输入）无 idempotencyKey → 500 且不残留占位', async () => {
  const db = openDb();
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/hypothesize',
      payload: { researchInput: '   ', mode: 'quick' },
    });
    // zod min(1) 通过（长度 3）→ executeLoop 抛 trim 空 → catch 仅 rethrow → 500
    assert.equal(response.statusCode, 500, 'executeLoop 抛错须传播为 500');
    const body = response.json() as { error_code: string };
    assert.equal(body.error_code, 'INTERNAL_ERROR');
    // 无 idemKey → 无占位可清理·幂等表保持空
    const rows = db.prepare(`SELECT COUNT(*) AS c FROM hypothesize_idempotency`).get() as { c: number };
    assert.equal(rows.c, 0, '无 idempotencyKey 请求不应写入幂等表');
  } finally {
    await app.close();
    db.close();
  }
});

test('POST /hypothesize: executeLoop 失败 + idempotencyKey → 清理 pending 占位（可重试）+ 500', async () => {
  const db = openDb();
  const app = await buildServer({
    db,
    gitCommitSha: 'a'.repeat(40),
    jwtSecret: null,
    logger: false,
  });
  try {
    const key = 'retry-after-fail-001';
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/hypothesize',
      payload: { researchInput: ' ', mode: 'quick', idempotencyKey: key },
    });
    assert.equal(response.statusCode, 500, 'executeLoop 抛错须传播为 500');
    const body = response.json() as { error_code: string };
    assert.equal(body.error_code, 'INTERNAL_ERROR');

    // 关键断言：claimIdempotency 已写入 pending → catch 分支必须 DELETE 占位
    const row = db
      .prepare(`SELECT status FROM hypothesize_idempotency WHERE idempotency_key = ?`)
      .get(key);
    assert.equal(row, undefined, '失败路径必须清理 pending 占位（同 key 可重试）');
  } finally {
    await app.close();
    db.close();
  }
});
