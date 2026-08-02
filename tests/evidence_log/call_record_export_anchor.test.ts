/**
 * call_record_export_anchor.test.ts — DEF-18(F-V04-01 ②)验收。
 *
 * 一致伪造(攻击者按公开算法重算 payload 后同步重算 hash 列)对 IC-07 库内自验不可检——
 * hash 列刻意不进 canonical 链输入(keyless hash 固有边界)。唯一残存锚点 = 篡改**前**的导出：
 * call_records.redacted.jsonl 含 payload hash 列(篡改前导出即内容锚)。
 *
 * 验收 Oracle(合同 FINDINGS F-V04-01 建议 ②):
 *   ① 干净 DB + 干净导出 → ok(verifiedCount=行数);
 *   ② 一致伪造(改 payload + 重算 hash 列·库内自验 pass) + 篡改前导出锚 → DB_EXPORT_ANCHOR_MISMATCH 检出并定位 seq;
 *   ③ 导出锚行集合漂移(导出多行/DB 删尾行)→ DB_EXPORT_ANCHOR_DRIFT 检出;
 *   ④ 老行 hash NULL 两侧一致 → legacy-not-covered 计数,不误报;
 *   ⑤ 空库 + 空导出 → ok。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import {
  appendRecord,
  getChainHead,
  GENESIS_PREV_HASH,
  hashCanonicalJson,
  verifyCallRecordExportAnchor,
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

/** 模拟篡改前导出的投影行(与 writeCallRecordsRedacted 同形:含 request/response_payload_hash 列)。 */
function exportRowsFromDb(db: Database.Database): Array<{ seq: number; request_payload_hash: string | null; response_payload_hash: string | null }> {
  return db
    .prepare(
      `SELECT seq, request_payload_hash, response_payload_hash
       FROM call_records ORDER BY seq ASC`,
    )
    .all() as Array<{ seq: number; request_payload_hash: string | null; response_payload_hash: string | null }>;
}

test('① 干净 DB + 干净导出 → ok(verifiedCount=行数)', () => {
  const db = openDb();
  for (let i = 1; i <= 3; i++) appendOne(db, i, auditWithHashes(i));
  const anchor = verifyCallRecordExportAnchor(db, exportRowsFromDb(db));
  assert.equal(anchor.ok, true, JSON.stringify(anchor));
  assert.equal(anchor.verifiedCount, 3);
  assert.equal(anchor.legacyCount, 0);
  assert.deepEqual(anchor.tamperedSeqs, []);
  assert.deepEqual(anchor.anchorDrift, []);
  db.close();
});

test('② 一致伪造(改 payload + 重算 hash 列·库内自验 pass) + 篡改前导出锚 → 检出并定位 seq', () => {
  const db = openDb();
  for (let i = 1; i <= 3; i++) appendOne(db, i, auditWithHashes(i));
  const preExportAnchor = exportRowsFromDb(db); // 篡改前导出锚(内容锚)

  // 攻击者:改 seq=2 的 payload + 用公开算法重算 hash 列(一致伪造·IC-07 库内自验通过)
  dropCallRecordTriggers(db);
  const forged = { q: 'FORGED' };
  db.prepare(`UPDATE call_records SET request_payload=?, request_payload_hash=? WHERE seq=2`).run(
    JSON.stringify(forged),
    hashCanonicalJson(forged),
  );

  const anchor = verifyCallRecordExportAnchor(db, preExportAnchor);
  assert.equal(anchor.ok, false);
  assert.deepEqual(anchor.tamperedSeqs, [2], '一致伪造须被篡改前导出锚检出(DEF-18)');
  assert.equal(anchor.verifiedCount, 3, 'verifiedCount=可比行数(全部有 hash 可锚),含伪造行');
  db.close();
});

test('②b 导出锚缺失 hash 列(旧锚·空列)→ 如实降级不误报(无锚可比)', () => {
  const db = openDb();
  for (let i = 1; i <= 3; i++) appendOne(db, i, auditWithHashes(i));
  const legacyAnchor = exportRowsFromDb(db).map((row) => ({
    seq: row.seq,
    request_payload_hash: null,
    response_payload_hash: null,
  }));
  const anchor = verifyCallRecordExportAnchor(db, legacyAnchor);
  assert.equal(anchor.ok, true, '旧锚无 hash 列 → 无锚可比,不误报(DEF-18 诚实降级)');
  assert.deepEqual(anchor.tamperedSeqs, []);
  db.close();
});

test('③ 导出锚行集合漂移:DB 删尾行 → DB_EXPORT_ANCHOR_DRIFT', () => {
  const db = openDb();
  for (let i = 1; i <= 3; i++) appendOne(db, i, auditWithHashes(i));
  const preExportAnchor = exportRowsFromDb(db); // 3 行锚
  dropCallRecordTriggers(db);
  db.prepare(`DELETE FROM call_records WHERE seq=3`).run(); // 链尾回滚(F-V04-05 同源)

  const anchor = verifyCallRecordExportAnchor(db, preExportAnchor);
  assert.equal(anchor.ok, false);
  assert.ok(
    anchor.anchorDrift.some((d) => d.includes('seq=3')),
    `须报 DB 行缺失漂移: ${anchor.anchorDrift.join('; ')}`,
  );
  db.close();
});

test('③b 导出锚超前(导出来自更新状态)→ 漂移检出', () => {
  const db = openDb();
  appendOne(db, 1, auditWithHashes(1));
  const inflatedAnchor = exportRowsFromDb(db);
  inflatedAnchor.push({ seq: 2, request_payload_hash: 'a'.repeat(64), response_payload_hash: 'b'.repeat(64) });
  const anchor = verifyCallRecordExportAnchor(db, inflatedAnchor);
  assert.equal(anchor.ok, false);
  assert.ok(
    anchor.anchorDrift.some((d) => d.includes('export seq=2')),
    `须报导出超前漂移: ${anchor.anchorDrift.join('; ')}`,
  );
  db.close();
});

test('④ 老行 hash NULL 两侧一致 → legacy-not-covered,不误报', () => {
  const db = openDb();
  // 模拟 0020 前老行(无 hash)
  appendOne(db, 1, {
    requestPayload: '{"q":1}',
    responsePayload: '{"a":1}',
    finishReason: 'stop',
    usageTokensTotal: 1,
  });
  appendOne(db, 2, auditWithHashes(2));
  const anchor = verifyCallRecordExportAnchor(db, exportRowsFromDb(db));
  assert.equal(anchor.ok, true);
  assert.equal(anchor.legacyCount, 1);
  assert.equal(anchor.verifiedCount, 1);
  db.close();
});

test('⑤ 空库 + 空导出 → ok(无锚可比,兼容)', () => {
  const db = openDb();
  const anchor = verifyCallRecordExportAnchor(db, []);
  assert.equal(anchor.ok, true);
  assert.equal(anchor.verifiedCount, 0);
  assert.deepEqual(anchor.tamperedSeqs, []);
  assert.deepEqual(anchor.anchorDrift, []);
  db.close();
});
