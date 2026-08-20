// src/research/adapters/figure_extraction/calibrate.ts
//
// 确定性像素→数值标定内核（figure_extraction 的算术半边）。
// 模型做感知（像素+刻度读数），本模块做换算：最小二乘拟合
//   linear: value = a·pixel + b
//   log   : log10(value) = a·pixel + b   （值恒正）
// ≥2 个标定点（schema 强制）；>2 个走 OLS，残差进结果（误差纪律，见 schema.ts 头注）。
// 退化输入（同像素刻度 / log 轴非正值 / 数值溢出）fail-closed 抛错——绝不静默外推。

import type { AxisCalibration, FigureExtraction } from './schema.ts';

/** 标定失败（fail-closed）。 */
export class FigureCalibrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FigureCalibrationError';
  }
}

/** 单轴拟合结果。residualMax = 拟合域内最大绝对残差（linear=值域；log=log10 域）。 */
export interface AxisFit {
  readonly axisType: 'linear' | 'log';
  readonly slope: number;
  readonly intercept: number;
  readonly residualMax: number;
  /**
   * 刻度 OLS 斜率标准误（经典公式 se=sqrt((SSR/(n-2))/Sxx)，拟合域）。
   * 恰 2 个刻度时无自由度 → null（拟合精确，标定误差=刻度读数误差，不可分离）。
   */
  readonly seSlope: number | null;
  /** 像素→值。 */
  toValue(pixel: number): number;
}

export function fitAxis(axis: AxisCalibration, axisName: 'xAxis' | 'yAxis'): AxisFit {
  const ticks = axis.ticks;
  if (axis.axisType === 'log' && ticks.some((t) => t.value <= 0)) {
    throw new FigureCalibrationError(
      `figure_calibration: ${axisName} log axis has non-positive tick value (all must be > 0)`,
    );
  }
  const pixelMean = ticks.reduce((s, t) => s + t.pixel, 0) / ticks.length;
  const pixelVar = ticks.reduce((s, t) => s + (t.pixel - pixelMean) ** 2, 0);
  if (pixelVar === 0) {
    throw new FigureCalibrationError(
      `figure_calibration: ${axisName} ticks share the same pixel — calibration is undefined`,
    );
  }
  // log 轴在 log10 域拟合（刻度几何均匀是图纸常态）。
  const target = (v: number): number => (axis.axisType === 'log' ? Math.log10(v) : v);
  const valueMean = ticks.reduce((s, t) => s + target(t.value), 0) / ticks.length;
  const cov = ticks.reduce((s, t) => s + (t.pixel - pixelMean) * (target(t.value) - valueMean), 0);
  const slope = cov / pixelVar;
  const intercept = valueMean - slope * pixelMean;
  const residualMax = ticks.reduce((m, t) => {
    const fitted = slope * t.pixel + intercept;
    return Math.max(m, Math.abs(fitted - target(t.value)));
  }, 0);
  const ssr = ticks.reduce((s, t) => {
    const fitted = slope * t.pixel + intercept;
    return s + (fitted - target(t.value)) ** 2;
  }, 0);
  const seSlope = ticks.length > 2 ? Math.sqrt(ssr / (ticks.length - 2) / pixelVar) : null;
  const invert = (fitted: number): number =>
    axis.axisType === 'log' ? 10 ** fitted : fitted;
  const axisType = axis.axisType;
  return {
    axisType,
    slope,
    intercept,
    residualMax,
    seSlope,
    toValue(pixel: number): number {
      const v = invert(slope * pixel + intercept);
      if (!Number.isFinite(v)) {
        throw new FigureCalibrationError(
          `figure_calibration: ${axisName} value at pixel ${pixel} is not finite (overflow?) — refusing to emit`,
        );
      }
      return v;
    },
  };
}

/** 标定后的提取结果：值空间序列 + 每轴残差（下游敏感性判定的输入）。 */
export interface CalibratedExtraction {
  readonly chartType: FigureExtraction['chartType'];
  readonly series: ReadonlyArray<{
    readonly id: string;
    /** px/py=感知输入（保留：斜率解析式与审计需要）；x/y=确定性换算值。 */
    readonly points: ReadonlyArray<{
      readonly px: number;
      readonly py: number;
      readonly x: number;
      readonly y: number;
    }>;
  }>;
  readonly calibration: {
    readonly xAxis: Pick<AxisFit, 'axisType' | 'slope' | 'seSlope' | 'residualMax'>;
    readonly yAxis: Pick<AxisFit, 'axisType' | 'slope' | 'seSlope' | 'residualMax'>;
  };
  readonly caveats: readonly string[];
  readonly provenance: FigureExtraction['provenance'];
}

/** 像素空间提取 → 值空间（确定性，无模型参与）。 */
export function calibrateExtraction(extraction: FigureExtraction): CalibratedExtraction {
  const xFit = fitAxis(extraction.xAxis, 'xAxis');
  const yFit = fitAxis(extraction.yAxis, 'yAxis');
  return {
    chartType: extraction.chartType,
    series: extraction.series.map((s) => ({
      id: s.id,
      points: s.points.map((p) => ({
        px: p.px,
        py: p.py,
        x: xFit.toValue(p.px),
        y: yFit.toValue(p.py),
      })),
    })),
    calibration: {
      xAxis: {
        axisType: xFit.axisType,
        slope: xFit.slope,
        seSlope: xFit.seSlope,
        residualMax: xFit.residualMax,
      },
      yAxis: {
        axisType: yFit.axisType,
        slope: yFit.slope,
        seSlope: yFit.seSlope,
        residualMax: yFit.residualMax,
      },
    },
    caveats: extraction.caveats,
    provenance: extraction.provenance,
  };
}
