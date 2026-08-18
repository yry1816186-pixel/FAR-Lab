// tests/science/method_selection.test.ts
// SCI-METHOD-001：11 方法清单、特征校验 fail-closed、确定性调度（required
// 优先）、排除理由、适配矩阵。纯函数，无 mock。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  METHOD_IDS,
  METHOD_LIBRARY,
  selectMethods,
  suitabilityMatrix,
  validateProblemFeatures,
} from '../../src/science/method_selection.ts';
import type { ProblemFeatures } from '../../src/science/method_selection.ts';

const observationalMultivariate: ProblemFeatures = {
  dataType: 'observational',
  causalStructure: 'correlational',
  interventional: 'none',
  confirmatory: true,
  expectedEffectSize: 'small',
  multivariate: true,
};

const labExperiment: ProblemFeatures = {
  dataType: 'experimental',
  causalStructure: 'experimental',
  interventional: 'full',
  confirmatory: false,
  expectedEffectSize: 'large',
  multivariate: false,
};

test('SCI-METHOD-001: 方法库 11 方法齐全（宪法枚举）+ 每方法有 purpose 与确定性规则', () => {
  assert.equal(METHOD_IDS.length, 11);
  assert.equal(METHOD_LIBRARY.length, 11);
  assert.deepEqual(
    METHOD_LIBRARY.map((m) => m.methodId).sort(),
    [...METHOD_IDS].sort(),
  );
  for (const m of METHOD_LIBRARY) {
    assert.ok(m.purpose.length > 10, `[${m.methodId}] purpose 过短`);
    assert.equal(typeof m.evaluate, 'function');
  }
});

test('SCI-METHOD-001: 确定性调度——同特征两次调用结果逐字节一致 + required 在前', () => {
  const d1 = selectMethods(observationalMultivariate);
  const d2 = selectMethods(observationalMultivariate);
  assert.deepEqual(d1, d2);
  // confirmatory → pre-registration 必须 required 且排最前（required 组按 id 序）
  const firstRequired = d1.recommended.filter((r) => r.suitability === 'required').map((r) => r.methodId);
  assert.ok(firstRequired.includes('pre-registration'));
  assert.ok(firstRequired.includes('sensitivity-analysis'), '多变量 → 敏感性分析 required');
  assert.ok(firstRequired.includes('multiple-working-hypotheses'), '多变量 → 多假设 required');
  assert.ok(firstRequired.includes('triangulation'), 'correlational → triangulation required');
  // required 组整体在 suitable 组之前
  const suitabilities = d1.recommended.map((r) => r.suitability);
  const firstSuitable = suitabilities.indexOf('suitable');
  const lastRequired = suitabilities.lastIndexOf('required');
  assert.ok(lastRequired < firstSuitable, `required 必须全部排在 suitable 前（lastRequired=${lastRequired}, firstSuitable=${firstSuitable}）`);
  // 每条推荐都有 rationale
  for (const r of d1.recommended) assert.ok(r.rationale.length > 5);
});

test('SCI-METHOD-001: 场景分派——实验性问题派 Strong Inference，观察性问题不派', () => {
  const lab = selectMethods(labExperiment);
  const strongInference = lab.recommended.find((r) => r.methodId === 'strong-inference');
  assert.ok(strongInference, '全干预 + 实验结构 → Strong Inference 适用');
  const obs = selectMethods(observationalMultivariate);
  assert.equal(obs.recommended.some((r) => r.methodId === 'strong-inference'), false, '无干预不派强推断');
  const excludedSi = obs.excluded.find((r) => r.methodId === 'strong-inference');
  assert.match(excludedSi?.rationale ?? '', /intervenability=none/);
  // negative-results 恒在推荐集（每个研究形态都要登记阴性结果）
  assert.ok(lab.recommended.some((r) => r.methodId === 'negative-results'));
  assert.ok(obs.recommended.some((r) => r.methodId === 'negative-results'));
  // exploratory 不强制预注册
  const exploratory = selectMethods({ ...labExperiment, confirmatory: false });
  assert.ok(exploratory.recommended.every((r) => r.suitability !== 'required' || r.methodId !== 'pre-registration') || !exploratory.recommended.some((r) => r.methodId === 'pre-registration' && r.suitability === 'required'));
  const confirmatory = selectMethods({ ...labExperiment, confirmatory: true });
  assert.equal(confirmatory.recommended.find((r) => r.methodId === 'pre-registration')?.suitability, 'required');
});

test('SCI-METHOD-001: 特征校验 fail-closed——枚举外取值 throw；调度至少一法（零推荐防御）', () => {
  assert.throws(() => validateProblemFeatures({ ...observationalMultivariate, dataType: 'gossip' as never }), /unknown dataType "gossip"/);
  assert.throws(() => validateProblemFeatures({ ...observationalMultivariate, causalStructure: 'vibes' as never }), /unknown causalStructure/);
  assert.throws(() => validateProblemFeatures({ ...observationalMultivariate, interventional: 'sometimes' as never }), /unknown interventional/);
  assert.throws(() => validateProblemFeatures({ ...observationalMultivariate, expectedEffectSize: 'huge' as never }), /unknown expectedEffectSize/);
  // 最弱形态（descriptive/none/exploratory/univariate/small）仍至少推荐 negative-results
  const minimal = selectMethods({
    dataType: 'archival',
    causalStructure: 'descriptive',
    interventional: 'none',
    confirmatory: false,
    expectedEffectSize: 'small',
    multivariate: false,
  });
  assert.ok(minimal.recommended.length >= 1);
  assert.ok(minimal.recommended.some((r) => r.methodId === 'negative-results'));
});

test('SCI-METHOD-001: 适配矩阵——方法 × 问题的审查视图 + 维度一致', () => {
  const matrix = suitabilityMatrix([observationalMultivariate, labExperiment]);
  assert.equal(matrix.length, 11);
  for (const row of matrix) assert.equal(row.perProblem.length, 2);
  const prereg = matrix.find((r) => r.methodId === 'pre-registration')!;
  assert.equal(prereg.perProblem[0], 'required', '问题 1 confirmatory → required');
  assert.equal(prereg.perProblem[1], 'neutral', '问题 2 exploratory → neutral');
  const si = matrix.find((r) => r.methodId === 'strong-inference')!;
  assert.equal(si.perProblem[1], 'suitable');
});
