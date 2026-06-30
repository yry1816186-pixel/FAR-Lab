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
    assert.deepEqual(result.applied, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(result.skipped, []);

    const rows = getSchemaMetaRows(db);
    assert.equal(rows.length, 8);
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

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((row) => row.name);
    assert.ok(tableNames.includes('call_records'));
    assert.ok(tableNames.includes('evidence_log'));
    assert.ok(tableNames.includes('schema_meta'));
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
    assert.deepEqual(result.skipped, [1, 2, 3, 4, 5, 6, 7, 8]);
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
