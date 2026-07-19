/**
 * TESS Harness — C-ASTRO-0001 可证伪检验 + verdict_mapping（spec 11 §3 / spec 12 §3.1 §9）。
 *
 * C-ASTRO-0001（spec 12 §9 / spec 11 §9）：
 *   claim：TIC 光变曲线存在 transit-like 周期信号（天文域 · hypothesis nodeKind · claimType=existence）。
 *   M1 BLS 周期搜索 / M2 odd-even depth / M3 transit SNR / M4 duration consistency + centroid vetting。
 *
 * V1 阈值数字 spec 标"待实测 W3 回填"——本模块把阈值作为**注入参数**，禁 hardcode 最终数值。
 * spec §9 期望落点（Hero Demo）：M1-M3 PASS + M4 WARN → verdict=INCONCLUSIVE（route mixed）。
 *
 * verdict_mapping 5 路径（spec 11 §3）+ F2 优先级：
 *   DEGRADED_SCOPE(1) > REFUTED(2) > INCONCLUSIVE(3) > CONFIRMED(4) > UNTESTED(5)
 *
 * 诚实边界（ASK-9）：mapChecksToVerdict **可**产出 CONFIRMED（机器裁决）；
 * 但上游 ProofEnvelope 密封会按 ASK-9 降级 CONFIRMED→INCONCLUSIVE（见 far_proof/demo_chain）。
 *
 * evo-03 三 claimType 全交付（22 T-W2-06 + 任务 #12）：
 *   - C-ASTRO-0001 existence（本模块）。
 *   - hero-A-001 quantitative（hero_a_harness.ts·MMLU-physics·设计 INCONCLUSIVE via mixed）。
 *   - hero-B-002 causal（hero_b_harness.ts·CoT 幻觉率·经 confounding_integration F6 降级 DEGRADED_SCOPE）。
 *   V1 claimType 覆盖清单见 claim_fixtures.ts（V1_CLAIM_FIXTURE_ROADMAP·3 delivered）。
 *   本模块另导出域无关原语 evaluateOutcome（check 阈值判定）供 hero_a/hero_b 复用（DRY·禁重复实现）。
 *
 * 模型中立。零容忍合规。
 */

import type {
  ScienceCheck,
  ScienceCheckOutcome,
  ScienceThreshold,
  VerdictMappingResult,
  VerdictRoute,
} from './types.ts';
import type { Verdict } from '../schema/enums.ts';

/** C-ASTRO-0001 claim 文本（spec 12 §9）。 */
export const C_ASTRO_0001_CLAIM =
  'TIC lightcurve exhibits a transit-like periodic signal (existence claim · hypothesis node)';

/** C-ASTRO-0001 检验项 id（M1-M4 · spec 12 §3.1）。 */
export const C_ASTRO_CHECK_IDS = ['M1_bls_power', 'M2_odd_even_depth', 'M3_transit_snr', 'M4_duration_centroid'] as const;

/** M1-M4 默认阈值（spec 11 §1.1 / §9 · V1 注入参数，数字标"待实测"的用占位 + 待回填注释）。 */
export const C_ASTRO_DEFAULT_THRESHOLDS: Record<(typeof C_ASTRO_CHECK_IDS)[number], ScienceThreshold> = {
  // M1：BLS power · Bonferroni 校正 α'=0.0125（F8 预登记·spec 12 §3.1）。
  M1_bls_power: { op: '<', value: 0.0125, unit: 'p-value' },
  // M2：odd-even depth diff · spec 11 §1.1 原文 op '<' value 3.0 unit 'sigma'。
  M2_odd_even_depth: { op: '<', value: 3.0, unit: 'sigma' },
  // M3：transit SNR · spec 12 §3.1 注脚"脚本设定待实测"（V1 注入·禁 hardcode 最终值）。
  M3_transit_snr: { op: '>=', value: 7.0, unit: 'sigma' },
  // M4：centroid shift · spec 12 §3.1"待实测"（V1 注入）。
  M4_duration_centroid: { op: '<', value: 1.0, unit: 'pixel' },
};

/** M1-M4 实测值（由 sandbox 执行产出·V1 注入）。 */
export interface CAstroMeasuredValues {
  /** M1 BLS 搜索 p-value（越小越显著）。 */
  readonly blsPValue: number;
  /** M2 odd-even depth 差异（sigma）。 */
  readonly oddEvenDepthDiff: number;
  /** M3 transit SNR（sigma）。 */
  readonly transitSnr: number;
  /** M4 centroid shift（pixel）。 */
  readonly centroidShift: number;
}

/**
 * 根据 M1-M4 默认阈值评估单个检验项的 outcome。
 * 评估语义遵循 threshold.op（<, <=, >, >=, ==）。
 *
 * 域无关（hero_a/hero_b 复用·DRY）：阈值 op 判定 → PASS / WARN（不达阈值）。FAIL 由调用方显式注入
 * （C-ASTRO-0001 全 M-check 经阈值判定只产 PASS/WARN；hero 亦然）。
 */
export function evaluateOutcome(metricValue: number, threshold: ScienceThreshold): ScienceCheckOutcome {
  let passes: boolean;
  switch (threshold.op) {
    case '<':
      passes = metricValue < threshold.value;
      break;
    case '<=':
      passes = metricValue <= threshold.value;
      break;
    case '>':
      passes = metricValue > threshold.value;
      break;
    case '>=':
      passes = metricValue >= threshold.value;
      break;
    case '==':
      passes = metricValue === threshold.value;
      break;
  }
  return passes ? 'PASS' : 'WARN';
}

/**
 * 构造 C-ASTRO-0001 的 M1-M4 检验项（阈值注入·禁 hardcode 最终数值）。
 *
 * @param measured sandbox 执行产出的实测值。
 * @param m4Outcome M4 的 outcome 可由调用方覆盖（spec §9 期望 WARN，但 centroid vetting
 *   常因近邻污染命中 WARN——V1 允许调用方如实注入而非纯阈值判定）。
 * @param thresholds 阈值覆盖（默认 C_ASTRO_DEFAULT_THRESHOLDS）。
 */
export function buildCAstroChecks(
  measured: CAstroMeasuredValues,
  options?: {
    readonly m4Outcome?: ScienceCheckOutcome;
    readonly thresholds?: Partial<Record<(typeof C_ASTRO_CHECK_IDS)[number], ScienceThreshold>>;
  },
): ScienceCheck[] {
  const thresholds = { ...C_ASTRO_DEFAULT_THRESHOLDS, ...(options?.thresholds ?? {}) };

  const m1 = {
    id: 'M1_bls_power',
    label: 'BLS period search',
    primaryMetric: 'bls_power',
    outcome: evaluateOutcome(measured.blsPValue, thresholds.M1_bls_power),
    metricValue: measured.blsPValue,
    threshold: thresholds.M1_bls_power,
    detail: `BLS p-value ${measured.blsPValue} ${thresholds.M1_bls_power.op} ${thresholds.M1_bls_power.value} (Bonferroni α'=0.0125, F8 prereg)`,
  } as const;

  const m2 = {
    id: 'M2_odd_even_depth',
    label: 'odd-even depth consistency',
    primaryMetric: 'odd_even_depth_diff',
    outcome: evaluateOutcome(measured.oddEvenDepthDiff, thresholds.M2_odd_even_depth),
    metricValue: measured.oddEvenDepthDiff,
    threshold: thresholds.M2_odd_even_depth,
    detail: `odd-even depth diff ${measured.oddEvenDepthDiff}σ ${thresholds.M2_odd_even_depth.op} ${thresholds.M2_odd_even_depth.value}σ`,
  } as const;

  const m3 = {
    id: 'M3_transit_snr',
    label: 'transit SNR',
    primaryMetric: 'transit_snr',
    outcome: evaluateOutcome(measured.transitSnr, thresholds.M3_transit_snr),
    metricValue: measured.transitSnr,
    threshold: thresholds.M3_transit_snr,
    detail: `transit SNR ${measured.transitSnr}σ ${thresholds.M3_transit_snr.op} ${thresholds.M3_transit_snr.value}σ`,
  } as const;

  const m4Threshold = thresholds.M4_duration_centroid;
  const m4 = {
    id: 'M4_duration_centroid',
    label: 'duration consistency + centroid vetting',
    primaryMetric: 'centroid_shift',
    outcome: options?.m4Outcome ?? evaluateOutcome(measured.centroidShift, m4Threshold),
    metricValue: measured.centroidShift,
    threshold: m4Threshold,
    detail: `centroid shift ${measured.centroidShift}px ${m4Threshold.op} ${m4Threshold.value}px (centroid vetting often WARNs on neighbor contamination)`,
  } as const;

  return [m1, m2, m3, m4];
}

/**
 * verdict_mapping 5 路径决策（spec 11 §3 · F2 优先级）。
 *
 * 优先级：DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED。
 * integrityFlags 来自 dataset_resolver（scope_narrow / data_missing）。
 *
 * @param checks M1-M4（或任意 ScienceCheck[]）检验结果。
 * @param integrityFlags 数据完整性标志（scope_narrow / data_missing）。
 */
export function mapChecksToVerdict(
  checks: readonly ScienceCheck[],
  integrityFlags: readonly string[] = [],
): VerdictMappingResult {
  const hasScopeNarrow = integrityFlags.includes('scope_narrow');
  const hasDataMissing = integrityFlags.includes('data_missing');
  const hasFail = checks.some((c) => c.outcome === 'FAIL');
  const hasWarn = checks.some((c) => c.outcome === 'WARN');
  const hasPass = checks.some((c) => c.outcome === 'PASS');
  // AT-01 修复：hasSkip 显式捕获 SKIP outcome（原 hasFail/hasWarn/hasPass 均不读 SKIP → [PASS,SKIP] 静默升 CONFIRMED）。
  const hasSkip = checks.some((c) => c.outcome === 'SKIP');
  // all_pass 全量判定（spec 11 §3 all_pass = 全 PASS 无 WARN/FAIL/SKIP）·原 hasPass 存在性判定过宽（AT-01）。
  const allPass = checks.length > 0 && checks.every((c) => c.outcome === 'PASS');

  // F2 优先级 1：scope_narrow → DEGRADED_SCOPE（baseline_exempt / exploratory / 样本不足）。
  if (hasScopeNarrow) {
    return {
      verdict: 'DEGRADED_SCOPE',
      route: 'scope_narrow',
      integrityFlags,
    };
  }

  // F2 优先级 2：any_refute（任一 FAIL）→ REFUTED。
  if (hasFail) {
    return {
      verdict: 'REFUTED',
      route: 'any_refute',
      integrityFlags,
    };
  }

  // F2 优先级 3：mixed（部分 PASS 部分 WARN，无 FAIL）→ INCONCLUSIVE。
  if (hasWarn) {
    return {
      verdict: 'INCONCLUSIVE',
      route: 'mixed',
      integrityFlags,
    };
  }

  // F2 优先级 4：partial_skip（含 PASS 但有 SKIP 未测项，无 WARN/FAIL）→ INCONCLUSIVE（AT-01·SKIP≠PASS·反 theater）。
  // 全 SKIP（无 PASS）落优先级 6；此处仅拦截 [PASS, SKIP] 这种"部分通过部分未测" → 未全覆盖 → 禁升 CONFIRMED。
  if (hasSkip && hasPass) {
    return {
      verdict: 'INCONCLUSIVE',
      route: 'partial_skip',
      integrityFlags,
    };
  }

  // F2 优先级 5：all_pass（全 PASS 无 WARN/FAIL/SKIP）→ CONFIRMED（bounded support）。
  // 注：ASK-9 上游密封会降级 CONFIRMED→INCONCLUSIVE（机器不可终审）。
  if (allPass) {
    return {
      verdict: 'CONFIRMED',
      route: 'all_pass',
      integrityFlags,
    };
  }

  // F2 优先级 6：全 SKIP / data_missing / 空 checks → UNTESTED。
  void hasDataMissing;
  return {
    verdict: 'UNTESTED',
    route: 'data_missing',
    integrityFlags,
  };
}

/** 便利：route → verdict 映射表（测试 + 文档用）。 */
export const ROUTE_TO_VERDICT: Readonly<Record<VerdictRoute, Verdict>> = {
  all_pass: 'CONFIRMED',
  any_refute: 'REFUTED',
  data_missing: 'UNTESTED',
  scope_narrow: 'DEGRADED_SCOPE',
  mixed: 'INCONCLUSIVE',
  // AT-01：partial_skip → INCONCLUSIVE（含 PASS 但有 SKIP 未测项 → 未全覆盖 → 不升 CONFIRMED）。
  partial_skip: 'INCONCLUSIVE',
};
