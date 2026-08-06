// tests/anti_theater/phack_pcurve.test.ts
// Unit tests for the AT-PHACK-PCURVE detector (p-curve distributional p-hacking detection).
//
// Test strategy:
//   1. Clean input (p not in danger zone) → no finding
//   2. p in [0.04, 0.05) + familySize >= 3 → WARN finding
//   3. p < 0.04 (clearly significant) → no finding (true effects cluster near 0)
//   4. familySize < 3 → no finding (insufficient data for p-curve)
//   5. primaryAdjustedPValue = null → no finding

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { detect_phack_pcurve } from '../../src/anti_theater/detectors/phack_pcurve.ts';
import { makeCleanBaseInput } from '../fixtures/anti_theater/golden_vectors.ts';
import type { AntiTheaterLintInput } from '../../src/anti_theater/types.ts';

/** Helper: clone base input and override fields for testing. */
function makeInput(overrides: {
  primaryP?: number | null;
  familySize?: number;
}): AntiTheaterLintInput {
  const base = makeCleanBaseInput();
  // Clone to mutable for test mutation
  const fec = { ...base.fec };
  if (overrides.familySize !== undefined) {
    fec.multipleTestingPlan = {
      correction: 'bonferroni',
      familySize: overrides.familySize,
      adjustedAlpha: 0.01,
      preregistered: true,
    };
  }

  return {
    ...base,
    verdict: {
      ...base.verdict,
      statisticalReport: {
        ...base.verdict.statisticalReport,
        primaryAdjustedPValue: overrides.primaryP === undefined
          ? base.verdict.statisticalReport.primaryAdjustedPValue
          : (overrides.primaryP as number | null),
      },
    },
    fec,
  };
}

describe('AT-PHACK-PCURVE: p-curve distributional detector', () => {
  it('clean input (p well below danger zone) → no finding', () => {
    const input = makeInput({ primaryP: 0.001, familySize: 5 });
    const findings = detect_phack_pcurve(input);
    assert.equal(findings.length, 0);
  });

  it('p in [0.04, 0.05) + familySize >= 3 → WARN finding', () => {
    const input = makeInput({ primaryP: 0.045, familySize: 5 });
    const findings = detect_phack_pcurve(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.stored.outcome, 'WARN');
    assert.equal(findings[0]?.stored.attackKind, 'p-hacking-p-curve-skew');
  });

  it('p = 0.04 (boundary) → WARN finding (inclusive lower bound)', () => {
    const input = makeInput({ primaryP: 0.040, familySize: 3 });
    const findings = detect_phack_pcurve(input);
    assert.equal(findings.length, 1);
  });

  it('p = 0.05 (boundary) → no finding (exclusive upper bound)', () => {
    const input = makeInput({ primaryP: 0.050, familySize: 3 });
    const findings = detect_phack_pcurve(input);
    assert.equal(findings.length, 0);
  });

  it('p = 0.039 (just below danger zone) → no finding', () => {
    const input = makeInput({ primaryP: 0.039, familySize: 5 });
    const findings = detect_phack_pcurve(input);
    assert.equal(findings.length, 0);
  });

  it('p in danger zone but familySize = 1 → no finding (insufficient family)', () => {
    const input = makeInput({ primaryP: 0.045, familySize: 1 });
    const findings = detect_phack_pcurve(input);
    assert.equal(findings.length, 0);
  });

  it('p in danger zone but familySize = 2 → no finding (below minimum)', () => {
    const input = makeInput({ primaryP: 0.045, familySize: 2 });
    const findings = detect_phack_pcurve(input);
    assert.equal(findings.length, 0);
  });

  it('primaryAdjustedPValue = null → no finding', () => {
    const input = makeInput({ primaryP: null, familySize: 10 });
    const findings = detect_phack_pcurve(input);
    assert.equal(findings.length, 0);
  });

  it('finding message mentions the danger zone and family size', () => {
    const input = makeInput({ primaryP: 0.045, familySize: 10 });
    const findings = detect_phack_pcurve(input);
    assert.equal(findings.length, 1);
    const msg = findings[0]?.stored.message ?? '';
    assert.ok(msg.includes('0.0450'), 'message should contain the p-value');
    assert.ok(msg.includes('10'), 'message should contain family size');
  });

  it('finding includes remediation guidance', () => {
    const input = makeInput({ primaryP: 0.048, familySize: 8 });
    const findings = detect_phack_pcurve(input);
    assert.equal(findings.length, 1);
    const ext = findings[0]?.ext;
    assert.ok(ext?.remediation, 'should have remediation');
    assert.ok(ext.remediation!.includes('Pre-register'), 'remediation should mention pre-registration');
  });
});
