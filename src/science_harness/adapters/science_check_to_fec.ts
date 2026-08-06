/**
 * science_harness adapters —— ScienceCheck → FEC FalsificationSpec/ThresholdSpec 投影（P1-5）。
 *
 * 为什么需要 adapter：ScienceCheck.threshold.op 是 5 值（'<'|'<='|'>'|'>='|'=='），FEC thresholdSemantics
 * 是 3 值（'gt'|'lt'|'range'）。两套枚举不对齐——adapter 单点承载投影，禁调用方散落自造映射（铁律 #1 单口径）。
 *
 * 投影规则（诚实·有损声明）：
 *   - '>' → 'gt'；'>=' → 'gt'（折叠·边界等号丢失：>= 0.8 按 > 0.8 处理）。
 *   - '<' → 'lt'；'<=' → 'lt'（折叠·同上）。
 *   - '==' → throw（精确等值无可证伪语义·fail-closed 拒绝·强约束上游 fixture 不用 '=='）。
 * 折叠是有损的： verdict 由 statistics 注入路径（真实 pValue/adjustedPValue）驱动，非 threshold 评估；
 * thresholdSpec 仅作 FEC 契约形状，故边界等号丢失不影响裁决正确性。
 *
 * 模型中立（F3/C1）。零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch。纯函数（不 mutate 输入）。
 */

import type {
  FalsificationSpec,
  ThresholdSemantics,
  ThresholdSpec,
} from '../../falsifiability/types.ts';
import type { ScienceCheck } from '../types.ts';
/** Projection of a ScienceCheck into FEC FalsificationSpec + ThresholdSpec.
 * Handles the 5-value to 3-value threshold operator mapping (lossy but honest). */
export interface ScienceCheckFecProjection {
  readonly falsificationSpec: FalsificationSpec;
  readonly thresholdSpec: ThresholdSpec;
}

function opToSemantics(check: ScienceCheck): ThresholdSemantics {
  const op = check.threshold.op;
  if (op === '>' || op === '>=') {
    return 'gt';
  }
  if (op === '<' || op === '<=') {
    return 'lt';
  }
  // '==' 无可证伪语义（精确等值不可证伪·Popper）→ fail-closed 拒绝，强约束上游 fixture。
  throw new Error(
    `scienceCheckToFalsificationSpec: '==' op has no falsification semantics (check id="${check.id}"); use '>'/'<' (or '>='/'<=') — exact-equality claims are unfalsifiable`,
  );
}

/**
 * ScienceCheck → FalsificationSpec + ThresholdSpec。
 *
 * falsificationSpec.prediction 机械合成自 metric + threshold（可证伪的 metric 命题）；
 * 若需富语义 prediction，caller 可在取得 thresholdSpec 后自建 FalsificationSpec 覆盖。
 */
export function scienceCheckToFalsificationSpec(check: ScienceCheck): ScienceCheckFecProjection {
  const { op, value, unit } = check.threshold;
  const semantics = opToSemantics(check);
  const unitSuffix = unit.trim().length > 0 ? ` ${unit.trim()}` : '';
  const thresholdSpec: ThresholdSpec = { semantics, value };
  const falsificationSpec: FalsificationSpec = {
    prediction: `${check.primaryMetric} ${op} ${value}${unitSuffix}`,
    metric: check.primaryMetric,
    falsificationThreshold: value,
    thresholdSemantics: semantics,
  };
  return { falsificationSpec, thresholdSpec };
}
