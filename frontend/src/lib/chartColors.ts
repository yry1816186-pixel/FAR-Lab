/**
 * chartColors.ts — 图表 / 裁决色单一出口（D-02/D-03 销账 · PR-02）。
 *
 * 所有图表与 D3 取色一律经此模块，页面/组件层不再自写 hsl。
 *   - 裁决色渲染时消费 `--verdict-*` CSS 变量（暗色主题自动跟随 token）；
 *   - 描边优先消费 `--verdict-*-solid` 深色阶 token（无 solid token 的裁决用登记常量）；
 *   - 网格 / 轴文字消费 `--border` / `--muted-foreground`。
 *
 * 回退契约：token 读不到时（jsdom / 无样式表）返回 fallback，fallback 与
 * `index.css` :root 亮色 token 一一对齐——`designTokens.test.ts` 锁此防漂移。
 *
 * 豁免清单（D-03 验收「消费侧硬编码 hsl=0」）：本文件为单一出口，其中
 * 基线身份色与中性灰无对应语义 token，作为常量登记于此（仅此一处维护）。
 *
 * 已知边界（沿用 AblationCharts 原注释）：图表不监听主题切换——主题翻转
 * 后需数据变化或重挂载才重绘（backlog）。
 */

import type { VerdictValue } from '@/lib/types';

/**
 * 主题感知取色：渲染时从 CSS 变量读取 HSL 三元组并包成 hsl()。
 * 读不到（jsdom / 极老浏览器）回退到 fallback。
 */
export function cssHsl(varName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value.length > 0 ? `hsl(${value})` : fallback;
}

// ---------------------------------------------------------------------------
// 裁决色（消费 --verdict-* token）
// ---------------------------------------------------------------------------

/** 裁决 → vivid token（图表填充 / icon / border）。 */
export const VERDICT_FILL_TOKEN: Record<VerdictValue, string> = {
  CONFIRMED: '--verdict-confirmed',
  REFUTED: '--verdict-refuted',
  INCONCLUSIVE: '--verdict-inconclusive',
  DEGRADED_SCOPE: '--verdict-degraded',
  UNTESTED: '--verdict-untested',
};

/**
 * 裁决 → solid token（深色阶，用于描边）。
 * INCONCLUSIVE / UNTESTED 无 solid token（黄底配深字、灰为 outline——见
 * index.css WCAG 校准注释），其描边使用登记常量。
 */
export const VERDICT_STROKE_TOKEN: Partial<Record<VerdictValue, string>> = {
  CONFIRMED: '--verdict-confirmed-solid',
  REFUTED: '--verdict-refuted-solid',
  DEGRADED_SCOPE: '--verdict-degraded-solid',
};

/** 填充回退：与 index.css :root vivid token 一一对齐（逗号记法）。 */
const VERDICT_FILL_FALLBACK: Record<VerdictValue, string> = {
  CONFIRMED: 'hsl(142.1, 70.6%, 45.3%)',
  REFUTED: 'hsl(0, 84.2%, 60.2%)',
  INCONCLUSIVE: 'hsl(47.9, 95.8%, 53.1%)',
  DEGRADED_SCOPE: 'hsl(32.1, 94.6%, 43.7%)',
  UNTESTED: 'hsl(215.4, 16.3%, 46.9%)',
};

/**
 * 描边回退：有 solid token 者与其 :root 值对齐；无 solid token 者
 * （INCONCLUSIVE / UNTESTED）为登记常量（豁免清单）。
 */
const VERDICT_STROKE_FALLBACK: Record<VerdictValue, string> = {
  CONFIRMED: 'hsl(142.1, 70.6%, 30%)',
  REFUTED: 'hsl(0, 84.2%, 40%)',
  INCONCLUSIVE: 'hsl(47.9, 95.8%, 40%)',
  DEGRADED_SCOPE: 'hsl(32.1, 94.6%, 32%)',
  UNTESTED: 'hsl(215.4, 16.3%, 35%)',
};

/** 裁决图表填充色（vivid token → 暗色自适应）。 */
export function verdictChartFill(v: VerdictValue): string {
  return cssHsl(VERDICT_FILL_TOKEN[v], VERDICT_FILL_FALLBACK[v]);
}

/** 裁决图表描边色（solid token 优先 → 暗色自适应）。 */
export function verdictChartStroke(v: VerdictValue): string {
  const token = VERDICT_STROKE_TOKEN[v];
  return token !== undefined ? cssHsl(token, VERDICT_STROKE_FALLBACK[v]) : VERDICT_STROKE_FALLBACK[v];
}

/** 未知裁决值的 D3 回退色（登记常量，无对应 token）。 */
export const FALLBACK_VERDICT_CHART_COLOR: Readonly<{ fill: string; stroke: string }> = {
  fill: 'hsl(215.4, 16.3%, 70%)',
  stroke: 'hsl(215.4, 16.3%, 55%)',
};

// ---------------------------------------------------------------------------
// 基线身份色（消融对比图四基线 · 登记常量，无对应语义 token）
// ---------------------------------------------------------------------------

const BASELINE_CHART_COLORS: Readonly<Record<string, string>> = {
  random: 'hsl(0, 72%, 58%)',
  search: 'hsl(32, 95%, 44%)',
  'direct-llm': 'hsl(262, 83%, 58%)',
  'far-chain': 'hsl(217, 91%, 60%)',
};

/** 未知基线的图表回退色（登记常量）。 */
export const CHART_BASELINE_FALLBACK = 'hsl(215, 16%, 60%)';

/** 基线身份色取色（单一出口）。 */
export function baselineChartColor(key: string): string {
  return BASELINE_CHART_COLORS[key] ?? CHART_BASELINE_FALLBACK;
}

// ---------------------------------------------------------------------------
// 中性色（网格 / 轴文字 / 无裁决语义的弱填充）
// ---------------------------------------------------------------------------

/** 无裁决语义的弱填充灰（如 falsification 0/1 图的「无」柱 · 登记常量）。 */
export const CHART_NEUTRAL_FILL = 'hsl(215, 16%, 70%)';

/** 图表网格线（消费 --border token → 暗色自适应）。 */
export function chartGridColor(): string {
  return cssHsl('--border', 'hsl(215, 16%, 85%)');
}

/** 图表轴 / 标签文字（消费 --muted-foreground token → 暗色自适应）。 */
export function chartTextColor(): string {
  return cssHsl('--muted-foreground', 'hsl(215, 16%, 30%)');
}
