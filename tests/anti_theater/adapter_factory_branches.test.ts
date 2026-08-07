// tests/anti_theater/adapter_factory_branches.test.ts
// Branch coverage boost: kernel_adapter outcome→severity projection (WARN/PASS/SKIP) +
// finding_factory invariant guards (invalid attackId, blockSeal+non-FAIL) + PASS/SKIP severity.
//
// These branches are reachable pure-function paths that integration tests don't exercise
// (integration uses real detectors which only produce FAIL/WARN outcomes; PASS/SKIP and
// invariant violations are defensive paths). Covering them brings both files to ~100% branch.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { toKernelFinding, toKernelFindings } from '../../src/anti_theater/adapters/kernel_adapter.ts';
import { makeFinding, type MakeFindingInput } from '../../src/anti_theater/finding_factory.ts';
import { AntiTheaterInvariantError } from '../../src/anti_theater/errors.ts';
import type { AntiTheaterFinding } from '../../src/anti_theater/types.ts';

/** Build a minimal stored AntiTheaterFinding for a given outcome (used as toKernelFinding input). */
function makeStoredFinding(outcome: 'PASS' | 'WARN' | 'SKIP' | 'FAIL'): AntiTheaterFinding {
  return {
    findingId: 'AT-TEST-01',
    attackKind: 'fake-pass-forgery',
    outcome,
    hasFail: outcome === 'FAIL',
    evidenceRef: 'test-ref',
    message: `test finding with outcome=${outcome}`,
  };
}

describe('kernel_adapter: outcome → severity projection (all 4 outcomes)', () => {
  it('FAIL outcome → severity="fail"', () => {
    const k = toKernelFinding(makeStoredFinding('FAIL'));
    assert.equal(k.severity, 'fail');
    assert.equal(k.kind, 'fake-pass-forgery');
    assert.equal(k.details, 'test finding with outcome=FAIL');
  });

  it('WARN outcome → severity="warn" (previously uncovered branch)', () => {
    const k = toKernelFinding(makeStoredFinding('WARN'));
    assert.equal(k.severity, 'warn');
  });

  it('PASS outcome → severity="pass" (previously uncovered branch)', () => {
    const k = toKernelFinding(makeStoredFinding('PASS'));
    assert.equal(k.severity, 'pass');
  });

  it('SKIP outcome → severity="pass" (SKIP treated as pass — detector did not run)', () => {
    const k = toKernelFinding(makeStoredFinding('SKIP'));
    assert.equal(k.severity, 'pass');
  });

  it('toKernelFindings (batch) preserves order and projects each', () => {
    const batch = toKernelFindings([
      makeStoredFinding('FAIL'),
      makeStoredFinding('WARN'),
      makeStoredFinding('PASS'),
    ]);
    assert.equal(batch.length, 3);
    const [r0, r1, r2] = batch;
    assert.ok(r0 && r1 && r2, 'batch must have 3 elements');
    assert.equal(r0.severity, 'fail');
    assert.equal(r1.severity, 'warn');
    assert.equal(r2.severity, 'pass');
  });
});

describe('finding_factory: invariant guards (error paths)', () => {
  it('throws AntiTheaterInvariantError on unknown attackId (not in ATTACK_ID_TO_KIND)', () => {
    const input: MakeFindingInput = {
      attackId: 'AT-NONEXISTENT-FAKE',
      outcome: 'FAIL',
      reasonCode: 'TEST',
      evidenceRef: 'ref',
      message: 'msg',
    };
    assert.throws(
      () => makeFinding(input),
      (err: unknown) => err instanceof AntiTheaterInvariantError &&
        /unknown attackId 'AT-NONEXISTENT-FAKE'/.test((err as Error).message),
    );
  });

  it('throws AntiTheaterInvariantError when blockSeal=true but outcome≠FAIL', () => {
    const input: MakeFindingInput = {
      attackId: 'AT-FAKE-PASS',
      outcome: 'WARN', // blockSeal requires FAIL
      reasonCode: 'TEST',
      evidenceRef: 'ref',
      message: 'msg',
      blockSeal: true,
    };
    assert.throws(
      () => makeFinding(input),
      (err: unknown) => err instanceof AntiTheaterInvariantError &&
        /blockSeal=true requires outcome='FAIL'/.test((err as Error).message),
    );
  });

  it('throws on blockSeal=true + outcome=PASS', () => {
    const input: MakeFindingInput = {
      attackId: 'AT-FAKE-PASS',
      outcome: 'PASS',
      reasonCode: 'TEST',
      evidenceRef: 'ref',
      message: 'msg',
      blockSeal: true,
    };
    assert.throws(() => makeFinding(input), AntiTheaterInvariantError);
  });
});

describe('finding_factory: severity derivation for all outcomes', () => {
  it('outcome=FAIL (no blockSeal) → severity=FAIL', () => {
    const f = makeFinding({
      attackId: 'AT-LABEL-ONLY', outcome: 'FAIL', reasonCode: 'X', evidenceRef: 'r', message: 'm',
    });
    assert.equal(f.ext.severity, 'FAIL');
    assert.equal(f.stored.hasFail, true);
  });

  it('outcome=WARN → severity=WARN', () => {
    const f = makeFinding({
      attackId: 'AT-LABEL-ONLY', outcome: 'WARN', reasonCode: 'X', evidenceRef: 'r', message: 'm',
    });
    assert.equal(f.ext.severity, 'WARN');
    assert.equal(f.stored.hasFail, false);
  });

  it('outcome=PASS → severity=INFO (previously uncovered branch)', () => {
    const f = makeFinding({
      attackId: 'AT-LABEL-ONLY', outcome: 'PASS', reasonCode: 'X', evidenceRef: 'r', message: 'm',
    });
    assert.equal(f.ext.severity, 'INFO');
    assert.equal(f.stored.hasFail, false);
  });

  it('outcome=SKIP → severity=INFO (previously uncovered branch)', () => {
    const f = makeFinding({
      attackId: 'AT-LABEL-ONLY', outcome: 'SKIP', reasonCode: 'X', evidenceRef: 'r', message: 'm',
    });
    assert.equal(f.ext.severity, 'INFO');
    assert.equal(f.stored.hasFail, false);
  });

  it('outcome=FAIL + blockSeal=true → severity=BLOCK', () => {
    const f = makeFinding({
      attackId: 'AT-FAKE-PASS', outcome: 'FAIL', reasonCode: 'X', evidenceRef: 'r', message: 'm',
      blockSeal: true,
    });
    assert.equal(f.ext.severity, 'BLOCK');
  });

  it('findingIdSuffix produces distinct findingId', () => {
    const f = makeFinding({
      attackId: 'AT-EFFECT-P-MISMATCH', outcome: 'FAIL', reasonCode: 'X', evidenceRef: 'r', message: 'm',
      findingIdSuffix: 'CI_P',
    });
    assert.equal(f.stored.findingId, 'AT-EFFECT-P-MISMATCH-CI_P');
  });
});
