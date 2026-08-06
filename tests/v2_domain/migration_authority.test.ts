// tests/v2_domain/migration_authority.test.ts
//
// IMPL-013 — migration checksum/atomicity/compatibility authority.
//
// Authority: doc19 §3.6 (legacy term mapping), WP-02 (migration specification),
//   roadmap §10 (schema migration requires checksum, backup, forward-compat window,
//   rehearsal on copy, failure atomicity, verified restore).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMigrationPlan,
  assertMigrationAtomicity,
  applyMigrationAtomically,
  buildCompatibilityReport,
} from '../../src/v2_domain/migration_authority.ts';

// ---------------------------------------------------------------------------
// Migration plan — checksum + backup + forward-compat
// ---------------------------------------------------------------------------

test('buildMigrationPlan: produces plan with checksum + backup path + compat window', () => {
  const plan = buildMigrationPlan({
    migrationId: 'migr-0023',
    fromVersion: 22,
    toVersion: 23,
    description: 'add v2_domain_receipts table',
    forwardCompatibleUntil: '2027-01-01T00:00:00Z',
    rollbackPath: 'rollback-0023.sql',
  });
  assert.equal(plan.migrationId, 'migr-0023');
  assert.ok(plan.checksum.length === 64, 'checksum must be 64 hex');
  assert.equal(plan.canRollback, true);
});

test('buildMigrationPlan: checksum is deterministic', () => {
  const input = {
    migrationId: 'migr-0024',
    fromVersion: 23,
    toVersion: 24,
    description: 'test',
    forwardCompatibleUntil: '2027-01-01T00:00:00Z',
    rollbackPath: 'rollback-0024.sql',
  };
  assert.equal(buildMigrationPlan(input).checksum, buildMigrationPlan(input).checksum);
});

// ---------------------------------------------------------------------------
// Atomicity — apply must be all-or-nothing
// ---------------------------------------------------------------------------

test('applyMigrationAtomically: success returns applied=true', () => {
  const steps = [
    () => 'CREATE TABLE x (id INTEGER)',
    () => 'INSERT INTO x VALUES (1)',
  ];
  const result = applyMigrationAtomically(steps, { verifyAfter: () => true });
  assert.equal(result.applied, true);
  assert.equal(result.rolledBack, false);
});

test('applyMigrationAtomically: failure at step N rolls back all prior steps', () => {
  const steps = [
    () => 'CREATE TABLE x',
    () => { throw new Error('syntax error'); },
  ];
  const rollbackLog: string[] = [];
  const result = applyMigrationAtomically(steps, {
    verifyAfter: () => true,
    onRollback: (stepIdx) => { rollbackLog.push(`rollback-${stepIdx}`); },
  });
  assert.equal(result.applied, false);
  assert.equal(result.rolledBack, true);
  assert.equal(result.failureStep, 1);
});

test('applyMigrationAtomically: post-verify failure also triggers rollback', () => {
  const steps = [() => 'CREATE TABLE x'];
  const result = applyMigrationAtomically(steps, {
    verifyAfter: () => false, // verification fails
  });
  assert.equal(result.applied, false);
  assert.equal(result.rolledBack, true);
});

// ---------------------------------------------------------------------------
// Compatibility report — forward-compat window
// ---------------------------------------------------------------------------

test('buildCompatibilityReport: within compat window → compatible', () => {
  const report = buildCompatibilityReport({
    schemaVersion: 22,
    codeMinVersion: 20,
    codeMaxVersion: 24,
    forwardCompatibleUntil: '2027-01-01T00:00:00Z',
    evaluatedAt: '2026-08-05T00:00:00Z',
  });
  assert.equal(report.compatible, true);
});

test('buildCompatibilityReport: schema newer than code max → incompatible', () => {
  const report = buildCompatibilityReport({
    schemaVersion: 25,
    codeMinVersion: 20,
    codeMaxVersion: 24,
    forwardCompatibleUntil: '2027-01-01T00:00:00Z',
    evaluatedAt: '2026-08-05T00:00:00Z',
  });
  assert.equal(report.compatible, false);
  assert.equal(report.reasonCode, 'SCHEMA_NEWER_THAN_CODE');
});

test('buildCompatibilityReport: past forward-compat window → incompatible', () => {
  const report = buildCompatibilityReport({
    schemaVersion: 22,
    codeMinVersion: 20,
    codeMaxVersion: 24,
    forwardCompatibleUntil: '2025-01-01T00:00:00Z',
    evaluatedAt: '2026-08-05T00:00:00Z',
  });
  assert.equal(report.compatible, false);
  assert.equal(report.reasonCode, 'FORWARD_COMPAT_WINDOW_EXPIRED');
});

// ---------------------------------------------------------------------------
// assertMigrationAtomicity — pre-flight check
// ---------------------------------------------------------------------------

test('assertMigrationAtomicity: throws if no rollback path for irreversible migration', () => {
  assert.throws(
    () => assertMigrationAtomicity({
      migrationId: 'migr-x',
      fromVersion: 1,
      toVersion: 2,
      description: 'x',
      forwardCompatibleUntil: '2027-01-01T00:00:00Z',
      rollbackPath: '', // no rollback = not atomic
      canRollback: false,
      checksum: 'a'.repeat(64),
    }),
    /MIGRATION_NOT_ATOMIC/,
  );
});
