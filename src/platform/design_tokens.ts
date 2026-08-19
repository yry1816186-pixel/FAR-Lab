// src/platform/design_tokens.ts
// 设计 Token 单一事实源（DESIGN_SYSTEM.md §1.1 的可执行对应物）。
//
// 定位：
//   · 三范式（Web CSS 变量 / CLI ANSI / Monitor 栅格）共享同一份语义色定义；
//     Web 侧值与本表 light/dark hex 必须等于 frontend/src/index.css 生产值（测试锁定）。
//   · 零依赖、纯常量、确定性——可进任何层（含信任内核渲染路径），永不引入 I/O。
//   · CLI 颜色唯一出口仍是 cli/render.ts 的 colorize()；本模块只回答"语义 → 色码"，
//     不做渲染、不判断 TTY（NO_COLOR/FORCE_COLOR 契约归 render.ts:ansiEnabled）。
//
// 不能证明的事（诚实边界）：本表保证"同一语义同一色码"，不保证终端真实显色
// （旧 ConHost/极简 TTY 由 render.ts 降级链负责）；ANSI-256 数值为最近邻 xterm 近似，
// 三平台终端实测截图是 Phase 5 验收动作。

/** 裁决五值（R0-R9 内核输出空间；与 falsifiability 内核同构的展示层枚举）。 */
export const VERDICT_VALUES = [
  'CONFIRMED',
  'REFUTED',
  'INCONCLUSIVE',
  'DEGRADED_SCOPE',
  'UNTESTED',
] as const;
export type VerdictValue = (typeof VERDICT_VALUES)[number];

/** 功能语义色（非裁决：状态/交互）。 */
export const FUNCTIONAL_TONES = ['ok', 'danger', 'warn', 'info', 'accent'] as const;
export type FunctionalTone = (typeof FUNCTIONAL_TONES)[number];

export interface SemanticColor {
  /** CSS 变量名（frontend/src/index.css 既有生产变量）。 */
  readonly cssVar: string;
  /** 明主题 hex（= index.css 生产值）。 */
  readonly light: string;
  /** 暗主题 hex（= index.css 生产值）。 */
  readonly dark: string;
  /** xterm-256 最近邻色码（256 色终端）。 */
  readonly ansi256: number;
  /** ANSI-8 兜底名（= cli/render.ts AnsiColor 枚举子集）。 */
  readonly ansi8: 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'gray';
}

/** 裁决五值语义色（DESIGN_SYSTEM.md §1.1 表逐项落地）。 */
export const VERDICT_COLORS: Readonly<Record<VerdictValue, SemanticColor>> = {
  CONFIRMED: { cssVar: '--v-confirmed', light: '#0e7a4c', dark: '#3fb97f', ansi256: 29, ansi8: 'green' },
  REFUTED: { cssVar: '--v-refuted', light: '#b23232', dark: '#e06c6c', ansi256: 131, ansi8: 'red' },
  INCONCLUSIVE: { cssVar: '--v-inconclusive', light: '#96690d', dark: '#d9a83f', ansi256: 136, ansi8: 'yellow' },
  DEGRADED_SCOPE: { cssVar: '--v-degraded', light: '#6556c4', dark: '#a394f0', ansi256: 62, ansi8: 'magenta' },
  UNTESTED: { cssVar: '--v-untested', light: '#6e6b64', dark: '#8f8c85', ansi256: 242, ansi8: 'gray' },
};

/** 功能语义色。ok/danger/warn 与 confirmed/refuted/inconclusive 同值是刻意的：
 *  语义统一原则——"通过=证实绿、错误=证伪红、警告=不确定琥珀"（DESIGN_SYSTEM §1.1）。 */
export const FUNCTIONAL_COLORS: Readonly<Record<FunctionalTone, SemanticColor>> = {
  ok: VERDICT_COLORS.CONFIRMED,
  danger: VERDICT_COLORS.REFUTED,
  warn: VERDICT_COLORS.INCONCLUSIVE,
  info: { cssVar: '--info', light: '#1a4fd6', dark: '#7aa2ff', ansi256: 26, ansi8: 'blue' },
  accent: { cssVar: '--accent', light: '#1a4fd6', dark: '#7aa2ff', ansi256: 26, ansi8: 'blue' },
};

/** 裁决值 → 语义色。fail-closed：未知字符串返回 undefined（调用方决定降级），
 *  绝不静默给绿色——错误着色的 CONFIRMED 是比无色更糟的谎言。 */
export function verdictColor(verdict: string): SemanticColor | undefined {
  return (VERDICT_COLORS as Record<string, SemanticColor>)[verdict];
}

/** 裁决值 → ANSI-8 兜底色名（render.ts AnsiColor 兼容）。未知 → 'gray'（中性，不撒谎）。 */
export function verdictAnsi8(verdict: string): SemanticColor['ansi8'] {
  return verdictColor(verdict)?.ansi8 ?? 'gray';
}
