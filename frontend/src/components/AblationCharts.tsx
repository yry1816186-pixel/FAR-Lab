/**
 * AblationCharts.tsx —— 消融实验可视化图表组件。
 *
 * 使用 D3.js 渲染消融实验中各基线的对比图表：
 *   - 迭代次数对比柱状图
 *   - 指标值对比柱状图
 *   - 裁决分布堆叠图
 *
 * 颜色使用 HSL 函数记法（Design Token 派生），不硬编码 #RRGGBB。
 * 所有图表在 useEffect 中通过同步 D3 tick 渲染，无 rAF 依赖，便于测试。
 *
 * 类型安全（零容忍#4）：filter 后 d3 回调内不使用 `d.response!` 非空断言——
 * 用 `hasValidResponse` 类型谓词从源头收窄 `response` 为非 null；MetricBarChart
 * 额外用 `flatMap`+守卫派生 `MetricDatum`，把 `verdictNode.metricValue` 收窄为 number。
 */

import { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import type { HypothesizeResponse, VerdictValue } from '@/lib/types';

// ---------------------------------------------------------------------------
// 颜色色板（HSL 函数记法）
// ---------------------------------------------------------------------------

const BASELINE_COLORS: Record<string, string> = {
  random: 'hsl(0, 72%, 58%)',
  search: 'hsl(32, 95%, 44%)',
  'direct-llm': 'hsl(262, 83%, 58%)',
  'far-chain': 'hsl(217, 91%, 60%)',
};

const FALLBACK_COLOR = 'hsl(215, 16%, 60%)';

const VERDICT_CHART_COLORS: Record<VerdictValue, string> = {
  CONFIRMED: 'hsl(142, 71%, 45%)',
  REFUTED: 'hsl(0, 84%, 60%)',
  INCONCLUSIVE: 'hsl(48, 96%, 53%)',
  DEGRADED_SCOPE: 'hsl(32, 95%, 44%)',
  UNTESTED: 'hsl(215, 16%, 70%)',
};

const GRID_COLOR = 'hsl(215, 16%, 85%)';
const TEXT_COLOR = 'hsl(215, 16%, 30%)';

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

interface BaselineData {
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

function baselineColor(key: string): string {
  return BASELINE_COLORS[key] ?? FALLBACK_COLOR;
}

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
      .attr('stroke', GRID_COLOR)
      .attr('stroke-dasharray', '4,4');

    // Y 轴
    g.append('g')
      .call(d3.axisLeft(yScale).ticks(5))
      .selectAll('text')
      .attr('fill', TEXT_COLOR)
      .attr('font-size', 12);

    // X 轴
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale))
      .selectAll('text')
      .attr('fill', TEXT_COLOR)
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
      .attr('fill', (d) => baselineColor(d.key))
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
      .attr('fill', TEXT_COLOR)
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
    const minMetric = d3.min(allMetrics) ?? 0;
    const yMin = Math.max(0, minMetric - 0.1 * (maxMetric - minMetric));

    const xScale = d3
      .scaleBand()
      .domain(validData.map((d) => d.label))
      .range([0, innerW])
      .padding(0.3);

    const yScale = d3
      .scaleLinear()
      .domain([yMin, maxMetric])
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
      .attr('stroke', GRID_COLOR)
      .attr('stroke-dasharray', '4,4');

    // Y 轴
    g.append('g')
      .call(d3.axisLeft(yScale).ticks(5))
      .selectAll('text')
      .attr('fill', TEXT_COLOR)
      .attr('font-size', 12);

    // X 轴
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale))
      .selectAll('text')
      .attr('fill', TEXT_COLOR)
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
      .attr('fill', (d) => baselineColor(d.key))
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
      .attr('fill', TEXT_COLOR)
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
      .attr('aria-label', 'Verdict distribution across baselines')
      .attr('role', 'img');

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Each baseline gets a "verdict score" — map verdict to numeric 1-5
    const verdictOrder: VerdictValue[] = [
      'CONFIRMED',
      'REFUTED',
      'INCONCLUSIVE',
      'DEGRADED_SCOPE',
      'UNTESTED',
    ];

    const verdictScore: Record<VerdictValue, number> = {
      CONFIRMED: 4,
      REFUTED: 3,
      INCONCLUSIVE: 2,
      DEGRADED_SCOPE: 1,
      UNTESTED: 0,
    };

    const xScale = d3
      .scaleBand()
      .domain(validData.map((d) => d.label))
      .range([0, innerW])
      .padding(0.3);

    const yScale = d3
      .scaleLinear()
      .domain([0, 4])
      .range([innerH, 0]);

    // Y axis with verdict labels
    const yAxis = d3.axisLeft(yScale).ticks(5).tickFormat((d) => {
      const v = verdictOrder[4 - (d as number)];
      if (v === undefined) return '';
      return VERDICT_LABELS[v];
    });

    g.append('g')
      .call(yAxis)
      .selectAll('text')
      .attr('fill', TEXT_COLOR)
      .attr('font-size', 11);

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale))
      .selectAll('text')
      .attr('fill', TEXT_COLOR)
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
          .ticks(5)
          .tickSize(-innerW)
          .tickFormat(() => ''),
      )
      .selectAll('line')
      .attr('stroke', GRID_COLOR)
      .attr('stroke-dasharray', '4,4');

    // Draw bar for each baseline
    g.selectAll('.verdict-bar')
      .data(validData)
      .enter()
      .append('rect')
      .attr('class', 'verdict-bar')
      .attr('x', (d) => (xScale(d.label) ?? 0) + xScale.bandwidth() * 0.1)
      .attr('width', xScale.bandwidth() * 0.8)
      .attr('y', (d) => {
        const v = getVerdictFromResponse(d.response);
        return yScale(verdictScore[v]);
      })
      .attr('height', (d) => {
        const v = getVerdictFromResponse(d.response);
        return innerH - yScale(verdictScore[v]);
      })
      .attr('fill', (d) => {
        const v = getVerdictFromResponse(d.response);
        return VERDICT_CHART_COLORS[v] ?? FALLBACK_COLOR;
      })
      .attr('rx', 3);

    // Label each bar
    g.selectAll('.verdict-label')
      .data(validData)
      .enter()
      .append('text')
      .attr('class', 'verdict-label')
      .attr(
        'x',
        (d) =>
          (xScale(d.label) ?? 0) + xScale.bandwidth() / 2,
      )
      .attr('y', (d) => {
        const v = getVerdictFromResponse(d.response);
        return yScale(verdictScore[v]) - 6;
      })
      .attr('text-anchor', 'middle')
      .attr('fill', TEXT_COLOR)
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
      .attr('fill', TEXT_COLOR)
      .attr('font-size', 12);

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale))
      .selectAll('text')
      .attr('fill', TEXT_COLOR)
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
      .attr('stroke', GRID_COLOR)
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
          ? 'hsl(142, 71%, 45%)'
          : 'hsl(215, 16%, 70%)',
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
      .attr('fill', TEXT_COLOR)
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
