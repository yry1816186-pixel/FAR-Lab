// tests/evaluation/novelty.test.ts
// EVAL-NOVELTY-001：三面度量（文本/机制/有用性）+ 裁决矩阵 + 宪法铁律
// （文本距离单独不得作为新颖性结论）。纯函数，无 mock。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  assessNovelty,
  mechanismFace,
  textFace,
  usefulnessFace,
} from '../../src/evaluation/novelty.ts';
import type { NoveltyCandidate, PriorArt } from '../../src/evaluation/novelty.ts';

const PRIOR: readonly PriorArt[] = [
  {
    id: 'pa-1',
    text: 'Selection bias in the recruit pool inflates the reported correlation between radius and insolation.',
    mechanismTags: ['selection-bias', 'correlation-inflation'],
  },
  {
    id: 'pa-2',
    text: 'Instrument calibration drift across observation campaigns explains the apparent trend.',
    mechanismTags: ['instrument-drift'],
  },
];

function candidate(overrides: Partial<NoveltyCandidate> = {}): NoveltyCandidate {
  return {
    id: 'cand',
    text: 'Heterogeneous review pipelines with differential citation practices drive the observed effect.',
    mechanismTags: ['citation-practice-heterogeneity'],
    falsifiablePrediction: 'If pipelines are normalized, the effect size drops below 0.1 in a replication.',
    expectedInformationGain: 0.6,
    expertUsefulness: 4,
    experimentalTractability: 3,
    ...overrides,
  };
}

test('EVAL-NOVELTY-001: 三面齐全的新机制候选 → NOVEL_WITH_SUPPORT；三面数据独立呈现不合并', () => {
  const c = candidate();
  const report = assessNovelty(c, PRIOR);
  assert.equal(report.verdict, 'NOVEL_WITH_SUPPORT');
  // 面 1：与最近先验的文本距离（数值可复核）
  assert.ok(report.textFace.maxSimilarity < 0.3, '候选与先验文本不相似');
  assert.equal(report.textFace.nearestPriorArtId !== null, true);
  // 面 2：机制标签全新
  assert.deepEqual(report.mechanismFace.novelTags, ['citation-practice-heterogeneity']);
  assert.equal(report.mechanismFace.overlapRatio, 0);
  // 面 3：各字段独立在场（无单一合并分）
  assert.equal(report.usefulnessFace.falsifiable, true);
  assert.equal(report.usefulnessFace.expectedInformationGain, 0.6);
  assert.deepEqual(report.usefulnessFace.belowFloor, []);
});

test('EVAL-NOVELTY-001: 机制同构 + 文本高相似 → PARAPHRASE_OF_PRIOR_ART（改写检出）', () => {
  const c = candidate({
    text: 'Selection bias in the recruit pool inflates the reported correlation between radius and insolation across samples.',
    mechanismTags: ['selection-bias', 'correlation-inflation'],
  });
  const report = assessNovelty(c, PRIOR);
  assert.equal(report.verdict, 'PARAPHRASE_OF_PRIOR_ART');
  assert.ok(report.flags.includes('PARAPHRASE_RISK'));
  assert.ok(report.flags.includes('MECHANISM_OVERLAP'));
  assert.ok(report.textFace.maxSimilarity >= 0.7);
  assert.equal(report.mechanismFace.overlapRatio, 1);
});

test('EVAL-NOVELTY-001: 机制同构 + 换一种说法（文本不相似）→ REDISCOVERY 而非新颖', () => {
  const c = candidate({
    text: 'Who gets into the sample in the first place shapes every downstream association reported here.',
    mechanismTags: ['selection-bias', 'correlation-inflation'],
    falsifiablePrediction: 'Effect vanishes under representative sampling.',
  });
  const report = assessNovelty(c, PRIOR);
  assert.equal(report.verdict, 'REDISCOVERY');
  assert.ok(report.flags.includes('MECHANISM_OVERLAP'));
  assert.ok(!report.flags.includes('PARAPHRASE_RISK'), '换写法不触发改写风险，但机制覆盖照检');
});

test('EVAL-NOVELTY-001: 新机制但无可证伪预测 → UNSUPPORTED_NOVELTY；低专家有用性 → LOW_USEFULNESS 标记', () => {
  const unsupported = assessNovelty(candidate({ falsifiablePrediction: null }), PRIOR);
  assert.equal(unsupported.verdict, 'UNSUPPORTED_NOVELTY');
  assert.ok(unsupported.flags.includes('UNSUPPORTED_NOVELTY'));

  const lowValue = assessNovelty(candidate({ expertUsefulness: 1 }), PRIOR);
  assert.equal(lowValue.verdict, 'NOVEL_WITH_SUPPORT', '有用性低不推翻新颖性本身');
  assert.ok(lowValue.flags.includes('LOW_USEFULNESS'));

  // 越界数值 fail-closed
  assert.throws(() => usefulnessFace(candidate({ expertUsefulness: 7 })), /\[0,5\]/);
  assert.throws(() => usefulnessFace(candidate({ experimentalTractability: -1 })), /\[0,5\]/);
});

test('EVAL-NOVELTY-001: 宪法铁律——textOnly 模式恒为 TEXT_DISTANCE_ONLY_INSUFFICIENT', () => {
  // 即便与全部先验文本完全不相似（文本距离=1），文本面单独不构成新颖性结论
  const report = assessNovelty(candidate(), PRIOR, { textOnly: true });
  assert.equal(report.verdict, 'TEXT_DISTANCE_ONLY_INSUFFICIENT');
  assert.equal(report.textDistanceAloneInsufficient, true);
  // 无机制标签（未做机制分析）→ 不可测试而非默认新颖
  const noTags = assessNovelty(candidate({ mechanismTags: [] }), PRIOR);
  assert.equal(noTags.verdict, 'NOVELTY_UNTESTABLE_NO_MECHANISM_TAGS');
});

test('EVAL-NOVELTY-001: 非显然组合——已知部件跨两个先验的新组合被识别', () => {
  // 候选机制 = pa-1 的 selection-bias + pa-2 的 instrument-drift（跨先验组合）
  const combo = candidate({ mechanismTags: ['selection-bias', 'instrument-drift'] });
  const mf = mechanismFace(combo, PRIOR);
  assert.equal(mf.nonObviousCombination, true);
  assert.deepEqual(mf.combiningPriorArtIds, ['pa-1', 'pa-2']);
  assert.equal(mf.novelTags.length, 0, '部件全是已知的——组合新颖而非部件新颖');
  // 单先验子集不是非显然组合
  const subset = mechanismFace(candidate({ mechanismTags: ['selection-bias'] }), PRIOR);
  assert.equal(subset.nonObviousCombination, false);
  // 覆盖 ≥2 先验（同标签重复出现在两个先验）但与单一先验完全同集 → 不是组合
  const dupArts: readonly PriorArt[] = [
    ...PRIOR,
    { id: 'pa-3', text: 'drift again', mechanismTags: ['instrument-drift'] },
  ];
  const sameSet = mechanismFace(candidate({ mechanismTags: ['instrument-drift'] }), dupArts);
  assert.equal(sameSet.combiningPriorArtIds.length, 2);
  assert.equal(sameSet.nonObviousCombination, false, '与单一先验同集不是新组合');
  // 空机制标签的面 2 退化
  const empty = mechanismFace(candidate({ mechanismTags: [] }), PRIOR);
  assert.equal(empty.overlapRatio, 0);
  assert.equal(empty.nonObviousCombination, false);
  // 空 prior-art 集：一切标签皆新
  assert.deepEqual(textFace(candidate(), []).nearestPriorArtId, null);
  assert.deepEqual(mechanismFace(candidate(), []).novelTags, ['citation-practice-heterogeneity']);
});
