import type { ThresholdSpec } from './types.ts';

export interface ThresholdEvaluation {
  readonly supportsClaim: boolean;
  readonly refutesClaim: boolean;
}

/**
 * 阈值边界语义（boundaryPolicy = INCLUSIVE · 显式裁决 D13 · 依据 DEBT-12）。
 *
 * `gt` 在 metricValue === spec.value 时 supportsClaim = true（即 `>=`）；`lt` 同理用 `<=`。
 *
 * 裁决依据：DEBT-12（2026-08-01 偿还）按 Popper 删除精确等值语义 eq/ne——「精确等值无可证伪语义」。
 * 边界点 metric === threshold 正是精确等值，按同一 Popper 逻辑它是不可证伪的测度零点/约定点。
 * 在该不可证伪点 engine 取 inclusive convention（给 claimant 留疑），与 DEBT-12 推理一致。
 *
 * 设计权衡（不改为 strict 的理由）：
 *   - 改 strict(`>`) 会改变边界裁决结果，触及 §7 受保护裁决状态，须 ADR + 序列化制品迁移 + 回滚。
 *   - 名称 `gt`/`lt` 在数学习惯中暗示 strict，但本系统语义枚举只有 gt/lt/range（无 ge/gt-strict），
 *     故 `gt` 是「大于」的唯一表达，inclusive 是其既定实现。命名直觉 vs 实现的张力由本注释显式消解。
 *   - 连续指标下边界是测度零事件（几乎不命中）；离散指标下 inclusive 给 claimant 留疑是保守可辩护选择。
 *
 * 边界特征测试（executable spec）：tests/falsifiability/threshold_boundary.test.ts 编码本行为。
 * 新增阈值语义消费者前须先裁决是否继承本 inclusive 策略（FF-16 reopen_trigger）。
 */
export function evaluateThreshold(metricValue: number, spec: ThresholdSpec): ThresholdEvaluation {
  if (!Number.isFinite(metricValue)) {
    throw new Error(`evaluateThreshold: metricValue must be finite, received ${metricValue}`);
  }

  let supportsClaim: boolean;
  switch (spec.semantics) {
    case 'gt':
      if (spec.value === undefined || !Number.isFinite(spec.value)) {
        throw new Error('evaluateThreshold: gt semantics requires finite value');
      }
      // INCLUSIVE（boundaryPolicy D13）：metric === value 时 supportsClaim = true（见函数头裁决）
      supportsClaim = metricValue >= spec.value;
      break;
    case 'lt':
      if (spec.value === undefined || !Number.isFinite(spec.value)) {
        throw new Error('evaluateThreshold: lt semantics requires finite value');
      }
      // INCLUSIVE（boundaryPolicy D13）：metric === value 时 supportsClaim = true（见函数头裁决）
      supportsClaim = metricValue <= spec.value;
      break;
    case 'range':
      if (
        spec.lower === undefined ||
        spec.upper === undefined ||
        !Number.isFinite(spec.lower) ||
        !Number.isFinite(spec.upper)
      ) {
        throw new Error('evaluateThreshold: range semantics requires finite lower and upper');
      }
      if (spec.lower > spec.upper) {
        throw new Error('evaluateThreshold: range lower must be less than or equal to upper');
      }
      supportsClaim = metricValue >= spec.lower && metricValue <= spec.upper;
      break;
    default:
      throw new Error('evaluateThreshold: unreachable threshold semantics');
  }

  return {
    supportsClaim,
    refutesClaim: !supportsClaim,
  };
}
