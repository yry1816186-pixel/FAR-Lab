/**
 * AblationCharts.tsx —— 消融实验可视化图表组件。
 *
 * 使用 D3.js 渲染消融实验中各基线的对比图表：
 *   - 迭代次数对比柱状图
 *   - 指标值对比柱状图
 *   - 裁决分布堆叠图
 *
 * 颜色统一经 lib/chartColors 单一出口（消费 --verdict-* / --border /
 * --muted-foreground token，暗色自适应，D-03 销账），本文件不再自写 hsl。
 * 所有图表在 useEffect 中通过同步 D3 tick 渲染，无 rAF 依赖，便于测试。
 *
 * 类型安全（零容忍#4）：filter 后 d3 回调内不使用 `d.response!` 非空断言——
 * 用 `hasValidResponse` 类型谓词从源头收窄 `response` 为非 null；MetricBarChart
 * 额外用 `flatMap`+守卫派生 `MetricDatum`，把 `verdictNode.metricValue` 收窄为 number。
 */

import { useRef, useEffect } from 'react';

import { renderHonestyCaption, type ChartHonestySpec, type ChartStatisticalSpec } from '@/lib/vizHonesty';
import * as d3 from 'd3';
import type { HypothesizeResponse, VerdictValue } from '@/lib/types';
import {
  baselineChartColor,
  verdictChartFill,
  chartGridColor,
  chartTextColor,
  CHART_NEUTRAL_FILL,
} from '@/lib/chartColors';

// ---------------------------------------------------------------------------
// 取色：全部经 lib/chartColors 单一出口（主题感知 + token 消费，暗色自适应）。
// 已知边界：图表不监听主题切换——主题翻转后需数据变化或重挂载才重绘（backlog）。
// ---------------------------------------------------------------------------

const VERDICT_LABELS: Record<VerdictValue, string> = {
  CONFIRMED: 'Confirmed',
  REFUTED: 'Refuted',
  INCONCLUSIVE: 'Inconclusive',
  DEGRADED_SCOPE: 'Degraded',
  UNTESTED: 'Untested',
};

// ---------------------------------------------------------------------------
// 共享类型
// ---------------------------------------------------------------------------

export interface BaselineData {
  readonly key: string;
  readonly label: string;
  readonly response: HypothesizeResponse | null;
  readonly isError: boolean;
}

/**
 * 有效基线视图：response 非 null 且无错误（filter 收窄后的元素类型）。
 * 谓词式收窄让后续 d3 回调内 `d.response` 直接为 HypothesizeResponse，
 * 无需 `d.response!` 非空断言。
 */
type ValidBaseline = BaselineData & { readonly response: HypothesizeResponse };

/** 类型谓词：收窄 BaselineData → ValidBaseline（替代各处 `d.response!` 断言）。 */
function hasValidResponse(d: BaselineData): d is ValidBaseline {
  return d.response !== null && !d.isError;
}

// ---------------------------------------------------------------------------
// UX-VIZ-001 诚实层：单次运行的统计事实 + 统一披露字幕。
// 消融页每条基线真实只跑 1 次（n=1）——CI 不可计算必须说出口，不冒充重复测量。
// ---------------------------------------------------------------------------

function singleRunStat(metricKind: ChartStatisticalSpec['metricKind']): ChartStatisticalSpec {
  return {
    runsPerSubject: 1,
    nRendered: true,
    ci: null,
    ciRendered: false,
    noCiReason: 'single run per baseline: CI not computable from n=1',
    metricKind,
  };
}

function HonestyCaption({ stat, testId }: { stat: ChartStatisticalSpec; testId: string }) {
  return (
    <p data-testid={testId} className="px-3 pb-2 pt-1 text-xs text-muted-foreground">
      {renderHonestyCaption(stat)}
    </p>
  );
}

/** 四图的诚实性 spec——与各组件真实渲染绑定（aria-label 原文一致；字幕渲染 n/CI 披露）。 */
export const ABLATION_CHART_HONESTY_SPECS: readonly ChartHonestySpec[] = [
  {
    id: 'ablation/iterations',
    comparative: true,
    statistical: singleRunStat('count'),
    a11y: { roleImg: true, ariaLabel: 'Bar chart of iteration counts across baselines', nonColorChannel: true },
  },
  {
    id: 'ablation/metric',
    comparative: true,
    statistical: singleRunStat('mean'),
    a11y: { roleImg: true, ariaLabel: 'Bar chart of metric values across baselines', nonColorChannel: true },
  },
  {
    id: 'ablation/verdict-dist',
    comparative: true,
    statistical: singleRunStat('ordinal'),
    a11y: { roleImg: true, ariaLabel: 'Final verdict comparison across baselines (one run each, categorical — not a score)', nonColorChannel: true },
  },
  {
    id: 'ablation/falsifiability',
    comparative: true,
    statistical: singleRunStat('ordinal'),
    a11y: { roleImg: true, ariaLabel: 'Falsifiability comparison across baselines', nonColorChannel: true },
  },
];

// ---------------------------------------------------------------------------
// 柱状图：迭代次数对比
// ---------------------------------------------------------------------------

interface IterationChartProps {
  readonly data: readonly BaselineData[];
}

export function IterationBarChart({ data }: IterationChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const svgEl = svgRef.current;
    const containerEl = containerRef.current;
    if (!svgEl || !containerEl) return;

    const validData = data.filter(hasValidResponse);
    if (validData.length === 0) return;

    const width = containerEl.clientWidth;
    const height = 320;
    const margin = { top: 20, right: 30, bottom: 60, left: 60 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', width)
      .attr('height', height)
      .attr('aria-label', 'Bar chart of iteration counts across baselines')
      .attr('role', 'img');

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // 比例尺
    const maxIter = d3.max(validData, (d) => d.response.loopState.iterationsCompleted) ?? 1;
    const xScale = d3
      .scaleBand()
      .domain(validData.map((d) => d.label))
      .range([0, innerW])
      .padding(0.3);

    const yScale = d3
      .scaleLinear()
      .domain([0, Math.max(maxIter, 1)])
      .nice()
      .range([innerH, 0]);

    // 网格
    g.append('g')
      .attr('class', 'grid')
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickSize(-innerW)
          .tickFormat(() => ''),
      )
      .selectAll('line')
      .attr('stroke', chartGridColor())
      .attr('stroke-dasharray', '4,4');

    // Y 轴
    g.append('g')
      .call(d3.axisLeft(yScale).ticks(5))
      .selectAll('text')
      .attr('fill', chartTextColor())
      .attr('font-size', 12);

    // X 轴
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale))
      .selectAll('text')
      .attr('fill', chartTextColor())
      .attr('font-size', 11)
      .attr('text-anchor', 'end')
      .attr('dx', '-0.5em')
      .attr('dy', '0.3em')
      .attr('transform', 'rotate(-25)');

    // 柱状条
    g.selectAll('.bar')
      .data(validData)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (d) => xScale(d.label) ?? 0)
      .attr('y', (d) => yScale(d.response.loopState.iterationsCompleted))
      .attr('width', xScale.bandwidth())
      .attr(
        'height',
        (d) => innerH - yScale(d.response.loopState.iterationsCompleted),
      )
      .attr('fill', (d) => baselineChartColor(d.key))
      .attr('rx', 3);

    // 数值标签
    g.selectAll('.label')
      .data(validData)
      .enter()
      .append('text')
      .attr('class', 'label')
      .attr('x', (d) => (xScale(d.label) ?? 0) + xScale.bandwidth() / 2)
      .attr('y', (d) => yScale(d.response.loopState.iterationsCompleted) - 6)
      .attr('text-anchor', 'middle')
      .attr('fill', chartTextColor())
      .attr('font-size', 13)
      .attr('font-weight', '600')
      .text((d) => String(d.response.loopState.iterationsCompleted));

    return () => {
      svg.selectAll('*').remove();
    };
  }, [data]);

  return (
    <div
      ref={containerRef}
      className="w-full min-h-[320px] rounded-lg border bg-card"
      data-testid="iteration-chart-container"
    >
      <svg ref={svgRef} className="w-full h-full" data-testid="iteration-chart-svg" />
      {data.some(hasValidResponse) && <HonestyCaption stat={singleRunStat('count')} testId="iteration-honesty-caption" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 柱状图：指标值对比
// ---------------------------------------------------------------------------

interface MetricChartProps {
  readonly data: readonly BaselineData[];
}

/**
 * 指标值视图：从 ValidBaseline 派生，verdictNode.metricValue 已收窄为 number。
 * 用 `flatMap`+守卫一次完成「过滤 null metricValue」与「类型收窄」（替代
 * `d.response!.loopState.verdictNode!.metricValue!` 三重断言）。
 */
interface MetricDatum {
  readonly key: string;
  readonly label: string;
  readonly metricValue: number;
}

export function MetricBarChart({ data }: MetricChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const svgEl = svgRef.current;
    const containerEl = containerRef.current;
    if (!svgEl || !containerEl) return;

    const validData: MetricDatum[] = data
      .filter(hasValidResponse)
      .flatMap((d) => {
        const metricValue = d.response.loopState.verdictNode?.metricValue;
        if (metricValue === null || metricValue === undefined) return [];
        return [{ key: d.key, label: d.label, metricValue }];
      });
    if (validData.length === 0) return;

    const width = containerEl.clientWidth;
    const height = 320;
    const margin = { top: 20, right: 30, bottom: 60, left: 60 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', width)
      .attr('height', height)
      .attr('aria-label', 'Bar chart of metric values across baselines')
      .attr('role', 'img');

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const allMetrics = validData.map((d) => d.metricValue);
    const maxMetric = d3.max(allMetrics) ?? 1;

    const xScale = d3
      .scaleBand()
      .domain(validData.map((d) => d.label))
      .range([0, innerW])
      .padding(0.3);

    // 柱状图 y 轴强制从 0 起——柱高与数值成正比是柱图的阅读契约;截断基线
    // (max(0, min-10%range)) 是经典差异放大术,对本产品论点不可接受。
    // 差异太小时读图困难的诚实解法是查精确值表格,不是放大轴。
    const yScale = d3
      .scaleLinear()
      .domain([0, maxMetric])
      .nice()
      .range([innerH, 0]);

    // 网格
    g.append('g')
      .attr('class', 'grid')
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickSize(-innerW)
          .tickFormat(() => ''),
      )
      .selectAll('line')
      .attr('stroke', chartGridColor())
      .attr('stroke-dasharray', '4,4');

    // Y 轴
    g.append('g')
      .call(d3.axisLeft(yScale).ticks(5))
      .selectAll('text')
      .attr('fill', chartTextColor())
      .attr('font-size', 12);

    // X 轴
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale))
      .selectAll('text')
      .attr('fill', chartTextColor())
      .attr('font-size', 11)
      .attr('text-anchor', 'end')
      .attr('dx', '-0.5em')
      .attr('dy', '0.3em')
      .attr('transform', 'rotate(-25)');

    // 柱状条
    g.selectAll('.bar')
      .data(validData)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (d) => xScale(d.label) ?? 0)
      .attr('y', (d) => yScale(d.metricValue))
      .attr('width', xScale.bandwidth())
      .attr('height', (d) => innerH - yScale(d.metricValue))
      .attr('fill', (d) => baselineChartColor(d.key))
      .attr('rx', 3);

    // 数值标签
    g.selectAll('.label')
      .data(validData)
      .enter()
      .append('text')
      .attr('class', 'label')
      .attr('x', (d) => (xScale(d.label) ?? 0) + xScale.bandwidth() / 2)
      .attr('y', (d) => yScale(d.metricValue) - 6)
      .attr('text-anchor', 'middle')
      .attr('fill', chartTextColor())
      .attr('font-size', 12)
      .attr('font-weight', '600')
      .text((d) => d.metricValue.toFixed(4));

    return () => {
      svg.selectAll('*').remove();
    };
  }, [data]);

  return (
    <div
      ref={containerRef}
      className="w-full min-h-[320px] rounded-lg border bg-card"
      data-testid="metric-chart-container"
    >
      <svg ref={svgRef} className="w-full h-full" data-testid="metric-chart-svg" />
      {data.some(hasValidResponse) && <HonestyCaption stat={singleRunStat('mean')} testId="metric-honesty-caption" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 裁决分布：分组柱状图
// ---------------------------------------------------------------------------

interface VerdictDistChartProps {
  readonly data: readonly BaselineData[];
}

export function VerdictDistChart({ data }: VerdictDistChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const svgEl = svgRef.current;
    const containerEl = containerRef.current;
    if (!svgEl || !containerEl) return;

    const validData = data.filter(hasValidResponse);
    if (validData.length === 0) return;

    const width = containerEl.clientWidth;
    const height = 340;
    const margin = { top: 20, right: 30, bottom: 70, left: 60 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', width)
      .attr('height', height)
      .attr('aria-label', 'Final verdict comparison across baselines (one run each, categorical — not a score)')
      .attr('role', 'img');

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // 每基线一个终裁值（n=1,非分布）。渲染为分类点阵:y 轴是 5 个裁决"类别"
    // (scaleBand,无高低语义),每基线在其裁决行放一枚色点 + 文字标签。
    // 旧实现把裁决映射成 0-4 "分数"画柱高——暗示 REFUTED(3)"优于"INCONCLUSIVE(2),
    // 对裁决仪器是语义错误;高度=排名的视觉契约已移除。
    const verdictOrder: VerdictValue[] = [
      'CONFIRMED',
      'REFUTED',
      'INCONCLUSIVE',
      'DEGRADED_SCOPE',
      'UNTESTED',
    ];

    const xScale = d3
      .scaleBand()
      .domain(validData.map((d) => d.label))
      .range([0, innerW])
      .padding(0.3);

    // scaleBand: 类别轴(顺序仅是显示惯例 CONFIRMED 在顶),无数值含义
    const yScale = d3
      .scaleBand()
      .domain(verdictOrder)
      .range([0, innerH])
      .padding(0.25);

    // Y axis with verdict category labels
    const yAxis = d3
      .axisLeft(yScale)
      .tickFormat((d) => VERDICT_LABELS[d as VerdictValue] ?? '');

    g.append('g')
      .call(yAxis)
      .selectAll('text')
      .attr('fill', chartTextColor())
      .attr('font-size', 11);

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale))
      .selectAll('text')
      .attr('fill', chartTextColor())
      .attr('font-size', 11)
      .attr('text-anchor', 'end')
      .attr('dx', '-0.5em')
      .attr('dy', '0.3em')
      .attr('transform', 'rotate(-25)');

    // Row separators per verdict category (band grid — no numeric ticks)
    g.append('g')
      .attr('class', 'grid')
      .selectAll('line')
      .data(verdictOrder)
      .enter()
      .append('line')
      .attr('x1', 0)
      .attr('x2', innerW)
      .attr('y1', (v) => yScale(v) ?? 0)
      .attr('y2', (v) => yScale(v) ?? 0)
      .attr('stroke', chartGridColor())
      .attr('stroke-dasharray', '4,4');

    // One dot per baseline at (baseline, its verdict row)
    g.selectAll('.verdict-dot')
      .data(validData)
      .enter()
      .append('circle')
      .attr('class', 'verdict-dot')
      .attr('cx', (d) => (xScale(d.label) ?? 0) + xScale.bandwidth() / 2)
      .attr('cy', (d) => {
        const v = getVerdictFromResponse(d.response);
        return (yScale(v) ?? 0) + yScale.bandwidth() / 2;
      })
      .attr('r', 9)
      .attr('fill', (d) => verdictChartFill(getVerdictFromResponse(d.response)))
      .attr('stroke', chartTextColor())
      .attr('stroke-width', 1);

    // Verdict text beside each dot — color-independent channel (WCAG 1.4.1)
    g.selectAll('.verdict-label')
      .data(validData)
      .enter()
      .append('text')
      .attr('class', 'verdict-label')
      .attr('x', (d) => (xScale(d.label) ?? 0) + xScale.bandwidth() / 2 + 14)
      .attr('y', (d) => {
        const v = getVerdictFromResponse(d.response);
        return (yScale(v) ?? 0) + yScale.bandwidth() / 2 + 4;
      })
      .attr('text-anchor', 'start')
      .attr('fill', chartTextColor())
      .attr('font-size', 11)
      .attr('font-weight', '600')
      .text((d) => VERDICT_LABELS[getVerdictFromResponse(d.response)] ?? '');

    return () => {
      svg.selectAll('*').remove();
    };
  }, [data]);

  return (
    <div
      ref={containerRef}
      className="w-full min-h-[340px] rounded-lg border bg-card"
      data-testid="verdict-dist-chart-container"
    >
      <svg ref={svgRef} className="w-full h-full" data-testid="verdict-dist-chart-svg" />
      {data.some(hasValidResponse) && <HonestyCaption stat={singleRunStat('ordinal')} testId="verdict-honesty-caption" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 可证伪性对比：是否存在 falsificationSpec
// ---------------------------------------------------------------------------

interface FalsifiabilityChartProps {
  readonly data: readonly BaselineData[];
}

export function FalsifiabilityChart({ data }: FalsifiabilityChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const svgEl = svgRef.current;
    const containerEl = containerRef.current;
    if (!svgEl || !containerEl) return;

    const validData = data.filter(hasValidResponse);
    if (validData.length === 0) return;

    const width = containerEl.clientWidth;
    const height = 260;
    const margin = { top: 20, right: 30, bottom: 60, left: 60 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', width)
      .attr('height', height)
      .attr('aria-label', 'Falsifiability comparison across baselines')
      .attr('role', 'img');

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3
      .scaleBand()
      .domain(validData.map((d) => d.label))
      .range([0, innerW])
      .padding(0.3);

    const yScale = d3
      .scaleLinear()
      .domain([0, 1])
      .range([innerH, 0]);

    // Y axis
    g.append('g')
      .call(
        d3
          .axisLeft(yScale)
          .ticks(2)
          .tickFormat((d) => (d === 0 ? 'No' : 'Yes')),
      )
      .selectAll('text')
      .attr('fill', chartTextColor())
      .attr('font-size', 12);

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale))
      .selectAll('text')
      .attr('fill', chartTextColor())
      .attr('font-size', 11)
      .attr('text-anchor', 'end')
      .attr('dx', '-0.5em')
      .attr('dy', '0.3em')
      .attr('transform', 'rotate(-25)');

    // Grid
    g.append('g')
      .attr('class', 'grid')
      .call(
        d3
          .axisLeft(yScale)
          .ticks(2)
          .tickSize(-innerW)
          .tickFormat(() => ''),
      )
      .selectAll('line')
      .attr('stroke', chartGridColor())
      .attr('stroke-dasharray', '4,4');

    // Bars: 1 = has falsificationSpec, 0 = doesn't
    g.selectAll('.fals-bar')
      .data(validData)
      .enter()
      .append('rect')
      .attr('class', 'fals-bar')
      .attr('x', (d) => (xScale(d.label) ?? 0) + xScale.bandwidth() * 0.15)
      .attr('width', xScale.bandwidth() * 0.7)
      .attr('y', (d) => yScale(hasFalsificationSpec(d.response) ? 0.95 : 0.05))
      .attr('height', (d) =>
        innerH - yScale(hasFalsificationSpec(d.response) ? 0.95 : 0.05),
      )
      .attr('fill', (d) =>
        hasFalsificationSpec(d.response)
          ? verdictChartFill('CONFIRMED')
          : CHART_NEUTRAL_FILL,
      )
      .attr('rx', 3);

    // Labels
    g.selectAll('.fals-label')
      .data(validData)
      .enter()
      .append('text')
      .attr('class', 'fals-label')
      .attr(
        'x',
        (d) => (xScale(d.label) ?? 0) + xScale.bandwidth() / 2,
      )
      .attr('y', (d) =>
        yScale(hasFalsificationSpec(d.response) ? 0.95 : 0.05) - 8,
      )
      .attr('text-anchor', 'middle')
      .attr('fill', chartTextColor())
      .attr('font-size', 12)
      .attr('font-weight', '600')
      .text((d) =>
        hasFalsificationSpec(d.response) ? 'has falsification spec' : 'no falsification spec',
      );

    return () => {
      svg.selectAll('*').remove();
    };
  }, [data]);

  return (
    <div
      ref={containerRef}
      className="w-full min-h-[260px] rounded-lg border bg-card"
      data-testid="falsifiability-chart-container"
    >
      <svg ref={svgRef} className="w-full h-full" data-testid="falsifiability-chart-svg" />
      {data.some(hasValidResponse) && <HonestyCaption stat={singleRunStat('ordinal')} testId="falsifiability-honesty-caption" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function getVerdictFromResponse(r: HypothesizeResponse): VerdictValue {
  const v =
    r.loopState.verdictNode?.verdict ?? r.honestVerdict?.verdict;
  return v ?? 'UNTESTED';
}

function hasFalsificationSpec(r: HypothesizeResponse): boolean {
  const node = r.loopState.verdictNode ?? r.honestVerdict;
  if (node === null || node === undefined) return false;
  const spec = (node as { falsificationSpec?: unknown }).falsificationSpec;
  return spec !== null && spec !== undefined;
}
