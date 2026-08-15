// src/planning/risk.ts
// 职责：P0-P4 确定性风险分级。
//
// 判定规则（纯函数，无 IO）：
//   1. 不可逆（irreversible）→ P4（双重授权 + 显式回滚 + 完整生命周期）
//   2. 破坏性（destructive）→ P3/P4（模糊向上取整）
//   3. trust-kernel / 新 CLI/API / schema migration → P3（授权 + 完整生命周期）
//   4. 跨模块（3+ 文件 / 核心模块）→ P3（广影响）
//   5. 可逆有界写 → P2（回滚声明）
//   6. 文档/低风险可逆 → P1；纯只读 → P0
//   7. ambiguous → 向上取整 +1（P4 封顶）—— 模糊时按更高级别处理

import type { RiskLevel, RiskSignals } from './types.ts';

export interface RiskGradeResult {
  readonly level: RiskLevel;
  /** 命中规则的说明（决策可审计）。 */
  readonly reasons: readonly string[];
}

const LEVEL_INDEX: Readonly<Record<RiskLevel, number>> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
};

/** 模糊向上取整表（P4 封顶——P4 不可再升）。 */
const BUMP_TABLE: Readonly<Record<RiskLevel, RiskLevel>> = {
  P0: 'P1',
  P1: 'P2',
  P2: 'P3',
  P3: 'P4',
  P4: 'P4',
};

function maxLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
  return LEVEL_INDEX[a] >= LEVEL_INDEX[b] ? a : b;
}

function bump(level: RiskLevel): RiskLevel {
  return BUMP_TABLE[level];
}

/**
 * 确定性风险分级。输入为信号对象（谁调用谁负责填真信号——禁止为降级而隐瞒）。
 * 返回 P0-P4 + 命中规则（每条规则带触发信号名）。
 */
export function gradeRisk(signals: RiskSignals): RiskGradeResult {
  const reasons: string[] = [];

  // 规则 1：不可逆 —— 最高优先级（P4）
  if (signals.irreversible) {
    reasons.push('P4: irreversible (push/tag/publish/production/force-push) — dual authorization + explicit rollback');
    return { level: 'P4', reasons };
  }

  // 规则 2：破坏性（广影响 / 批量删 / 编辑现有 migration）
  if (signals.destructive) {
    reasons.push('P3: destructive (broad impact / bulk delete / editing existing migration)');
  }

  // 规则 3：trust-kernel / 新 CLI/API / schema migration
  if (signals.touchesTrustKernel) {
    reasons.push('P3: touches trust-kernel (Claim/FEC/Evidence/Verdict/Proof) — additive only + cannotProveStatement');
  }
  if (signals.newCliOrApi) {
    reasons.push('P3: new CLI command / new API route / new schema migration');
  }

  // 规则 4：跨模块广影响
  if (signals.crossModule) {
    reasons.push('P3: cross-module (3+ files / core module)');
  }

  const hasP3Signal =
    signals.destructive || signals.touchesTrustKernel || signals.newCliOrApi || signals.crossModule;
  if (hasP3Signal) {
    const level: RiskLevel = 'P3';
    if (signals.ambiguous) {
      reasons.push('ambiguous: rounded up → P4');
      return { level: 'P4', reasons };
    }
    return { level, reasons };
  }

  // 规则 5/6：可逆写 / 文档 / 只读
  let base: RiskLevel;
  if (signals.boundedWrite) {
    base = 'P2';
    reasons.push('P2: reversible bounded write (single-file fix / new test) — rollback declaration');
  } else if (signals.docOnly) {
    base = 'P1';
    reasons.push('P1: low-risk reversible (docs / comments)');
  } else if (signals.readOnly) {
    base = 'P0';
    reasons.push('P0: pure read-only investigation');
  } else {
    // 无任何写信号但有动作 → 保守按 P2 处理（可逆有界写下限）
    base = 'P2';
    reasons.push('P2: fallback (write signal unspecified — treated as reversible bounded write)');
  }

  if (signals.ambiguous) {
    reasons.push(`ambiguous: rounded up ${base} → ${bump(base)}`);
    return { level: bump(base), reasons };
  }
  return { level: base, reasons };
}

/** 语义化对比：a 是否严格高于 b（用于"风险升级暂停重分级"判定）。 */
export function isHigherRisk(a: RiskLevel, b: RiskLevel): boolean {
  return LEVEL_INDEX[a] > LEVEL_INDEX[b];
}

export function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return maxLevel(a, b);
}
