/**
 * bundle_export_anchor.test.ts — DEF-18(F-V04-01)端到端接线验收。
 *
 * 一致伪造(攻击者按公开算法重算 payload + 重算 hash 列)对 IC-07 库内自验不可检;
 * DEF-18 接线后 `far verify --bundle <dir> --db <db>` 做 DB↔导出锚比对:
 *   - 篡改前导出的 call_records.redacted.jsonl(含 hash 列) = 内容锚;
 *   - 篡改后 DB 的 hash ≠ 锚 → DB_EXPORT_ANCHOR_MISMATCH → verify FAIL。
 *
 * 纯函数语义(`verifyCallRecordExportAnchor`)由
 * tests/evidence_log/call_record_export_anchor.test.ts 7 用例全覆盖(一致伪造检出/漂移/legacy/空库)。
 * 本文件验证 bundle_verifier 接线:
 *   ① demo bundle + 同一 demo DB → 锚比对 legacy 降级(无 hash 列)不误报,verify 仍过;
 *   ② demo DB 用生产路径补 hash 后伪造一致 + 篡改前导出 → DB_EXPORT_ANCHOR_MISMATCH 检出;
 *   ③ 不传 --db(仅验 bundle)→ additive 不回归。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildDemoChain } from '../../src/far_proof/demo_chain.ts';
import { exportFarProof } from '../../src/far_proof/exporter.ts';
import { verifyFarProofBundle } from '../../src/far_proof/bundle_verifier.ts';
import { runMigrations } from '../../src/db/migrator.ts';
import { hashCanonicalJson } from '../../src/evidence_log/index.ts';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

/** 生产路径补 payload hash(模拟 llm_record 落 hash;demo_chain 走 legacy 不落)。 */
function backfillPayloadHashes(db: Database.Database): void {
  dropCallRecordTriggers(db); // demo 库 hash 列原为 NULL,须绕过 append-only trigger 才能 UPDATE 补列
  const rows = db
    .prepare(`SELECT seq, request_payload, response_payload FROM call_records ORDER BY seq ASC`)
    .all() as Array<{ seq: number; request_payload: string; response_payload: string }>;
  for (const row of rows) {
    db.prepare(
      `UPDATE call_records SET request_payload_hash=?, response_payload_hash=? WHERE seq=?`,
    ).run(
      hashCanonicalJson(JSON.parse(row.request_payload) as Record<string, unknown>),
      hashCanonicalJson(JSON.parse(row.response_payload) as Record<string, unknown>),
      row.seq,
    );
  }
}

function exportDb(db: Database.Database): string {
  const outDir = mkdtempSync(join(tmpdir(), 'def18-export-'));
  exportFarProof({
    db,
    outputDir: outDir,
    runId: 'def18-demo',
    modelSnapshot: 'offline-replay-fixture@v1',
    gitCommitSha: 'e'.repeat(40),
    envHash: 'f'.repeat(64),
    exportedAt: '2026-08-02T00:00:00.000Z',
  });
  return outDir;
}

function dropCallRecordTriggers(db: Database.Database): void {
  const triggers = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='call_records'`)
    .all() as Array<{ name: string }>;
  for (const t of triggers) db.exec(`DROP TRIGGER IF EXISTS "${t.name}"`);
}

test('① demo bundle + demo DB → 锚比对 legacy 降级不误报,verify 仍过', () => {
  const db = openDb();
  buildDemoChain(db);
  const outDir = exportDb(db);
  try {
    const result = verifyFarProofBundle(outDir, 'full', { dbAnchor: db });
    assert.equal(result.ok, true, `demo bundle+DB 应过(无 hash 列→legacy 降级): ${result.errors.join('; ')}`);
  } finally {
    db.close();
    rmSync(outDir, { recursive: true, force: true });
  }
});

test('② 生产路径补 hash + 一致伪造(改 payload+重算 hash) + 篡改前导出 → DB_EXPORT_ANCHOR_MISMATCH', () => {
  const db = openDb();
  buildDemoChain(db);
  backfillPayloadHashes(db); // 模拟生产路径已落 hash
  const outDir = exportDb(db); // 篡改前导出 = 内容锚(含 hash 列)
  try {
    // 攻击者:改 seq=1 的 request_payload + 公开算法重算 hash(一致伪造·库内自验 pass)
    dropCallRecordTriggers(db);
    const forged = { q: 'FORGED' };
    db.prepare(`UPDATE call_records SET request_payload=?, request_payload_hash=? WHERE seq=1`).run(
      JSON.stringify(forged),
      hashCanonicalJson(forged),
    );

    // 仅验 bundle(无 dbAnchor)→ 过(锚比对 additive·不一致伪造才检出)
    const bundleOnly = verifyFarProofBundle(outDir, 'full');
    assert.equal(bundleOnly.ok, true, '不传 DB 时 bundle 自身仍应过(additive)');

    // bundle + dbAnchor → 一致伪造被篡改前导出锚检出
    const anchored = verifyFarProofBundle(outDir, 'full', { dbAnchor: db });
    assert.equal(anchored.ok, false, '一致伪造须被 DB↔导出锚比对检出(DEF-18)');
    assert.ok(
      anchored.errors.some((e) => e.includes('DB_EXPORT_ANCHOR_MISMATCH')),
      `须报 DB_EXPORT_ANCHOR_MISMATCH: ${anchored.errors.join('; ')}`,
    );
  } finally {
    db.close();
    rmSync(outDir, { recursive: true, force: true });
  }
});

test('③ 不传 --db(仅验 bundle)→ additive 不回归(clean 仍过)', () => {
  const db = openDb();
  buildDemoChain(db);
  backfillPayloadHashes(db);
  const outDir = exportDb(db);
  try {
    const result = verifyFarProofBundle(outDir, 'full');
    assert.equal(result.ok, true, `仅验 bundle(无锚)应过: ${result.errors.join('; ')}`);
  } finally {
    db.close();
    rmSync(outDir, { recursive: true, force: true });
  }
});
