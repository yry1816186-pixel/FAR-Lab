/**
 * anti_theater utils —— 反剧场 detector 共享纯函数工具。
 *
 * Authority: PROJECT_PLAN/APPENDIX_E_ANTI_THEATER.md §2（detect_* 伪代码调用的工具）+ §4（score 桶去重）。
 *
 * 模型中立。零容忍合规：无 any / @ts-ignore / 桩。纯函数（不 mutate 输入）。
 */

import type { FecContractV2 } from '../fec/fec_contract.ts';

/**
 * 浮点比较（AT-PHACK-ALPHA tol=0·R7）。
 * alpha 从 JSON 解析为 IEEE 754 double，TS/Python 两端位级一致；tol=0 即精确比较。
 * tol 参数保留以对齐 APPENDIX_E §2 伪代码签名 floats_equal(a, b, tol=0)。
 */
export function floatsEqual(a: number, b: number, tol = 0): boolean {
  return Math.abs(a - b) <= tol;
}

/** 集合交集（score.ts 桶去重扣分·D6·返回新 Set 不 mutate 入参）。 */
export function intersection<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): Set<T> {
  const result = new Set<T>();
  for (const item of a) {
    if (b.has(item)) {
      result.add(item);
    }
  }
  return result;
}

/**
 * FEC 是否声明 negative control（score 桶 6 no_negative_control·D7 近似判定）。
 * 从 datasetRequirements 检测 name 或 consentOrPrivacyTag 含 'negative' / 'control'。
 *
 * 诚实边界（PARTIAL·W4 ROADMAP）：FEC 无显式 negativeControl 字段（81 §2 要求未落地），
 * 此为 name/tag 字符串近似判定；真正字段升级为 W4。
 */
export function hasNegativeControl(fec: FecContractV2): boolean {
  return fec.datasetRequirements.some((req) => {
    const name = req.name.toLowerCase();
    const tag = (req.consentOrPrivacyTag ?? '').toLowerCase();
    return (
      name.includes('negative') ||
      name.includes('control') ||
      tag.includes('negative') ||
      tag.includes('control')
    );
  });
}
