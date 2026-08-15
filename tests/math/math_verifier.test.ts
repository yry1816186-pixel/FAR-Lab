// spec 38 · Math verifier router tests.
// Covers: routing by claimKind domain (numerical→Numerical; symbolic by
// requiredLevel: L1_cas→CAS / L2_smt→SMT / L3_formal→Lean4 / L4_human→human
// checkpoint), null formalization rejection, inputHash cross-lang consistency,
// CAS mode='expand', fresh-clone degradation.
//
// Domain isolation (§4.5 / §15 T1.4): routing is decided by claimKind,
// NOT requiredLevel — a numerical claim always goes to NumericalBackend
// regardless of requiredLevel; a symbolic claim is routed by requiredLevel.
//
// Uses FakeBackend (no real SymPy/Z3/Lean needed — fresh-clone friendly).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FatalMathError } from '../../src/math/errors.ts';
import type {
  BackendKind,
  BackendVerifyInput,
  BackendVerifyResult,
  FormalExpression,
  MathBackend,
  MathClaim,
} from '../../src/math/math_claim.ts';
import {
  canonicalConfidence,
  createDefaultMathVerifier,
  MathVerifier,
} from '../../src/math/math_verifier.ts';
import type { VerificationOutcome } from '../../src/math/math_claim.ts';

// ============================================================
// FakeBackend — test double (no external dependencies)
// ============================================================

class FakeBackend implements MathBackend {
  readonly backendKind: BackendKind;
  readonly backendId: string;
  private readonly configuredOutcome: VerificationOutcome;
  private readonly available: boolean;
  lastInput: BackendVerifyInput | null = null;
  callCount = 0;

  constructor(kind: BackendKind, outcome: VerificationOutcome, available = true) {
    this.backendKind = kind;
    this.backendId = `fake_${kind}@v1`;
    this.configuredOutcome = outcome;
    this.available = available;
  }

  isAvailable(): boolean {
    return this.available;
  }

  async verify(input: BackendVerifyInput): Promise<BackendVerifyResult> {
    this.lastInput = input;
    this.callCount++;
    if (!this.available) {
      return {
        backendKind: this.backendKind,
        backendId: this.backendId,
        outcome: 'unknown',
        outputArtifact: null,
        compileLog: 'backend_disabled',
        durationMs: 0,
      };
    }
    return {
      backendKind: this.backendKind,
      backendId: this.backendId,
      outcome: this.configuredOutcome,
      outputArtifact: JSON.stringify({ expression: input.expression }),
      compileLog: 'fake_backend_log',
      durationMs: 1,
    };
  }
}

// ============================================================
// Helpers
// ============================================================

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
    claimId: overrides.claimId ?? 'claim_ver_001',
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

// ============================================================
// §1  Symbolic routing by requiredLevel
// ============================================================

test('verify routes symbolic L1_cas to CAS backend', async () => {
  const casBackend = new FakeBackend('cas', 'verified');
  const verifier = new MathVerifier({ casBackend });
  const claim = makeClaim({ claimKind: 'algebraic_identity', requiredLevel: 'L1_cas' });
  const record = await verifier.verify(claim);
  assert.equal(record.backendKind, 'cas');
  assert.equal(casBackend.callCount, 1);
  assert.equal(record.outcome, 'verified');
});

test('verify routes symbolic L2_smt to SMT backend', async () => {
  const smtBackend = new FakeBackend('smt', 'verified');
  const verifier = new MathVerifier({ smtBackend });
  const claim = makeClaim({ claimKind: 'theorem', requiredLevel: 'L2_smt' });
  const record = await verifier.verify(claim);
  assert.equal(record.backendKind, 'smt');
  assert.equal(smtBackend.callCount, 1);
});

test('verify routes symbolic L3_formal to Lean4 backend', async () => {
  const formalBackend = new FakeBackend('lean4', 'verified');
  const verifier = new MathVerifier({ formalBackend });
  const claim = makeClaim({ claimKind: 'algebraic_identity', requiredLevel: 'L3_formal' });
  const record = await verifier.verify(claim);
  assert.equal(record.backendKind, 'lean4');
  assert.equal(formalBackend.callCount, 1);
});

test('verify routes symbolic L4_human to human checkpoint (no automatic backend)', async () => {
  const verifier = createDefaultMathVerifier();
  const claim = makeClaim({ claimKind: 'theorem', requiredLevel: 'L4_human' });
  const record = await verifier.verify(claim);
  assert.equal(record.outcome, 'unknown');
  assert.equal(record.compileLog, 'human_checkpoint_required');
  assert.equal(record.backendId, 'human@checkpoint');
});

// ============================================================
// §2  Numerical routing — domain decided by claimKind, not requiredLevel
// ============================================================

test('verify routes numerical kind to numerical backend', async () => {
  const numericalBackend = new FakeBackend('numerical', 'unknown');
  const verifier = new MathVerifier({ numericalBackend });
  const claim = makeClaim({
    claimKind: 'numerical_reproduction',
    requiredLevel: 'L4_human',
    formalization: makeFormalization({ source: '{"bound":{"min":0,"max":1,"sampleCount":10,"description":"test"}}' }),
  });
  const record = await verifier.verify(claim);
  assert.equal(record.backendKind, 'numerical');
  assert.equal(numericalBackend.callCount, 1);
});

test('verify routes numerical kind to numerical backend regardless of requiredLevel', async () => {
  // Domain isolation (spec §15 T1.4): a numerical claim is routed by claimKind,
  // so even requiredLevel=L1_cas lands on the NumericalBackend (not CAS).
  const numericalBackend = new FakeBackend('numerical', 'unknown');
  const verifier = new MathVerifier({ numericalBackend });
  const claim = makeClaim({
    claimKind: 'numerical_reproduction',
    requiredLevel: 'L1_cas',
    formalization: makeFormalization({ source: '{"bound":{"min":0,"max":1,"sampleCount":10,"description":"test"}}' }),
  });
  const record = await verifier.verify(claim);
  assert.equal(record.backendKind, 'numerical');
  assert.equal(record.outcome, 'unknown');
});

test('verify throws FatalMathError for null formalization', async () => {
  const verifier = createDefaultMathVerifier();
  const claim = makeClaim({ formalization: null });
  await assert.rejects(() => verifier.verify(claim), FatalMathError);
});

// ============================================================
// §3  Record fields
// ============================================================

test('verify produces record with all required fields', async () => {
  const casBackend = new FakeBackend('cas', 'verified');
  const verifier = new MathVerifier({ casBackend });
  const claim = makeClaim({ claimKind: 'algebraic_identity', requiredLevel: 'L1_cas' });
  const record = await verifier.verify(claim);

  assert.equal(record.claimId, claim.claimId);
  assert.equal(record.backendKind, 'cas');
  assert.equal(typeof record.verificationId, 'string');
  assert.ok(record.verificationId.length > 0);
  assert.equal(typeof record.backendId, 'string');
  assert.equal(record.outcome, 'verified');
  assert.match(record.inputHash, /^[0-9a-f]{64}$/);
  assert.equal(typeof record.sourceAnchor, 'string');
  assert.equal(typeof record.verifiedAt, 'string');
  assert.ok(record.durationMs >= 0);
});

test('verify passes mode=expand to CAS backend', async () => {
  const casBackend = new FakeBackend('cas', 'verified');
  const verifier = new MathVerifier({ casBackend });
  const claim = makeClaim({ claimKind: 'algebraic_identity', requiredLevel: 'L1_cas' });
  await verifier.verify(claim);
  assert.equal(casBackend.lastInput?.mode, 'expand');
});

test('verify builds BackendVerifyInput.expression from formalization.source', async () => {
  const casBackend = new FakeBackend('cas', 'verified');
  const verifier = new MathVerifier({ casBackend });
  const source = '{"lhs":"a","rhs":"b"}';
  const claim = makeClaim({
    claimKind: 'algebraic_identity',
    requiredLevel: 'L1_cas',
    formalization: makeFormalization({ source }),
  });
  await verifier.verify(claim);
  assert.equal(casBackend.lastInput?.expression, source);
});

// ============================================================
// §4  Fresh-clone degradation (backend unavailable)
// ============================================================

test('verify returns unknown when CAS backend unavailable (fresh-clone degradation)', async () => {
  const casBackend = new FakeBackend('cas', 'verified', false);
  const verifier = new MathVerifier({ casBackend });
  const claim = makeClaim({ claimKind: 'algebraic_identity', requiredLevel: 'L1_cas' });
  const record = await verifier.verify(claim);
  assert.equal(record.outcome, 'unknown');
  assert.equal(record.compileLog, 'backend_disabled');
});

test('verify returns unknown when Lean4 backend unavailable (fresh-clone degradation)', async () => {
  const formalBackend = new FakeBackend('lean4', 'verified', false);
  const verifier = new MathVerifier({ formalBackend });
  const claim = makeClaim({ claimKind: 'algebraic_identity', requiredLevel: 'L3_formal' });
  const record = await verifier.verify(claim);
  assert.equal(record.outcome, 'unknown');
  assert.equal(record.compileLog, 'backend_disabled');
});

// ============================================================
// §5  inputHash determinism (TS) + canonicalConfidence normalization
//     Cross-lang byte-equality (TS↔Python) covered by
//     tests/math/math_input_hash_cross_lang.test.ts (audit [F] F-3: this section
//     previously titled "cross-lang consistency" but only tested TS self-consistency).
// ============================================================

test('computeInputHash produces deterministic 64-char hex', async () => {
  const verifier = new MathVerifier();
  const formalization = makeFormalization();
  const hash1 = verifier.computeInputHash(formalization);
  const hash2 = verifier.computeInputHash(formalization);
  assert.equal(hash1, hash2);
  assert.match(hash1, /^[0-9a-f]{64}$/);
});

test('computeInputHash changes when source changes (avalanche)', async () => {
  const verifier = new MathVerifier();
  const f1 = makeFormalization({ source: '{"lhs":"x","rhs":"x"}' });
  const f2 = makeFormalization({ source: '{"lhs":"x","rhs":"y"}' });
  assert.notEqual(verifier.computeInputHash(f1), verifier.computeInputHash(f2));

  // Same formalization → same hash (deterministic).
  const hash1 = verifier.computeInputHash(f1);
  const hash2 = verifier.computeInputHash(makeFormalization({ source: '{"lhs":"x","rhs":"x"}' }));
  assert.equal(hash1, hash2);
});

test('computeInputHash changes when target language changes (avalanche)', async () => {
  const verifier = new MathVerifier();
  const f1 = makeFormalization({ target: 'smtlib', source: 'same source' });
  const f2 = makeFormalization({ target: 'lean4', source: 'same source' });
  assert.notEqual(verifier.computeInputHash(f1), verifier.computeInputHash(f2));
});

test('canonicalConfidence normalizes integer floats to fixed-point (cross-lang align)', () => {
  // F-1 核心：整数浮点 1.0 → "1.000000"（非 JS JSON.stringify "1"）对齐 Python json.dumps "1.0"
  assert.equal(canonicalConfidence(1.0), '1.000000');
  assert.equal(canonicalConfidence(0.0), '0.000000');
  assert.equal(canonicalConfidence(0.9), '0.900000');
  assert.equal(canonicalConfidence(1e-10), '0.000000'); // 定点无指数分歧（JS/Python 同）
});

test('canonicalConfidence normalizes -0 to +0 (JS/Python fixed-point align)', () => {
  // -0.0 归一化：JS (-0).toFixed(6)="0.000000" vs Python f"{-0.0:.6f}"="-0.000000" → 归一化消除分歧。
  // 注：-0.0 无法跨进程传递（argv/JSON 丢失负零符号）·此处在 TS 进程内验证归一化逻辑。
  assert.equal(canonicalConfidence(-0), '0.000000');
  assert.equal(canonicalConfidence(-0.0), '0.000000');
});
