/**
 * kernel_evidence_quality.test.ts —— verdict kernel 证据质量透明度层（批次 2-D）。
 *
 * 覆盖：
 *   1. 未提供 studyDesign → 输出与历史一致（零回归：无 evidenceQuality 字段·verdict 不变）。
 *   2. 提供 studyDesign → 输出附 evidenceQualityTier/Note·且 verdict/reasonCodes 不变（透明度层不进判定）。
 *   3. 低质量证据设计 → 质量等级降级但裁决路径不受影响。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideFiveValueVerdict, type VerdictKernelInput } from '../../src/falsifiability/verdict_kernel_v2.ts';
import { makeValidFec } from '../fec/fixtures.ts';

function baseInput(): VerdictKernelInput {
  return {
    fec: makeValidFec(),
    datasetBindings: [
      {
        datasetId: 'D1',
        contentHash: 'a'.repeat(64),
        sourceAnchor: { resolved: true },
        scopeCoverage: { dimension: 'population', value: 'adults', relation: 'within' },
      },
    ],
    statistics: [
      {
        testId: 'rmse',
        status: 'ran',
        effectDirection: 'supports',
        pValue: 0.01,
        adjustedPValue: 0.01,
        effectSizeObserved: 0.4,
        confidenceInterval: [0.2, 0.5],
        assumptionDiagnostics: [],
      },
    ],
    protocolDeviations: [],
    antiTheaterFindings: [],
    evidenceSufficiency: { status: 'sufficient', powerStatus: 'adequate' },
    contradictionSet: [],
    integrityFlags: [],
  };
}

test('no studyDesign → no evidence quality fields (zero regression)', () => {
  const out = decideFiveValueVerdict(baseInput());
  assert.equal(out.evidenceQualityTier, undefined);
  assert.equal(out.evidenceQualityNote, undefined);
  assert.equal(out.verdict, 'CONFIRMED');
});

test('studyDesign adds transparency fields without changing verdict or reasonCodes', () => {
  const plain = decideFiveValueVerdict(baseInput());
  const graded = decideFiveValueVerdict({ ...baseInput(), studyDesign: 'rct', robAssessments: [] });
  assert.equal(graded.verdict, plain.verdict, 'verdict must be unchanged');
  assert.deepEqual(graded.reasonCodes, plain.reasonCodes, 'reasonCodes must be unchanged');
  assert.equal(graded.evidenceQualityTier, 1);
  assert.ok(graded.evidenceQualityNote, 'note must be present');
  assert.match(graded.evidenceQualityNote!, /tier 1/);
});

test('observational study design with high-risk bias degrades quality level only', () => {
  const graded = decideFiveValueVerdict({
    ...baseInput(),
    studyDesign: 'observational',
    robAssessments: [{ domain: 'other_bias', risk: 'high' }],
  });
  assert.equal(graded.evidenceQualityTier, 3);
  assert.match(graded.evidenceQualityNote!, /very_low/);
  assert.equal(graded.verdict, 'CONFIRMED', 'verdict path unaffected by transparency layer');
});
