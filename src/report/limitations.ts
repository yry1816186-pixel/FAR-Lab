// src/report/limitations.ts
// 职责：CORE-LIMITS-001 逐结论限制项 —— 每个重要结论必须说明不能证明什么。
// 确定性模板按裁决值分支，由 falsificationSpec 具体化（不泛化）；UNTESTED 豁免。

import type { VerdictNode } from '../falsifiability/types.ts';
import type { LimitationItem } from './types.ts';

/**
 * 逐结论限制项生成：每个非 UNTESTED 裁决节点一条「本结论不能证明什么」。
 * UNTESTED 豁免：无结论则无限制声明义务（untestedReason 已自述）。
 */
export function buildClaimLimitations(verdictNodes: readonly VerdictNode[]): LimitationItem[] {
  const items: LimitationItem[] = [];
  for (const node of verdictNodes) {
    if (node.verdict === 'UNTESTED') continue;
    const prediction = node.falsificationSpec.prediction;
    const metric = node.falsificationSpec.metric;
    switch (node.verdict) {
      case 'CONFIRMED':
        items.push({
          claimId: node.verdictId,
          cannotProve: `cannot prove external validity beyond the tested scope — "${prediction}" was verified on metric '${metric}' only`,
          reason: 'verification binds the preregistered threshold under the tested inputs; extrapolation is out of scope',
        });
        break;
      case 'REFUTED':
        items.push({
          claimId: node.verdictId,
          cannotProve: `cannot rule out that a corrected measurement would satisfy "${prediction}" (metric '${metric}')`,
          reason: 'refutation reflects the recorded evidence set; measurement-error or scope-shifted replications are not excluded',
        });
        break;
      case 'INCONCLUSIVE':
        items.push({
          claimId: node.verdictId,
          cannotProve: `cannot prove either direction of "${prediction}" (metric '${metric}')`,
          reason: 'significant evidence conflicts or never reached the decision threshold — both directions remain open',
        });
        break;
      case 'DEGRADED_SCOPE':
        items.push({
          claimId: node.verdictId,
          cannotProve: `cannot prove "${prediction}" at the original scope (metric '${metric}')`,
          reason: node.scopeSlipText !== null && node.scopeSlipText.length > 0
            ? `scope degraded: ${node.scopeSlipText}`
            : 'verdict holds only within the narrowed scope actually verified',
        });
        break;
    }
  }
  return items;
}

/** 覆盖率：非 UNTESTED 节点中被 limitation 覆盖的比例（验收口径 = 100%；未覆盖 id 可枚举）。 */
export function claimLimitationCoverage(
  verdictNodes: readonly Pick<VerdictNode, 'verdictId' | 'verdict'>[],
  items: readonly LimitationItem[],
): { total: number; covered: number; uncoveredClaimIds: readonly string[] } {
  const required = verdictNodes.filter((n) => n.verdict !== 'UNTESTED').map((n) => n.verdictId);
  const coveredSet = new Set(items.map((i) => i.claimId));
  const uncovered = required.filter((id) => !coveredSet.has(id));
  return { total: required.length, covered: required.length - uncovered.length, uncoveredClaimIds: uncovered };
}
