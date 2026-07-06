// tests/schema/blob_store.test.ts
//
// FUSION-OS-9 端到端 RED→GREEN：内容寻址 blob CAS 表（far_blob_store）—— 同内容去重 + 篡改检测 + append-only。
//
// 单一真实依赖（CLAUDE.md §1）：真实 runMigrations 建 far_blob_store 表（0015）+ trigger → storeBlob 真实落库
//（INSERT OR IGNORE + sha256 canonical hash）→ CAS 完整性重算比对。非 Fake 后端、非硬编码指标。
//
// RED→GREEN 论证：
//   RED（接线前）：far_blob_store 表不存在；storeBlob/getBlob 不存在 → FEC Plan/kernel trace/evidence payload
//     无法内容寻址去重，artifact 可静默替换（theater）。
//   GREEN（接线后）：0015 建表 + append-only trigger；storeBlob 同内容去重 + hash 内容寻址 + 篡改失配检测。
//
// Authority: PROJECT_PLAN/DEPTH_LEDGER.md §C FUSION-OS-9 +
//            PROJECT_PLAN/FUSION_OPEN_SCIENCE_DESIGN.md §4 FUSION-OS-9（content-addressable CAS 范式）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/index.ts';
import { storeBlob, getBlob } from '../../src/cas/index.ts';
import { hashCanonicalJson } from '../../src/evidence_log/hasher.ts';

test('same_content_deduped_and_tamper_detected: 同内容去重单行 + hash 内容寻址篡改失配', () => {
  const db = new Database(':memory:');
  try {
    runMigrations(db);
    const payload = { fecId: 'FEC-CAS-1', trace: [{ ruleId: 'R7_PRIMARY_TEST_CONFIRMS', triggered: true }], evidenceIds: ['ev1'] };

    const row1 = storeBlob(db, payload);
    const row2 = storeBlob(db, payload);

    // 去重：同 canonical JSON → 同 hash → INSERT OR IGNORE 单行。
    assert.equal(row2.hash, row1.hash, '同内容须同 hash（内容寻址）');
    assert.equal(row2.size_bytes, row1.size_bytes);
    const count = db.prepare('SELECT COUNT(*) as n FROM far_blob_store').get() as { n: number };
    assert.equal(count.n, 1, '同内容写两次须去重为单行');

    // CAS 完整性（篡改检测）：row.hash 须 === sha256(canonical JSON of row.content)。
    // 若 content 被离线篡改（绕过 trigger 的 DB 文件级编辑），重算 hash ≠ row.hash → 检测。
    const recomputed = hashCanonicalJson(JSON.parse(row1.content) as Record<string, unknown>);
    assert.equal(recomputed, row1.hash, 'hash 须为 content 的 sha256 指纹·篡改 content → 失配');

    // 篡改场景：不同 content → 不同 hash（内容寻址·防 artifact 静默替换）。
    const tamperedPayload = { ...payload, evidenceIds: ['ev2'] };
    const tamperedHash = hashCanonicalJson(tamperedPayload);
    assert.notEqual(tamperedHash, row1.hash, '不同 content 须不同 hash（CAS 内容寻址·theater 防护）');
  } finally {
    db.close();
  }
});

test('append_only_triggers_block_update_and_delete: CAS append-only trigger 物理兜底', () => {
  const db = new Database(':memory:');
  try {
    runMigrations(db);
    storeBlob(db, { id: 'a', value: 1 });

    // UPDATE forbidden（hash 不可变·CAS 完整性）。
    assert.throws(
      () => db.prepare("UPDATE far_blob_store SET content = '{}'").run(),
      /UPDATE forbidden/,
    );
    // DELETE forbidden（append-only·artifact 不可抹除）。
    assert.throws(
      () => db.prepare('DELETE FROM far_blob_store').run(),
      /DELETE forbidden/,
    );
  } finally {
    db.close();
  }
});

test('different_payloads_dedup_to_different_hashes: 不同内容不去重', () => {
  const db = new Database(':memory:');
  try {
    runMigrations(db);
    const a = storeBlob(db, { id: 'a' });
    const b = storeBlob(db, { id: 'b' });
    assert.notEqual(a.hash, b.hash);
    assert.ok(getBlob(db, a.hash) !== undefined);
    assert.ok(getBlob(db, b.hash) !== undefined);
    const count = db.prepare('SELECT COUNT(*) as n FROM far_blob_store').get() as { n: number };
    assert.equal(count.n, 2, '不同内容须各占一行');
  } finally {
    db.close();
  }
});
