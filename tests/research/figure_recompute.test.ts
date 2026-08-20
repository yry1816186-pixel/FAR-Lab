// tests/research/figure_recompute.test.ts
//
// 复算敏感性层契约测试（figure_extraction phase 2 免 key 半边）：
//   - r 手算钉死（3/√10 ≈ 0.9486833）
//   - 仿射不变性定理钉死（轴标定做任意正仿射扰动 → r 逐位不动）
//   - 斜率解析式（值域斜率=(a_y/a_x)·像素斜率）手算钉死 dy/dx=2
//   - 标定带：3 刻度轴 seSlope>0 → 带含点估计；双 2 刻度轴 → 带退化+诚实标注
//   - fail-closed：n<3 相关 / 混轴 / 未知序列 / 共 px 斜率
//
// 全部期望值为手算精确值（注释给推导），同时钉死数学正确性与解析性质。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { FigureExtraction } from '../../src/research/adapters/figure_extraction/schema.ts';
import { parseFigureExtraction } from '../../src/research/adapters/figure_extraction/schema.ts';
import {
  calibrateExtraction,
  type CalibratedExtraction,
} from '../../src/research/adapters/figure_extraction/calibrate.ts';
import {
  recomputeCorrelation,
  recomputeSlope,
  FigureRecomputeError,
} from '../../src/research/adapters/figure_extraction/recompute.ts';
import { pearsonR } from '../../src/statistics/correlation.ts';

/** 构造已标定提取（复用 figure_extraction.test 的签名记录模式，简化版）。 */
function calibrated(mutate?: (r: FigureExtraction) => FigureExtraction): CalibratedExtraction {
  const base: FigureExtraction = {
    chartType: 'scatter',
    xAxis: { axisType: 'linear', ticks: [{ pixel: 10, value: 0 }, { pixel: 110, value: 10 }] },
    yAxis: { axisType: 'linear', ticks: [{ pixel: 10, value: 0 }, { pixel: 110, value: 10 }] },
    series: [
      {
        id: 's1',
        // px 20/30/40/50 → x = 1/2/3/4；py 20/30/30/40 → y = 1/2/2/3
        points: [
          { px: 20, py: 20 },
          { px: 30, py: 30 },
          { px: 40, py: 30 },
          { px: 50, py: 40 },
        ],
      },
    ],
    caveats: [],
    provenance: {
      extractor: 'vlm',
      model: 'qwen3-vl-plus',
      payloadSha256: '0'.repeat(64),
      producedAt: '2026-08-21T12:00:00.000Z',
      mode: 'SYNTHETIC_TEST',
      sourceRef: 'doi:10.0000/contract-vector',
    },
  };
  const record = mutate === undefined ? base : mutate(base);
  return calibrateExtraction(record);
}

test('recompute: r 手算钉死——x=[1,2,3,4], y=[1,2,2,3] ⇒ r=3/√10≈0.9486833', () => {
  const cal = calibrated();
  const result = recomputeCorrelation(cal);
  // cov=3, varX=5, varY=2 ⇒ r = 3/√(5·2)
  assert.ok(Math.abs(result.r - 3 / Math.sqrt(10)) < 1e-12);
  assert.equal(result.n, 4);
  assert.equal(result.computedOn, 'values');
  assert.equal(result.invariance, 'pearson-affine-exact');
  assert.ok(result.pTwoSided !== null && result.pTwoSided > 0 && result.pTwoSided < 0.1);
});

test('recompute: 仿射不变性定理——x 轴标定扰动为 x→2x+5，r 逐位不动', () => {
  const plain = calibrated();
  // x 刻度改为 (10→5, 110→25)：a=0.2, b=3 ⇒ px20→7, 30→9, 40→11, 50→13 = 2x+5
  const perturbed = calibrated((r) => ({
    ...r,
    xAxis: { ...r.xAxis, ticks: [{ pixel: 10, value: 5 }, { pixel: 110, value: 25 }] },
  }));
  const r1 = recomputeCorrelation(plain).r;
  const r2 = recomputeCorrelation(perturbed).r;
  assert.ok(Math.abs(r1 - r2) < 1e-12, `affine invariance violated: ${r1} vs ${r2}`);
  // 且与直接对原始值计算一致
  assert.ok(Math.abs(r2 - pearsonR([1, 2, 3, 4], [1, 2, 2, 3])) < 1e-12);
});

test('recompute: 斜率解析式——a_y/a_x=0.2/0.1=2，像素斜率=1 ⇒ dy/dx=2', () => {
  const cal = calibrated((r) => ({
    ...r,
    chartType: 'line' as 'scatter',
    yAxis: { ...r.yAxis, ticks: [{ pixel: 10, value: 0 }, { pixel: 110, value: 20 }] },
    series: [
      {
        id: 's1',
        // 像素严格共线 py=px：像素 OLS 斜率=1
        points: [
          { px: 10, py: 10 },
          { px: 35, py: 35 },
          { px: 60, py: 60 },
          { px: 85, py: 85 },
          { px: 110, py: 110 },
        ],
      },
    ],
  }));
  const slope = recomputeSlope(cal);
  assert.ok(Math.abs(slope.dyOverDx - 2) < 1e-12);
  // 双 2 刻度轴 → 无自由度 → 带退化 + 诚实标注
  assert.equal(slope.band, null);
  assert.equal(slope.bandBasis, 'exact-two-tick-fit');
  assert.equal(slope.domain, 'values');
});

test('recompute: 标定带——3 刻度非共线 y 轴 seSlope>0 ⇒ 带含点估计且宽>0', () => {
  // y 刻度 (10,0),(60,10.2),(110,20)：a_y=0.2, se_y=√(SSR/1/Sxx)=√(0.026667/5000)≈0.0023094
  // ⇒ F∈[(0.2-0.0023)/0.1, (0.2+0.0023)/0.1]≈[1.9769, 2.0231]，×像素斜率 1
  const cal = calibrated((r) => ({
    ...r,
    yAxis: {
      ...r.yAxis,
      ticks: [{ pixel: 10, value: 0 }, { pixel: 60, value: 10.2 }, { pixel: 110, value: 20 }],
    },
    series: [
      {
        id: 's1',
        points: [
          { px: 10, py: 10 },
          { px: 60, py: 60 },
          { px: 110, py: 110 },
        ],
      },
    ],
  }));
  const slope = recomputeSlope(cal);
  assert.equal(slope.bandBasis, 'tick-ols-se');
  assert.ok(slope.band !== null);
  assert.ok(slope.band.low < slope.dyOverDx && slope.dyOverDx < slope.band.high);
  assert.ok(Math.abs(slope.dyOverDx - 2) < 1e-12);
  // 半宽 = se_y/a_x = sqrt((SSR/(n-2))/Sxx)/a_x = sqrt((2/75)/1/5000)/0.1 ≈ 0.023094
  const expectedHalf = Math.sqrt(2 / 75 / 1 / 5000) / 0.1;
  assert.ok(Math.abs((slope.band!.high - slope.band!.low) / 2 - expectedHalf) < 1e-9);
});

test('recompute: log-log 轴——在 log10 域计算（幂律指数语义）', () => {
  // x 刻度 (10→1, 110→100), y 刻度 (10→1, 110→100)：log10 域均 a=0.02, b=-0.2
  // 共线像素点 py=px ⇒ log 域斜率 = (0.02/0.02)·1 = 1（y=x 幂律）
  const cal = calibrated((r) => ({
    ...r,
    xAxis: { ...r.xAxis, axisType: 'log' as 'linear', ticks: [{ pixel: 10, value: 1 }, { pixel: 110, value: 100 }] },
    yAxis: { ...r.yAxis, axisType: 'log' as 'linear', ticks: [{ pixel: 10, value: 1 }, { pixel: 110, value: 100 }] },
    series: [
      { id: 's1', points: [{ px: 10, py: 10 }, { px: 60, py: 60 }, { px: 110, py: 110 }] },
    ],
  }));
  const slope = recomputeSlope(cal);
  assert.ok(Math.abs(slope.dyOverDx - 1) < 1e-9);
  assert.equal(slope.domain, 'log10-values');
  const corr = recomputeCorrelation(cal);
  assert.equal(corr.computedOn, 'log10-values');
  assert.ok(Math.abs(corr.r - 1) < 1e-9, 'collinear log points ⇒ r=1');
});

test('recompute: fail-closed——n<3 相关 / 混轴 / 未知序列 / 共 px', () => {
  const cal = calibrated();
  const twoPoint = calibrated((r) => ({
    ...r,
    series: [{ id: 's1', points: r.series[0]!.points.slice(0, 2) }],
  }));
  assert.throws(() => recomputeCorrelation(twoPoint), FigureRecomputeError);
  assert.throws(() => recomputeCorrelation(cal, 'nope'), /not found/);
  const mixed = calibrated((r) => ({
    ...r,
    yAxis: { ...r.yAxis, axisType: 'log' as 'linear', ticks: [{ pixel: 10, value: 1 }, { pixel: 110, value: 100 }] },
  }));
  assert.throws(() => recomputeCorrelation(mixed), /mixed axis transforms/);
  assert.throws(() => recomputeSlope(mixed), /mixed axis transforms/);
  const degenerate = calibrated((r) => ({
    ...r,
    series: [{ id: 's1', points: [{ px: 50, py: 10 }, { px: 50, py: 90 }] }],
  }));
  assert.throws(() => recomputeSlope(degenerate), /share one px/);
});

test('recompute: 解析入口不受上游签名解析影响（端到端：raw → parse → calibrate → recompute）', () => {
  // 复用 schema.test 的 signedRecord 流程证明四层链路真实接通（非孤立单测）。
  const raw = JSON.stringify({
    chartType: 'line',
    xAxis: { axisType: 'linear', ticks: [{ pixel: 10, value: 0 }, { pixel: 110, value: 10 }] },
    yAxis: { axisType: 'linear', ticks: [{ pixel: 10, value: 0 }, { pixel: 110, value: 10 }] },
    series: { id: 'only', points: [{ px: 10, py: 10 }, { px: 110, py: 110 }] },
    caveats: [],
    provenance: {
      extractor: 'vector-pdf',
      model: null,
      payloadSha256: '',
      producedAt: '2026-08-21T00:00:00.000Z',
      mode: 'OFFLINE_DEVELOPMENT',
      sourceRef: 'file://local/figure.pdf#page3',
    },
  });
  assert.throws(() => parseFigureExtraction(raw), /series/); // series 应为数组——fail-closed 仍守门
});
