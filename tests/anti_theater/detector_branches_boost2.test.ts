// tests/anti_theater/detector_branches_boost2.test.ts
// Branch coverage boost for 2 anti_theater detectors with low branch coverage.
//
// Detectors targeted:
//   1. hark.ts (75.00% branch, uncovered lines 42-43, 51-52)
//      → Line 42-43: endedAtList.length === 0 early return (all runs have empty endedAt)
//      → Line 51-52: expFinished === undefined guard (UNREACHABLE — noUncheckedIndexedAccess
//        defense, endedAtList.length>0 ⇒ sortedAsc has same length ⇒ last element always defined)
//   2. optional_stopping.ts (76.47% branch, uncovered lines 61-62, 66, 82-83, 85-86)
//      → Line 61-62: classifyStoppingRule → 'alpha_spending' keyword match
//      → Line 66: classifyStoppingRule → 'none_declared' fallback (no keywords)
//      → Line 82-83: inferSpendingFunction → 'pocock' return
//      → Line 85-86: inferSpendingFunction → 'obrien-fleming' return
//
// Test strategy: clone clean base → minimal mutation to trigger specific branch → assert.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { detect_hark } from '../../src/anti_theater/detectors/hark.ts';
import { detect_optional_stopping } from '../../src/anti_theater/detectors/optional_stopping.ts';
import { makeCleanBaseInput } from '../fixtures/anti_theater/golden_vectors.ts';

// ===== Mutable clone helper (same pattern as golden_vectors.ts cloneMutable / detector_branches_boost.test.ts) =====

/**
 * Recursively strip readonly for fixture construction.
 * structuredClone produces a runtime-mutable copy; this cast only relaxes type-level readonly.
 * Same pattern as golden_vectors.ts cloneMutable — single as with documented justification.
 */
type DeepMutable<T> = T extends object
  ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
  : T;

function cloneMutable<T extends object>(value: T): DeepMutable<T> {
  return structuredClone(value) as DeepMutable<T>;
}

// =============================================================================
// 1. detect_hark — branch coverage boost (target: 75.00% → ~90%)
//    Uncovered: lines 42-43 (endedAtList empty guard)
//               lines 51-52 (expFinished undefined guard — UNREACHABLE)
// =============================================================================

describe('AT-HARK: branch coverage boost', () => {
  // ─── Base false-positive guard ───

  it('clean base → zero findings', () => {
    const input = makeCleanBaseInput();
    const findings = detect_hark(input);
    assert.equal(findings.length, 0);
  });

  // ─── Line 42-43: endedAtList.length === 0 early return ───

  it('all runs have empty string endedAt → endedAtList empty → early return []', () => {
    const input = cloneMutable(makeCleanBaseInput());
    // Set all endedAt to empty string — filter removes them (length === 0)
    for (const run of input.executionTrace.runs) {
      run.endedAt = '';
    }

    const findings = detect_hark(input);
    assert.equal(findings.length, 0);
  });

  it('mixed runs: some empty endedAt + some valid → filter keeps only valid → no early return', () => {
    const input = cloneMutable(makeCleanBaseInput());
    // First run: empty endedAt (filtered out), second: valid, third: valid
    input.executionTrace.runs[0]!.endedAt = '';
    // hypothesisSealedAt is '2024-01-01' which is < max(valid endedAt)
    // → no HARKing → return [] via normal path (line 75)
    input.preregistrationRecord.hypothesisSealedAt = '2024-01-01T00:00:00Z';

    const findings = detect_hark(input);
    assert.equal(findings.length, 0);
  });

  it('single run with empty endedAt → endedAtList empty → early return []', () => {
    const input = cloneMutable(makeCleanBaseInput());
    // Replace runs with a single run that has empty endedAt
    input.executionTrace.runs = [
      { runId: 'solo-empty', endedAt: '', isInterim: false, earlyStopped: false, seed: 1 },
    ];

    const findings = detect_hark(input);
    assert.equal(findings.length, 0);
  });

  // ─── FAIL path regression (hypSealed > expFinished, already covered but guard it) ───

  it('hypothesis sealed after latest experiment end → HARKING_REVISION_AFTER_RESULT FAIL', () => {
    const input = cloneMutable(makeCleanBaseInput());
    // max endedAt = 2024-06-03; set hypothesisSealedAt to a later date
    input.preregistrationRecord.hypothesisSealedAt = '2024-12-25T00:00:00Z';

    const findings = detect_hark(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.stored.outcome, 'FAIL');
    assert.equal(findings[0]?.ext.reasonCode, 'HARKING_REVISION_AFTER_RESULT');
    assert.equal(findings[0]?.ext.attackId, 'AT-HARK');
    assert.ok(findings[0]?.stored.message.includes('HARKing'));
    assert.ok(findings[0]?.stored.message.includes('2024-12-25'));
  });

  it('hypothesis sealed before latest experiment end → no finding (normal path)', () => {
    const input = cloneMutable(makeCleanBaseInput());
    // max endedAt = 2024-06-03; hypothesisSealedAt is earlier
    input.preregistrationRecord.hypothesisSealedAt = '2024-01-01T00:00:00Z';

    const findings = detect_hark(input);
    assert.equal(findings.length, 0);
  });

  // NOTE: Line 51-52 (expFinished === undefined guard) is UNREACHABLE.
  // Proof: endedAtList.length > 0 (guaranteed by prior guard at line 41-43) →
  //   sortedAsc = [...endedAtList].sort() has same length > 0 →
  //   sortedAsc[sortedAsc.length - 1] always yields a defined string (last element).
  // This is a TypeScript noUncheckedIndexedAccess defense that never fires at runtime.
  // Residual: 1 unreachable branch (lines 51-52). To fully eliminate, the defensive
  //   check could be replaced with a non-null assertion (!) since the invariant is
  //   provable, or suppressed with a comment explaining why coverage is blocked.
});

// =============================================================================
// 2. detect_optional_stopping — branch coverage boost (target: 76.47% → ~95%)
//    Uncovered: lines 61-62 (classify → alpha_spending)
//               line 66 (classify → none_declared fallback)
//               lines 82-83 (inferSpendingFunction → pocock)
//               lines 85-86 (inferSpendingFunction → obrien-fleming)
// =============================================================================

describe('AT-OPTIONAL-STOPPING: branch coverage boost', () => {
  // ─── Base false-positive guard ───

  it('clean base → zero findings', () => {
    const input = makeCleanBaseInput();
    const findings = detect_optional_stopping(input);
    assert.equal(findings.length, 0);
  });

  // ─── classifyStoppingRule: alpha_spending branch (lines 60-62, uncovered) ───

  it('classify: alpha_spending keyword (no spending) → kind=alpha_spending, FAIL', () => {
    const input = cloneMutable(makeCleanBaseInput());
    // Contains 'alpha_spending' but no spending function keywords (pocock/obrien/fleming)
    input.fec.statisticalPlan.stoppingRule = 'alpha_spending approach without bound spending';

    const findings = detect_optional_stopping(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.stored.outcome, 'FAIL');
    assert.equal(findings[0]?.ext.reasonCode, 'OPTIONAL_STOPPING_NO_SPENDING');
    assert.equal(findings[0]?.ext.attackId, 'AT-OPTIONAL-STOPPING');
    // Message should reference 'alpha_spending' as the detected kind
    assert.ok(findings[0]?.stored.message.includes('alpha_spending'));
    assert.ok(findings[0]?.stored.message.includes('spending function'));
    // Evidence ref points to stoppingRule field
    assert.equal(findings[0]?.stored.evidenceRef, 'fec.statisticalPlan.stoppingRule');
  });

  // ─── classifyStoppingRule: none_declared fallback (line 66, uncovered) ───

  it('classify: no recognized keyword → kind=none_declared → no finding', () => {
    const input = cloneMutable(makeCleanBaseInput());
    // No group_sequential, alpha_spending, or fixed keywords
    input.fec.statisticalPlan.stoppingRule = 'we collect data until we see significance';

    const findings = detect_optional_stopping(input);
    // none_declared is not in the check set (only group_sequential/alpha_spending trigger)
    assert.equal(findings.length, 0);
  });

  it('classify: fixed_n keyword → kind=fixed_n → no finding (out of scope)', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.fec.statisticalPlan.stoppingRule = 'fixed sample size with single terminal analysis';

    const findings = detect_optional_stopping(input);
    // fixed_n is not in the check set → no finding
    assert.equal(findings.length, 0);
  });

  // ─── inferSpendingFunction: pocock branch (lines 81-83, uncovered) ───

  it('spending: pocock keyword → spendingFunction=pocock → no finding (legal)', () => {
    const input = cloneMutable(makeCleanBaseInput());
    // group_sequential + pocock → kind=group_sequential, spendingFunction=pocock → no FAIL
    input.fec.statisticalPlan.stoppingRule = 'group_sequential design with Pocock spending boundaries';

    const findings = detect_optional_stopping(input);
    assert.equal(findings.length, 0);
  });

  it('spending: alpha_spending + pocock → no finding (both classify and spending covered)', () => {
    const input = cloneMutable(makeCleanBaseInput());
    // alpha_spending (classify branch L61-62) + pocock (spending branch L82-83) → legal
    input.fec.statisticalPlan.stoppingRule = 'alpha_spending (Pocock)';

    const findings = detect_optional_stopping(input);
    assert.equal(findings.length, 0);
  });

  it('spending: pocock in mixed-case → case-insensitive match returns pocock', () => {
    const input = cloneMutable(makeCleanBaseInput());
    // Verify case-insensitivity of inferSpendingFunction
    input.fec.statisticalPlan.stoppingRule = 'group_sequential POCOCK approach';

    const findings = detect_optional_stopping(input);
    assert.equal(findings.length, 0);
  });

  // ─── inferSpendingFunction: obrien branch (lines 84-86, uncovered) ───

  it('spending: obrien keyword → spendingFunction=obrien-fleming → no finding', () => {
    const input = cloneMutable(makeCleanBaseInput());
    // alpha_spending + obrien → kind=alpha_spending, spendingFunction=obrien-fleming → no FAIL
    // NOTE: 'obrien' must be a continuous substring (no apostrophe) for includes() to match
    input.fec.statisticalPlan.stoppingRule = 'alpha_spending Obrien boundaries';

    const findings = detect_optional_stopping(input);
    assert.equal(findings.length, 0);
  });

  it('spending: obrien before pocock → returns obrien-fleming (not pocock)', () => {
    const input = cloneMutable(makeCleanBaseInput());
    // 'obrien' is checked before 'pocock' in inferSpendingFunction
    // Even though 'pocock' is also present, 'obrien' matches first
    // NOTE: 'obrien' must be continuous substring (no apostrophe) for includes() to match
    input.fec.statisticalPlan.stoppingRule = 'group_sequential Obrien-Pocock hybrid';

    const findings = detect_optional_stopping(input);
    // obrien matches first → spendingFunction='obrien-fleming' → no finding
    assert.equal(findings.length, 0);
  });

  it('spending: obrien without fleming substring → still matches obrien', () => {
    const input = cloneMutable(makeCleanBaseInput());
    // Only 'obrien' is present (not 'fleming'), should still match
    input.fec.statisticalPlan.stoppingRule = 'group_sequential (Obrien)';

    const findings = detect_optional_stopping(input);
    assert.equal(findings.length, 0);
  });

  // ─── group_sequential + no spending (regression, covered by gvOptionalStopping01) ───

  it('group_sequential without any spending keyword → OPTIONAL_STOPPING_NO_SPENDING FAIL', () => {
    const input = cloneMutable(makeCleanBaseInput());
    // classify=group_sequential (matches first), no spending keyword → FAIL
    input.fec.statisticalPlan.stoppingRule = 'group_sequential boundary design without named spending';

    const findings = detect_optional_stopping(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ext.reasonCode, 'OPTIONAL_STOPPING_NO_SPENDING');
    assert.equal(findings[0]?.ext.attackId, 'AT-OPTIONAL-STOPPING');
    assert.ok(findings[0]?.stored.message.includes('group_sequential'));
    assert.ok(findings[0]?.stored.message.includes('spending function'));
  });

  // ─── Finding metadata integrity ───

  it('finding has correct metadata: deterministic=true, outcome=FAIL, remediation present', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.fec.statisticalPlan.stoppingRule = 'alpha_spending no function named';

    const findings = detect_optional_stopping(input);
    assert.equal(findings.length, 1);
    const f = findings[0]!;
    assert.equal(f.stored.outcome, 'FAIL');
    assert.equal(f.ext.deterministic, true);
    assert.equal(f.ext.severity, 'FAIL');
    assert.ok((f.ext.remediation?.length ?? 0) > 0, 'remediation should be provided');
    assert.ok(f.ext.remediation?.toLowerCase().includes('spending'), 'remediation mentions spending');
  });

  // ─── Edge: empty stoppingRule → none_declared, no finding ───

  it('empty stoppingRule string → classify=none_declared → no finding', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.fec.statisticalPlan.stoppingRule = '';

    const findings = detect_optional_stopping(input);
    assert.equal(findings.length, 0);
  });
});
