// spec 38 · Math claim types & constants tests.
// Covers: MATH_CLAIM_KINDS (12), VERIFICATION_LEVELS (4), VERIFICATION_OUTCOMES (3),
// BACKEND_KINDS (5), FORMAL_TARGETS (3), type guards, validateMathClaim,
// defaultRequiredLevel, derivedAchievedLevel, meetsRequiredLevel.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BACKEND_KINDS,
  BACKEND_LEVEL,
  defaultRequiredLevel,
  derivedAchievedLevel,
  isBackendKind,
  isFormalTarget,
  isMathClaimKind,
  isNumericalKind,
  isSymbolicKind,
  isVerificationLevel,
  isVerificationOutcome,
  LEVEL_RANK,
  MATH_CLAIM_KINDS,
  meetsRequiredLevel,
  NUMERICAL_MATH_CLAIM_KINDS,
  SYMBOLIC_MATH_CLAIM_KINDS,
  validateMathClaim,
  VERIFICATION_LEVELS,
  VERIFICATION_OUTCOMES,
} from '../../src/math/math_claim.ts';
import type {
  FormalExpression,
  FormalTarget,
  MathClaim,
  MathClaimKind,
  MathVerificationRecord,
  VerificationLevel,
  VerificationOutcome,
} from '../../src/math/math_claim.ts';
import { FatalMathError } from '../../src/math/errors.ts';

function makeFormalization(overrides: Partial<FormalExpression> = {}): FormalExpression {
  return {
    target: overrides.target ?? 'smtlib',
    source: overrides.source ?? '{"lhs":"x","rhs":"x"}',
    formalizerId: overrides.formalizerId ?? 'core_neutral@v1',
    confidence: overrides.confidence ?? 0.9,
  };
}

function makeClaim(overrides: Partial<MathClaim> = {}): MathClaim {
  return {
    claimId: overrides.claimId ?? 'claim_test_001',
    naturalLanguage: overrides.naturalLanguage ?? 'x equals x',
    claimKind: overrides.claimKind ?? 'algebraic_identity',
    formalization: overrides.formalization === undefined ? makeFormalization() : overrides.formalization,
    requiredLevel: overrides.requiredLevel ?? 'L1_cas',
    expectedOutcome: overrides.expectedOutcome ?? 'verified',
    linkedVerdictNodeId: overrides.linkedVerdictNodeId ?? null,
    requireFormalVerification: overrides.requireFormalVerification ?? false,
    createdAt: overrides.createdAt ?? '2026-06-27T00:00:00.000Z',
  };
}

function makeVerification(overrides: Partial<MathVerificationRecord> = {}): MathVerificationRecord {
  return {
    verificationId: overrides.verificationId ?? 'ver_test_001',
    claimId: overrides.claimId ?? 'claim_test_001',
    backendKind: overrides.backendKind ?? 'cas',
    backendId: overrides.backendId ?? 'sympy@1.12',
    outcome: overrides.outcome ?? 'verified',
    inputHash: overrides.inputHash ?? 'a'.repeat(64),
    outputArtifact: overrides.outputArtifact ?? null,
    compileLog: overrides.compileLog ?? null,
    durationMs: overrides.durationMs ?? 42,
    sourceAnchor: overrides.sourceAnchor ?? '{"backendId":"sympy@1.12"}',
    verifiedAt: overrides.verifiedAt ?? '2026-06-27T00:00:00.000Z',
  };
}

test('MATH_CLAIM_KINDS has exactly 12 values', () => {
  assert.equal(MATH_CLAIM_KINDS.length, 12);
});

test('SYMBOLIC_MATH_CLAIM_KINDS has exactly 8 values', () => {
  assert.equal(SYMBOLIC_MATH_CLAIM_KINDS.length, 8);
});

test('NUMERICAL_MATH_CLAIM_KINDS has exactly 4 values', () => {
  assert.equal(NUMERICAL_MATH_CLAIM_KINDS.length, 4);
});

test('SYMBOLIC + NUMERICAL = MATH_CLAIM_KINDS (union is complete)', () => {
  assert.deepEqual(
    [...SYMBOLIC_MATH_CLAIM_KINDS, ...NUMERICAL_MATH_CLAIM_KINDS],
    [...MATH_CLAIM_KINDS],
  );
});

test('VERIFICATION_LEVELS has exactly 4 values in order', () => {
  assert.equal(VERIFICATION_LEVELS.length, 4);
  assert.deepEqual([...VERIFICATION_LEVELS], ['L1_cas', 'L2_smt', 'L3_formal', 'L4_human']);
});

test('VERIFICATION_OUTCOMES has exactly 3 values in order', () => {
  assert.equal(VERIFICATION_OUTCOMES.length, 3);
  assert.deepEqual([...VERIFICATION_OUTCOMES], ['verified', 'refuted', 'unknown']);
});

test('BACKEND_KINDS has exactly 5 values in order', () => {
  assert.equal(BACKEND_KINDS.length, 5);
  assert.deepEqual([...BACKEND_KINDS], ['cas', 'smt', 'lean4', 'dafny', 'numerical']);
});

test('isSymbolicKind returns true for all 8 symbolic kinds, false for numerical', () => {
  for (const kind of SYMBOLIC_MATH_CLAIM_KINDS) {
    assert.equal(isSymbolicKind(kind), true, `isSymbolicKind should be true for ${kind}`);
  }
  assert.equal(isSymbolicKind('numerical_reproduction'), false);
});

test('isNumericalKind returns true for all 4 numerical kinds, false for symbolic', () => {
  for (const kind of NUMERICAL_MATH_CLAIM_KINDS) {
    assert.equal(isNumericalKind(kind), true, `isNumericalKind should be true for ${kind}`);
  }
  assert.equal(isNumericalKind('algebraic_identity'), false);
});

test('isMathClaimKind returns true for all 12 kinds and false for unknown', () => {
  for (const kind of MATH_CLAIM_KINDS) {
    assert.equal(isMathClaimKind(kind), true, `isMathClaimKind should be true for ${kind}`);
  }
  assert.equal(isMathClaimKind('not_a_real_kind'), false);
});

test('isVerificationLevel / isVerificationOutcome / isBackendKind / isFormalTarget reject unknown values', () => {
  for (const level of VERIFICATION_LEVELS) {
    assert.equal(isVerificationLevel(level), true);
  }
  assert.equal(isVerificationLevel('L5_FAKE'), false);
  for (const outcome of VERIFICATION_OUTCOMES) {
    assert.equal(isVerificationOutcome(outcome), true);
  }
  assert.equal(isVerificationOutcome('maybe'), false);
  for (const backend of BACKEND_KINDS) {
    assert.equal(isBackendKind(backend), true);
  }
  assert.equal(isBackendKind('wolfram'), false);
  assert.equal(isFormalTarget('lean4'), true);
  assert.equal(isFormalTarget('dafny'), true);
  assert.equal(isFormalTarget('smtlib'), true);
  assert.equal(isFormalTarget('coq'), false);
});

test('validateMathClaim accepts a valid claim for each of the 12 kinds', () => {
  for (const kind of MATH_CLAIM_KINDS) {
    const requiredLevel = defaultRequiredLevel(kind);
    const claim = makeClaim({ claimKind: kind, requiredLevel });
    assert.doesNotThrow(() => validateMathClaim(claim), `validateMathClaim should accept kind=${kind}`);
  }
});

test('validateMathClaim rejects unknown claimKind', () => {
  const bad = makeClaim({ claimKind: 'not_a_kind' as MathClaimKind });
  assert.throws(() => validateMathClaim(bad), FatalMathError);
});

test('validateMathClaim rejects unknown requiredLevel', () => {
  const bad = makeClaim({ requiredLevel: 'L9_FAKE' as VerificationLevel });
  assert.throws(() => validateMathClaim(bad), FatalMathError);
});

test('validateMathClaim rejects unknown expectedOutcome', () => {
  const bad = makeClaim({ expectedOutcome: 'maybe' as VerificationOutcome });
  assert.throws(() => validateMathClaim(bad), FatalMathError);
});

test('validateMathClaim rejects requireFormalVerification=true without L3_formal', () => {
  const bad = makeClaim({ requireFormalVerification: true, requiredLevel: 'L1_cas' });
  assert.throws(() => validateMathClaim(bad), FatalMathError);
});

test('validateMathClaim accepts requireFormalVerification=true with L3_formal', () => {
  const good = makeClaim({ requireFormalVerification: true, requiredLevel: 'L3_formal' });
  assert.doesNotThrow(() => validateMathClaim(good));
});

test('validateMathClaim rejects numerical kind with requireFormalVerification=true', () => {
  // requiredLevel must be L3_formal to reach the numerical-kind check (otherwise
  // the requireFormalVerification != L3_formal guard fires first — spec §1 line 175).
  const bad = makeClaim({
    claimKind: 'numerical_reproduction',
    requiredLevel: 'L3_formal',
    requireFormalVerification: true,
  });
  assert.throws(() => validateMathClaim(bad), FatalMathError);
});

test('validateMathClaim accepts numerical kind with L1_cas (no kind-level forcing)', () => {
  // spec §1 line 175: validateMathClaim only gates requireFormalVerification;
  // it does NOT force numerical→L4_human or symbolic→!L4_human. Domain routing is
  // the verifier's responsibility (spec §15 T1.4).
  const good = makeClaim({ claimKind: 'numerical_reproduction', requiredLevel: 'L1_cas' });
  assert.doesNotThrow(() => validateMathClaim(good));
});

test('validateMathClaim accepts symbolic kind with L4_human (no kind-level forcing)', () => {
  const good = makeClaim({ claimKind: 'algebraic_identity', requiredLevel: 'L4_human' });
  assert.doesNotThrow(() => validateMathClaim(good));
});

test('validateMathClaim rejects unknown formalization target', () => {
  const bad = makeClaim({ formalization: makeFormalization({ target: 'not_a_target' as FormalTarget }) });
  assert.throws(() => validateMathClaim(bad), FatalMathError);
});

test('validateMathClaim rejects empty formalization source', () => {
  const bad = makeClaim({ formalization: makeFormalization({ source: '' }) });
  assert.throws(() => validateMathClaim(bad), FatalMathError);
});

test('validateMathClaim rejects confidence out of [0,1]', () => {
  const bad = makeClaim({ formalization: makeFormalization({ confidence: 1.5 }) });
  assert.throws(() => validateMathClaim(bad), FatalMathError);
});

test('validateMathClaim accepts null formalization', () => {
  const good = makeClaim({ formalization: null });
  assert.doesNotThrow(() => validateMathClaim(good));
});

test('defaultRequiredLevel returns L1_cas for all symbolic kinds', () => {
  for (const kind of SYMBOLIC_MATH_CLAIM_KINDS) {
    assert.equal(defaultRequiredLevel(kind), 'L1_cas', `defaultRequiredLevel(${kind}) should be L1_cas`);
  }
});

test('defaultRequiredLevel returns L4_human for all numerical kinds', () => {
  for (const kind of NUMERICAL_MATH_CLAIM_KINDS) {
    assert.equal(defaultRequiredLevel(kind), 'L4_human', `defaultRequiredLevel(${kind}) should be L4_human`);
  }
});

test('derivedAchievedLevel returns null for empty verifications', () => {
  assert.equal(derivedAchievedLevel([]), null);
});

test('derivedAchievedLevel returns null when all outcomes are unknown', () => {
  const records = [makeVerification({ backendKind: 'cas', outcome: 'unknown' })];
  assert.equal(derivedAchievedLevel(records), null);
});

test('derivedAchievedLevel returns L1_cas for a verified CAS record', () => {
  const records = [makeVerification({ backendKind: 'cas', outcome: 'verified' })];
  assert.equal(derivedAchievedLevel(records), 'L1_cas');
});

test('derivedAchievedLevel returns L3_formal for a verified lean4 record', () => {
  const records = [makeVerification({ backendKind: 'lean4', outcome: 'verified' })];
  assert.equal(derivedAchievedLevel(records), 'L3_formal');
});

test('derivedAchievedLevel returns highest level among multiple verified records', () => {
  const records = [
    makeVerification({ backendKind: 'cas', outcome: 'verified' }),
    makeVerification({ backendKind: 'smt', outcome: 'verified' }),
    makeVerification({ backendKind: 'lean4', outcome: 'verified' }),
  ];
  assert.equal(derivedAchievedLevel(records), 'L3_formal');
});

test('derivedAchievedLevel ignores numerical backend (non-self-proving)', () => {
  const records = [makeVerification({ backendKind: 'numerical', outcome: 'verified' })];
  assert.equal(derivedAchievedLevel(records), null);
});

test('derivedAchievedLevel ignores refuted records', () => {
  const records = [
    makeVerification({ backendKind: 'cas', outcome: 'refuted' }),
    makeVerification({ backendKind: 'lean4', outcome: 'verified' }),
  ];
  assert.equal(derivedAchievedLevel(records), 'L3_formal');
});

test('meetsRequiredLevel returns false for null achieved', () => {
  assert.equal(meetsRequiredLevel(null, 'L1_cas'), false);
});

test('meetsRequiredLevel returns true when achieved equals required', () => {
  assert.equal(meetsRequiredLevel('L1_cas', 'L1_cas'), true);
});

test('meetsRequiredLevel returns true when achieved exceeds required', () => {
  assert.equal(meetsRequiredLevel('L3_formal', 'L1_cas'), true);
});

test('meetsRequiredLevel returns false when achieved is below required', () => {
  assert.equal(meetsRequiredLevel('L1_cas', 'L3_formal'), false);
});

test('LEVEL_RANK is monotonically increasing L1 < L2 < L3 < L4', () => {
  assert.ok(LEVEL_RANK['L1_cas'] < LEVEL_RANK['L2_smt']);
  assert.ok(LEVEL_RANK['L2_smt'] < LEVEL_RANK['L3_formal']);
  assert.ok(LEVEL_RANK['L3_formal'] < LEVEL_RANK['L4_human']);
});

test('BACKEND_LEVEL maps cas/smt/lean4/dafny correctly (numerical absent)', () => {
  assert.equal(BACKEND_LEVEL['cas'], 'L1_cas');
  assert.equal(BACKEND_LEVEL['smt'], 'L2_smt');
  assert.equal(BACKEND_LEVEL['lean4'], 'L3_formal');
  assert.equal(BACKEND_LEVEL['dafny'], 'L3_formal');
  const keys = Object.keys(BACKEND_LEVEL).sort();
  assert.deepEqual(keys, ['cas', 'dafny', 'lean4', 'smt']);
  assert.equal(keys.includes('numerical'), false);
});
