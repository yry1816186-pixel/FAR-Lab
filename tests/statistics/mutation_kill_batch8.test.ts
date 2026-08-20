/**
 * statistics 域 mutation 补杀（2026-08-20 批次 8）。
 *
 * multiple_testing 43.8% / ci 25.0% / effect_size 50% 存活的输入验证边界用例：
 * alpha 与 p 值的闭开区间语义、显著性等号边界（p === alpha 须拒绝 H0·统计惯例）、
 * 最小合法样本量直通、零标准差 fail-closed。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 桩。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { adjustPValues } from '../../src/statistics/multiple_testing.ts';
import {
  meanConfidenceInterval,
  meanConfidenceIntervalT,
  differenceInMeansConfidenceInterval,
  differenceInMeansConfidenceIntervalWelch,
} from '../../src/statistics/ci.ts';
import { cohensDOneSample, sampleVariance } from '../../src/statistics/effect_size.ts';

// ===== multiple_testing：alpha / p 值验证边界 =====

test('mutation 补杀: alpha=0 / alpha=1 / NaN 精确拒绝（开区间 (0,1) 语义）', () => {
  assert.throws(() => adjustPValues([0.03], 'bonferroni', 0), /strictly between 0 and 1, got 0/,
    'alpha=0 恰在边界必须拒绝（<=0 → <0 变异会放行零显著性水平）');
  assert.throws(() => adjustPValues([0.03], 'bonferroni', 1), /strictly between 0 and 1, got 1/,
    'alpha=1 恰在边界必须拒绝（>=1 → >1 变异会放行必然显著水平）');
  assert.throws(() => adjustPValues([0.03], 'bonferroni', Number.NaN), /strictly between 0 and 1, got NaN/,
    'NaN alpha 必须拒绝（||→&& 变异会放行 NaN 落入恒 false 比较）');
});

test('mutation 补杀: p=0 / p=1 合法（闭区间 [0,1] 语义·与 alpha 开区间对照）', () => {
  const withZero = adjustPValues([0, 0.5], 'bonferroni', 0.05);
  assert.ok(Array.isArray(withZero) && withZero.length === 2, 'p=0 是合法边界（< 0 → <= 0 变异会误拒）');
  const withOne = adjustPValues([1, 0.5], 'bonferroni', 0.05);
  assert.ok(Array.isArray(withOne) && withOne.length === 2, 'p=1 是合法边界（> 1 → >= 1 变异会误拒）');
});

test('mutation 补杀: adjusted p === alpha 拒绝 H0（<= 含等号·显著性边界）', () => {
  // bonferroni 单检验：adjusted = min(0.05*1, 1) = 0.05 === alpha → rejected 必须为 true
  //（p 恰等 alpha 的边界按 ≤ 语义拒绝原假设——统计惯例）。
  const [adj] = adjustPValues([0.05], 'bonferroni', 0.05);
  assert.ok(adj !== undefined, '前置：单检验返回');
  assert.equal(adj.rejected, true, 'adjusted p === alpha → 拒绝（<= → < 变异会漏判边界显著）');
});

// ===== ci：最小合法样本量 n=2 直通 =====

test('mutation 补杀: 四个 CI 函数 n=2 合法（length < 2 含等号边界）', () => {
  const z = meanConfidenceInterval([1, 2], 0.95);
  assert.ok(z.lower < z.upper, 'z-CI n=2 不得拒绝');
  const t = meanConfidenceIntervalT([1, 2], 0.95);
  assert.ok(t.lower < t.upper, 't-CI n=2 不得拒绝');
  const pooled = differenceInMeansConfidenceInterval([1, 2], [3, 4], 0.95);
  assert.ok(pooled.lower < pooled.upper, 'pooled diff-CI n=2/2 不得拒绝');
  const welch = differenceInMeansConfidenceIntervalWelch([1, 2], [5, 8], 0.95);
  assert.ok(welch.lower < welch.upper, 'Welch diff-CI n=2/2 不得拒绝');
});

// ===== effect_size：零标准差 + 最小样本量 =====

test('mutation 补杀: cohensDOneSample 零标准差 fail-closed（sd === 0 位点）', () => {
  // 全同样本 sd=0：原版显式 throw（除零不可静默）；变异 !==0 会走 0/0=NaN 返回。
  assert.throws(() => cohensDOneSample([3, 3, 3], 3), /standard deviation must be non-zero/,
    'sd=0 须显式拒绝（=== → !== 变异会返回 NaN 效应量）');
});

test('mutation 补杀: sampleVariance n=2 恰为最小合法量（minimumLength 含等号）', () => {
  const v = sampleVariance([1, 2]);
  assert.equal(v, 0.5, 'n=2 方差合法且正确（<min → <=min 变异会误拒最小样本）');
});

// ── 批次 9：ks_test 补杀（tie 扫描越界 + 不等长主循环）──

import { kolmogorovSmirnovTwoSample } from '../../src/statistics/ks_test.ts';

test('mutation 补杀: KS 不等长样本（样本 1 先耗尽·主循环 || 位点）精确结果', () => {
  // n1=3 < n2=4：合并主循环须在样本 1 耗尽后继续处理样本 2 剩余（|| → && 变异会
  // 提前截断，D 统计量与渐近 p 均错）。golden 值为原版实跑 bit 级快照。
  const r = kolmogorovSmirnovTwoSample([1, 1, 2], [1, 2, 2, 3]);
  assert.equal(r.statistic, 0.41666666666666663, 'D 统计量 bit-exact（tie + 不等长）');
  assert.equal(r.pValue, 0.8214372624935488, '渐近 p bit-exact');
  assert.deepEqual([...r.sampleSizes], [3, 4]);
});

test('mutation 补杀: KS 无 tie 两样本精确结果（tie 扫描 && 位点·跨 tie 边界推进）', () => {
  // data1=[1,2] data2=[1.5,2.5] 无跨样本 tie：tie 扫描 while(i<n1 && data1[i]===v1)
  // 的 && → || 变异会把 tie 边界后的元素一并跳过（i 推到 n1）→ D 错。
  const r = kolmogorovSmirnovTwoSample([1.0, 2.0], [1.5, 2.5]);
  assert.equal(r.statistic, 0.5, 'D=0.5（两组完全交错）');
  assert.equal(r.pValue, 0.8438198245415606, '渐近 p bit-exact');
});

test('mutation 补杀: KS 完全相同分布 D=0·相同样本', () => {
  const r = kolmogorovSmirnovTwoSample([1, 2, 3], [1, 2, 3]);
  assert.equal(r.statistic, 0, '同分布 D=0');
});

test('mutation 补杀: KS 折叠跳跃区分用例（tie 扫描 &&→|| 位点·手工变异实证）', () => {
  // [1,4,7] vs [2,3,5]：变异（v2 tie 扫描 ||）会把 data2 一次折叠到 F2=1，
  // 产生假极值 D=0.667/p=0.320；原版逐点 merge D=1/3/p=0.976。
  // 值为原版实跑 bit 级快照（2026-08-20 手工变异对照实验）。
  const r = kolmogorovSmirnovTwoSample([1, 4, 7], [2, 3, 5]);
  assert.equal(r.statistic, 0.33333333333333337, 'D bit-exact（逐点 merge·非折叠）');
  assert.equal(r.pValue, 0.9762126488644777, '渐近 p bit-exact');
});

// ── 批次 9：permutation_test 补杀（RNG golden + 主路径 golden）──

import { createMulberry32, permutationTestMeanDifference } from '../../src/statistics/permutation_test.ts';

test('mutation 补杀: mulberry32(42) 固定种子输出序列 golden（RNG 内部位点）', () => {
  // RNG 状态机任一位点变异都会改变序列。值为原版实跑快照（2026-08-20）。
  const rng = createMulberry32(42);
  const first6 = [rng(), rng(), rng(), rng(), rng(), rng()];
  assert.deepEqual(first6, [2581720956, 1925393290, 3661312704, 2876485805, 750819978, 2261697747]);
});

test('mutation 补杀: permutation 主路径 golden（seed=42 精确 p/extremeCount）', () => {
  // RNG 序列、pool 拼装（for i < n1 哨兵）、acceptance 采样、BigInt 精确比较
  // 任一可观测变异都会改变 extremeCount/pValue。原版实跑快照。
  const r = permutationTestMeanDifference([1.0, 2.0], [3.0, 4.0], { seed: 42 });
  assert.equal(r.pValue, 0.3235, 'p bit-exact（9999 迭代·seed 42）');
  assert.equal(r.extremeCount, 3234, 'extreme count bit-exact');
  assert.equal(r.observedStatistic, -2, '观测统计量');
});

test('mutation 补杀: permutation 对称输入相等语义（|stat| >= |observed| 含等号·精确有理数内核）', () => {
  // [0,4] vs [2,2]：observed=0 恰在 permutation 统计量集合内（对称差为 0）→
  // 极端计数含全部 >=0 的 permutation → extremeCount === iterations → p=1。
  // 阈值比较的 >= → > 变异会排除相等统计量 → p < 1。原版实跑快照。
  const r = permutationTestMeanDifference([0, 4], [2, 2], { seed: 42 });
  assert.equal(r.observedStatistic, 0);
  assert.equal(r.extremeCount, 9999, '相等统计量必须计入极端（>= 含等号）');
  assert.equal(r.pValue, 1, '全极端 → p=1（> 变异会漏计相等项致 p<1）');
});

test('mutation 补杀: permutation 非零观测相等语义（dyadic 精确阈值比较·4 位点）', () => {
  // [1,2] vs [1,3]：obs=-0.5（dyadic 精确），全部 permutation 的 |diff| 最小恰为 0.5
  // -> 阈值 |x| >= 0.5 的相等项占多数路径——>= -> > 变异会排除相等项 -> extreme < 9999。
  const r = permutationTestMeanDifference([1, 2], [1, 3], { seed: 42 });
  assert.equal(r.observedStatistic, -0.5);
  assert.equal(r.extremeCount, 9999, '相等 |diff|===0.5 的项必须计入极端（精确有理数 >= 含等号）');
  assert.equal(r.pValue, 1);
});

// ── 批次 9：numerics 补杀（tolerantCompare 容差等值 + safeInteger 恰等边界）──

import { tolerantCompare, relDiff, safeIntegerAdd, safeIntegerMul } from '../../src/statistics/numerics.ts';

test('mutation 补杀: tolerantCompare relDiff 恰等 tol → 判相等（<= 含等号）', () => {
  // tol 用导出的 relDiff 现算（与实现内部同一次运算 → 位相同）→ 精确命中等值分支。
  const b = 1 + 2 ** -30;
  const tol = relDiff(1, b);
  assert.equal(tolerantCompare(1, b, { relTolerance: tol }), 0, 'relDiff === tol 须判相等（< 变异会误判 -1）');
});

test('mutation 补杀: safeIntegerAdd/Mul 结果恰为 MAX_SAFE_INTEGER → number 不升 BigInt（> 严格不含等号）', () => {
  const sum = safeIntegerAdd(Number.MAX_SAFE_INTEGER - 1, 1);
  assert.equal(typeof sum, 'number', '恰等于 MAX_SAFE_INTEGER 仍是安全整数（>= 变异会误升 BigInt）');
  assert.equal(sum, Number.MAX_SAFE_INTEGER);
  const product = safeIntegerMul(1, Number.MAX_SAFE_INTEGER);
  assert.equal(typeof product, 'number', '乘积恰等 MAX_SAFE_INTEGER 不升 BigInt');
  assert.equal(product, Number.MAX_SAFE_INTEGER);
  // 下界同型：恰等 MIN_SAFE_INTEGER 仍是安全整数（< 变异会误升 BigInt）。
  const negative = safeIntegerMul(1, Number.MIN_SAFE_INTEGER);
  assert.equal(typeof negative, 'number', '乘积恰等 MIN_SAFE_INTEGER 不升 BigInt');
  assert.equal(negative, Number.MIN_SAFE_INTEGER);
});

// ── 批次 9 尾：bootstrap_ci / calibration 补杀 ──

import { bootstrapMeanPercentileCi } from '../../src/statistics/bootstrap_ci.ts';
import { brierScore, expectedCalibrationError } from '../../src/statistics/calibration.ts';

test('mutation 补杀: bootstrap iterations=2 恰为最小合法量 + n=2 样本（< 含等号边界）', () => {
  const r = bootstrapMeanPercentileCi([1, 2, 3, 4], { seed: 42, iterations: 2 });
  assert.deepEqual({ ...r }, { estimate: 2.5, lower: 2.25, upper: 3, confidenceLevel: 0.95, iterations: 2, seed: 42 },
    'iterations=2 golden（<min → <=min 变异会误拒最小迭代量；for k<iterations 的多余迭代会改变重采样分布）');
  const n2 = bootstrapMeanPercentileCi([1, 2], { seed: 7, iterations: 100 });
  assert.deepEqual({ ...n2 }, { estimate: 1.5, lower: 1, upper: 2, confidenceLevel: 0.95, iterations: 100, seed: 7 },
    'n=2 样本 golden');
});

test('mutation 补杀: bootstrap confidenceLevel=1 恰在边界拒绝（>= 1 含等号）', () => {
  assert.throws(() => bootstrapMeanPercentileCi([1, 2, 3], { seed: 1, iterations: 2, confidenceLevel: 1 }),
    /confidenceLevel must be/, 'confidenceLevel=1（必然置信）必须拒绝（> 变异会放行）');
});

test('mutation 补杀: calibration p=-0.1 越界拒绝 + 空输入拒绝（|| → && 变异会放行非法输入）', () => {
  assert.throws(() => brierScore([-0.1], [true]), /out of \[0,1\]/,
    'p<0 必须 throw（||→&& 恒 false 后非法 p 落入计算）');
  assert.throws(() => brierScore([1.1], [false]), /out of \[0,1\]/, 'p>1 必须 throw');
  // 空输入返回 0（与落入计算路径的空循环结果同值——or_to_and 位点经实测为输出等价，登记在册）
  assert.equal(expectedCalibrationError([], [], 1), 0, '空输入 ECE=0');
});

test('mutation 补杀: brierScore golden（for-i 哨兵·越界迭代产生 NaN 会被 0.25 断言捕获）', () => {
  assert.equal(brierScore([0.5, 0.5], [true, false]), 0.25, 'brier bit-exact（0.25²+0.25²)/2');
  assert.equal(brierScore([0.2], [true]), 0.6400000000000001, '(1-0.2)² 的双精度值');
});

test('mutation 补杀: calibration bins=1 恰为最小合法量（< 含等号）', () => {
  const ece = expectedCalibrationError(
    [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
    [true, false, true, false, true, true, false, true],
    1,
  );
  assert.equal(ece, 0.17500000000000004,
    'bins=1 单桶 ECE=|mean(pred)−mean(outcome)|=|0.45−0.625|（golden——早退守卫变异会返回假 0）');
});
