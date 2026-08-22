import { createHash } from 'node:crypto';
import type { PlanDeviation, ResearchPlan, TestSpec } from '../../domain/index.js';
import { newId } from '../../domain/index.js';

/**
 * Wave-S deterministic checks over the structured preregistration layer (plan.ts g1):
 * predicate interval V&V (g2, decision-table lineage — Vanthienen/Prologa/DMN: interval/
 * discrete lattices admit polynomial completeness/conflict/redundancy checks, no SAT) and
 * the Platt/Chamberlin prediction conflict matrix (g3). Free-text-only plans get ONE
 * advisory warning, never errors — qualitative plans are legitimate; the structured layer
 * is audited exactly when it exists.
 */

export interface StructuredCheckInput {
  hypothesisIds: readonly string[];
  metricSpecs: ResearchPlan['metricSpecs'];
  testSpecs: ResearchPlan['testSpecs'];
  predictions: ResearchPlan['predictions'];
  expectedInfoGain?: ResearchPlan['expectedInfoGain'];
  alternativeBranches: readonly string[];
}

export interface StructuredCheckResult {
  /** Present when the structured layer exists; false for legacy free-text plans. */
  structured: boolean;
  errors: string[];
  warnings: string[];
}

const intervalOf = (t: { threshold?: number; thresholdOp?: string }): readonly [number, number] | null => {
  if (t.threshold === undefined || t.thresholdOp === undefined) return null;
  switch (t.thresholdOp) {
    case '>=': return [t.threshold, Number.POSITIVE_INFINITY];
    case '>': return [t.threshold, Number.POSITIVE_INFINITY]; // open/closed immaterial for overlap
    case '<=': return [Number.NEGATIVE_INFINITY, t.threshold];
    case '<': return [Number.NEGATIVE_INFINITY, t.threshold];
    default: return null;
  }
};

const overlaps = (a: readonly [number, number], b: readonly [number, number]): boolean =>
  a[0] <= b[1] && b[0] <= a[1];

export const checkStructuredPreregistration = (
  plan: StructuredCheckInput,
  knownHypothesisIds: Iterable<string>,
): StructuredCheckResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const structured =
    plan.metricSpecs.length > 0 || plan.testSpecs.length > 0 || plan.predictions.length > 0;
  if (!structured) {
    return {
      structured: false,
      errors,
      warnings: [
        '计划未含结构化预注册层（metricSpecs/testSpecs/predictions）——自由文本判据不可机器审计，建议补齐（咨询位，不阻断）',
      ],
    };
  }

  const known = new Set(knownHypothesisIds);
  const metricNames = new Set<string>();
  for (const m of plan.metricSpecs) {
    if (metricNames.has(m.name)) errors.push(`metricSpecs 名称重复：${m.name}`);
    metricNames.add(m.name);
  }
  const primaryCount = plan.metricSpecs.filter((m) => m.role === 'primary').length;
  if (plan.testSpecs.length > 0 && primaryCount !== 1) {
    warnings.push(`primary 指标应为恰好 1 个（single_primary 纪律），当前 ${primaryCount} 个`);
  }

  // g2 — reference integrity + direction/threshold contradictions + interval V&V.
  for (const [i, t] of plan.testSpecs.entries()) {
    if (!metricNames.has(t.metric)) errors.push(`testSpecs[${i}]「${t.id}」引用未定义的 metric：${t.metric}`);
    for (const h of t.hypothesisIds) {
      if (!known.has(h)) errors.push(`testSpecs[${i}]「${t.id}」引用不存在的假设：${h}`);
    }
    if (t.statistic !== 'descriptive' && t.threshold === undefined) {
      warnings.push(`testSpecs[${i}]「${t.id}」无 threshold——判据无法谓词化，只能作描述性检验`);
    }
    const metric = plan.metricSpecs.find((m) => m.name === t.metric);
    if (metric !== undefined && t.thresholdOp !== undefined && t.threshold !== undefined) {
      const rising = t.thresholdOp === '>=' || t.thresholdOp === '>';
      if (metric.direction === 'higher_better' && t.prediction === 'supports' && !rising) {
        errors.push(`testSpecs[${i}]「${t.id}」方向矛盾：higher_better 指标的 supports 判据须为「≥/>阈值」`);
      }
      if (metric.direction === 'higher_better' && (t.prediction === 'weakens' || t.prediction === 'excludes') && rising) {
        errors.push(`testSpecs[${i}]「${t.id}」方向矛盾：higher_better 指标的 weakens/excludes 判据须为「≤/<阈值」`);
      }
      if (metric.direction === 'lower_better' && t.prediction === 'supports' && rising) {
        errors.push(`testSpecs[${i}]「${t.id}」方向矛盾：lower_better 指标的 supports 判据须为「≤/<阈值」`);
      }
      if (metric.direction === 'lower_better' && (t.prediction === 'weakens' || t.prediction === 'excludes') && !rising) {
        errors.push(`testSpecs[${i}]「${t.id}」方向矛盾：lower_better 指标的 weakens/excludes 判据须为「≥/>阈值」`);
      }
    }
    if (t.alpha !== undefined && (t.alpha <= 0 || t.alpha > 0.1)) {
      warnings.push(`testSpecs[${i}]「${t.id}」alpha=${t.alpha} 超出常规 (0, 0.1] 区间——复核错误预算`);
    }
  }

  // g2 — same-metric conflict/redundancy via interval intersection.
  for (let i = 0; i < plan.testSpecs.length; i += 1) {
    for (let j = i + 1; j < plan.testSpecs.length; j += 1) {
      const a = plan.testSpecs[i] as TestSpec;
      const b = plan.testSpecs[j] as TestSpec;
      if (a.metric !== b.metric) continue;
      const sharedHyps = a.hypothesisIds.filter((h) => b.hypothesisIds.includes(h));
      if (sharedHyps.length === 0) continue;
      const ia = intervalOf(a);
      const ib = intervalOf(b);
      if (ia === null || ib === null) continue;
      if (!overlaps(ia, ib)) {
        warnings.push(`testSpecs「${a.id}」与「${b.id}」在同一指标 ${a.metric} 上的阈值区间不相交——其中之一可能不可达`);
      } else if (a.prediction !== b.prediction) {
        warnings.push(`testSpecs「${a.id}」（${a.prediction}）与「${b.id}」（${b.prediction}）区间重叠且预测不同——可能同时触发，裁决规则需显式消歧（hitPolicy）`);
      }
    }
  }

  // g3 — prediction conflict matrix: genuine competition = same (observable, condition),
  // DIFFERENT expectedRelation across hypotheses.
  for (const [i, p] of plan.predictions.entries()) {
    if (!known.has(p.hypothesisId)) errors.push(`predictions[${i}] 引用不存在的假设：${p.hypothesisId}`);
  }
  const groups = new Map<string, Map<string, string>>();
  for (const p of plan.predictions) {
    const key = `${p.observable.trim().toLowerCase()}||${p.condition.trim().toLowerCase()}`;
    const row = groups.get(key) ?? new Map<string, string>();
    row.set(p.hypothesisId, p.expectedRelation);
    groups.set(key, row);
  }
  let competingPairs = 0;
  for (const row of groups.values()) {
    const relations = [...row.values()];
    for (let i = 0; i < relations.length; i += 1) {
      for (let j = i + 1; j < relations.length; j += 1) {
        if (relations[i] !== relations[j]) competingPairs += 1;
      }
    }
  }
  if (plan.hypothesisIds.length > 1 && competingPairs === 0) {
    warnings.push(
      '预测冲突矩阵：假设间不存在「同 observable+condition、不同预期关系」的判别性预测——竞争性未在机器层确立（可能是同向假设）',
    );
  }
  const predicted = new Set(plan.predictions.map((p) => p.hypothesisId));
  for (const h of plan.hypothesisIds) {
    if (!predicted.has(h)) {
      warnings.push(`假设 ${h} 无结构化预测（outcome→消除映射缺失）——non-crucial experiments only`);
    }
  }

  // VOI discipline (s2): a plan that discriminates or branches must say what buying the
  // evidence would decide.
  if ((plan.hypothesisIds.length > 1 || plan.alternativeBranches.length > 0) && plan.expectedInfoGain === undefined) {
    errors.push('expectedInfoGain 缺失：多假设/含分支的计划必须给出结构化信息价值块（decisionAtStake/ambiguitySource/discriminatingMetric/expectedSeparation）');
  }

  return { structured: true, errors, warnings };
};

// ---------------------------------------------------------------------------
// g13 — freeze triplet: content hash at registration, deviations, compliance audit.

const CONTENT_OMIT = new Set([
  'id', 'runId', 'createdAt', 'executabilityCheck', 'planHash', 'frozenAt', 'deviations',
]);

/** Stable (key-sorted) JSON so equal content always hashes equal. */
const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
};

export interface PlanFreeze {
  planHash: string;
  frozenAt: string;
}

/** SHA-256 over the plan's content (server/audit fields excluded) at registration time. */
export const planContentHash = (plan: ResearchPlan): string => {
  const content = Object.fromEntries(
    Object.entries(plan).filter(([k]) => !CONTENT_OMIT.has(k)),
  );
  return createHash('sha256').update(stableStringify(content)).digest('hex');
};

export const freezePlan = (plan: ResearchPlan, now: string): PlanFreeze => ({
  planHash: planContentHash(plan),
  frozenAt: now,
});

export interface PlanComplianceAudit {
  registered: boolean;
  compliant: boolean;
  recordedHash?: string;
  currentHash: string;
  deviationCount: number;
  note: string;
}

/** RR stage-2 audit: has the registered plan drifted? Mismatch is REPORTED, never silently
 * repaired — deviations are first-class objects a human (or revision) must account for. */
export const auditPlanCompliance = (plan: ResearchPlan): PlanComplianceAudit => {
  const currentHash = planContentHash(plan);
  if (plan.planHash === undefined) {
    return {
      registered: false,
      compliant: false,
      currentHash,
      deviationCount: plan.deviations.length,
      note: '计划未注册冻结（无 planHash）——RR stage-1 形态不完整',
    };
  }
  const compliant = plan.planHash === currentHash;
  return {
    registered: true,
    compliant,
    recordedHash: plan.planHash,
    currentHash,
    deviationCount: plan.deviations.length,
    note: compliant
      ? '内容哈希与注册时一致'
      : `内容偏离注册版本（${plan.deviations.length} 条已记录偏离）——偏离须有对应 Deviation 对象`,
  };
};

/** Immutable deviation append (the revision loop owns the WHY; this only records). */
export const recordPlanDeviation = (
  plan: ResearchPlan,
  dev: Omit<PlanDeviation, 'id' | 'at'> & { at: string },
): ResearchPlan => ({
  ...plan,
  deviations: [...plan.deviations, { ...dev, id: newId('dev') }],
});

// ---------------------------------------------------------------------------
// g6 — cross-version α-spending ledger: re-testing the same hypothesis across plan
// versions consumes error budget; the spend is accumulated and disclosed, not reset.

export interface AlphaSpendRow {
  hypothesisId: string;
  versions: number;
  totalAlpha: number;
}

export const alphaSpendLedger = (
  plans: readonly Pick<ResearchPlan, 'hypothesisIds' | 'testSpecs'>[],
): AlphaSpendRow[] => {
  const byHypothesis = new Map<string, { versions: number; totalAlpha: number }>();
  for (const plan of plans) {
    const perHypothesisAlpha = new Map<string, number>();
    for (const t of plan.testSpecs) {
      if (t.alpha === undefined) continue;
      for (const h of t.hypothesisIds) {
        perHypothesisAlpha.set(h, (perHypothesisAlpha.get(h) ?? 0) + t.alpha);
      }
    }
    for (const h of plan.hypothesisIds) {
      const row = byHypothesis.get(h) ?? { versions: 0, totalAlpha: 0 };
      row.versions += 1;
      row.totalAlpha += perHypothesisAlpha.get(h) ?? 0;
      byHypothesis.set(h, row);
    }
  }
  return [...byHypothesis.entries()]
    .map(([hypothesisId, r]) => ({ hypothesisId, ...r }))
    .sort((a, b) => b.totalAlpha - a.totalAlpha);
};
