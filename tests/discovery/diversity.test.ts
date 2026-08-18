// tests/discovery/diversity.test.ts
// SCI-DIVERSITY-001：五维分离度量、三 flag 显式标记、机制聚类 + 留一稳定、
// embedding 只作增强信号。纯函数，无 mock。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  clusterByMechanism,
  clusterStability,
  diversityReport,
  embeddingAdvisory,
  analyzePairs,
} from '../../src/discovery/diversity.ts';
import type { DiversityCandidate } from '../../src/discovery/diversity.ts';

function cand(overrides: Partial<DiversityCandidate> & { id: string }): DiversityCandidate {
  return {
    text: `hypothesis ${overrides.id} about the observed effect`,
    mechanismTags: ['baseline-mechanism'],
    prediction: `prediction of ${overrides.id}`,
    evidenceNeeds: ['cohort'],
    ...overrides,
  };
}

test('SCI-DIVERSITY-001: 表述差异 vs 机制差异分离——高文本相似但机制不同 → 只报 PARAPHRASE_RISK 不报 MECHANISM_OVERLAP', () => {
  const base = 'The apparent trend in the dataset is driven by selection effects in the recruitment pipeline.';
  const paraphrase = 'The apparent trend in the dataset is driven by selection effects in the recruiting pipeline overall.';
  const pairs = analyzePairs([
    cand({ id: 'a', text: base, mechanismTags: ['selection-bias'], prediction: 'normalize recruitment → effect halves' }),
    cand({ id: 'b', text: paraphrase, mechanismTags: ['instrument-drift'], prediction: 'recalibrate → effect vanishes' }),
  ]);
  assert.equal(pairs.length, 1);
  const p = pairs[0]!;
  assert.ok(p.flags.includes('PARAPHRASE_RISK'), '表述近重复被标记');
  assert.equal(p.sameMechanism, false, '机制不同不算重叠');
  assert.equal(p.flags.includes('MECHANISM_OVERLAP'), false);
  assert.equal(p.experimentallyDistinguishable, true, '机制/预测都不同 → 实验可区分');
});

test('SCI-DIVERSITY-001: 机制同集 + 预测同文 → NOT_DISTINGUISHABLE；双空预测 → UNTESTABLE_VARIANT', () => {
  const pairs = analyzePairs([
    cand({ id: 'a', mechanismTags: ['selection-bias'], prediction: 'same prediction text' }),
    cand({ id: 'b', mechanismTags: ['selection-bias'], prediction: 'same prediction text' }),
    cand({ id: 'c', mechanismTags: ['other'], prediction: null }),
    cand({ id: 'd', mechanismTags: ['other2'], prediction: null }),
  ]);
  const ab = pairs.find((p) => p.a === 'a' && p.b === 'b')!;
  assert.ok(ab.flags.includes('MECHANISM_OVERLAP'));
  assert.ok(ab.flags.includes('NOT_DISTINGUISHABLE'), '同机制同预测 → 实验不可区分');
  assert.equal(ab.experimentallyDistinguishable, false);
  assert.equal(ab.predictionRelation, 'identical');
  const cd = pairs.find((p) => p.a === 'c' && p.b === 'd')!;
  assert.ok(cd.flags.includes('UNTESTABLE_VARIANT'));
  assert.equal(cd.predictionRelation, 'both-untestable');
  // 双空 + 同机制 → 同样不可区分
  const cdSameMech = analyzePairs([
    cand({ id: 'c', mechanismTags: ['x'], prediction: null }),
    cand({ id: 'd', mechanismTags: ['x'], prediction: null }),
  ])[0]!;
  assert.equal(cdSameMech.experimentallyDistinguishable, false);
});

test('SCI-DIVERSITY-001: 机制聚类确定性 + 留一稳定性——移除Singleton候选改变簇数', () => {
  const candidates = [
    cand({ id: 'a', mechanismTags: ['m1'] }),
    cand({ id: 'b', mechanismTags: ['m1'] }),
    cand({ id: 'c', mechanismTags: ['m2'] }),
  ];
  const clusters = clusterByMechanism(candidates);
  assert.equal(clusters.length, 2);
  assert.deepEqual(clusters[0], { tags: ['m1'], memberIds: ['a', 'b'] });
  assert.deepEqual(clusters[1], { tags: ['m2'], memberIds: ['c'] });

  const stability = clusterStability(candidates);
  assert.equal(stability.baseClusterCount, 2);
  // 移除 c（唯一 m2 成员）→ 簇数变 1；移除 a/b 仍 2 → 非稳定（对移除敏感如实报告）
  const removeC = stability.perRemovalClusterCounts.find((p) => p.removed === 'c')!;
  assert.equal(removeC.clusterCount, 1);
  const removeA = stability.perRemovalClusterCounts.find((p) => p.removed === 'a')!;
  assert.equal(removeA.clusterCount, 2);
  assert.equal(stability.stable, false);

  // 稳定例：每簇 ≥2 成员 → 移任一成员簇数不变
  const robust = [cand({ id: 'a', mechanismTags: ['m1'] }), cand({ id: 'b', mechanismTags: ['m1'] }), cand({ id: 'c', mechanismTags: ['m2'] }), cand({ id: 'd', mechanismTags: ['m2'] })];
  assert.equal(clusterStability(robust).stable, true);
});

test('SCI-DIVERSITY-001: 候选集报告——多样性比值/flag 计数/警告聚合 + 空集边界', () => {
  const report = diversityReport([
    cand({ id: 'a', mechanismTags: ['m1'], prediction: 'p1', evidenceNeeds: ['cohort', 'registry'] }),
    cand({ id: 'b', mechanismTags: ['m1'], prediction: 'p1', evidenceNeeds: ['cohort'] }),
    cand({ id: 'c', mechanismTags: ['m2'], prediction: null, evidenceNeeds: ['sensor'] }),
  ]);
  assert.equal(report.candidateCount, 3);
  assert.ok(Math.abs(report.mechanismDiversity - 2 / 3) < 1e-12);
  assert.ok(Math.abs(report.predictionDiversity - 1 / 3) < 1e-12, 'a/b 同文预测 p1，c 无预测 → 唯一非空预测 1 个 = 1/3');
  assert.equal(report.flagCounts.MECHANISM_OVERLAP >= 1, true);
  assert.equal(report.flagCounts.UNTESTABLE_VARIANT, 0, '仅 c 一个空预测——不成对');
  assert.ok(report.warnings.some((w) => w.includes('overstate breadth')));
  const empty = diversityReport([]);
  assert.equal(empty.candidateCount, 0);
  assert.equal(empty.mechanismDiversity, 0);
  assert.equal(empty.warnings.length, 0);
});

test('SCI-DIVERSITY-001: embedding 仅增强信号——advisory 输出余弦且不进任何裁决路径', () => {
  const withVecs = [
    cand({ id: 'a', mechanismTags: ['m1'], embeddingVector: [1, 0, 0] }),
    cand({ id: 'b', mechanismTags: ['m2'], embeddingVector: [0, 1, 0] }),
    cand({ id: 'c', mechanismTags: ['m1'] }),
  ];
  const advisory = embeddingAdvisory(withVecs);
  // 只有带向量的 a/b 进入（c 无向量）
  assert.equal(advisory.length, 1);
  assert.deepEqual(advisory[0]?.pair, ['a', 'b']);
  assert.ok(Math.abs((advisory[0]?.cosineSimilarity ?? 1) - 0) < 1e-9, '正交向量余弦 0');
  // 机制裁决不受 embedding 影响：a/c 同标签集 → MECHANISM_OVERLAP（尽管只有 a 有向量）
  const pairs = analyzePairs(withVecs);
  const ac = pairs.find((p) => (p.a === 'a' && p.b === 'c') || (p.a === 'c' && p.b === 'a'))!;
  assert.ok(ac.flags.includes('MECHANISM_OVERLAP'), '机制等价只读 mechanismTags——结构性纪律');
  // 同向向量
  const parallel = embeddingAdvisory([
    cand({ id: 'x', embeddingVector: [2, 0] }),
    cand({ id: 'y', embeddingVector: [5, 0] }),
  ]);
  assert.ok(Math.abs((parallel[0]?.cosineSimilarity ?? 0) - 1) < 1e-9);
  // 零向量 → 余弦 0（不产生 NaN）
  const zero = embeddingAdvisory([cand({ id: 'x', embeddingVector: [0, 0] }), cand({ id: 'y', embeddingVector: [1, 1] })]);
  assert.equal(zero[0]?.cosineSimilarity, 0);
});
