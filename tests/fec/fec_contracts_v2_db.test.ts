/**
 * FEC V2 DB 层单测（migration 0009 fec_contracts_v2 + fec_repository）。
 *
 * 覆盖：
 *   1. registerFecV2 写入 + fec_hash=computeFecHash + contract_json round-trip。
 *   2. contract_version='FEC/2.0' CHECK 约束。
 *   3. compiled_by='deterministic_compiler' CHECK 约束（F3）。
 *   4. append-only：UPDATE/DELETE trigger ABORT（F1/F3 物理防线）。
 *   5. getFecV2ByFecId / getFecV2ByClaim 查询 + 缺失 throw。
 *   6. fec_hash 互验：stored.fecHash === computeFecHash(fec)（自引用已规避）。
 *
 * 权威：schema/migrations/0009_fec_contracts_v2.sql + 03 §1.2。
 * 零容忍合规：无 any / @ts-ignore / 改测试期望让实现通过。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/index.ts';
import { computeFecHash } from '../../src/fec/compiler.ts';
import {
  getFecV2ByClaim,
  getFecV2ByFecId,
  registerFecV2,
} from '../../src/fec/fec_repository.ts';
import { makeValidFec } from './fixtures.ts';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

test('registerFecV2: 写入 + fec_hash=computeFecHash + contract_json round-trip', () => {
  const db = openDb();
  try {
    const fec = makeValidFec();
    const stored = registerFecV2(db, { fec, compiledAt: '2020-01-01T00:00:00Z' });
    assert.equal(stored.fec.fecId, 'FEC-TEST-0001');
    assert.equal(stored.fec.contractVersion, 'FEC/2.0');
    assert.equal(stored.fecHash, computeFecHash(fec));
    assert.equal(stored.fecHash.length, 64);
    assert.equal(stored.locked, true);
    assert.equal(stored.compiledAt, '2020-01-01T00:00:00Z');
    // round-trip：读回的 fec 与写入一致（关键字段）。
    assert.equal(stored.fec.measurableImplication, fec.measurableImplication);
    assert.equal(stored.fec.metric.metricKey, 'rmse');
  } finally {
    db.close();
  }
});

test('migration 0009: contract_version CHECK 约束（=FEC/2.0）', () => {
  const db = openDb();
  try {
    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO fec_contracts_v2 (fec_id, claim_id, contract_version, fec_hash, contract_json, compiled_by, compiled_at)
             VALUES (?, ?, 'FEC/1.0', ?, ?, 'deterministic_compiler', ?)`,
          )
          .run('FEC-X', 'C1', '0'.repeat(64), '{}', '2020-01-01'),
    );
  } finally {
    db.close();
  }
});

test('migration 0009: compiled_by CHECK 约束（=deterministic_compiler · F3）', () => {
  const db = openDb();
  try {
    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO fec_contracts_v2 (fec_id, claim_id, contract_version, fec_hash, contract_json, compiled_by, compiled_at)
             VALUES (?, ?, 'FEC/2.0', ?, ?, 'llm_as_judge', ?)`,
          )
          .run('FEC-X', 'C1', '0'.repeat(64), '{}', '2020-01-01'),
    );
  } finally {
    db.close();
  }
});

test('migration 0009: fec_hash length=64 CHECK 约束', () => {
  const db = openDb();
  try {
    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO fec_contracts_v2 (fec_id, claim_id, contract_version, fec_hash, contract_json, compiled_by, compiled_at)
             VALUES (?, ?, 'FEC/2.0', ?, ?, 'deterministic_compiler', ?)`,
          )
          .run('FEC-X', 'C1', 'too-short', '{}', '2020-01-01'),
    );
  } finally {
    db.close();
  }
});

test('migration 0009: append-only UPDATE trigger ABORT', () => {
  const db = openDb();
  try {
    registerFecV2(db, { fec: makeValidFec(), compiledAt: '2020-01-01T00:00:00Z' });
    assert.throws(
      () => db.prepare(`UPDATE fec_contracts_v2 SET locked = 0 WHERE fec_id = ?`).run('FEC-TEST-0001'),
      /append-only/,
    );
  } finally {
    db.close();
  }
});

test('migration 0009: append-only DELETE trigger ABORT', () => {
  const db = openDb();
  try {
    registerFecV2(db, { fec: makeValidFec(), compiledAt: '2020-01-01T00:00:00Z' });
    assert.throws(
      () => db.prepare(`DELETE FROM fec_contracts_v2 WHERE fec_id = ?`).run('FEC-TEST-0001'),
      /append-only/,
    );
  } finally {
    db.close();
  }
});

test('getFecV2ByClaim: 按 claim_id 查询 + 时间排序', () => {
  const db = openDb();
  try {
    registerFecV2(db, { fec: makeValidFec({ fecId: 'FEC-A', claimId: 'CLAIM-X' }), compiledAt: '2020-01-01T00:00:00Z' });
    registerFecV2(db, { fec: makeValidFec({ fecId: 'FEC-B', claimId: 'CLAIM-X' }), compiledAt: '2020-01-02T00:00:00Z' });
    registerFecV2(db, { fec: makeValidFec({ fecId: 'FEC-C', claimId: 'CLAIM-Y' }), compiledAt: '2020-01-03T00:00:00Z' });
    const results = getFecV2ByClaim(db, 'CLAIM-X');
    assert.equal(results.length, 2);
    const [first, second] = results;
    assert.ok(first, 'results[0] 须存在');
    assert.ok(second, 'results[1] 须存在');
    assert.equal(first.fec.fecId, 'FEC-A');
    assert.equal(second.fec.fecId, 'FEC-B');
  } finally {
    db.close();
  }
});

test('getFecV2ByFecId: 不存在 → throw', () => {
  const db = openDb();
  try {
    assert.throws(() => getFecV2ByFecId(db, 'NONEXISTENT'), /not found/);
  } finally {
    db.close();
  }
});

test('fec_hash 互验: stored.fecHash === computeFecHash(fec)（自引用已规避·caller 可令 freeze.fecHash 一致）', () => {
  const db = openDb();
  try {
    const base = makeValidFec();
    // caller 预填 freeze.fecHash = computeFecHash(fec)（computeFecHash 排除 freeze.fecHash·无循环）。
    const fecHash = computeFecHash(base);
    const fec = makeValidFec({ freeze: { ...base.freeze, fecHash } });
    const stored = registerFecV2(db, { fec, compiledAt: '2020-01-01T00:00:00Z' });
    assert.equal(stored.fecHash, fecHash, 'repository 存的 fecHash 须 === computeFecHash(fec)');
    assert.equal(stored.fec.freeze.fecHash, fecHash, 'freeze.fecHash round-trip 一致');
  } finally {
    db.close();
  }
});

test('registerFecV2: 空 fecId → throw', () => {
  const db = openDb();
  try {
    assert.throws(
      () => registerFecV2(db, { fec: makeValidFec({ fecId: '  ' }), compiledAt: '2020-01-01T00:00:00Z' }),
      /fecId/,
    );
  } finally {
    db.close();
  }
});

test('registerFecV2: 重复 fec_id → PRIMARY KEY 冲突', () => {
  const db = openDb();
  try {
    registerFecV2(db, { fec: makeValidFec(), compiledAt: '2020-01-01T00:00:00Z' });
    assert.throws(
      () => registerFecV2(db, { fec: makeValidFec(), compiledAt: '2020-01-02T00:00:00Z' }),
    );
  } finally {
    db.close();
  }
});
