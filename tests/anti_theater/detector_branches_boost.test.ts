// tests/anti_theater/detector_branches_boost.test.ts
// Branch coverage boost for 3 anti_theater detectors with low branch coverage.
//
// Detectors targeted:
//   1. fake_degraded.ts (66.67% branch, funcs 50%, uncovered lines 88-108)
//      → NULL_RESULT_LAUNDERED sub-path: declared null results washed from proof envelope
//   2. report_mismatch.ts (69.57% branch, uncovered lines 77-82, 96-97)
//      → OVERCLAIMING detection (lines 93-98); lines 77-82 unreachable (type-covered invariant)
//   3. stopping_rule.ts (71.43% branch, uncovered lines 59-60, 64, 100-113)
//      → alpha_spending classify (59-60), none_declared classify (64), sub-path 2 (100-113),
//        sub-path 3 UNREGISTERED_EARLY_STOP (115-135)
//
// Test strategy: clone clean base → minimal mutation to trigger specific branch → assert.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { detect_fake_degraded } from '../../src/anti_theater/detectors/fake_degraded.ts';
import { detect_report_mismatch } from '../../src/anti_theater/detectors/report_mismatch.ts';
import { detect_stopping_rule } from '../../src/anti_theater/detectors/stopping_rule.ts';
import { makeCleanBaseInput } from '../fixtures/anti_theater/golden_vectors.ts';
import type { NullResultRecord } from '../../src/anti_theater/types.ts';
import type { ExperimentRunTrace } from '../../src/anti_theater/types.ts';

// ===== Mutable clone helper (same pattern as golden_vectors.ts cloneMutable) =====

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

// ===== NullResultRecord factory =====

function makeNullResult(overrides: Partial<NullResultRecord> & { nullResultId: string }): NullResultRecord {
  return {
    testId: `test-${overrides.nullResultId}`,
    reason: 'no_effect',
    enteredProofHash: false,
    linkedVerdictRule: 'R7_PRIMARY_TEST_CONFIRMS',
    ...overrides,
  };
}

// ===== ExperimentRunTrace factory =====

function makeRun(overrides: Partial<ExperimentRunTrace> & { runId: string }): ExperimentRunTrace {
  return {
    endedAt: '2024-06-01T00:00:00Z',
    isInterim: false,
    earlyStopped: false,
    seed: 1,
    ...overrides,
  };
}

// =============================================================================
// 1. detect_fake_degraded — branch coverage boost (target: 66.67% → ~95%)
//    Uncovered: lines 88-108 (NULL_RESULT_LAUNDERED sub-path)
// =============================================================================

describe('AT-FAKE-DEGRADED: branch coverage boost', () => {
  // ─── Base false-positive guard ───

  it('clean base → zero findings', () => {
    const input = makeCleanBaseInput();
    const findings = detect_fake_degraded(input);
    assert.equal(findings.length, 0);
  });

  // ─── Sub-path 1: REFUTATION_HIDDEN_BY_SCOPE ───

  it('REFUTATION_HIDDEN_BY_SCOPE: DEGRADED_SCOPE + hasSameScopeRefutation=true → FAIL', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.verdict.verdict = 'DEGRADED_SCOPE';
    input.verdict.scopeReport.hasSameScopeRefutation = true;
    input.verdict.scopeReport.coverage = 'full'; // prevent AT-SCOPE-LAUNDER interference

    const findings = detect_fake_degraded(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.stored.outcome, 'FAIL');
    assert.equal(findings[0]?.ext.reasonCode, 'REFUTATION_HIDDEN_BY_SCOPE');
    assert.equal(findings[0]?.ext.attackId, 'AT-FAKE-DEGRADED');
    assert.ok(findings[0]?.stored.findingId.endsWith('-HIDDEN_REFUTATION'));
  });

  it('REFUTATION_HIDDEN_BY_SCOPE skip: wrong verdict (CONFIRMED) + refutation → no finding', () => {
    const input = cloneMutable(makeCleanBaseInput());
    // base already has verdict='CONFIRMED', just set refutation
    input.verdict.scopeReport.hasSameScopeRefutation = true;

    const findings = detect_fake_degraded(input);
    assert.equal(findings.length, 0);
  });

  it('REFUTATION_HIDDEN_BY_SCOPE skip: DEGRADED_SCOPE but no refutation → no finding', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.verdict.verdict = 'DEGRADED_SCOPE';
    // hasSameScopeRefutation stays false (base default)

    const findings = detect_fake_degraded(input);
    assert.equal(findings.length, 0);
  });

  // ─── Sub-path 2: NULL_RESULT_LAUNDERED ───

  it('NULL_RESULT_LAUNDERED: declared null not in sealed + enteredProofHash=false → FAIL', () => {
    const input = cloneMutable(makeCleanBaseInput());
    const washed: NullResultRecord = makeNullResult({
      nullResultId: 'nr-washed-001',
      enteredProofHash: false,
    });
    input.runRegistry.declaredNullResults = [washed];
    // envelopeDraft.nullResults stays empty → sealedNullIds is empty → nr-washed-001 not sealed
    input.envelopeDraft.nullResults = [];

    const findings = detect_fake_degraded(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.stored.outcome, 'FAIL');
    assert.equal(findings[0]?.ext.reasonCode, 'NULL_RESULT_LAUNDERED');
    assert.equal(findings[0]?.ext.attackId, 'AT-FAKE-DEGRADED');
    assert.ok(findings[0]?.stored.findingId.endsWith('-NULL_nr-washed-001'));
    // Evidence message should contain the nullResultId
    assert.ok(findings[0]?.stored.message.includes('nr-washed-001'));
  });

  it('NULL_RESULT_LAUNDERED skip: declared null IS in sealed set → no finding', () => {
    const input = cloneMutable(makeCleanBaseInput());
    const nr: NullResultRecord = makeNullResult({
      nullResultId: 'nr-sealed-001',
      enteredProofHash: false,
    });
    input.runRegistry.declaredNullResults = [nr];
    // Same nullResultId appears in sealed (envelopeDraft.nullResults)
    input.envelopeDraft.nullResults = [nr];

    const findings = detect_fake_degraded(input);
    assert.equal(findings.length, 0);
  });

  it('NULL_RESULT_LAUNDERED skip: enteredProofHash=true → no finding', () => {
    const input = cloneMutable(makeCleanBaseInput());
    const nr: NullResultRecord = makeNullResult({
      nullResultId: 'nr-entered-001',
      enteredProofHash: true, // already entered proofHash
    });
    input.runRegistry.declaredNullResults = [nr];
    // Not in sealed set, but enteredProofHash=true → no wash
    input.envelopeDraft.nullResults = [];

    const findings = detect_fake_degraded(input);
    assert.equal(findings.length, 0);
  });

  it('NULL_RESULT_LAUNDERED: mixed nulls — one washed, one sealed, one entered → only washed found', () => {
    const input = cloneMutable(makeCleanBaseInput());
    const washed = makeNullResult({ nullResultId: 'nr-washed', enteredProofHash: false });
    const sealed = makeNullResult({ nullResultId: 'nr-sealed', enteredProofHash: false });
    const entered = makeNullResult({ nullResultId: 'nr-entered', enteredProofHash: true });

    input.runRegistry.declaredNullResults = [washed, sealed, entered];
    // Only 'nr-sealed' is in the sealed set
    input.envelopeDraft.nullResults = [sealed];

    const findings = detect_fake_degraded(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ext.reasonCode, 'NULL_RESULT_LAUNDERED');
    assert.ok(findings[0]?.stored.findingId.endsWith('-NULL_nr-washed'));
  });

  it('NULL_RESULT_LAUNDERED: multiple washed nulls → one finding per washed null', () => {
    const input = cloneMutable(makeCleanBaseInput());
    const washed1 = makeNullResult({ nullResultId: 'nr-w1', enteredProofHash: false });
    const washed2 = makeNullResult({ nullResultId: 'nr-w2', enteredProofHash: false });

    input.runRegistry.declaredNullResults = [washed1, washed2];
    input.envelopeDraft.nullResults = []; // neither sealed

    const findings = detect_fake_degraded(input);
    assert.equal(findings.length, 2);
    const reasonCodes = findings.map((f) => f.ext.reasonCode);
    assert.deepEqual(reasonCodes, ['NULL_RESULT_LAUNDERED', 'NULL_RESULT_LAUNDERED']);
    // findingId format: AT-FAKE-DEGRADED-NULL_nr-w1 → last segment after '-' is 'w1'
    const suffixes = findings.map((f) => f.stored.findingId.split('-').pop());
    assert.deepEqual(suffixes.sort(), ['w1', 'w2']);
  });

  // ─── Both sub-paths triggered simultaneously ───

  it('both sub-paths: DEGRADED_SCOPE + refutation + washed null → 2 findings', () => {
    const input = cloneMutable(makeCleanBaseInput());
    // Sub-path 1: fake degraded scope
    input.verdict.verdict = 'DEGRADED_SCOPE';
    input.verdict.scopeReport.hasSameScopeRefutation = true;
    input.verdict.scopeReport.coverage = 'full';
    // Sub-path 2: washed null
    const washed = makeNullResult({ nullResultId: 'nr-both', enteredProofHash: false });
    input.runRegistry.declaredNullResults = [washed];
    input.envelopeDraft.nullResults = [];

    const findings = detect_fake_degraded(input);
    assert.equal(findings.length, 2);
    const reasonCodes = findings.map((f) => f.ext.reasonCode).sort();
    assert.deepEqual(reasonCodes, ['NULL_RESULT_LAUNDERED', 'REFUTATION_HIDDEN_BY_SCOPE']);
  });
});

// =============================================================================
// 2. detect_report_mismatch — branch coverage boost (target: 69.57% → ~92%)
//    Uncovered: lines 77-82 (unreachable, type-covered invariant)
//               lines 96-97 (OVERCLAIMING detection loop)
// =============================================================================

describe('AT-REPORT-MISMATCH: branch coverage boost', () => {
  // ─── Base false-positive guard ───

  it('clean base → zero findings', () => {
    const input = makeCleanBaseInput();
    const findings = detect_report_mismatch(input);
    assert.equal(findings.length, 0);
  });

  // ─── REPORT_VERDICT_MISMATCH: strength word not in verdict's allowed set ───

  it('REPORT_VERDICT_MISMATCH: UNTESTED + "confirms" → FAIL (already covered, regression guard)', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.verdict.verdict = 'UNTESTED';
    input.envelopeDraft.humanSummary = 'This experiment confirms the hypothesis with strong evidence.';

    const findings = detect_report_mismatch(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.stored.outcome, 'FAIL');
    assert.equal(findings[0]?.ext.reasonCode, 'REPORT_VERDICT_MISMATCH');
    assert.equal(findings[0]?.ext.attackId, 'AT-REPORT-MISMATCH');
  });

  it('REPORT_VERDICT_MISMATCH: INCONCLUSIVE + "supports" → FAIL', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.verdict.verdict = 'INCONCLUSIVE';
    input.envelopeDraft.humanSummary = 'The data supports the primary hypothesis.';

    const findings = detect_report_mismatch(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ext.reasonCode, 'REPORT_VERDICT_MISMATCH');
    assert.ok(findings[0]?.stored.message.includes('INCONCLUSIVE'));
    assert.ok(findings[0]?.stored.message.includes('supports'));
  });

  it('REPORT_VERDICT_MISMATCH: CONFIRMED + "refutes" → FAIL', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.verdict.verdict = 'CONFIRMED';
    input.envelopeDraft.humanSummary = 'The analysis refutes the null hypothesis in all tests.';

    const findings = detect_report_mismatch(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ext.reasonCode, 'REPORT_VERDICT_MISMATCH');
  });

  it('REPORT_VERDICT_MISMATCH: DEGRADED_SCOPE + "confirms" → FAIL', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.verdict.verdict = 'DEGRADED_SCOPE';
    input.envelopeDraft.humanSummary = 'The result confirms a strong effect within the degraded scope.';

    const findings = detect_report_mismatch(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ext.reasonCode, 'REPORT_VERDICT_MISMATCH');
  });

  it('REPORT_VERDICT_MISMATCH: REFUTED + "supports" → FAIL', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.verdict.verdict = 'REFUTED';
    input.envelopeDraft.humanSummary = 'The evidence supports the original claim.';

    const findings = detect_report_mismatch(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ext.reasonCode, 'REPORT_VERDICT_MISMATCH');
  });

  // ─── OVERCLAIMING: absolute overclaim words (lines 93-98, uncovered) ───

  it('OVERCLAIMING: "proves" in summary → FAIL with OVERCLAIMING reasonCode', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.verdict.verdict = 'CONFIRMED';
    input.envelopeDraft.humanSummary = 'The experiment proves the hypothesis beyond doubt.';

    const findings = detect_report_mismatch(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.stored.outcome, 'FAIL');
    assert.equal(findings[0]?.ext.reasonCode, 'OVERCLAIMING');
    assert.ok(findings[0]?.stored.message.includes('proves'));
    assert.ok(findings[0]?.stored.message.includes('bounded support'));
  });

  it('OVERCLAIMING: "definitively" in summary → FAIL', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.verdict.verdict = 'CONFIRMED';
    input.envelopeDraft.humanSummary = 'The results definitively establish the causal relationship.';

    const findings = detect_report_mismatch(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ext.reasonCode, 'OVERCLAIMING');
    assert.ok(findings[0]?.stored.message.includes('definitively'));
  });

  it('OVERCLAIMING: "guarantees" in summary → FAIL', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.verdict.verdict = 'CONFIRMED';
    input.envelopeDraft.humanSummary = 'This finding guarantees the reproducibility of the experiment.';

    const findings = detect_report_mismatch(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ext.reasonCode, 'OVERCLAIMING');
  });

  it('OVERCLAIMING: Chinese "证明了" (proves) → FAIL', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.verdict.verdict = 'CONFIRMED';
    input.envelopeDraft.humanSummary = '实验结果有力地证明了原假设。';

    const findings = detect_report_mismatch(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ext.reasonCode, 'OVERCLAIMING');
    assert.ok(findings[0]?.stored.message.includes('证明了'));
  });

  it('OVERCLAIMING: Chinese "确保" (guarantees) → FAIL', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.verdict.verdict = 'CONFIRMED';
    input.envelopeDraft.humanSummary = '该方法确保了结果的可靠性。';

    const findings = detect_report_mismatch(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ext.reasonCode, 'OVERCLAIMING');
  });

  // ─── Priority: mismatch over overclaim when both detected ───

  it('both mismatch + overclaim: mismatch takes priority → REPORT_VERDICT_MISMATCH', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.verdict.verdict = 'UNTESTED';
    input.envelopeDraft.humanSummary = 'This proves and confirms the hypothesis.';
    // 'confirms' triggers REPORT_VERDICT_MISMATCH (not in UNTESTED allowed set)
    // 'proves' triggers OVERCLAIMING
    // → mismatch takes priority (used.length > 0 check happens first)

    const findings = detect_report_mismatch(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ext.reasonCode, 'REPORT_VERDICT_MISMATCH');
  });

  // ─── Concurrent overclaim + word that IS in verdict's allowed set → only overclaim ───

  it('overclaim only: CONFIRMED + "confirms" (allowed) + "proves" (overclaim) → only OVERCLAIMING', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.verdict.verdict = 'CONFIRMED';
    // 'confirms' IS in CONFIRMED allowed set → no mismatch
    // 'proves' IS an overclaim word → OVERCLAIMING
    input.envelopeDraft.humanSummary = 'The analysis confirms the result and proves it definitively.';

    const findings = detect_report_mismatch(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ext.reasonCode, 'OVERCLAIMING');
  });

  // ─── Empty / neutral humanSummary → no findings ───

  it('empty humanSummary → zero findings', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.envelopeDraft.humanSummary = '';

    const findings = detect_report_mismatch(input);
    assert.equal(findings.length, 0);
  });

  it('neutral humanSummary with no strength/overclaim words → zero findings', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.envelopeDraft.humanSummary = 'A routine administrative note about the experiment timeline.';

    const findings = detect_report_mismatch(input);
    assert.equal(findings.length, 0);
  });
});

// =============================================================================
// 3. detect_stopping_rule — branch coverage boost (target: 71.43% → ~95%)
//    Uncovered: lines 59-60 (alpha_spending classify)
//               line 64 (none_declared classify)
//               lines 100-113 (sub-path 2: none_declared + interim)
//               lines 115-135 (sub-path 3: UNREGISTERED_EARLY_STOP)
// =============================================================================

describe('AT-STOPPING-RULE: branch coverage boost', () => {
  // ─── Base false-positive guard ───

  it('clean base (group_sequential + no interim) → zero findings', () => {
    const input = makeCleanBaseInput();
    const findings = detect_stopping_rule(input);
    assert.equal(findings.length, 0);
  });

  // ─── classifyStoppingRule: alpha_spending coverage (lines 58-60, uncovered) ───

  it('classify: alpha_spending keyword → kind=alpha_spending → no finding (legal)', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.fec.statisticalPlan.stoppingRule = 'alpha_spending approach with Pocock boundaries';
    // alpha_spending is a legal spending rule, even with interim looks
    const interimRun = makeRun({ runId: 'run-int-1', isInterim: true, earlyStopped: false });
    input.executionTrace.runs = [interimRun, interimRun, makeRun({ runId: 'run-final', isInterim: false })];

    const findings = detect_stopping_rule(input);
    assert.equal(findings.length, 0);
  });

  // ─── classifyStoppingRule: none_declared fallback (line 64, uncovered) ───

  it('classify: no matching keyword → kind=none_declared', () => {
    const input = cloneMutable(makeCleanBaseInput());
    // No group_sequential, alpha_spending, or fixed keywords
    input.fec.statisticalPlan.stoppingRule = 'just look at the data until satisfied';
    // Multiple interim looks + none_declared → sub-path 2 triggers
    const int1 = makeRun({ runId: 'int-1', isInterim: true, earlyStopped: false });
    const int2 = makeRun({ runId: 'int-2', isInterim: true, earlyStopped: false });
    const final = makeRun({ runId: 'final', isInterim: false });
    input.executionTrace.runs = [int1, int2, final];

    const findings = detect_stopping_rule(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ext.reasonCode, 'STOPPING_RULE_VIOLATION');
    assert.equal(findings[0]?.ext.attackId, 'AT-STOPPING-RULE');
    assert.ok(findings[0]?.stored.findingId.endsWith('-INTERIM_NONE_DECLARED'));
    // Evidence should reference the stoppingRule field
    assert.equal(findings[0]?.stored.evidenceRef, 'fec.statisticalPlan.stoppingRule');
    // Message should mention optional stopping risk
    assert.ok(findings[0]?.stored.message.includes('optional stopping'));
    assert.ok(findings[0]?.stored.message.includes('2 interim looks'));
  });

  // ─── Sub-path 1: fixed_n + multiple interim (regression guard, covered by gvStoppingRule01) ───

  it('fixed_n + multiple interim looks → STOPPING_RULE_VIOLATION with INTERIM_FIXED_N suffix', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.fec.statisticalPlan.stoppingRule = 'fixed_n design with single terminal analysis';
    // 3 runs, all interim → interimLooks.length = 3 > 1
    const runs = [
      makeRun({ runId: 'r1', isInterim: true }),
      makeRun({ runId: 'r2', isInterim: true }),
      makeRun({ runId: 'r3', isInterim: true }),
    ];
    input.executionTrace.runs = runs;

    const findings = detect_stopping_rule(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ext.reasonCode, 'STOPPING_RULE_VIOLATION');
    assert.ok(findings[0]?.stored.findingId.endsWith('-INTERIM_FIXED_N'));
    assert.ok(findings[0]?.stored.message.includes('fixed_n'));
    assert.ok(findings[0]?.stored.message.includes('peeking'));
  });

  it('fixed_n + exactly 1 interim look → no finding (≤1 is allowed)', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.fec.statisticalPlan.stoppingRule = 'fixed_n single terminal analysis';
    const runs = [
      makeRun({ runId: 'r1', isInterim: true }),
      makeRun({ runId: 'r2', isInterim: false }),
    ];
    input.executionTrace.runs = runs;

    const findings = detect_stopping_rule(input);
    assert.equal(findings.length, 0);
  });

  // ─── Sub-path 2: none_declared + multiple interim (lines 100-113, uncovered) ───

  it('none_declared + multiple interim looks → STOPPING_RULE_VIOLATION with INTERIM_NONE_DECLARED', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.fec.statisticalPlan.stoppingRule = 'no formal stopping rule';
    const runs = [
      makeRun({ runId: 'int1', isInterim: true }),
      makeRun({ runId: 'int2', isInterim: true }),
      makeRun({ runId: 'int3', isInterim: true }),
    ];
    input.executionTrace.runs = runs;

    const findings = detect_stopping_rule(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ext.reasonCode, 'STOPPING_RULE_VIOLATION');
    assert.ok(findings[0]?.stored.findingId.endsWith('-INTERIM_NONE_DECLARED'));
    assert.equal(findings[0]?.stored.evidenceRef, 'fec.statisticalPlan.stoppingRule');
  });

  it('none_declared + exactly 1 interim look → no finding', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.fec.statisticalPlan.stoppingRule = 'adhoc decision';
    const runs = [
      makeRun({ runId: 'r1', isInterim: true }),
      makeRun({ runId: 'r2', isInterim: false }),
    ];
    input.executionTrace.runs = runs;

    const findings = detect_stopping_rule(input);
    assert.equal(findings.length, 0);
  });

  it('none_declared + 0 interim looks → no finding', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.fec.statisticalPlan.stoppingRule = 'no rule specified';
    const runs = [
      makeRun({ runId: 'r1', isInterim: false }),
      makeRun({ runId: 'r2', isInterim: false }),
    ];
    input.executionTrace.runs = runs;

    const findings = detect_stopping_rule(input);
    assert.equal(findings.length, 0);
  });

  // ─── Sub-path 3: UNREGISTERED_EARLY_STOP (lines 115-135, uncovered) ───
  // D12 PARTIAL: declaredStops is empty set → any earlyStopped=true interim run triggers

  it('UNREGISTERED_EARLY_STOP: interim run with earlyStopped=true → FAIL', () => {
    const input = cloneMutable(makeCleanBaseInput());
    // Keep base stoppingRule (group_sequential, legal) to isolate sub-path 3
    const earlyRun = makeRun({ runId: 'early-1', isInterim: true, earlyStopped: true });
    const finalRun = makeRun({ runId: 'final', isInterim: false, earlyStopped: false });
    input.executionTrace.runs = [earlyRun, finalRun];

    const findings = detect_stopping_rule(input);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.stored.outcome, 'FAIL');
    assert.equal(findings[0]?.ext.reasonCode, 'UNREGISTERED_EARLY_STOP');
    assert.equal(findings[0]?.ext.attackId, 'AT-STOPPING-RULE');
    assert.ok(findings[0]?.stored.findingId.endsWith('-UNREGISTERED_early-1'));
    assert.ok(findings[0]?.stored.message.includes('early-1'));
    assert.ok(findings[0]?.stored.message.includes('earlyStopped'));
    assert.ok(findings[0]?.stored.message.includes('D12 PARTIAL'));
  });

  it('UNREGISTERED_EARLY_STOP: multiple early-stopped interim runs → one finding per run', () => {
    const input = cloneMutable(makeCleanBaseInput());
    const early1 = makeRun({ runId: 'early-A', isInterim: true, earlyStopped: true });
    const early2 = makeRun({ runId: 'early-B', isInterim: true, earlyStopped: true });
    const final = makeRun({ runId: 'final', isInterim: false, earlyStopped: false });
    input.executionTrace.runs = [early1, early2, final];

    const findings = detect_stopping_rule(input);
    assert.equal(findings.length, 2);
    const reasonCodes = findings.map((f) => f.ext.reasonCode);
    assert.deepEqual(reasonCodes, ['UNREGISTERED_EARLY_STOP', 'UNREGISTERED_EARLY_STOP']);
    // findingId format: AT-STOPPING-RULE-UNREGISTERED_early-A → last segment after '-' is 'A'
    const suffixes = findings.map((f) => f.stored.findingId.split('-').pop()).sort();
    assert.deepEqual(suffixes, ['A', 'B']);
  });

  it('UNREGISTERED_EARLY_STOP skip: earlyStopped=false run → no finding', () => {
    const input = cloneMutable(makeCleanBaseInput());
    const normalRun = makeRun({ runId: 'normal', isInterim: true, earlyStopped: false });
    input.executionTrace.runs = [normalRun];

    const findings = detect_stopping_rule(input);
    assert.equal(findings.length, 0);
  });

  it('UNREGISTERED_EARLY_STOP skip: non-interim run with earlyStopped=true → no finding', () => {
    // sub-path 3 only iterates interimLooks, so non-interim runs are skipped
    const input = cloneMutable(makeCleanBaseInput());
    const nonInterim = makeRun({ runId: 'final-only', isInterim: false, earlyStopped: true });
    input.executionTrace.runs = [nonInterim];

    const findings = detect_stopping_rule(input);
    assert.equal(findings.length, 0);
  });

  // ─── Combined sub-paths: two findings from different sub-paths ───

  it('combined: none_declared + interim looks + early stop → 2 findings (sub-path 2 + sub-path 3)', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.fec.statisticalPlan.stoppingRule = 'unknown stopping approach';
    const early = makeRun({ runId: 'r-early', isInterim: true, earlyStopped: true });
    const interim = makeRun({ runId: 'r-int', isInterim: true, earlyStopped: false });
    const final = makeRun({ runId: 'r-final', isInterim: false });
    input.executionTrace.runs = [early, interim, final];
    // interimLooks.length = 2 > 1 + none_declared → sub-path 2
    // early.isInterim=true + earlyStopped=true → sub-path 3

    const findings = detect_stopping_rule(input);
    assert.equal(findings.length, 2);
    const reasonCodes = findings.map((f) => f.ext.reasonCode).sort();
    assert.deepEqual(reasonCodes, ['STOPPING_RULE_VIOLATION', 'UNREGISTERED_EARLY_STOP']);
  });

  // ─── classify edge: 'fixed' substring priority (lower than 'group_sequential'/'alpha_spending') ───

  it('classify: "group_sequential with fixed boundaries" → group_sequential (not fixed_n)', () => {
    // 'group_sequential' appears before 'fixed' in classification → group_sequential wins
    const input = cloneMutable(makeCleanBaseInput());
    input.fec.statisticalPlan.stoppingRule = 'group_sequential with fixed boundaries';
    // add interim looks → group_sequential is legal, no finding
    const runs = [
      makeRun({ runId: 'r1', isInterim: true }),
      makeRun({ runId: 'r2', isInterim: true }),
    ];
    input.executionTrace.runs = runs;

    const findings = detect_stopping_rule(input);
    assert.equal(findings.length, 0);
  });

  // ─── Finding metadata integrity ───

  it('all stopping_rule findings have deterministic=true and severity=FAIL', () => {
    const input = cloneMutable(makeCleanBaseInput());
    input.fec.statisticalPlan.stoppingRule = 'fixed_n design';
    input.executionTrace.runs = [
      makeRun({ runId: 'r1', isInterim: true }),
      makeRun({ runId: 'r2', isInterim: true }),
      makeRun({ runId: 'r3', isInterim: true, earlyStopped: true }),
    ];

    const findings = detect_stopping_rule(input);
    assert.ok(findings.length >= 2, 'should have at least INTERIM_FIXED_N + UNREGISTERED');
    for (const f of findings) {
      assert.equal(f.stored.outcome, 'FAIL');
      assert.equal(f.stored.hasFail, true);
      assert.equal(f.ext.deterministic, true);
      assert.equal(f.ext.attackId, 'AT-STOPPING-RULE');
      assert.equal(f.ext.severity, 'FAIL');
      // Note: detect_stopping_rule does not set remediation in its makeFinding calls (detector behavior)
    }
  });
});
