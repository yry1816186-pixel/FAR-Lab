// §5 · Evidence sink persistence tests.
// Loads 0001_initial.sql + 0003_math_verification.sql into an in-memory DB
// (math 0003 depends on schema_meta table from 0001).
//
// Covers:
//   - persistMathClaim + getMathClaim round-trip (with formalization)
//   - persistMathClaim + getMathClaim round-trip (null formalization)
//   - persistVerification + getVerificationsForClaim round-trip
//   - getVerificationsForClaim returns records ordered by verified_at ASC
//   - getMathClaim returns null for unknown claimId
//   - formalization target + source fields round-trip when present
//   - append-only trigger forbids UPDATE on math_claims
//   - append-only trigger forbids DELETE on math_verifications

import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { persistMathClaim, getMathClaim, persistVerification, getVerificationsForClaim } from '../../src/math/evidence_sink.ts';
import type { MathClaim, MathVerificationRecord } from '../../src/math/math_claim.ts';

const ddl0001 = readFileSync(new URL('../../schema/migrations/0001_initial.sql', import.meta.url), 'utf8');
const ddl0003 = readFileSync(new URL('../../schema/migrations/0003_math_verification.sql', import.meta.url), 'utf8');

function openDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(ddl0001);
  db.exec(ddl0003);
  return db;
}

function makeClaim(overrides: Partial<MathClaim> = {}): MathClaim {
  return {
    claimId: overrides.claimId ?? 'claim_sink_001',
    naturalLanguage: overrides.naturalLanguage ?? 'forall x in R, x equals x',
    claimKind: overrides.claimKind ?? 'algebraic_identity',
    formalization: overrides.formalization === undefined ? {
      target: 'smtlib',
      source: '{"lhs":"x","rhs":"x"}',
      formalizerId: 'core_neutral@v1',
      confidence: 0.9,
    } : overrides.formalization,
    requiredLevel: overrides.requiredLevel ?? 'L1_cas',
    expectedOutcome: overrides.expectedOutcome ?? 'verified',
    linkedVerdictNodeId: overrides.linkedVerdictNodeId ?? null,
    requireFormalVerification: overrides.requireFormalVerification ?? false,
    createdAt: overrides.createdAt ?? '2026-06-27T00:00:00.000Z',
  };
}

function makeVerification(overrides: Partial<MathVerificationRecord> = {}): MathVerificationRecord {
  return {
    verificationId: overrides.verificationId ?? 'ver_sink_001',
    claimId: overrides.claimId ?? 'claim_sink_001',
    backendKind: overrides.backendKind ?? 'cas',
    backendId: overrides.backendId ?? 'sympy@1.12',
    outcome: overrides.outcome ?? 'verified',
    inputHash: overrides.inputHash ?? 'd'.repeat(64),
    outputArtifact: overrides.outputArtifact ?? null,
    compileLog: overrides.compileLog ?? null,
    durationMs: overrides.durationMs ?? 42,
    sourceAnchor: overrides.sourceAnchor ?? '{"backendId":"sympy@1.12"}',
    verifiedAt: overrides.verifiedAt ?? '2026-06-27T00:00:00.000Z',
  };
}

test('persistMathClaim + getMathClaim round-trip preserves all fields (with formalization)', () => {
  const db = openDb();
  try {
    const claim = makeClaim({
      claimId: 'claim_roundtrip_001',
      linkedVerdictNodeId: 'verdict_node_abc',
      requireFormalVerification: true,
      requiredLevel: 'L3_formal',
    });
    persistMathClaim(db, claim);
    const fetched = getMathClaim(db, 'claim_roundtrip_001');
    assert.ok(fetched !== null, 'expected claim to be fetched');
    assert.equal(fetched!.claimId, 'claim_roundtrip_001');
    assert.equal(fetched!.naturalLanguage, claim.naturalLanguage);
    assert.equal(fetched!.claimKind, 'algebraic_identity');
    assert.equal(fetched!.requiredLevel, 'L3_formal');
    assert.equal(fetched!.expectedOutcome, 'verified');
    assert.equal(fetched!.linkedVerdictNodeId, 'verdict_node_abc');
    assert.equal(fetched!.requireFormalVerification, true);
    assert.equal(fetched!.createdAt, claim.createdAt);
    assert.ok(fetched!.formalization !== null);
    assert.equal(fetched!.formalization!.target, 'smtlib');
    assert.equal(fetched!.formalization!.source, '{"lhs":"x","rhs":"x"}');
    assert.equal(fetched!.formalization!.formalizerId, 'core_neutral@v1');
    assert.equal(fetched!.formalization!.confidence, 0.9);
  } finally {
    db.close();
  }
});

test('persistMathClaim + getMathClaim round-trip with null formalization', () => {
  const db = openDb();
  try {
    const claim = makeClaim({
      claimId: 'claim_null_formal_001',
      formalization: null,
    });
    persistMathClaim(db, claim);
    const fetched = getMathClaim(db, 'claim_null_formal_001');
    assert.ok(fetched !== null);
    assert.equal(fetched!.formalization, null);
  } finally {
    db.close();
  }
});

test('persistMathClaim preserves formalization.target and source when present', () => {
  const db = openDb();
  try {
    const claim = makeClaim({
      claimId: 'claim_with_source_001',
      formalization: {
        target: 'lean4',
        source: 'human_translated',
        formalizerId: 'core_neutral@v1',
        confidence: 0.8,
      },
    });
    persistMathClaim(db, claim);
    const fetched = getMathClaim(db, 'claim_with_source_001');
    assert.ok(fetched !== null);
    assert.ok(fetched!.formalization !== null);
    assert.equal(fetched!.formalization!.target, 'lean4');
    assert.equal(fetched!.formalization!.source, 'human_translated');
  } finally {
    db.close();
  }
});

test('getMathClaim returns null for unknown claimId', () => {
  const db = openDb();
  try {
    const fetched = getMathClaim(db, 'claim_does_not_exist');
    assert.equal(fetched, null);
  } finally {
    db.close();
  }
});

test('persistVerification + getVerificationsForClaim round-trip preserves all fields', () => {
  const db = openDb();
  try {
    const claim = makeClaim({ claimId: 'claim_ver_001' });
    persistMathClaim(db, claim);
    const record = makeVerification({
      verificationId: 'ver_record_001',
      claimId: 'claim_ver_001',
      backendKind: 'lean4',
      backendId: 'lean4@v4',
      outcome: 'verified',
      inputHash: 'e'.repeat(64),
      outputArtifact: '{"proof":"theorem_eq_refl"}',
      compileLog: 'Lean compilation succeeded',
      durationMs: 1234,
      sourceAnchor: '{"backendId":"lean4@v4","commit":"abc123"}',
      verifiedAt: '2026-06-27T10:00:00.000Z',
    });
    persistVerification(db, record);
    const fetched = getVerificationsForClaim(db, 'claim_ver_001');
    assert.equal(fetched.length, 1);
    const v0 = fetched[0];
    assert.ok(v0 !== undefined);
    assert.equal(v0.verificationId, 'ver_record_001');
    assert.equal(v0.claimId, 'claim_ver_001');
    assert.equal(v0.backendKind, 'lean4');
    assert.equal(v0.backendId, 'lean4@v4');
    assert.equal(v0.outcome, 'verified');
    assert.equal(v0.inputHash, 'e'.repeat(64));
    assert.equal(v0.outputArtifact, '{"proof":"theorem_eq_refl"}');
    assert.equal(v0.compileLog, 'Lean compilation succeeded');
    assert.equal(v0.durationMs, 1234);
    assert.equal(v0.sourceAnchor, '{"backendId":"lean4@v4","commit":"abc123"}');
    assert.equal(v0.verifiedAt, '2026-06-27T10:00:00.000Z');
  } finally {
    db.close();
  }
});

test('getVerificationsForClaim returns records ordered by verified_at ASC', () => {
  const db = openDb();
  try {
    const claim = makeClaim({ claimId: 'claim_order_001' });
    persistMathClaim(db, claim);
    persistVerification(db, makeVerification({
      verificationId: 'ver_late',
      claimId: 'claim_order_001',
      verifiedAt: '2026-06-27T20:00:00.000Z',
    }));
    persistVerification(db, makeVerification({
      verificationId: 'ver_early',
      claimId: 'claim_order_001',
      verifiedAt: '2026-06-27T08:00:00.000Z',
    }));
    persistVerification(db, makeVerification({
      verificationId: 'ver_mid',
      claimId: 'claim_order_001',
      verifiedAt: '2026-06-27T14:00:00.000Z',
    }));
    const fetched = getVerificationsForClaim(db, 'claim_order_001');
    assert.equal(fetched.length, 3);
    const r0 = fetched[0];
    const r1 = fetched[1];
    const r2 = fetched[2];
    assert.ok(r0 !== undefined && r1 !== undefined && r2 !== undefined);
    assert.equal(r0.verificationId, 'ver_early');
    assert.equal(r1.verificationId, 'ver_mid');
    assert.equal(r2.verificationId, 'ver_late');
  } finally {
    db.close();
  }
});

test('getVerificationsForClaim returns empty array for claim with no verifications', () => {
  const db = openDb();
  try {
    const claim = makeClaim({ claimId: 'claim_empty_001' });
    persistMathClaim(db, claim);
    const fetched = getVerificationsForClaim(db, 'claim_empty_001');
    assert.equal(fetched.length, 0);
  } finally {
    db.close();
  }
});

test('append-only trigger forbids UPDATE on math_claims', () => {
  const db = openDb();
  try {
    const claim = makeClaim({ claimId: 'claim_no_update_001' });
    persistMathClaim(db, claim);
    assert.throws(
      () => db.prepare("UPDATE math_claims SET natural_language = 'modified' WHERE claim_id = ?").run('claim_no_update_001'),
      /append-only/,
    );
  } finally {
    db.close();
  }
});

test('append-only trigger forbids DELETE on math_verifications', () => {
  const db = openDb();
  try {
    const claim = makeClaim({ claimId: 'claim_no_delete_001' });
    persistMathClaim(db, claim);
    persistVerification(db, makeVerification({
      verificationId: 'ver_no_delete_001',
      claimId: 'claim_no_delete_001',
    }));
    assert.throws(
      () => db.prepare("DELETE FROM math_verifications WHERE verification_id = ?").run('ver_no_delete_001'),
      /append-only/,
    );
  } finally {
    db.close();
  }
});
