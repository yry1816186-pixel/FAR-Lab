// frontend/src/__tests__/ablationHonesty.test.tsx
// UX-VIZ-001 组件绑定层：四个消融图表的诚实性 spec lint 全过，且 spec 声明的
// 渲染事实（nRendered/a11y/nonColorChannel）与真实渲染一致——spec 与渲染脱钩即红。
// 防剧场：仅 lint 过 ≠ 通过；必须渲染出可查询的披露文本与可访问名称。

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  ABLATION_CHART_HONESTY_SPECS,
  IterationBarChart,
  MetricBarChart,
  VerdictDistChart,
  FalsifiabilityChart,
} from '@/components/AblationCharts';
import { lintChart } from '@/lib/vizHonesty';
import type { HypothesizeResponse, VerdictValue } from '@/lib/types';
import type { BaselineData } from '@/components/AblationCharts';

function makeResponse(runId: string, verdict: VerdictValue = 'CONFIRMED'): HypothesizeResponse {
  return {
    loopState: {
      runId,
      iterationsCompleted: 5,
      terminated: true,
      terminationReason: 'feedback_converged',
      artifacts: [],
      verdictNode: {
        verdictId: `v-${runId}`,
        evidenceId: `ev-${runId}`,
        parentVerdictId: null,
        nodeKind: 'hypothesis',
        verdict,
        falsificationSpec: {
          prediction: 'test prediction',
          metric: 'accuracy',
          falsificationThreshold: 0.8,
          thresholdSemantics: 'gt',
        },
        thresholdSpec: null,
        metricValue: 0.92,
        conflictingEvidenceCount: 0,
        scopeSlipText: null,
        untestedReason: null,
        sourceAnchor: {},
      } as HypothesizeResponse['loopState']['verdictNode'],
      error: null,
    },
    graphSubtree: { nodes: [], edges: [] } as unknown as HypothesizeResponse['graphSubtree'],
    honestVerdict: null,
    reproHash: `hash-${runId}`,
  };
}

const DATA: readonly BaselineData[] = [
  { key: 'random', label: 'Random', response: makeResponse('run-random'), isError: false },
  { key: 'search', label: 'Search', response: makeResponse('run-search', 'INCONCLUSIVE'), isError: false },
];

describe('UX-VIZ-001: 消融图表诚实性（lint + 渲染绑定）', () => {
  it('四图 spec 全部 lint 零违规', () => {
    expect(ABLATION_CHART_HONESTY_SPECS.length).toBe(4);
    for (const spec of ABLATION_CHART_HONESTY_SPECS) {
      expect(lintChart(spec)).toEqual([]);
    }
  });

  it.each([
    ['iteration-honesty-caption', () => <IterationBarChart data={DATA} />],
    ['metric-honesty-caption', () => <MetricBarChart data={DATA} />],
    ['verdict-honesty-caption', () => <VerdictDistChart data={DATA} />],
    ['falsifiability-honesty-caption', () => <FalsifiabilityChart data={DATA} />],
  ])('%s 渲染 n=1 与无 CI 披露', (_testId, renderChart) => {
    render(renderChart());
    const caption = screen.getByText(/n=1 run per baseline/);
    expect(caption.textContent).toContain('CI not computable from n=1');
  });

  it.each([
    ['iteration-chart-svg', 'Bar chart of iteration counts across baselines', () => <IterationBarChart data={DATA} />],
    ['metric-chart-svg', 'Bar chart of metric values across baselines', () => <MetricBarChart data={DATA} />],
    ['verdict-dist-chart-svg', 'Final verdict comparison across baselines (one run each, categorical — not a score)', () => <VerdictDistChart data={DATA} />],
    ['falsifiability-chart-svg', 'Falsifiability comparison across baselines', () => <FalsifiabilityChart data={DATA} />],
  ])('%s 可访问名称与 spec 声明一致', (svgTestId, expectedLabel, renderChart) => {
    render(renderChart());
    const svg = screen.getByTestId(svgTestId);
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe(expectedLabel); // spec.a11y.ariaLabel 原文
    const spec = ABLATION_CHART_HONESTY_SPECS.find((s) => s.a11y.ariaLabel === expectedLabel);
    expect(spec).toBeDefined();
    expect(spec!.a11y.roleImg).toBe(true);
  });

  it('无有效数据时不渲染披露字幕（空数据必须是空态，不得宣称任何 n）', () => {
    const empty: readonly BaselineData[] = [
      { key: 'random', label: 'Random', response: null, isError: true },
    ];
    const { container } = render(<IterationBarChart data={empty} />);
    expect(container.textContent).not.toMatch(/n=\d/);
  });
});

describe('消融图表诚实性 — 2026-08-18 审计修复（截断轴 / 裁决序数化）', () => {
  // jsdom 无布局:clientWidth=0 → d3 渲染跳过。但 y 定义域在 effect 内计算,
  // 通过注入非零尺寸让渲染走通,再断言轴刻度含 0。
  function withLayout(html: string): string {
    return html;
  }

  it('MetricBarChart y 轴从 0 起（柱高∝数值契约·修复截断轴）', () => {
    // 判别性断言:注入容器尺寸后,度量图 y 轴第一个刻度必须是 0(旧实现为
    // max(0, min-10%range) 的截断值,此测试对旧实现红)。
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return { width: 600, height: 340, top: 0, left: 0, bottom: 340, right: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };
    try {
      const { container } = render(<MetricBarChart data={DATA} />);
      const tickTexts = [...container.querySelectorAll('svg g.tick text')].map((t) => t.textContent ?? '');
      // 网格组带空 tickFormat——只看数值刻度:最小值必须是 0(旧实现为截断基线,此断言对旧码红)
      const numericTicks = tickTexts.map(Number).filter((n) => Number.isFinite(n));
      expect(numericTicks.length).toBeGreaterThan(0);
      // 最小刻度必须是 0(旧截断实现为 max(0,min-10%range)>0,此断言对旧码红)
      expect(Math.min(...numericTicks)).toBe(0);
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
  });

  it('VerdictDistChart 渲染类别点阵而非分数柱（无 verdict→score 高度映射）', () => {
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return { width: 600, height: 340, top: 0, left: 0, bottom: 340, right: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };
    try {
      const { container } = render(<VerdictDistChart data={DATA} />);
      // 点阵标记存在
      const dots = container.querySelectorAll('circle.verdict-dot');
      expect(dots.length).toBe(DATA.length);
      // 旧实现的分数柱(verdict-bar rect)必须不复存在
      expect(container.querySelectorAll('rect.verdict-bar').length).toBe(0);
      // y 轴是 5 个裁决类别名(非 0-4 数值刻度)
      const tickTexts = [...container.querySelectorAll('svg g.tick text')].map((t) => t.textContent ?? '');
      for (const label of ['Confirmed', 'Refuted', 'Inconclusive', 'Degraded', 'Untested']) {
        expect(tickTexts).toContain(label);
      }
      expect(tickTexts).not.toContain('4');
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
    void withLayout;
  });
});
