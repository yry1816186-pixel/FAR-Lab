/**
 * FalsificationSufficiencyAuditor 单测 (§3.5 + migration 0006).
 *
 * 覆盖背景:auditContract 原为孤立生产代码(全 src 零调用、barrel 未导出、零测试)。
 * §2-M3 修复:barrel 导出 + canonical envelope 哈希(替裸 JSON.stringify + prevHash+payload 字符串拼接)
 * + 本套件覆盖,使审计事件链可达、可测、确定性可独立重算。
 *
 * 覆盖:
 *   1. 4 规则各产 1 event,落库 4 行,规则顺序与 AUDIT_RULES 一致
 *   2. 哈希链内部一致:event[0].prevHash=genesis;event[i].prevHash=event[i-1].currentHash
 *   3. currentHash 走 canonical envelope(排序 key + 拒非有限数)——可由存储字段独立重算复现
 *   4. append-only(R1):UPDATE/DELETE trigger ABORT
 *   5. 字段充分性判定真实生效:良构→PASS,缺字段(measurable/metric 空)→FAIL
 *
 * 权威:11 §3.5 + 02 §3(0006 DDL)+ auditor.ts。
 * 零容忍合规:无 any / @ts-ignore / 改测试期望让实现通过。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  AUDIT_RULES,
  auditContract,
  registerContract,
} from '../../src/falsifiability/index.ts';
import type { FalsifiabilityContract } from '../../src/falsifiability/index.ts';
import { hashCanonicalJson } from '../../src/evidence_log/hasher.ts';
import { runMigrations } from '../../src/db/index.ts';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

const GENESIS_HASH = '0'.repeat(64);

function makeContract(db: Database.Database): FalsifiabilityContract {
  return registerContract(db, {
    claimId: 'claim-audit-test',
    measurableImplication: '若 BLS period 信号显著则 odd-even depth 超过探测阈值 (when SNR high then depth observable)',
    metric: 'bls_snr',
    comparator: 'gt',
    thresholdValue: 7.0,
    compiledAt: '2026-06-30T00:00:00.000Z',
  });
}

test('auditContract runs all 4 sufficiency rules and writes one hash-chained event per rule', () => {
  const db = openDb();
  try {
    const contract = makeContract(db);
    const result = auditContract(db, contract, GENESIS_HASH);

    assert.equal(result.events.length, AUDIT_RULES.length);
    assert.equal(result.events.length, 4);
    assert.deepEqual(
      result.events.map((e) => e.ruleId),
      [...AUDIT_RULES],
    );

    const count = db
      .prepare('SELECT COUNT(*) AS n FROM falsification_audit_events')
      .get() as { n: number };
    assert.equal(count.n, 4);

    // summary 4 键齐全(OUTCOME 无 UNKNOWN,诚实边界)。
    assert.deepEqual(Object.keys(result.summary).sort(), ['FAIL', 'PASS', 'SKIP', 'WARN']);
    assert.equal(result.summary.SKIP, 0);
  } finally {
    db.close();
  }
});

test('auditContract hash chain is internally consistent and genesis-linked', () => {
  const db = openDb();
  try {
    const contract = makeContract(db);
    const result = auditContract(db, contract, GENESIS_HASH);

    assert.equal(result.events[0]!.prevHash, GENESIS_HASH);
    for (let i = 1; i < result.events.length; i++) {
      assert.equal(
        result.events[i]!.prevHash,
        result.events[i - 1]!.currentHash,
        `event[${i}].prevHash must equal event[${i - 1}].currentHash`,
      );
    }
    for (const e of result.events) {
      assert.match(e.currentHash, /^[0-9a-f]{64}$/);
      assert.equal(e.sealedBy, 'deterministic_sealer');
      assert.equal(e.checkKind, 'falsification_sufficiency');
    }
  } finally {
    db.close();
  }
});

test('auditContract currentHash is canonical-envelope reproducible (determinism proof)', () => {
  // 核心:stored currentHash 必须可由 canonical envelope {prevHash, eventId, contractId, claimId, ruleId, outcome, detail}
  // 独立重算复现。这证明哈希走的是项目 canonical 契约(排序 key + 拒非有限数),
  // 而非裸 JSON.stringify + prevHash+payload 字符串拼接(后者 key 顺序不确定 + 中文 detail 跨语言 ensure_ascii 差异)。
  const db = openDb();
  try {
    const contract = makeContract(db);
    const result = auditContract(db, contract, GENESIS_HASH);

    let expectedPrev = GENESIS_HASH;
    for (const e of result.events) {
      const recomputed = hashCanonicalJson({
        prevHash: expectedPrev,
        eventId: e.eventId,
        contractId: e.contractId,
        claimId: e.claimId,
        ruleId: e.ruleId,
        outcome: e.outcome,
        detail: e.detail,
      });
      assert.equal(e.currentHash, recomputed, 'currentHash must be canonical-envelope reproducible');
      assert.equal(e.prevHash, expectedPrev);
      expectedPrev = e.currentHash;
    }
  } finally {
    db.close();
  }
});

test('falsification_audit_events is append-only: UPDATE and DELETE trigger ABORT (R1)', () => {
  const db = openDb();
  try {
    const contract = makeContract(db);
    auditContract(db, contract, GENESIS_HASH);

    assert.throws(
      () =>
        db
          .prepare("UPDATE falsification_audit_events SET outcome = 'SKIP' WHERE rule_id = 'RULE-FS-001'")
          .run(),
      /falsification_audit_events is append-only: UPDATE forbidden/,
    );
    assert.throws(
      () =>
        db
          .prepare("DELETE FROM falsification_audit_events WHERE rule_id = 'RULE-FS-001'")
          .run(),
      /falsification_audit_events is append-only: DELETE forbidden/,
    );

    const count = db
      .prepare('SELECT COUNT(*) AS n FROM falsification_audit_events')
      .get() as { n: number };
    assert.equal(count.n, 4);
  } finally {
    db.close();
  }
});

test('auditContract field-sufficiency verdict is real: well-formed → PASS, insufficient → FAIL', () => {
  // 良构契约(measurable/metric/threshold/alpha/seed 齐全且合规)→ 多数 PASS,0 FAIL。
  // 缺字段契约(传 mutated 副本,contractId 仍存在以满足 FK;measurable/metric 空)→ ≥2 FAIL。
  // 注:registerContract 现以 canonical hash 在注册期即拒 NaN/Infinity thresholdValue(更早失败,更好);
  //   auditContract 的 RULE-FS-002 仍对已注册契约对象做 Number.isNaN 判定,双重保险。
  const db = openDb();
  try {
    const good = makeContract(db);
    const goodResult = auditContract(db, good, GENESIS_HASH);
    assert.ok(
      goodResult.summary.PASS >= 3,
      `well-formed contract should PASS >=3 rules (got PASS=${goodResult.summary.PASS})`,
    );
    assert.equal(goodResult.summary.FAIL, 0);

    // 传 mutated 副本:contractId 沿用(满足 FK),但 measurable/metric 清空。
    const insufficient: FalsifiabilityContract = {
      ...good,
      measurableImplication: '   ',
      metric: '',
    };
    const badResult = auditContract(db, insufficient, GENESIS_HASH);
    assert.ok(
      badResult.summary.FAIL >= 2,
      `insufficient contract should FAIL >=2 rules (got FAIL=${badResult.summary.FAIL})`,
    );
  } finally {
    db.close();
  }
});
