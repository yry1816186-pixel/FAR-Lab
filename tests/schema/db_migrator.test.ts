import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  getSchemaMetaRows,
  readMigrationFiles,
  runMigrations,
} from '../../src/db/index.ts';

test('runMigrations applies 0001_initial and records schema version', () => {
  const db = new Database(':memory:');
  try {
    const result = runMigrations(db);
    assert.deepEqual(result.applied, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
    assert.deepEqual(result.skipped, []);

    const rows = getSchemaMetaRows(db);
    assert.equal(rows.length, 17);
    assert.equal(rows[0]?.version, 1);
    assert.equal(rows[0]?.name, '0001_initial');
    assert.equal(rows[1]?.version, 2);
    assert.equal(rows[1]?.name, '0002_add_dialogue_tables');
    assert.equal(rows[2]?.version, 3);
    assert.equal(rows[2]?.name, '0003_math_verification');
    assert.equal(rows[3]?.version, 4);
    assert.equal(rows[3]?.name, '0004_proof_envelopes');
    assert.equal(rows[4]?.version, 5);
    assert.equal(rows[4]?.name, '0005_falsifiability_contracts');
    assert.equal(rows[5]?.version, 6);
    assert.equal(rows[5]?.name, '0006_falsification_audit_events');
    assert.equal(rows[6]?.version, 7);
    assert.equal(rows[6]?.name, '0007_add_degraded_from');
    assert.equal(rows[7]?.version, 8);
    assert.equal(rows[7]?.name, '0008_anti_theater_fail_coverage');
    assert.equal(rows[8]?.version, 9);
    assert.equal(rows[8]?.name, '0009_fec_contracts_v2');
    assert.equal(rows[9]?.version, 10);
    assert.equal(rows[9]?.name, '0010_proof_envelopes_v2');
    assert.equal(rows[10]?.version, 11);
    assert.equal(rows[10]?.name, '0011_anti_theater_trigger_v2');
    assert.equal(rows[11]?.version, 12);
    assert.equal(rows[11]?.name, '0012_verdict_trace_persist');
    assert.equal(rows[12]?.version, 13);
    assert.equal(rows[12]?.name, '0013_verdict_enum_guard');
    assert.equal(rows[13]?.version, 14);
    assert.equal(rows[13]?.name, '0014_verdict_supersede');
    assert.equal(rows[14]?.version, 15);
    assert.equal(rows[14]?.name, '0015_far_blob_store');
    assert.equal(rows[15]?.version, 16);
    assert.equal(rows[15]?.name, '0016_evidence_derivable');
    assert.equal(rows[16]?.version, 17);
    assert.equal(rows[16]?.name, '0017_evidence_provenance_class');

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((row) => row.name);
    assert.ok(tableNames.includes('call_records'));
    assert.ok(tableNames.includes('evidence_log'));
    assert.ok(tableNames.includes('schema_meta'));
    assert.ok(tableNames.includes('fec_contracts_v2'), '0009 须建 fec_contracts_v2 表');
    assert.ok(tableNames.includes('proof_envelopes_v2'), '0010 须建 proof_envelopes_v2 表');
  } finally {
    db.close();
  }
});

test('runMigrations skips already applied versions', () => {
  const db = new Database(':memory:');
  try {
    runMigrations(db);
    const result = runMigrations(db);
    assert.deepEqual(result.applied, []);
    assert.deepEqual(result.skipped, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
  } finally {
    db.close();
  }
});

test('readMigrationFiles rejects version gaps before executing SQL', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'far-chain-migrations-'));
  try {
    writeFileSync(join(tempDir, '0001_first.sql'), 'CREATE TABLE first_table (id INTEGER);', 'utf8');
    writeFileSync(join(tempDir, '0003_third.sql'), 'CREATE TABLE third_table (id INTEGER);', 'utf8');
    const migrations = readMigrationFiles(tempDir);
    assert.equal(migrations.length, 2);

    const db = new Database(':memory:');
    try {
      assert.throws(
        () => runMigrations(db, { migrationsDir: tempDir }),
        /contiguous/,
      );
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'first_table'")
        .get();
      assert.equal(row, undefined);
    } finally {
      db.close();
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// 0011 anti-theater trigger 行为验证（F1 物理兜底·envelope_json hasFail/canSealConfirmed 模式匹配）。
const HEX64_ABI = 'ab'.repeat(32); // 64-hex 占位（满足 fec_hash/proof_hash/ledger_root length=64 CHECK）。

function insertV2Envelope(
  db: Database.Database,
  envelopeId: string,
  conclusion: string,
  envelopeJson: string,
): void {
  db.prepare(
    `INSERT INTO proof_envelopes_v2
       (envelope_id, claim_id, schema_version, conclusion, fec_hash, proof_hash, ledger_root, envelope_json, sealed_by, sealed_at)
     VALUES (?, ?, 'far.proof_envelope.v2', ?, ?, ?, ?, ?, 'deterministic_sealer', '2026-01-01T00:00:00Z')`,
  ).run(envelopeId, `claim-${envelopeId}`, conclusion, HEX64_ABI, HEX64_ABI, HEX64_ABI, envelopeJson);
}

test('0011 anti-theater trigger: hasFail=true 或 canSealConfirmed=false + CONFIRMED → ABORT（F1 物理兜底）', () => {
  const db = new Database(':memory:');
  try {
    runMigrations(db);

    // 1. CONFIRMED + hasFail=true → ABORT（anti-theater 阻断 seal）。
    assert.throws(
      () => insertV2Envelope(db, 'env-hasfail', 'CONFIRMED', '{"hasFail":true,"failCount":1}'),
      /cannot seal CONFIRMED/,
    );

    // 2. CONFIRMED + canSealConfirmed=false（hasFail=false）→ ABORT（score<70 或 BLOCK·无法干净 seal）。
    assert.throws(
      () => insertV2Envelope(db, 'env-noseal', 'CONFIRMED', '{"hasFail":false,"canSealConfirmed":false}'),
      /cannot seal CONFIRMED/,
    );

    // 3. CONFIRMED + hasFail=false + canSealConfirmed=true → 允许（合法干净 seal）。
    insertV2Envelope(db, 'env-clean', 'CONFIRMED', '{"hasFail":false,"canSealConfirmed":true}');
    const cleanRow = db
      .prepare('SELECT conclusion FROM proof_envelopes_v2 WHERE envelope_id = ?')
      .get('env-clean') as { conclusion: string } | undefined;
    assert.equal(cleanRow?.conclusion, 'CONFIRMED');

    // 4. DEGRADED_SCOPE + hasFail=true → 允许（honest degradation·非 CONFIRMED 不阻断）。
    insertV2Envelope(db, 'env-degraded', 'DEGRADED_SCOPE', '{"hasFail":true}');
    const degradedRow = db
      .prepare('SELECT conclusion FROM proof_envelopes_v2 WHERE envelope_id = ?')
      .get('env-degraded') as { conclusion: string } | undefined;
    assert.equal(degradedRow?.conclusion, 'DEGRADED_SCOPE');
  } finally {
    db.close();
  }
});

test('0011 anti-theater trigger: 旧 overallStatus 模式不再阻断（D1 类型统一后字段不存在·0010 no-op 已被 0011 取代）', () => {
  const db = new Database(':memory:');
  try {
    runMigrations(db);
    // 旧 overallStatus 模式：0010 trigger 会阻断，但 0011 DROP 了它。新形状无 overallStatus 字段，
    // 故 CONFIRMED + overallStatus:FAIL 但 hasFail=false 应被允许（证明 0010 旧 trigger 已被 0011 取代）。
    insertV2Envelope(db, 'env-legacy', 'CONFIRMED', '{"hasFail":false,"overallStatus":"FAIL"}');
    const row = db
      .prepare('SELECT conclusion FROM proof_envelopes_v2 WHERE envelope_id = ?')
      .get('env-legacy') as { conclusion: string } | undefined;
    assert.equal(row?.conclusion, 'CONFIRMED');
  } finally {
    db.close();
  }
});

