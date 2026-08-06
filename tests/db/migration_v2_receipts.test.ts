/**
 * migration_v2_receipts.test.ts — migration 0023 V2 receipt tables.
 *
 * Validates: table creation, INSERT/SELECT round-trip, UNIQUE constraint,
 * and foreign-key constraint for the four V2 receipt tables.
 *
 * Zero-tolerance: no any / @ts-ignore / empty catch / stubs.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/migrator.ts';

const MIGRATIONS_DIR = 'schema/migrations';

describe('0023_v2_receipts migration', () => {
  /** Create an in-memory DB with all migrations applied. */
  function freshDb(): Database.Database {
    const db = new Database(':memory:');
    runMigrations(db, { migrationsDir: MIGRATIONS_DIR });
    return db;
  }

  test('all four V2 receipt tables exist after migration', () => {
    const db = freshDb();
    try {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as readonly { readonly name: string }[];
      const tableNames = tables.map((row) => row.name);

      assert.ok(tableNames.includes('v2_receipts'), 'v2_receipts table must exist');
      assert.ok(tableNames.includes('v2_manifest_members'), 'v2_manifest_members table must exist');
      assert.ok(tableNames.includes('v2_verification_results'), 'v2_verification_results table must exist');
      assert.ok(tableNames.includes('v2_contract_bindings'), 'v2_contract_bindings table must exist');
    } finally {
      db.close();
    }
  });

  test('INSERT v2_receipt + v2_manifest_members + SELECT round-trip', () => {
    const db = freshDb();
    try {
      const receiptId = 'rcpt-001';
      db.prepare(
        `INSERT INTO v2_receipts
           (id, claim_id, claim_text, verdict, proof_hash, schema_version, created_at, receipt_standing, preservation_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        receiptId, 'claim-01', 'Hypothesis H1', 'SUPPORTED',
        'sha256:abcdef', '2.0', '2026-08-06T00:00:00Z', 'ACTIVE', 'AVAILABLE',
      );

      db.prepare(
        `INSERT INTO v2_manifest_members (receipt_id, kind, digest, size_bytes)
         VALUES (?, ?, ?, ?)`,
      ).run(receiptId, 'claim_bundle', 'sha256:deadbeef', 1024);

      const members = db
        .prepare('SELECT * FROM v2_manifest_members WHERE receipt_id = ?')
        .all(receiptId) as readonly Record<string, unknown>[];

      assert.equal(members.length, 1);
      assert.equal(members[0]?.kind, 'claim_bundle');
      assert.equal(members[0]?.digest, 'sha256:deadbeef');
      assert.equal(members[0]?.size_bytes, 1024);
    } finally {
      db.close();
    }
  });

  test('UNIQUE(receipt_id, kind) rejects duplicate manifest member', () => {
    const db = freshDb();
    try {
      const receiptId = 'rcpt-002';
      db.prepare(
        `INSERT INTO v2_receipts (id, claim_id, claim_text, verdict, proof_hash, schema_version, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(receiptId, 'claim-02', 'Hypothesis H2', 'REFUTED', 'sha256:1111', '2.0', '2026-08-06T00:00:00Z');

      const insertMember = db.prepare(
        `INSERT INTO v2_manifest_members (receipt_id, kind, digest, size_bytes) VALUES (?, ?, ?, ?)`,
      );
      insertMember.run(receiptId, 'evidence_log', 'sha256:aaaa', 512);

      assert.throws(
        () => insertMember.run(receiptId, 'evidence_log', 'sha256:bbbb', 2048),
        /UNIQUE constraint failed/,
        'duplicate (receipt_id, kind) must violate UNIQUE constraint',
      );
    } finally {
      db.close();
    }
  });

  test('FK constraint rejects manifest member with non-existent receipt_id', () => {
    const db = freshDb();
    try {
      assert.throws(
        () =>
          db
            .prepare(
              `INSERT INTO v2_manifest_members (receipt_id, kind, digest, size_bytes) VALUES (?, ?, ?, ?)`,
            )
            .run('nonexistent-rcpt', 'artifact', 'sha256:ffff', 256),
        /FOREIGN KEY constraint failed/,
        'inserting manifest member referencing missing receipt must violate FK constraint',
      );
    } finally {
      db.close();
    }
  });
});
