// src/research/adapters/figure_extraction/recompute.ts
//
// 标定后提取的确定性复算层（phase 2 免 key 半边）。
//
// 两条解析性质（测试钉死，非近似）：
//   1. Pearson r 对每轴的正仿射映射不变（尺度/平移不变性）。线性轴下，
//      标定残差/seSlope 数学上不可能移动 r——r 的诚实不确定性来自 MARKER
//      读取误差（感知侧，永远进 caveats，绝不静默折叠进数）。
//   2. OLS 斜率具仿射协变性：值域数据斜率 = (a_y/a_x)·像素域数据斜率。
//      刻度 OLS seSlope 经典公式传播为标定带；恰 2 刻度时无自由度 → 带退化
//      + 诚实标注（标定误差=刻度读数误差，不可分离）。
//
// Turner 2023 纪律的落地形态：能解析证明不动的（r）不给假误差带；只能
// 区间陈述的（斜率）给带；两者之外的（感知误差）留在 caveats。fail-closed：
// n 不足 / 混轴 / 退化标定一律抛错，绝不静默降级。

import { pearsonR, pearsonTwoSidedP } from '../../../statistics/correlation.ts';
import type { CalibratedExtraction } from './calibrate.ts';

/** 复算失败（fail-closed）。 */
export class FigureRecomputeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FigureRecomputeError';
  }
}

function findSeries(cal: CalibratedExtraction, seriesId: string) {
  const series = cal.series.find((s) => s.id === seriesId);
  if (series === undefined) {
    throw new FigureRecomputeError(
      `figure_recompute: series "${seriesId}" not found (have: ${cal.series.map((s) => s.id).join(', ')})`,
    );
  }
  return series;
}

/** 两轴须同为 linear 或同为 log（log-log 在 log10 域成立同一套仿射性质）。 */
function requireMatchingAxes(cal: CalibratedExtraction): void {
  const tx = cal.calibration.xAxis.axisType;
  const ty = cal.calibration.yAxis.axisType;
  if (tx !== ty) {
    throw new FigureRecomputeError(
      `figure_recompute: mixed axis transforms (x=${tx}, y=${ty}) — correlation/slope are not well-defined across a mixed transform; refuse (fail-closed)`,
    );
  }
}

/** 拟合域取值：log 轴回到 log10 域（仿射性质成立的域）。 */
function domainValue(axisType: 'linear' | 'log', v: number): number {
  return axisType === 'log' ? Math.log10(v) : v;
}

export interface CorrelationRecompute {
  readonly kind: 'correlation';
  readonly seriesId: string;
  readonly n: number;
  readonly r: number;
  readonly pTwoSided: number | null;
  readonly computedOn: 'values' | 'log10-values';
  /**
   * 'pearson-affine-exact'：r 对轴标定的正仿射误差不变（解析定理）——
   * 标定残差不进入 r 的不确定性；感知误差见提取记录的 caveats。
   */
  readonly invariance: 'pearson-affine-exact';
}

/**
 * 从标定后的提取重算 Pearson r（含 t 变换双侧 p）。
 * n<3 抛错（p 无定义，不给无检验意义的 r）。
 */
export function recomputeCorrelation(
  cal: CalibratedExtraction,
  seriesId?: string,
): CorrelationRecompute {
  requireMatchingAxes(cal);
  const series = findSeries(cal, seriesId ?? cal.series[0]!.id);
  if (series.points.length < 3) {
    throw new FigureRecomputeError(
      `figure_recompute: correlation needs n>=3 (got ${series.points.length}); p is undefined below that — refuse`,
    );
  }
  const axisType = cal.calibration.xAxis.axisType; // = yAxis（requireMatchingAxes 保证）
  const xs = series.points.map((p) => domainValue(axisType, p.x));
  const ys = series.points.map((p) => domainValue(axisType, p.y));
  const r = pearsonR(xs, ys);
  return {
    kind: 'correlation',
    seriesId: series.id,
    n: series.points.length,
    r,
    pTwoSided: pearsonTwoSidedP(r, series.points.length),
    computedOn: axisType === 'log' ? 'log10-values' : 'values',
    invariance: 'pearson-affine-exact',
  };
}

export interface SlopeRecompute {
  readonly kind: 'slope';
  readonly seriesId: string;
  readonly n: number;
  /** 值域 OLS 斜率（log-log 轴时为 log10 域斜率，即幂律指数）。 */
  readonly dyOverDx: number;
  /** 标定带（来自两轴刻度 OLS seSlope 的区间传播）。null=带不可定义（见 bandBasis）。 */
  readonly band: { readonly low: number; readonly high: number } | null;
  readonly bandBasis: 'tick-ols-se' | 'exact-two-tick-fit' | 'undefined-denominator-crossing-zero';
  readonly domain: 'values' | 'log10-values';
}

/**
 * 从标定后的提取重算数据斜率（值域 OLS of y on x；log-log 轴在 log10 域）。
 * 解析式：值域斜率 = (a_y/a_x)·像素域斜率（OLS 仿射协变性）。
 * 标定带 = (a_y±se_y)/(a_x±se_x) 四角极值 × 像素斜率；任一分母角 ≤0 →
 * 带不可定义（fail-honest：band=null + bandBasis 标注）。
 */
export function recomputeSlope(cal: CalibratedExtraction, seriesId?: string): SlopeRecompute {
  requireMatchingAxes(cal);
  const series = findSeries(cal, seriesId ?? cal.series[0]!.id);
  if (series.points.length < 2) {
    throw new FigureRecomputeError('figure_recompute: slope needs n>=2 points');
  }
  // 像素域 OLS（我们自己的确定性算术，与标定无关）
  const pxs = series.points.map((p) => p.px);
  const pys = series.points.map((p) => p.py);
  const meanPx = pxs.reduce((s, v) => s + v, 0) / pxs.length;
  const meanPy = pys.reduce((s, v) => s + v, 0) / pys.length;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < pxs.length; i += 1) {
    sxy += (pxs[i]! - meanPx) * (pys[i]! - meanPy);
    sxx += (pxs[i]! - meanPx) ** 2;
  }
  if (sxx === 0) {
    throw new FigureRecomputeError('figure_recompute: all points share one px — slope undefined');
  }
  const pixelSlope = sxy / sxx;
  const ax = cal.calibration.xAxis;
  const ay = cal.calibration.yAxis;
  const dyOverDx = (ay.slope / ax.slope) * pixelSlope;
  const domain = ax.axisType === 'log' ? 'log10-values' : 'values';

  if (ax.seSlope === null && ay.seSlope === null) {
    return {
      kind: 'slope',
      seriesId: series.id,
      n: series.points.length,
      dyOverDx,
      band: null,
      bandBasis: 'exact-two-tick-fit',
      domain,
    };
  }
  // 区间传播（任一轴无 se 时该侧 ±0）
  const seX = ax.seSlope ?? 0;
  const seY = ay.seSlope ?? 0;
  const corners = [
    (ay.slope - seY) / (ax.slope - seX),
    (ay.slope - seY) / (ax.slope + seX),
    (ay.slope + seY) / (ax.slope - seX),
    (ay.slope + seY) / (ax.slope + seX),
  ];
  if (corners.some((c) => !Number.isFinite(c))) {
    return {
      kind: 'slope',
      seriesId: series.id,
      n: series.points.length,
      dyOverDx,
      band: null,
      bandBasis: 'undefined-denominator-crossing-zero',
      domain,
    };
  }
  const fLow = Math.min(...corners);
  const fHigh = Math.max(...corners);
  const low = fLow * pixelSlope;
  const high = fHigh * pixelSlope;
  return {
    kind: 'slope',
    seriesId: series.id,
    n: series.points.length,
    dyOverDx,
    band: { low: Math.min(low, high), high: Math.max(low, high) },
    bandBasis: 'tick-ols-se',
    domain,
  };
}
