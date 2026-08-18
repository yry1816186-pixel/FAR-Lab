import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERDICT_VALUES } from '@/lib/verdict';
import type { VerdictValue } from '@/lib/types';
import {
  cssHsl,
  verdictChartFill,
  verdictChartStroke,
  baselineChartColor,
  chartGridColor,
  chartTextColor,
  CHART_NEUTRAL_FILL,
  CHART_BASELINE_FALLBACK,
  FALLBACK_VERDICT_CHART_COLOR,
  VERDICT_FILL_TOKEN,
  VERDICT_STROKE_TOKEN,
} from '@/lib/chartColors';

/**
 * 语义设计 Token v2 契约测试（PR-02 · 销账 D-02/D-03/D-05 全局 + D-04 token 供给）。
 *
 * 四个锁定面（全部真实断言，无空检查）：
 *   1. index.css 的 :root 与 .dark 下关键语义 token 存在、非空、形态合法
 *      （HSL 三元组 / 长度值），新增 token 被误删或写坏即红；
 *   2. 全局 :focus-visible 基线在场且消费 --focus-ring token（D-05 回归锁）；
 *   3. chartColors 运行时确实消费 CSS 变量（注入变量→返回 token 值；
 *      清除变量→回退），且回退值与 index.css :root token 逐一对齐
 *      （单一出口不得私藏第二套色源，D-02/D-03 防漂移）；
 *   4. 消费侧源码锁：VerdictBadge/AblationCharts 内硬编码 hsl = 0，
 *      chartColors 单一出口内不得出现 hex 字面量。
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(HERE, '..', 'index.css'), 'utf-8');
const tailwindConfig = readFileSync(join(HERE, '..', '..', 'tailwind.config.ts'), 'utf-8');
const chartColorsSrc = readFileSync(join(HERE, '..', 'lib', 'chartColors.ts'), 'utf-8');
const verdictBadgeSrc = readFileSync(join(HERE, '..', 'components', 'VerdictBadge.tsx'), 'utf-8');
const ablationChartsSrc = readFileSync(join(HERE, '..', 'components', 'AblationCharts.tsx'), 'utf-8');

/** 抽取顶层 `selector { ... }` 块体（token 声明无嵌套花括号）。 */
function blockOf(selector: ':root' | '.dark'): string {
  const match = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(css);
  if (match === null) throw new Error(`index.css 缺少 ${selector} 块`);
  return match[1];
}

function tokenValue(block: string, name: string): string | undefined {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(block);
  return match?.[1].trim();
}

/** HSL 三元组形态：`H S% L%`（空格分隔，无 hsl() 包裹——R-09 记法）。 */
const HSL_TRIPLE = /^\d+(\.\d+)? \d+(\.\d+)?% \d+(\.\d+)?%$/;
/** 长度值形态（如 2px）。 */
const LENGTH = /^\d+(\.\d+)?px$/;

/** 三元组 → 逗号记法 hsl()（chartColors 回退的记法）。 */
function commaHsl(triple: string): string {
  return `hsl(${triple.split(/\s+/).join(', ')})`;
}

const ROOT = blockOf(':root');
const DARK = blockOf('.dark');

/** 必须在亮暗双调下均存在的 HSL 语义 token。 */
const REQUIRED_HSL_TOKENS = [
  // D-04 供给：success/warning 状态色
  'success',
  'success-solid',
  'success-foreground',
  'warning',
  'warning-foreground',
  // D-05：焦点环色
  'focus-ring',
  // 既有裁决 token（防新增改动误伤）
  'verdict-confirmed',
  'verdict-confirmed-solid',
  'verdict-refuted',
  'verdict-refuted-solid',
  'verdict-inconclusive',
  'verdict-degraded',
  'verdict-degraded-solid',
  'verdict-untested',
] as const;

afterEach(() => {
  // 清除测试注入的内联变量，避免跨用例污染
  for (const name of [
    '--verdict-confirmed',
    '--verdict-confirmed-solid',
    '--verdict-inconclusive',
    '--verdict-inconclusive-solid',
    '--border',
    '--muted-foreground',
  ]) {
    document.documentElement.style.removeProperty(name);
  }
});

describe('语义 Token v2 — index.css 声明契约', () => {
  it.each(REQUIRED_HSL_TOKENS)('--%s 在 :root 与 .dark 均存在且为合法 HSL 三元组', (name) => {
    for (const [label, block] of [
      [':root', ROOT],
      ['.dark', DARK],
    ] as const) {
      const value = tokenValue(block, name);
      expect(value, `${name} 缺失于 ${label}`).toBeDefined();
      expect(value, `${name} 为空`).not.toBe('');
      expect(value, `${name} 值形态非法: ${String(value)}`).toMatch(HSL_TRIPLE);
    }
  });

  it('--focus-ring-offset 在亮暗双调均为合法长度值', () => {
    for (const block of [ROOT, DARK]) {
      const value = tokenValue(block, 'focus-ring-offset');
      expect(value).toBeDefined();
      expect(value).toMatch(LENGTH);
    }
  });

  it('warning 只配深色前景不配 solid（黄+白字不达 AA 的校准决策锁）', () => {
    expect(tokenValue(ROOT, 'warning-foreground')).toBe('222.2 84% 4.9%');
    // 亮色 warning 与 inconclusive 同族黄——同色族校准不得漂移
    expect(tokenValue(ROOT, 'warning')).toBe(tokenValue(ROOT, 'verdict-inconclusive'));
  });
});

describe('语义 Token v2 — 全局 :focus-visible 基线（D-05）', () => {
  it('存在全局 :focus-visible 规则且环色/offset 均消费 token', () => {
    const rule = /:focus-visible\s*\{([^}]*)\}/.exec(css);
    expect(rule, 'index.css 缺少全局 :focus-visible 规则').not.toBeNull();
    const body = rule !== null ? rule[1] : '';
    expect(body).toContain('hsl(var(--focus-ring))');
    expect(body).toContain('var(--focus-ring-offset)');
    expect(body).toMatch(/outline:\s*2px solid/);
  });
});

describe('语义 Token v2 — tailwind.config.ts 供给面', () => {
  it('text-2xs 字号阶在场（收敛 text-[10px]/text-[11px] 任意值）', () => {
    expect(tailwindConfig).toContain("'2xs':");
    expect(tailwindConfig).toContain('0.6875rem');
  });

  it('success/warning 语义色已注册供页面消费', () => {
    expect(tailwindConfig).toContain("hsl(var(--success))");
    expect(tailwindConfig).toContain("hsl(var(--success-solid))");
    expect(tailwindConfig).toContain("hsl(var(--warning))");
    expect(tailwindConfig).toContain("hsl(var(--warning-foreground))");
  });
});

describe('语义 Token v2 — chartColors 运行时消费契约（D-02/D-03）', () => {
  it('注入 CSS 变量后取色来自 token（而非回退字面量）', () => {
    document.documentElement.style.setProperty('--verdict-confirmed', '99 1% 2%');
    expect(verdictChartFill('CONFIRMED')).toBe('hsl(99 1% 2%)');
    expect(cssHsl('--verdict-confirmed', 'IGNORED')).toBe('hsl(99 1% 2%)');

    document.documentElement.style.setProperty('--verdict-confirmed-solid', '99 2% 3%');
    expect(verdictChartStroke('CONFIRMED')).toBe('hsl(99 2% 3%)');

    document.documentElement.style.setProperty('--border', '1 2% 3%');
    document.documentElement.style.setProperty('--muted-foreground', '4 5% 6%');
    expect(chartGridColor()).toBe('hsl(1 2% 3%)');
    expect(chartTextColor()).toBe('hsl(4 5% 6%)');
  });

  it('无 solid token 的裁决描边不受变量注入影响（登记常量路径）', () => {
    document.documentElement.style.setProperty('--verdict-inconclusive-solid', '99 9% 9%');
    // VERDICT_STROKE_TOKEN 不含 INCONCLUSIVE——注入不得改变其描边
    expect(verdictChartStroke('INCONCLUSIVE')).toBe('hsl(47.9, 95.8%, 40%)');
    expect(verdictChartStroke('UNTESTED')).toBe('hsl(215.4, 16.3%, 35%)');
  });

  it('变量缺失时回退值与 index.css :root token 逐一对齐（防双源漂移）', () => {
    for (const v of VERDICT_VALUES) {
      const value = verdictChartFill(v as VerdictValue);
      const triple = tokenValue(ROOT, `verdict-${v.toLowerCase().replace('_scope', '')}`);
      expect(triple, `:root 缺 --verdict token: ${v}`).toBeDefined();
      expect(value, `${v} 回退与 :root token 漂移`).toBe(commaHsl(triple as string));
    }
    // 描边：有 solid token 者必须与 :root solid 对齐
    for (const [v, token] of Object.entries(VERDICT_STROKE_TOKEN)) {
      expect(token, `${v} 的 stroke token 未登记`).toBeDefined();
      const triple = tokenValue(ROOT, (token as string).replace(/^--/, ''));
      expect(triple).toBeDefined();
      expect(verdictChartStroke(v as VerdictValue)).toBe(commaHsl(triple as string));
    }
  });

  it('五裁决全覆盖且 token 命名遵循 --verdict-* 约定', () => {
    for (const v of VERDICT_VALUES) {
      expect(VERDICT_FILL_TOKEN[v as VerdictValue]).toBe(`--verdict-${v.toLowerCase().replace('_scope', '')}`);
    }
    expect(baselineChartColor('far-chain')).toBe('hsl(217, 91%, 60%)');
    expect(baselineChartColor('unknown-baseline')).toBe(CHART_BASELINE_FALLBACK);
    expect(CHART_NEUTRAL_FILL).toMatch(/^hsl\(/);
    expect(FALLBACK_VERDICT_CHART_COLOR.fill).toMatch(/^hsl\(/);
  });
});

describe('语义 Token v2 — 消费侧源码锁（硬编码 hsl 清零）', () => {
  it('VerdictBadge.tsx 内硬编码 hsl = 0（颜色全经 chartColors）', () => {
    expect(verdictBadgeSrc).not.toMatch(/hsl\(/);
    expect(verdictBadgeSrc).toContain('@/lib/chartColors');
  });

  it('AblationCharts.tsx 内硬编码 hsl = 0（颜色全经 chartColors）', () => {
    expect(ablationChartsSrc).not.toMatch(/hsl\(/);
    expect(ablationChartsSrc).toContain('@/lib/chartColors');
  });

  it('chartColors 单一出口不得包含 hex 色值字面量', () => {
    expect(chartColorsSrc).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    // 单一出口必须保留主题感知取色路径
    expect(chartColorsSrc).toContain('getComputedStyle');
    expect(chartColorsSrc).toContain('--verdict-');
  });
});
