/**
 * grader.test.ts —— 证据质量确定性评分（GRADE/Cochrane RoB 借鉴）。
 *
 * 覆盖：
 *   1. gradeEvidenceTier 映射（rct→1 … expert/unspecified→4·fail-conservative）。
 *   2. assessRoB 计数 + 缺省维度按 unclear + 重复域抛错。
 *   3. gradeEvidenceQuality 综合等级（tier 主 + RoB 修正·确定性规则全覆盖）。
 *   4. 空评估输入（全 unclear）的 fail-conservative 行为。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gradeEvidenceTier,
  assessRoB,
  gradeEvidenceQuality,
  ROB_DOMAINS,
} from '../../src/evidence_quality/grader.ts';
import type { RobAssessment, StudyDesign } from '../../src/evidence_quality/types.ts';

test('gradeEvidenceTier maps study designs (fail-conservative for unspecified)', () => {
  assert.equal(gradeEvidenceTier('rct'), 1);
  assert.equal(gradeEvidenceTier('quasi_experimental'), 2);
  assert.equal(gradeEvidenceTier('observational'), 3);
  assert.equal(gradeEvidenceTier('case_report'), 4);
  assert.equal(gradeEvidenceTier('expert_opinion'), 4);
  assert.equal(gradeEvidenceTier('unspecified'), 4);
});

test('ROB_DOMAINS has exactly 7 fixed domains', () => {
  assert.equal(ROB_DOMAINS.length, 7);
  assert.deepEqual(ROB_DOMAINS, [
    'sequence_generation',
    'allocation_concealment',
    'blinding_participants',
    'blinding_outcome_assessment',
    'incomplete_outcome_data',
    'selective_reporting',
    'other_bias',
  ]);
});

function allLow(): RobAssessment[] {
  return ROB_DOMAINS.map((domain) => ({ domain, risk: 'low' as const }));
}

test('assessRoB counts and defaults missing domains to unclear', () => {
  const partial = assessRoB([{ domain: 'sequence_generation', risk: 'high' }]);
  assert.equal(partial.robHighCount, 1);
  assert.equal(partial.robUnclearCount, 6, 'missing domains default to unclear');
  assert.equal(partial.robLowCount, 0);

  const full = assessRoB(allLow());
  assert.equal(full.robLowCount, 7);
  assert.equal(full.robHighCount, 0);
  assert.equal(full.robUnclearCount, 0);
});

test('assessRoB throws on duplicate domain', () => {
  assert.throws(
    () => assessRoB([
      { domain: 'other_bias', risk: 'low' },
      { domain: 'other_bias', risk: 'high' },
    ]),
    /duplicate domain/,
  );
});

test('gradeEvidenceQuality tier-1: >=5 low → high; >=2 high or >=3 unclear → low; else moderate', () => {
  const strong = gradeEvidenceQuality('rct', allLow());
  assert.equal(strong.overall, 'high');
  assert.equal(strong.tier, 1);
  assert.equal(strong.tierLabel.includes('randomized controlled trial'), true);

  const manyHigh = gradeEvidenceQuality('rct', [
    { domain: 'sequence_generation', risk: 'high' },
    { domain: 'allocation_concealment', risk: 'high' },
  ]);
  assert.equal(manyHigh.overall, 'low');

  const manyUnclear = gradeEvidenceQuality('rct', []); // all unclear
  assert.equal(manyUnclear.overall, 'low', 'tier-1 with >=3 unclear → low');

  const mixed = gradeEvidenceQuality('rct', [
    { domain: 'sequence_generation', risk: 'low' },
    { domain: 'allocation_concealment', risk: 'low' },
    { domain: 'blinding_participants', risk: 'low' },
    { domain: 'blinding_outcome_assessment', risk: 'low' },
    { domain: 'incomplete_outcome_data', risk: 'high' },
    { domain: 'selective_reporting', risk: 'unclear' },
    { domain: 'other_bias', risk: 'unclear' },
  ]);
  assert.equal(mixed.overall, 'moderate', 'tier-1: 4 low + 1 high + 2 unclear → moderate');

  const fourLowThreeUnclear = gradeEvidenceQuality('rct', [
    { domain: 'sequence_generation', risk: 'low' },
    { domain: 'allocation_concealment', risk: 'low' },
    { domain: 'blinding_participants', risk: 'low' },
    { domain: 'blinding_outcome_assessment', risk: 'low' },
  ]);
  assert.equal(fourLowThreeUnclear.overall, 'low', 'tier-1: >=3 unclear → low');
});

test('gradeEvidenceQuality tier-2: >=4 low and no high → moderate; else low', () => {
  const strong = gradeEvidenceQuality('quasi_experimental', [
    ...ROB_DOMAINS.slice(0, 4).map((domain) => ({ domain, risk: 'low' as const })),
    ...ROB_DOMAINS.slice(4).map((domain) => ({ domain, risk: 'unclear' as const })),
  ]);
  assert.equal(strong.overall, 'moderate');

  const weak = gradeEvidenceQuality('quasi_experimental', [
    { domain: 'sequence_generation', risk: 'high' },
  ]);
  assert.equal(weak.overall, 'low');
});

test('gradeEvidenceQuality tier-3/4: any high or <3 low → very_low; else low', () => {
  const bad = gradeEvidenceQuality('observational', [{ domain: 'other_bias', risk: 'high' }]);
  assert.equal(bad.overall, 'very_low');

  const fewLow = gradeEvidenceQuality('case_report', [
    { domain: 'sequence_generation', risk: 'low' },
    { domain: 'allocation_concealment', risk: 'low' },
  ]);
  assert.equal(fewLow.overall, 'very_low', 'tier-4 with <3 low → very_low');

  const decent = gradeEvidenceQuality('observational', [
    ...ROB_DOMAINS.slice(0, 3).map((domain) => ({ domain, risk: 'low' as const })),
  ]);
  assert.equal(decent.overall, 'low');
});

test('empty assessments on unspecified design is fail-conservative very_low', () => {
  const g = gradeEvidenceQuality('unspecified', []);
  assert.equal(g.tier, 4);
  assert.equal(g.overall, 'very_low');
});

test('all study designs are covered by grader (exhaustive map)', () => {
  const designs: readonly StudyDesign[] = [
    'rct',
    'quasi_experimental',
    'observational',
    'case_report',
    'expert_opinion',
    'unspecified',
  ];
  for (const d of designs) {
    assert.ok([1, 2, 3, 4].includes(gradeEvidenceTier(d)), `design ${d} not mapped`);
  }
});
