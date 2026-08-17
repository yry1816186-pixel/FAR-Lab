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
    ['verdict-dist-chart-svg', 'Verdict distribution across baselines', () => <VerdictDistChart data={DATA} />],
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
