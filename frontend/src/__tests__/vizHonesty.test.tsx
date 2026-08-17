// frontend/src/__tests__/vizHonesty.test.tsx
// UX-VIZ-001 验收：visualization lint + golden datasets + edge cases。
// 纯引擎测试（无 DOM）；组件↔spec 绑定测试见 ablationHonesty.test.tsx。

import { describe, it, expect } from 'vitest';
import {
  lintChart,
  lintCharts,
  renderHonestyCaption,
  type ChartHonestySpec,
} from '@/lib/vizHonesty';

// ============================================================
// Golden datasets —— 诚实/不诚实 exemplar（规则语义的锚定样本）
// ============================================================

/** 诚实基线对比图：n=1 披露 + 无 CI 理由说出口 + a11y 双通道。 */
export const goldenHonestySpec: ChartHonestySpec = {
  id: 'golden/honest-ablation-bar',
  comparative: true,
  statistical: {
    runsPerSubject: 1,
    nRendered: true,
    ci: null,
    ciRendered: false,
    noCiReason: 'single run per baseline: CI not computable from n=1',
    metricKind: 'count',
  },
  a11y: { roleImg: true, ariaLabel: 'Bar chart of iteration counts across baselines', nonColorChannel: true },
};

/** 反面 golden：六种不诚实各一例（每例只故意违反自己那条规则）。 */
export const goldenDishonestySpecs: readonly { readonly name: string; readonly rule: string; readonly spec: ChartHonestySpec }[] = [
  {
    name: 'sample size unknown',
    rule: 'VIZ-SAMPLE-SIZE',
    spec: { ...goldenHonestySpec, id: 'bad/n-unknown', statistical: { ...goldenHonestySpec.statistical, runsPerSubject: null } },
  },
  {
    name: 'sample size hidden',
    rule: 'VIZ-SAMPLE-SIZE',
    spec: { ...goldenHonestySpec, id: 'bad/n-hidden', statistical: { ...goldenHonestySpec.statistical, nRendered: false } },
  },
  {
    name: 'ci available but hidden',
    rule: 'VIZ-CI-HIDDEN',
    spec: {
      ...goldenHonestySpec,
      id: 'bad/ci-hidden',
      statistical: { ...goldenHonestySpec.statistical, ci: [2.1, 5.4], ciRendered: false },
    },
  },
  {
    name: 'no ci, silent',
    rule: 'VIZ-NO-CI-QUIET',
    spec: { ...goldenHonestySpec, id: 'bad/no-ci-quiet', statistical: { ...goldenHonestySpec.statistical, noCiReason: null } },
  },
  {
    name: 'inverted ci',
    rule: 'VIZ-CI-INVERTED',
    spec: {
      ...goldenHonestySpec,
      id: 'bad/ci-inverted',
      statistical: { ...goldenHonestySpec.statistical, ci: [5.4, 2.1], ciRendered: true },
    },
  },
  {
    name: 'no accessible name',
    rule: 'VIZ-A11Y-LABEL',
    spec: { ...goldenHonestySpec, id: 'bad/a11y-label', a11y: { roleImg: true, ariaLabel: '  ', nonColorChannel: true } },
  },
  {
    name: 'color-only channel',
    rule: 'VIZ-A11Y-CHANNEL',
    spec: { ...goldenHonestySpec, id: 'bad/a11y-channel', a11y: { roleImg: true, ariaLabel: 'chart', nonColorChannel: false } },
  },
];

describe('vizHonesty: golden datasets（规则语义锚定）', () => {
  it('诚实 golden 零违规', () => {
    expect(lintChart(goldenHonestySpec)).toEqual([]);
  });

  for (const { name, rule, spec } of goldenDishonestySpecs) {
    it(`反面 golden「${name}」命中 ${rule} 且仅命中该规则`, () => {
      const violations = lintChart(spec);
      expect(violations.length).toBeGreaterThanOrEqual(1);
      expect(violations.every((v) => v.rule === rule)).toBe(true);
    });
  }
});

describe('vizHonesty: edge cases', () => {
  it('n=0：空数据必须是空态而非图表（fabricated aggregates）', () => {
    const violations = lintChart({
      ...goldenHonestySpec,
      statistical: { ...goldenHonestySpec.statistical, runsPerSubject: 0, nRendered: true },
    });
    expect(violations.some((v) => v.rule === 'VIZ-SAMPLE-SIZE' && v.detail.includes('no data'))).toBe(true);
  });

  it('n 非整数/负数拒绝', () => {
    for (const bad of [-1, 1.5]) {
      const violations = lintChart({
        ...goldenHonestySpec,
        statistical: { ...goldenHonestySpec.statistical, runsPerSubject: bad },
      });
      expect(violations.some((v) => v.rule === 'VIZ-SAMPLE-SIZE' && v.detail.includes('integer'))).toBe(true);
    }
  });

  it('退化 CI [x, x] 合法（点估计零宽区间）', () => {
    expect(
      lintChart({
        ...goldenHonestySpec,
        statistical: { ...goldenHonestySpec.statistical, ci: [3, 3], ciRendered: true },
      }),
    ).toEqual([]);
  });

  it('noCiReason 空白字符串等同未披露', () => {
    const violations = lintChart({
      ...goldenHonestySpec,
      statistical: { ...goldenHonestySpec.statistical, noCiReason: '   ' },
    });
    expect(violations.some((v) => v.rule === 'VIZ-NO-CI-QUIET')).toBe(true);
  });

  it('非比较图（单主体）无 CI 披露义务', () => {
    const violations = lintChart({
      ...goldenHonestySpec,
      comparative: false,
      statistical: { ...goldenHonestySpec.statistical, noCiReason: null, nRendered: false },
    });
    expect(violations.every((v) => v.rule !== 'VIZ-NO-CI-QUIET')).toBe(true);
    expect(violations.some((v) => v.rule === 'VIZ-SAMPLE-SIZE')).toBe(true); // n 义务仍在
  });

  it('ariaLabel 空白等同缺失', () => {
    expect(
      lintChart({ ...goldenHonestySpec, a11y: { roleImg: false, ariaLabel: null, nonColorChannel: true } }).some(
        (v) => v.rule === 'VIZ-A11Y-LABEL',
      ),
    ).toBe(true);
  });
});

describe('vizHonesty: lintCharts 汇总与确定性', () => {
  it('跨图汇总按 chartId+rule 稳定排序，同输入字节等同', () => {
    const specs = [goldenHonestySpec, ...goldenDishonestySpecs.map((g) => g.spec)];
    const a = JSON.stringify(lintCharts(specs));
    const b = JSON.stringify(lintCharts([...specs].reverse()));
    expect(a).toEqual(b); // 顺序无关 → 输出确定
    expect(JSON.parse(a).length).toBeGreaterThan(0);
  });
});

describe('renderHonestyCaption：spec 与字幕同源', () => {
  it('n=1 单次运行措辞', () => {
    expect(renderHonestyCaption(goldenHonestySpec.statistical)).toBe(
      'n=1 run per baseline · single run per baseline: CI not computable from n=1',
    );
  });

  it('多运行 + CI 渲染措辞', () => {
    expect(
      renderHonestyCaption({ ...goldenHonestySpec.statistical, runsPerSubject: 5, ci: [2.1, 5.4], ciRendered: true }),
    ).toBe('n=5 runs per baseline · 95% CI [2.1, 5.4]');
  });
});
