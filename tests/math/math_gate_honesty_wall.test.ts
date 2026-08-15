// §7 + §8 · MathGate and HonestyWall tests.
// Covers:
//   - canConfirmWithMathGate: gate OFF (requireFormalVerification=false) → canConfirm=true
//   - canConfirmWithMathGate: gate ON + no verifications → canConfirm=false
//   - canConfirmWithMathGate: gate ON + L1 achieved → canConfirm=false
//   - canConfirmWithMathGate: gate ON + L3 achieved → canConfirm=true
//   - renderMathHonestyWall: renders claim metadata + verification records
//   - renderMathHonestyWall: WARNING when disabled backends present
//   - renderMathHonestyWall: NOTE when achieved level does not meet required
//   - renderMathHonestyWall: GATE when requireFormalVerification=true but L3 not achieved

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { canConfirmWithMathGate } from '../../src/math/math_gate.ts';
import {
  MATH_VERIFICATION_BOUNDARY,
  renderMathHonestyWall,
} from '../../src/math/honesty_wall.ts';
import type {
  MathClaim,
  MathVerificationRecord,
} from '../../src/math/math_claim.ts';

function makeClaim(overrides: Partial<MathClaim> = {}): MathClaim {
  return {
    claimId: overrides.claimId ?? 'claim_gate_001',
    naturalLanguage: overrides.naturalLanguage ?? 'forall x, x equals x',
    claimKind: overrides.claimKind ?? 'algebraic_identity',
    formalization: overrides.formalization ?? {
      target: 'smtlib',
      source: '{"lhs":"x","rhs":"x"}',
      formalizerId: 'core_neutral@v1',
      confidence: 0.9,
    },
    requiredLevel: overrides.requiredLevel ?? 'L3_formal',
    expectedOutcome: overrides.expectedOutcome ?? 'verified',
    linkedVerdictNodeId: overrides.linkedVerdictNodeId ?? null,
    requireFormalVerification: overrides.requireFormalVerification ?? false,
    createdAt: overrides.createdAt ?? '2026-06-27T00:00:00.000Z',
  };
}

function makeVerification(overrides: Partial<MathVerificationRecord> = {}): MathVerificationRecord {
  return {
    verificationId: overrides.verificationId ?? 'ver_gate_001',
    claimId: overrides.claimId ?? 'claim_gate_001',
    backendKind: overrides.backendKind ?? 'cas',
    backendId: overrides.backendId ?? 'sympy@1.12',
    outcome: overrides.outcome ?? 'verified',
    inputHash: overrides.inputHash ?? 'b'.repeat(64),
    outputArtifact: overrides.outputArtifact ?? null,
    compileLog: overrides.compileLog ?? null,
    durationMs: overrides.durationMs ?? 42,
    sourceAnchor: overrides.sourceAnchor ?? '{"backendId":"sympy@1.12"}',
    verifiedAt: overrides.verifiedAt ?? '2026-06-27T00:00:00.000Z',
  };
}

test('canConfirmWithMathGate: gate OFF (requireFormalVerification=false) returns canConfirm=true', () => {
  const claim = makeClaim({
    requiredLevel: 'L1_cas',
    requireFormalVerification: false,
  });
  const result = canConfirmWithMathGate({ claim, verifications: [] });
  assert.equal(result.canConfirm, true);
  assert.equal(result.forcedUntestedReason, null);
});

test('canConfirmWithMathGate: gate ON + no verifications returns canConfirm=false', () => {
  const claim = makeClaim({
    requiredLevel: 'L3_formal',
    requireFormalVerification: true,
  });
  const result = canConfirmWithMathGate({ claim, verifications: [] });
  assert.equal(result.canConfirm, false);
  assert.ok(result.forcedUntestedReason !== null);
  assert.ok(result.forcedUntestedReason.length > 0);
});

test('canConfirmWithMathGate: gate ON + only L1_cas achieved returns canConfirm=false', () => {
  const claim = makeClaim({
    requiredLevel: 'L3_formal',
    requireFormalVerification: true,
  });
  const verifications = [
    makeVerification({ backendKind: 'cas', outcome: 'verified' }),
  ];
  const result = canConfirmWithMathGate({ claim, verifications });
  assert.equal(result.canConfirm, false);
  assert.ok(result.forcedUntestedReason !== null);
  assert.equal(result.achievedLevel, 'L1_cas');
  assert.equal(result.meetsRequiredLevel, false);
});

test('canConfirmWithMathGate: gate ON + L3_formal achieved returns canConfirm=true', () => {
  const claim = makeClaim({
    requiredLevel: 'L3_formal',
    requireFormalVerification: true,
  });
  const verifications = [
    makeVerification({ backendKind: 'lean4', backendId: 'lean4@v4', outcome: 'verified' }),
  ];
  const result = canConfirmWithMathGate({ claim, verifications });
  assert.equal(result.canConfirm, true);
  assert.equal(result.forcedUntestedReason, null);
  assert.equal(result.achievedLevel, 'L3_formal');
  assert.equal(result.meetsRequiredLevel, true);
});

test('renderMathHonestyWall: renders claim metadata and verification records', () => {
  const claim = makeClaim({
    requiredLevel: 'L1_cas',
    requireFormalVerification: false,
  });
  const verifications = [
    makeVerification({
      backendKind: 'cas',
      backendId: 'sympy@1.12',
      outcome: 'verified',
      inputHash: 'c'.repeat(64),
    }),
  ];
  const render = renderMathHonestyWall({ claim, verifications });
  assert.equal(render.boundary, MATH_VERIFICATION_BOUNDARY);
  assert.equal(render.verificationCount, 1);
  assert.equal(render.achievedLevel, 'L1_cas');
  assert.equal(render.meetsRequiredLevel, true);
  assert.equal(render.hasDisabledBackends, false);
  assert.ok(render.text.includes('forall x, x equals x'));
  assert.ok(render.text.includes('sympy@1.12'));
  assert.ok(render.text.includes('verified'));
  assert.ok(render.text.includes('c'.repeat(64)));
});

test('renderMathHonestyWall: emits WARNING when disabled backends present', () => {
  const claim = makeClaim({
    requiredLevel: 'L1_cas',
    requireFormalVerification: false,
  });
  const verifications = [
    makeVerification({
      backendKind: 'cas',
      outcome: 'unknown',
      compileLog: 'backend_disabled',
    }),
  ];
  const render = renderMathHonestyWall({ claim, verifications });
  assert.equal(render.hasDisabledBackends, true);
  assert.ok(render.text.includes('WARNING'));
  assert.ok(render.text.includes('DISABLED'));
});

test('renderMathHonestyWall: emits NOTE when achieved level does not meet required', () => {
  const claim = makeClaim({
    requiredLevel: 'L3_formal',
    requireFormalVerification: false,
  });
  const verifications = [
    makeVerification({ backendKind: 'cas', outcome: 'verified' }),
  ];
  const render = renderMathHonestyWall({ claim, verifications });
  assert.equal(render.meetsRequiredLevel, false);
  assert.ok(render.text.includes('NOTE'));
});

test('renderMathHonestyWall: emits GATE when requireFormalVerification=true but L3 not achieved', () => {
  const claim = makeClaim({
    requiredLevel: 'L3_formal',
    requireFormalVerification: true,
  });
  const verifications = [
    makeVerification({ backendKind: 'cas', outcome: 'verified' }),
  ];
  const render = renderMathHonestyWall({ claim, verifications });
  assert.ok(render.text.includes('GATE'));
  assert.ok(render.text.includes('requireFormalVerification'));
});

test('renderMathHonestyWall: handles empty verifications gracefully', () => {
  const claim = makeClaim({ requiredLevel: 'L1_cas' });
  const render = renderMathHonestyWall({ claim, verifications: [] });
  assert.equal(render.verificationCount, 0);
  assert.equal(render.achievedLevel, null);
  assert.equal(render.meetsRequiredLevel, false);
  assert.ok(render.text.includes('(none'));
});
