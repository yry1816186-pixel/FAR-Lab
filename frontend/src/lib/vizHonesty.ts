// frontend/src/lib/vizHonesty.ts
// 职责：科学可视化诚实性 lint（UX-VIZ-001）—— 纯规则引擎，无 IO、无 DOM、确定性。
//
// 科学不诚实模式（每条规则对应一种夸大/隐藏）：
//   VIZ-SAMPLE-SIZE  图上聚合值不披露样本量（n=1 冒充可靠估计）
//   VIZ-CI-HIDDEN    有置信区间数据却不渲染（隐藏不确定性）
//   VIZ-NO-CI-QUIET  无 CI 且不披露原因（静默略过不确定性）
//   VIZ-CI-INVERTED  CI 上下界倒置（数据形状非法仍渲染）
//   VIZ-A11Y-LABEL   图表无可访问名称（role/aria 缺失）
//   VIZ-A11Y-CHANNEL 颜色是唯一编码通道（色盲不可辨）
//
// 防剧场绑定：ChartHonestySpec 声明的渲染事实（nRendered/ciRendered/…）必须与组件真实
// 渲染一致 —— 由组件测试双向锁定（spec lint 全过 + 渲染文本断言），spec 与渲染脱钩即测试红。
//
// 本引擎不能证明的：语义正确性（数值算得对不对）、视觉可读性、完整 WCAG 合规。

/** 图上数值的统计性质。 */
export type MetricKind = 'count' | 'rate' | 'mean' | 'ordinal';

export interface ChartStatisticalSpec {
  /** 每个绘制主体的独立运行数（n=1 表示单次运行，不冒充重复测量）。null = 未知。 */
  readonly runsPerSubject: number | null;
  /** n 是否真实渲染在图面上（轴标签/字幕均可）。 */
  readonly nRendered: boolean;
  /** 置信区间（与主体同单位的 [lo, hi]）；null = 无 CI。 */
  readonly ci: readonly [number, number] | null;
  /** CI 是否渲染（误差棒/区间带/数值标注）。 */
  readonly ciRendered: boolean;
  /** 无 CI 的披露理由（ci=null 时必填——「为什么没有」必须说出口）。 */
  readonly noCiReason: string | null;
  /** 数值种类。 */
  readonly metricKind: MetricKind;
}

export interface ChartA11ySpec {
  /** svg 带 role="img"。 */
  readonly roleImg: boolean;
  /** 非空可访问名称（aria-label / <title>）。 */
  readonly ariaLabel: string | null;
  /** 颜色之外存在第二编码通道（文本标签/形状/位置）。 */
  readonly nonColorChannel: boolean;
}

export interface ChartHonestySpec {
  readonly id: string;
  /** 是否比较多个主体（基线对比图——CI 披露义务来源）。 */
  readonly comparative: boolean;
  readonly statistical: ChartStatisticalSpec;
  readonly a11y: ChartA11ySpec;
}

export type VizRuleId =
  | 'VIZ-SAMPLE-SIZE'
  | 'VIZ-CI-HIDDEN'
  | 'VIZ-NO-CI-QUIET'
  | 'VIZ-CI-INVERTED'
  | 'VIZ-A11Y-LABEL'
  | 'VIZ-A11Y-CHANNEL';

export interface VizViolation {
  readonly rule: VizRuleId;
  readonly chartId: string;
  readonly detail: string;
}

/** 单图 lint。确定性：同 spec 同违规列表（按 rule 字典序稳定输出）。 */
export function lintChart(spec: ChartHonestySpec): VizViolation[] {
  const violations: VizViolation[] = [];
  const s = spec.statistical;

  if (s.runsPerSubject === null) {
    violations.push({
      rule: 'VIZ-SAMPLE-SIZE',
      chartId: spec.id,
      detail: 'runsPerSubject unknown — an aggregate chart must know and disclose its run count',
    });
  } else if (s.runsPerSubject < 0 || !Number.isInteger(s.runsPerSubject)) {
    violations.push({
      rule: 'VIZ-SAMPLE-SIZE',
      chartId: spec.id,
      detail: `runsPerSubject must be a non-negative integer, got ${s.runsPerSubject}`,
    });
  } else if (s.runsPerSubject === 0) {
    violations.push({
      rule: 'VIZ-SAMPLE-SIZE',
      chartId: spec.id,
      detail: 'no data (0 runs) — render an empty state, not a chart of fabricated aggregates',
    });
  } else if (!s.nRendered) {
    violations.push({
      rule: 'VIZ-SAMPLE-SIZE',
      chartId: spec.id,
      detail: `sample size not rendered: n=${s.runsPerSubject} must be disclosed on the chart`,
    });
  }

  if (spec.comparative) {
    if (s.ci !== null) {
      const [lo, hi] = s.ci;
      if (lo > hi) {
        violations.push({
          rule: 'VIZ-CI-INVERTED',
          chartId: spec.id,
          detail: `CI bounds inverted: [${lo}, ${hi}]`,
        });
      } else if (!s.ciRendered) {
        violations.push({
          rule: 'VIZ-CI-HIDDEN',
          chartId: spec.id,
          detail: 'CI data available but not rendered — hiding uncertainty exaggerates precision',
        });
      }
    } else if (s.noCiReason === null || s.noCiReason.trim().length === 0) {
      violations.push({
        rule: 'VIZ-NO-CI-QUIET',
        chartId: spec.id,
        detail: 'no CI and no disclosure why — comparative charts must state why uncertainty is absent',
      });
    }
  }

  if (!spec.a11y.roleImg || spec.a11y.ariaLabel === null || spec.a11y.ariaLabel.trim().length === 0) {
    violations.push({
      rule: 'VIZ-A11Y-LABEL',
      chartId: spec.id,
      detail: 'chart lacks an accessible name (svg role="img" + non-empty aria-label)',
    });
  }
  if (!spec.a11y.nonColorChannel) {
    violations.push({
      rule: 'VIZ-A11Y-CHANNEL',
      chartId: spec.id,
      detail: 'color is the only encoding channel — add text/shape/position channel',
    });
  }

  return violations.sort((a, b) => a.rule.localeCompare(b.rule) || a.detail.localeCompare(b.detail));
}

/** 多图 lint 汇总（跨图稳定序：chartId → rule）。 */
export function lintCharts(specs: readonly ChartHonestySpec[]): VizViolation[] {
  return specs
    .flatMap((spec) => lintChart(spec))
    .sort((a, b) => a.chartId.localeCompare(b.chartId) || a.rule.localeCompare(b.rule));
}

/** 渲染诚实性字幕（组件统一使用——spec 与渲染同源，防脱钩）。 */
export function renderHonestyCaption(statistical: ChartStatisticalSpec): string {
  const n = statistical.runsPerSubject;
  const nPart = n === null ? 'n unknown' : `n=${n} run${n === 1 ? '' : 's'} per baseline`;
  if (statistical.ci !== null && statistical.ciRendered) {
    const [lo, hi] = statistical.ci;
    return `${nPart} · 95% CI [${lo}, ${hi}]`;
  }
  const reason = statistical.noCiReason ?? 'no CI computed';
  return `${nPart} · ${reason}`;
}
