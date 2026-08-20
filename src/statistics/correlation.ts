// src/statistics/correlation.ts
//
// 跨领域共享的 Pearson 相关统计（SSOT）。2026-08-21 自 research/adapters/
// exoplanet_analysis.ts 迁入——figure_extraction 复算层需要同一统计量，
// 领域适配器不再是通用数学的归宿。exoplanet_analysis re-export 保持导入面。

import { studentTTwoSidedP } from './t_distribution.ts';

/** Pearson r for two paired samples (throws on length mismatch / n<2). */
export function pearsonR(xs: readonly number[], ys: readonly number[]): number {
  if (xs.length !== ys.length) {
    throw new Error(`pearsonR: length mismatch (${xs.length} vs ${ys.length})`);
  }
  const n = xs.length;
  if (n < 2) throw new Error('pearsonR: needs at least 2 points');
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return 0; // constant vector → no linear association
  return cov / Math.sqrt(varX * varY);
}

/**
 * Two-sided p-value of Pearson r via t-transform (df = n-2).
 */
export function pearsonTwoSidedP(r: number, n: number): number | null {
  if (n < 3) return null;
  const r2 = r * r;
  if (r2 >= 1) return 0; // perfect correlation
  const t = (r * Math.sqrt(n - 2)) / Math.sqrt(1 - r2);
  return studentTTwoSidedP(t, n - 2);
}
