/**
 * call_record_payload_hashes.test.ts — IC-07(F-01 修复)验收。
 *
 * 验收 Oracle(合同 contract-007):
 *   ① RT-04 攻击树语义:DROP TRIGGER+UPDATE 后 verifyCallRecordPayloadHashes 检出并定位 seq;
 *   ② 触发器 PREVENT 仍拦 UPDATE/DELETE;
 *   ③ 老行 hash NULL → legacy-not-covered(如实标注,不计 tampered);
 *   ④ 改 hash 列本身 → 与 payload 字节失配 → tampered(链外篡改可检)。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import {
  appendRecord,
  getChainHead,
  GENESIS_PREV_HASH,
  hashCanonicalJson,
  verifyChainHead,
  verifyCallRecordPayloadHashes,
} from '../../src/evidence_log/index.ts';
import { runMigrations } from '../../src/db/migrator.ts';
import type { CallAuditData } from '../../src/evidence_log/types.ts';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

function auditWithHashes(i: number): CallAuditData {
  const req = { q: i };
  const res = { a: i };
  return {
    requestPayload: JSON.stringify(req),
    responsePayload: JSON.stringify(res),
    requestPayloadHash: hashCanonicalJson(req),
    responsePayloadHash: hashCanonicalJson(res),
    finishReason: 'stop',
    usageTokensTotal: i,
  };
}

function appendOne(db: Database.Database, i: number, audit: CallAuditData): void {
  appendRecord(
    db,
    {
      stageId: `stage${i}`,
      cred: {
        modelId: 'fixture',
        dashscopeRequestId: null,
        reproHash: `${i}`.repeat(64).slice(0, 64),
        gitCommitSha: 'b'.repeat(40),
        isoTimestamp: `2026-07-20T00:00:0${i}.000Z`,
      },
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
      prevHash: getChainHead(db)?.currentHash ?? GENESIS_PREV_HASH,
    },
    audit,
    { providerProfile: 'offline_replay' },
  );
}

function dropCallRecordTriggers(db: Database.Database): void {
  const triggers = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='call_records'`)
    .all() as Array<{ name: string }>;
  for (const t of triggers) db.exec(`DROP TRIGGER IF EXISTS "${t.name}"`);
}

test('① DROP TRIGGER 旁路改 request_payload → 检出并定位 seq(链验证不检=正交证明)', () => {
  const db = openDb();
  for (let i = 1; i <= 3; i++) appendOne(db, i, auditWithHashes(i));
  dropCallRecordTriggers(db);
  db.prepare(`UPDATE call_records SET request_payload='{"poison":1}' WHERE seq=2`).run();
  const chain = verifyChainHead(db);
  assert.equal(chain.ok, true, 'payload 不在 canonical 输入,链验证应仍 ok(正交)');
  const payload = verifyCallRecordPayloadHashes(db);
  assert.equal(payload.ok, false);
  assert.deepEqual(payload.tamperedSeqs, [2]);
  assert.equal(payload.verifiedCount, 2);
  db.close();
});

test('①b 旁路改 response_payload → 检出;改 hash 列与 payload 失配 → 检出', () => {
  const db = openDb();
  appendOne(db, 1, auditWithHashes(1));
  dropCallRecordTriggers(db);
  db.prepare(`UPDATE call_records SET response_payload='{"poison":2}' WHERE seq=1`).run();
  let payload = verifyCallRecordPayloadHashes(db);
  assert.deepEqual(payload.tamperedSeqs, [1]);
  // 攻击者同步伪造 hash 列(但不知 canonical 输入)→ 失配仍检出
  db.prepare(`UPDATE call_records SET response_payload_hash='${'0'.repeat(64)}' WHERE seq=1`).run();
  payload = verifyCallRecordPayloadHashes(db);
  assert.deepEqual(payload.tamperedSeqs, [1]);
  db.close();
});

test('② 触发器 PREVENT 仍拦 UPDATE/DELETE', () => {
  const db = openDb();
  appendOne(db, 1, auditWithHashes(1));
  assert.throws(() => db.prepare(`UPDATE call_records SET request_payload='x' WHERE seq=1`).run(), /append-only|forbidden/i);
  assert.throws(() => db.prepare(`DELETE FROM call_records WHERE seq=1`).run(), /append-only|forbidden/i);
  db.close();
});

test('③ 老行 hash NULL → legacy-not-covered(不计 tampered)', () => {
  const db = openDb();
  // 模拟 0020 前老行:无 hash 列值
  appendOne(db, 1, {
    requestPayload: '{"q":1}',
    responsePayload: '{"a":1}',
    finishReason: 'stop',
    usageTokensTotal: 1,
  });
  appendOne(db, 2, auditWithHashes(2));
  const payload = verifyCallRecordPayloadHashes(db);
  assert.equal(payload.ok, true);
  assert.equal(payload.legacyCount, 1);
  assert.equal(payload.verifiedCount, 1);
  assert.deepEqual(payload.tamperedSeqs, []);
  db.close();
});

test('④ 干净库全量 verified;空库 ok', () => {
  const db = openDb();
  let payload = verifyCallRecordPayloadHashes(db);
  assert.equal(payload.ok, true);
  assert.equal(payload.verifiedCount, 0);
  for (let i = 1; i <= 3; i++) appendOne(db, i, auditWithHashes(i));
  payload = verifyCallRecordPayloadHashes(db);
  assert.equal(payload.ok, true);
  assert.equal(payload.verifiedCount, 3);
  assert.equal(payload.legacyCount, 0);
  db.close();
});
