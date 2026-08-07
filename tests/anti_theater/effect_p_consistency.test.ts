// tests/anti_theater/effect_p_consistency.test.ts
// Unit tests for AT-EFFECT-P-MISMATCH detector (statistical report internal consistency).
//
// Test strategy:
//   Layer 1 (CI-p mathematical identity, two-sided only):
//     - CI excludes null + p < alpha → consistent (no finding)
//     - CI excludes null + p >= alpha → INCONSISTENT (finding)
//     - CI includes null + p < alpha → INCONSISTENT (finding)
//     - CI includes null + p >= alpha → consistent (no finding)
//     - non-two-sided direction → skip layer 1
//   Layer 2 (direction-effectSize sign mismatch):
//     - greater + effectSize > 0 → consistent
//     - greater + effectSize < 0 → MISMATCH (finding)
//     - less + effectSize < 0 → consistent
//     - less + effectSize > 0 → MISMATCH (finding)
//     - two_sided → skip layer 2
//   Layer 3 (direction-CI contradiction):
//     - greater + CI upper < 0 → CONTRADICTION (finding)
//     - less + CI lower > 0 → CONTRADICTION (finding)
//     - greater + CI straddling 0 → no contradiction
//   Base input → zero findings (false-positive guard)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { detect_effect_p_consistency } from '../../src/anti_theater/detectors/effect_p_consistency.ts';
import { makeCleanBaseInput } from '../fixtures/anti_theater/golden_vectors.ts';
import type { AntiTheaterLintInput } from '../../src/anti_theater/types.ts';

/** Helper: clone base and override statistical fields + direction for testing. */
function makeInput(overrides: {
  effectDirection?: 'greater' | 'less' | 'two_sided';
  primaryP?: number | null;
  primaryEffectSize?: number | null;
  primaryCI?: readonly [number, number] | null;
  alpha?: number;
}): AntiTheaterLintInput {
  const base = makeCleanBaseInput();
  const statisticalPlan = {
    ...base.fec.statisticalPlan,
    ...(overrides.effectDirection !== undefined ? { effectDirection: overrides.effectDirection } : {}),
    ...(overrides.alpha !== undefined ? { alpha: overrides.alpha } : {}),
  };
  const statisticalReport = {
    ...base.verdict.statisticalReport,
    ...(overrides.primaryP !== undefined
      ? { primaryAdjustedPValue: overrides.primaryP as number | null }
      : {}),
    ...(overrides.primaryEffectSize !== undefined
      ? { primaryEffectSize: overrides.primaryEffectSize as number | null }
      : {}),
    ...(overrides.primaryCI !== undefined
      ? { primaryConfidenceInterval: overrides.primaryCI as readonly [number, number] | null }
      : {}),
  };
  return {
    ...base,
    fec: { ...base.fec, statisticalPlan },
    verdict: { ...base.verdict, statisticalReport },
  };
}

describe('AT-EFFECT-P-MISMATCH: statistical report internal consistency', () => {
  // ===== Base false-positive guard =====

  it('clean base input → zero findings (false-positive rate = 0)', () => {
    const input = makeCleanBaseInput();
    const findings = detect_effect_p_consistency(input);
    assert.equal(findings.length, 0);
  });

  // ===== Layer 1: CI-p mathematical identity (two-sided only) =====

  it('L1: two-sided, CI excludes null + p < alpha → consistent', () => {
    const input = makeInput({
      effectDirection: 'two_sided',
      alpha: 0.05,
      primaryP: 0.01,
      primaryCI: [0.1, 0.3],
    });
    const findings = detect_effect_p_consistency(input);
    assert.equal(findings.length, 0);
  });

  it('L1: two-sided, CI excludes null but p >= alpha → CI_P_INCONSISTENT', () => {
    // CI=[0.1, 0.3] excludes 0 (significant CI), but p=0.08 >= alpha=0.05 (non-significant p)
    const input = makeInput({
      effectDirection: 'two_sided',
      alpha: 0.05,
      primaryP: 0.08,
      primaryCI: [0.1, 0.3],
    });
    const findings = detect_effect_p_consistency(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.stored.outcome, 'FAIL');
    assert.equal(findings[0]?.stored.attackKind, 'effect-p-consistency-mismatch');
    assert.equal(findings[0]?.ext.reasonCode, 'CI_P_INCONSISTENT');
    assert.equal(findings[0]?.stored.findingId, 'AT-EFFECT-P-MISMATCH-CI_P');
  });

  it('L1: two-sided, CI includes null but p < alpha → CI_P_INCONSISTENT', () => {
    // CI=[-0.1, 0.3] includes 0 (non-significant CI), but p=0.01 < alpha=0.05 (significant p)
    const input = makeInput({
      effectDirection: 'two_sided',
      alpha: 0.05,
      primaryP: 0.01,
      primaryCI: [-0.1, 0.3],
    });
    const findings = detect_effect_p_consistency(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ext.reasonCode, 'CI_P_INCONSISTENT');
  });

  it('L1: two-sided, CI includes null + p >= alpha → consistent (both non-significant)', () => {
    const input = makeInput({
      effectDirection: 'two_sided',
      alpha: 0.05,
      primaryP: 0.08,
      primaryCI: [-0.1, 0.3],
    });
    const findings = detect_effect_p_consistency(input);
    assert.equal(findings.length, 0);
  });

  it('L1: CI=[-0.5, -0.1] excludes null (both negative) + p < alpha → consistent', () => {
    // Negative effect CI excluding null is still consistent with significant p
    const input = makeInput({
      effectDirection: 'two_sided',
      alpha: 0.05,
      primaryP: 0.01,
      primaryCI: [-0.5, -0.1],
    });
    const findings = detect_effect_p_consistency(input);
    assert.equal(findings.length, 0);
  });

  it('L1: non-two-sided direction → skip layer 1 (no CI_p finding)', () => {
    // greater direction: even if CI-p mathematically contradicts, layer 1 skips
    const input = makeInput({
      effectDirection: 'greater',
      alpha: 0.05,
      primaryP: 0.08,
      primaryCI: [0.1, 0.3],
      primaryEffectSize: 0.2,
    });
    const findings = detect_effect_p_consistency(input);
    const ciPFindings = findings.filter((f) => f.ext.reasonCode === 'CI_P_INCONSISTENT');
    assert.equal(ciPFindings.length, 0);
  });

  it('L1: p at boundary (p === alpha exactly) → INCONSISTENT (p < alpha is strictly less)', () => {
    // p === alpha exactly is conventionally "not significant" (strict p < alpha is significant)
    // CI excludes null (significant) + p == alpha (boundary, non-sig) → INCONSISTENT
    // This is the correct behavior: p must be strictly < alpha for significance claim
    const input = makeInput({
      effectDirection: 'two_sided',
      alpha: 0.05,
      primaryP: 0.05,
      primaryCI: [0.1, 0.3],
    });
    const findings = detect_effect_p_consistency(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ext.reasonCode, 'CI_P_INCONSISTENT');
  });

  // ===== Layer 2: direction-effectSize sign mismatch =====

  it('L2: greater + effectSize > 0 → consistent', () => {
    const input = makeInput({ effectDirection: 'greater', primaryEffectSize: 0.5 });
    const findings = detect_effect_p_consistency(input);
    const l2 = findings.filter((f) => f.ext.reasonCode === 'DIRECTION_EFFECT_SIGN_MISMATCH');
    assert.equal(l2.length, 0);
  });

  it('L2: greater + effectSize < 0 → DIRECTION_EFFECT_SIGN_MISMATCH', () => {
    const input = makeInput({
      effectDirection: 'greater',
      primaryEffectSize: -0.5,
      primaryCI: [0.1, 0.3], // CI consistent to isolate L2
    });
    const findings = detect_effect_p_consistency(input);
    const l2 = findings.filter((f) => f.ext.reasonCode === 'DIRECTION_EFFECT_SIGN_MISMATCH');
    assert.equal(l2.length, 1);
    assert.equal(l2[0]?.stored.findingId, 'AT-EFFECT-P-MISMATCH-DIRECTION_EFFECT');
  });

  it('L2: less + effectSize < 0 → consistent', () => {
    const input = makeInput({
      effectDirection: 'less',
      primaryEffectSize: -0.5,
      primaryCI: [-0.3, -0.1], // CI consistent with less
    });
    const findings = detect_effect_p_consistency(input);
    const l2 = findings.filter((f) => f.ext.reasonCode === 'DIRECTION_EFFECT_SIGN_MISMATCH');
    assert.equal(l2.length, 0);
  });

  it('L2: less + effectSize > 0 → DIRECTION_EFFECT_SIGN_MISMATCH', () => {
    const input = makeInput({
      effectDirection: 'less',
      primaryEffectSize: 0.5,
      primaryCI: [-0.3, -0.1], // CI consistent with less to isolate L2
    });
    const findings = detect_effect_p_consistency(input);
    const l2 = findings.filter((f) => f.ext.reasonCode === 'DIRECTION_EFFECT_SIGN_MISMATCH');
    assert.equal(l2.length, 1);
  });

  it('L2: effectSize = 0 → no sign check (zero has no sign contradiction)', () => {
    const input = makeInput({ effectDirection: 'greater', primaryEffectSize: 0 });
    const findings = detect_effect_p_consistency(input);
    const l2 = findings.filter((f) => f.ext.reasonCode === 'DIRECTION_EFFECT_SIGN_MISMATCH');
    assert.equal(l2.length, 0);
  });

  // ===== Layer 3: direction-CI contradiction =====

  it('L3: greater + CI entirely negative (upper < 0) → DIRECTION_CI_MISMATCH', () => {
    const input = makeInput({
      effectDirection: 'greater',
      primaryEffectSize: -0.3, // also triggers L2 (intentional: multi-finding)
      primaryCI: [-0.5, -0.1],
    });
    const findings = detect_effect_p_consistency(input);
    const l3 = findings.filter((f) => f.ext.reasonCode === 'DIRECTION_CI_MISMATCH');
    assert.equal(l3.length, 1);
    assert.equal(l3[0]?.stored.findingId, 'AT-EFFECT-P-MISMATCH-DIRECTION_CI');
  });

  it('L3: less + CI entirely positive (lower > 0) → DIRECTION_CI_MISMATCH', () => {
    const input = makeInput({
      effectDirection: 'less',
      primaryEffectSize: 0.3, // also triggers L2
      primaryCI: [0.1, 0.5],
    });
    const findings = detect_effect_p_consistency(input);
    const l3 = findings.filter((f) => f.ext.reasonCode === 'DIRECTION_CI_MISMATCH');
    assert.equal(l3.length, 1);
  });

  it('L3: greater + CI straddling 0 → no contradiction (not opposite, just non-significant)', () => {
    const input = makeInput({
      effectDirection: 'greater',
      primaryEffectSize: 0.2,
      primaryCI: [-0.1, 0.3],
    });
    const findings = detect_effect_p_consistency(input);
    const l3 = findings.filter((f) => f.ext.reasonCode === 'DIRECTION_CI_MISMATCH');
    assert.equal(l3.length, 0);
  });

  // ===== Multi-finding (multiple layers triggered simultaneously) =====

  it('multi: greater + negative effectSize + negative CI → 2 findings (L2 + L3)', () => {
    const input = makeInput({
      effectDirection: 'greater',
      primaryEffectSize: -0.5,
      primaryCI: [-0.5, -0.1],
    });
    const findings = detect_effect_p_consistency(input);
    assert.equal(findings.length, 2);
    const reasonCodes = findings.map((f) => f.ext.reasonCode).sort();
    assert.deepEqual(reasonCodes, ['DIRECTION_CI_MISMATCH', 'DIRECTION_EFFECT_SIGN_MISMATCH']);
  });

  it('multi: two-sided + CI/p contradiction + (L2/L3 skip for two-sided) → 1 finding (L1 only)', () => {
    const input = makeInput({
      effectDirection: 'two_sided',
      alpha: 0.05,
      primaryP: 0.08,
      primaryCI: [0.1, 0.3],
      primaryEffectSize: -0.5, // negative but two-sided → L2 skips
    });
    const findings = detect_effect_p_consistency(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ext.reasonCode, 'CI_P_INCONSISTENT');
  });

  // ===== Null / missing field handling (graceful skip) =====

  it('null primaryP → L1 skips (no CI_p finding)', () => {
    const input = makeInput({
      effectDirection: 'two_sided',
      primaryP: null,
      primaryCI: [0.1, 0.3],
    });
    const findings = detect_effect_p_consistency(input);
    assert.equal(findings.length, 0);
  });

  it('null primaryCI → L1 + L3 skip', () => {
    const input = makeInput({
      effectDirection: 'two_sided',
      primaryP: 0.01,
      primaryCI: null,
    });
    const findings = detect_effect_p_consistency(input);
    assert.equal(findings.length, 0);
  });

  it('null primaryEffectSize → L2 skips', () => {
    const input = makeInput({
      effectDirection: 'greater',
      primaryEffectSize: null,
      primaryCI: [0.1, 0.3],
    });
    const findings = detect_effect_p_consistency(input);
    assert.equal(findings.length, 0);
  });

  it('all three null → zero findings (graceful degradation)', () => {
    const input = makeInput({
      effectDirection: 'greater',
      primaryP: null,
      primaryEffectSize: null,
      primaryCI: null,
    });
    const findings = detect_effect_p_consistency(input);
    assert.equal(findings.length, 0);
  });

  // ===== Finding metadata integrity =====

  it('all findings have outcome=FAIL and deterministic=true', () => {
    const input = makeInput({
      effectDirection: 'greater',
      primaryEffectSize: -0.5,
      primaryCI: [-0.5, -0.1],
    });
    const findings = detect_effect_p_consistency(input);
    for (const f of findings) {
      assert.equal(f.stored.outcome, 'FAIL');
      assert.equal(f.stored.hasFail, true);
      assert.equal(f.ext.deterministic, true);
      assert.equal(f.ext.attackId, 'AT-EFFECT-P-MISMATCH');
      assert.equal(f.ext.severity, 'FAIL'); // blockSeal=false → severity=FAIL not BLOCK
    }
  });

  it('all findings include remediation guidance', () => {
    const input = makeInput({
      effectDirection: 'greater',
      primaryEffectSize: -0.5,
      primaryCI: [-0.5, -0.1],
    });
    const findings = detect_effect_p_consistency(input);
    for (const f of findings) {
      assert.ok(f.ext.remediation, `finding ${f.stored.findingId} should have remediation`);
      assert.ok(f.ext.remediation!.length > 20, 'remediation should be substantive');
    }
  });

  it('finding messages contain the specific violating values', () => {
    const input = makeInput({
      effectDirection: 'greater',
      primaryEffectSize: -0.42,
      primaryCI: [-0.5, -0.1],
    });
    const findings = detect_effect_p_consistency(input);
    const l2 = findings.find((f) => f.ext.reasonCode === 'DIRECTION_EFFECT_SIGN_MISMATCH');
    assert.ok(l2, 'L2 finding should exist');
    assert.ok(l2!.stored.message.includes('-0.42'), 'message should contain effectSize value');
    assert.ok(l2!.stored.message.includes('greater'), 'message should contain direction');
  });
});
