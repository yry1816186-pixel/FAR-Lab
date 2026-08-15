/**
 * study_design_classifier.test.ts — night-r2：确定性研究设计分类器 + 扩展枚举分层。
 * 2.md §8.9 后 R10 T1（证据等级分级）的补齐部分。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyStudyDesign, gradeEvidenceTier, gradeEvidenceQuality } from '../../src/evidence_quality/index.ts';

test('classifier: meta-analysis markers (EN/ZH) → meta_analysis, tier 1', () => {
  for (const text of [
    'A meta-analysis of 42 trials on statin efficacy',
    'Systematic review of dark matter direct detection claims',
    'Pooled analysis of cohort mortality data',
    '荟萃分析：铁基超导机制研究',
    '系统综述与预后研究',
  ]) {
    assert.equal(classifyStudyDesign(text), 'meta_analysis', text);
  }
  assert.equal(gradeEvidenceTier('meta_analysis'), 1);
});

test('classifier: RCT markers → rct, tier 1', () => {
  for (const text of [
    'Randomized controlled trial of drug X',
    'A double-blind placebo-controlled trial',
    '随机对照研究：干预效果评估',
    'This was an RCT in 12 centers',
  ]) {
    assert.equal(classifyStudyDesign(text), 'rct', text);
  }
  assert.equal(gradeEvidenceTier('rct'), 1);
});

test('classifier: cohort/quasi markers → quasi_experimental, tier 2', () => {
  assert.equal(classifyStudyDesign('A prospective cohort study of 392 stars'), 'quasi_experimental');
  assert.equal(classifyStudyDesign('Retrospective longitudinal analysis'), 'quasi_experimental');
  assert.equal(gradeEvidenceTier('quasi_experimental'), 2);
});

test('classifier: case-control → observational; cross-sectional/survey → cross_sectional, tier 3', () => {
  assert.equal(classifyStudyDesign('A nested case-control study'), 'observational');
  assert.equal(classifyStudyDesign('Cross-sectional survey of prevalence'), 'cross_sectional');
  assert.equal(classifyStudyDesign('横断面调查'), 'cross_sectional');
  assert.equal(gradeEvidenceTier('observational'), 3);
  assert.equal(gradeEvidenceTier('cross_sectional'), 3);
});

test('classifier: case reports and opinion → tier 4 designs', () => {
  assert.equal(classifyStudyDesign('Case report: a rare presentation'), 'case_report');
  assert.equal(classifyStudyDesign('Editorial: what to make of the new result'), 'expert_opinion');
  assert.equal(gradeEvidenceTier('case_report'), 4);
  assert.equal(gradeEvidenceTier('expert_opinion'), 4);
});

test('classifier: preprint markers dominate design words (fail-conservative, documented trade-off)', () => {
  // 预印本承载的 RCT：评审轴不可分 → 保守 tier 4（grader 校准注释中的显式边界）
  assert.equal(classifyStudyDesign('arXiv preprint: randomized controlled trial'), 'preprint');
  assert.equal(classifyStudyDesign('medRxiv — a meta-analysis'), 'preprint');
  assert.equal(classifyStudyDesign('预印本：队列研究'), 'preprint');
  assert.equal(gradeEvidenceTier('preprint'), 4);
});

test('classifier: precedence meta over rct for composite titles (GRADE convention)', () => {
  assert.equal(classifyStudyDesign('Systematic review of randomized controlled trials'), 'meta_analysis');
});

test('classifier: no markers → unspecified (fail-conservative tier 4)', () => {
  assert.equal(classifyStudyDesign('The orbit of exoplanet X is eccentric'), 'unspecified');
  assert.equal(classifyStudyDesign(''), 'unspecified');
  assert.equal(classifyStudyDesign('   '), 'unspecified');
  assert.equal(gradeEvidenceTier('unspecified'), 4);
});

test('classifier: deterministic across repeated calls', () => {
  const text = 'A randomized trial with cohort elements and a survey';
  const first = classifyStudyDesign(text);
  for (let i = 0; i < 10; i += 1) assert.equal(classifyStudyDesign(text), first);
  assert.equal(first, 'rct'); // rct precedes cohort/survey in the precedence order
});

test('grader: meta_analysis without RoB assessments → moderate (tier-1 path unchanged semantics)', () => {
  const grade = gradeEvidenceQuality('meta_analysis', []);
  assert.equal(grade.tier, 1);
  // 0 low / 0 high / 7 unclear → tier1 rule: unclear>=3 → low
  assert.equal(grade.overall, 'low');
  assert.equal(grade.robUnclearCount, 7);
});

test('grader: extended tiers do not alter existing designs (regression)', () => {
  assert.deepEqual(gradeEvidenceQuality('rct', []), gradeEvidenceQuality('meta_analysis', []));
  assert.equal(gradeEvidenceQuality('cross_sectional', []).tier, gradeEvidenceQuality('observational', []).tier);
  assert.equal(gradeEvidenceQuality('preprint', []).tier, gradeEvidenceQuality('unspecified', []).tier);
});
