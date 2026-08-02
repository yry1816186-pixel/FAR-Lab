/**
 * migrator_safety.test.ts — db.migrator 迁移安全守卫(前向不兼容检测)。
 *
 * runMigrations (migrator.ts:31) 对 DB schema_meta 中存在但代码迁移集不含的版本
 * fail-closed 抛错(L45):防止旧代码意外降级读新 schema 崩溃。此前零测覆盖。
 *
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 桩。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations, getSchemaMetaRows } from '../../src/db/migrator.ts';

test('migrator: DB schema 版本高于代码迁移集 → fail-closed(前向不兼容检测)', () => {
  const db = new Database(':memory:');
  try {
    runMigrations(db); // 应用全部迁移,创建 schema_meta
    // 模拟"DB 来自未来版本":插入一个代码迁移集中不存在的版本
    db.prepare('INSERT INTO schema_meta (version, name) VALUES (?, ?)').run(9999, 'future_migration');
    // 再次 runMigrations → 检测到未知版本 → fail-closed
    assert.throws(
      () => runMigrations(db),
      /database schema version 9999 is newer than available migrations/,
      'DB 版本高于代码须 fail-closed(防降级代码读新 schema 崩溃)',
    );
  } finally {
    db.close();
  }
});

test('migrator: 已应用迁移被正确跳过 + schema_meta 可读(回归基线)', () => {
  const db = new Database(':memory:');
  try {
    const first = runMigrations(db);
    assert.ok(first.applied.length > 0, '首次须应用迁移');
    const rowsAfterFirst = getSchemaMetaRows(db);
    assert.equal(rowsAfterFirst.length, first.applied.length);

    const second = runMigrations(db);
    assert.equal(second.applied.length, 0, '二次须全部跳过(幂等)');
    assert.equal(second.skipped.length, first.applied.length);
    assert.equal(getSchemaMetaRows(db).length, rowsAfterFirst.length, 'schema_meta 行数不变');
  } finally {
    db.close();
  }
});
