/**
 * Falsifiability Contracts 单测(spec 11 F8 + 0005_falsifiability_contracts)。
 *
 * §2-M2 修复:contracts.ts 的 registerContract/getContractsByClaim 原为死代码
 * (零调用零测试·包级未导出)。本套件覆盖预登记回路,使 F8 反 p-hacking 机制可达可测。
 *
 * 覆盖:
 *   1. registerContract 写入 locked contract + F8 preregistrationHash(64 hex)+ F3 compiled_by + 默认 alpha/seed
 *   2. F7 guard:空 measurableImplication 抛错
 *   3. getContractsByClaim 按 claim_id 查询(claim_id 无 FK·caller 自由提供)
 *   4. append-only(R1):UPDATE/DELETE trigger ABORT
 *   5. 预登记不可变字段(measurable/metric/comparator/threshold/alpha/seed)纳入 hash
 *
 * 权威:11 §F8 + 02 §3(0005 DDL)+ contracts.ts。
 * 零容忍合规:无 any / @ts-ignore / 改测试期望让实现通过。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  getContractsByClaim,
  registerContract,
} from '../../src/falsifiability/index.ts';
import type { RegisterContractInput } from '../../src/falsifiability/index.ts';
import { runMigrations } from '../../src/db/index.ts';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

const baseInput: RegisterContractInput = {
  claimId: 'claim-astro-0001',
  measurableImplication: "BLS period p < 0.0125 (Bonferroni alpha'=0.0125)",
  metric: 'bls_p_value',
  comparator: 'lt',
  thresholdValue: 0.0125,
  compiledAt: '2026-06-29T00:00:00.000Z',
};

test('registerContract writes a locked contract with preregistrationHash (F8)', () => {
  const db = openDb();
  try {
    const contract = registerContract(db, baseInput);

    assert.ok(contract.contractId.length > 0);
    assert.equal(contract.claimId, 'claim-astro-0001');
    // F8: preregistrationHash 锁定(sha256 → 64 hex)。
    assert.match(contract.preregistrationHash, /^[0-9a-f]{64}$/);
    // F3: compiled_by = deterministic_compiler(禁 LLM)。
    assert.equal(contract.compiledBy, 'deterministic_compiler');
    // F8 defaults: alpha=0.0125 / seed=42 / bonferroni / locked。
    assert.equal(contract.alpha, 0.0125);
    assert.equal(contract.seed, 42);
    assert.equal(contract.bonferroniApplied, true);
    assert.equal(contract.locked, true);

    const count = db.prepare('SELECT COUNT(*) AS n FROM falsifiability_contracts').get() as { n: number };
    assert.equal(count.n, 1);
  } finally {
    db.close();
  }
});

test('registerContract rejects empty measurableImplication (F7 FEC 三件套 guard)', () => {
  const db = openDb();
  try {
    assert.throws(
      () =>
        registerContract(db, {
          ...baseInput,
          measurableImplication: '   ',
        }),
      /measurableImplication must be non-empty/,
    );
  } finally {
    db.close();
  }
});

test('getContractsByClaim returns contracts grouped by claim_id (claim_id 无 FK·caller 自由提供)', () => {
  const db = openDb();
  try {
    registerContract(db, { ...baseInput, claimId: 'claim-A', metric: 'm1' });
    registerContract(db, { ...baseInput, claimId: 'claim-A', metric: 'm2' });
    registerContract(db, { ...baseInput, claimId: 'claim-B', metric: 'm3' });

    const forA = getContractsByClaim(db, 'claim-A');
    assert.equal(forA.length, 2);
    assert.deepEqual(
      forA.map((c) => c.metric).sort(),
      ['m1', 'm2'],
    );

    const forB = getContractsByClaim(db, 'claim-B');
    assert.equal(forB.length, 1);
    assert.equal(forB[0]!.metric, 'm3');

    const forNone = getContractsByClaim(db, 'claim-Z');
    assert.equal(forNone.length, 0);
  } finally {
    db.close();
  }
});

test('falsifiability_contracts is append-only: UPDATE and DELETE trigger ABORT (R1)', () => {
  const db = openDb();
  try {
    registerContract(db, baseInput);

    // UPDATE 禁(append-only trigger)。
    assert.throws(
      () =>
        db
          .prepare("UPDATE falsifiability_contracts SET alpha = 0.5 WHERE claim_id = 'claim-astro-0001'")
          .run(),
      /falsifiability_contracts is append-only: UPDATE forbidden/,
    );
    // DELETE 禁(append-only trigger)。
    assert.throws(
      () =>
        db
          .prepare("DELETE FROM falsifiability_contracts WHERE claim_id = 'claim-astro-0001'")
          .run(),
      /falsifiability_contracts is append-only: DELETE forbidden/,
    );

    // 原行未被改/删。
    const count = db.prepare('SELECT COUNT(*) AS n FROM falsifiability_contracts').get() as { n: number };
    assert.equal(count.n, 1);
  } finally {
    db.close();
  }
});

test('preregistrationHash distinguishes contracts by immutable pre-registered fields (F8 anti p-hacking)', () => {
  // preregistrationHash 含 contractId(ulid·每次不同)→ 两次注册 hash 不同;
  // 但 measurable/metric/comparator/threshold/alpha/seed 是预登记不可变字段,纳入 hash(改任一即不同契约)。
  const db = openDb();
  try {
    const c1 = registerContract(db, baseInput);
    const c2 = registerContract(db, { ...baseInput, metric: 'different_metric' });

    assert.notEqual(c1.contractId, c2.contractId);
    assert.notEqual(c1.metric, c2.metric);
    assert.match(c1.preregistrationHash, /^[0-9a-f]{64}$/);
    assert.match(c2.preregistrationHash, /^[0-9a-f]{64}$/);
    assert.notEqual(c1.preregistrationHash, c2.preregistrationHash);
  } finally {
    db.close();
  }
});
