/**
 * fallback.test.ts —— math backend fallback 链（provider fallback）。
 *
 * 覆盖：
 *   1. 主后端 isAvailable=false → fallback 到替代后端（结果带 fallback_from 标注）。
 *   2. 主后端 verify 抛错 → fallback。
 *   3. 主后端诚实降级 backend_disabled → fallback。
 *   4. 主后端产出结论（verified）→ 不 fallback（保留主结果）。
 *   5. fallback 链全部不可用 → 保留主结果（backend_disabled）或重抛主异常。
 *   6. 用户自定义 fallbackChains 覆盖默认（含 null 关闭）。
 *   7. 默认链：smt→[cas]、lean4→[dafny]。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type {
  BackendKind,
  BackendVerifyInput,
  BackendVerifyResult,
  FormalExpression,
  MathBackend,
  MathClaim,
  VerificationOutcome,
} from '../../src/math/math_claim.ts';
import { MathVerifier } from '../../src/math/math_verifier.ts';
import type { MathVerifierOptions } from '../../src/math/math_verifier.ts';

// ---- test doubles ----

class FakeBackend implements MathBackend {
  readonly backendKind: BackendKind;
  readonly backendId: string;
  private readonly configuredOutcome: VerificationOutcome;
  private readonly available: boolean;
  private readonly throwOnVerify: boolean;
  callCount = 0;

  constructor(kind: BackendKind, outcome: VerificationOutcome, available = true, throwOnVerify = false) {
    this.backendKind = kind;
    this.backendId = `fake_${kind}@v1`;
    this.configuredOutcome = outcome;
    this.available = available;
    this.throwOnVerify = throwOnVerify;
  }

  isAvailable(): boolean {
    return this.available;
  }

  async verify(input: BackendVerifyInput): Promise<BackendVerifyResult> {
    this.callCount += 1;
    if (this.throwOnVerify) {
      throw new Error(`fake ${this.backendKind} crashed`);
    }
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

function makeFormalization(): FormalExpression {
  return {
    target: 'smtlib',
    source: '{"lhs":"x","rhs":"x"}',
    formalizerId: 'core_neutral@v1',
    confidence: 0.9,
  };
}

function makeClaim(overrides: Partial<MathClaim> = {}): MathClaim {
  return {
    claimId: 'claim_fb_001',
    naturalLanguage: 'x equals x',
    claimKind: 'algebraic_identity',
    formalization: makeFormalization(),
    requiredLevel: 'L2_smt',
    expectedOutcome: 'verified',
    linkedVerdictNodeId: null,
    requireFormalVerification: false,
    createdAt: '2026-06-27T00:00:00.000Z',
    ...overrides,
  };
}

function verifierWith(opts: {
  smt?: MathBackend;
  cas?: MathBackend;
  lean4?: MathBackend;
  dafny?: MathBackend;
  fallbackChains?: MathVerifierOptions['fallbackChains'];
}): MathVerifier {
  return new MathVerifier({
    ...(opts.smt ? { smtBackend: opts.smt } : {}),
    ...(opts.cas ? { casBackend: opts.cas } : {}),
    ...(opts.lean4 ? { formalBackend: opts.lean4 } : {}),
    ...(opts.dafny ? { dafnyBackend: opts.dafny } : {}),
    ...(opts.fallbackChains ? { fallbackChains: opts.fallbackChains } : {}),
  });
}

// ---- tests ----

test('default chain: SMT unavailable → falls back to CAS with fallback_from marker', async () => {
  const smt = new FakeBackend('smt', 'verified', false); // unavailable
  const cas = new FakeBackend('cas', 'verified', true);
  const verifier = verifierWith({ smt, cas });

  const record = await verifier.verify(makeClaim());
  assert.equal(record.backendKind, 'cas', 'should fall back to CAS');
  assert.equal(record.backendId, 'fake_cas@v1');
  assert.match(record.compileLog ?? '', /fallback_from:smt/);
  assert.equal(smt.callCount, 0, 'unavailable backend verify not invoked');
  assert.equal(cas.callCount, 1);
});

test('SMT throws → falls back to CAS; result carries fallback marker', async () => {
  const smt = new FakeBackend('smt', 'verified', true, true); // throws on verify
  const cas = new FakeBackend('cas', 'verified', true);
  const verifier = verifierWith({ smt, cas });

  const record = await verifier.verify(makeClaim());
  assert.equal(record.backendKind, 'cas');
  assert.match(record.compileLog ?? '', /fallback_from:smt/);
});

test('SMT honest degradation backend_disabled → falls back to CAS', async () => {
  // isAvailable=true 但 verify 返回 backend_disabled（诚实降级）→ fallback
  const disabledSmt = new (class extends FakeBackend {
    override async verify(): Promise<BackendVerifyResult> {
      this.callCount += 1;
      return {
        backendKind: this.backendKind,
        backendId: this.backendId,
        outcome: 'unknown',
        outputArtifact: null,
        compileLog: 'backend_disabled',
        durationMs: 0,
      };
    }
  })('smt', 'verified', true);
  const cas = new FakeBackend('cas', 'verified', true);
  const verifier = verifierWith({ smt: disabledSmt, cas });

  const record = await verifier.verify(makeClaim());
  assert.equal(record.backendKind, 'cas');
  assert.match(record.compileLog ?? '', /fallback_from:smt/);
});

test('primary produces a conclusion → no fallback invoked', async () => {
  const smt = new FakeBackend('smt', 'verified', true);
  const cas = new FakeBackend('cas', 'refuted', true);
  const verifier = verifierWith({ smt, cas });

  const record = await verifier.verify(makeClaim());
  assert.equal(record.backendKind, 'smt', 'primary verdict kept');
  assert.equal(record.outcome, 'verified');
  assert.equal(cas.callCount, 0, 'fallback must not run when primary concludes');
});

test('fallback chain all unavailable → primary backend_disabled result preserved', async () => {
  const smt = new FakeBackend('smt', 'verified', false);
  const cas = new FakeBackend('cas', 'verified', false); // also unavailable
  const verifier = verifierWith({ smt, cas });

  const record = await verifier.verify(makeClaim());
  assert.equal(record.backendKind, 'smt', 'primary result preserved');
  assert.equal(record.outcome, 'unknown');
  assert.equal(record.compileLog, 'backend_disabled');
});

test('primary throws and fallback chain empty → original error rethrown', async () => {
  const smt = new FakeBackend('smt', 'verified', true, true); // throws
  const verifier = verifierWith({ smt, fallbackChains: { smt: null } }); // fallback disabled
  await assert.rejects(() => verifier.verify(makeClaim()), /fake smt crashed/);
});

test('custom fallback chain overrides default (smt → lean4)', async () => {
  const smt = new FakeBackend('smt', 'verified', false);
  const cas = new FakeBackend('cas', 'verified', true); // would be default target
  const lean4 = new FakeBackend('lean4', 'verified', true); // custom target
  const verifier = verifierWith({
    smt,
    cas,
    lean4,
    fallbackChains: { smt: ['lean4'] },
  });

  const record = await verifier.verify(makeClaim());
  assert.equal(record.backendKind, 'lean4', 'custom chain used');
  assert.equal(cas.callCount, 0, 'default cas fallback not used');
  assert.match(record.compileLog ?? '', /fallback_from:smt/);
});

test('default chains: lean4 → dafny', async () => {
  const lean4 = new FakeBackend('lean4', 'verified', false);
  const dafny = new FakeBackend('dafny', 'verified', true);
  const verifier = verifierWith({ lean4, dafny });
  const record = await verifier.verify(
    makeClaim({ requiredLevel: 'L3_formal', claimKind: 'theorem' }),
  );
  assert.equal(record.backendKind, 'dafny');
  assert.match(record.compileLog ?? '', /fallback_from:lean4/);
});
