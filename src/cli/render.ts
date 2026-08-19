// src/cli/render.ts
// 跨平台 CLI 渲染层（用户愿景「图形化 CLI 稳态交互与动态显示」）。
//
// 设计原则：
//   · 零外部依赖（不引入 cli-color/ora/boxen），ANSI 转义手写且跨平台安全。
//   · Windows 旧终端（ConHost）自动降级为纯文本；新 Windows Terminal 支持 ANSI。
//   · 所有渲染函数返回字符串，由调用方决定写 stdout（便于测试与管道）。
//   · 非 TTY 环境（管道/CI）自动关闭 spinner/进度条，避免污染结构化输出。
//   · ADDITIVE ONLY — 不修改现有命令输出。

import { VERDICT_COLORS } from '../platform/design_tokens.ts';

/** ANSI 颜色枚举（跨平台安全：Windows Terminal / VSCode 终端 / 现代 ConHost）。 */
export type AnsiColor = 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'gray' | 'bold' | 'dim' | 'reset';

const ANSI_CODES: Record<AnsiColor, string> = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
};

/** 是否应该启用 ANSI（TTY + 平台支持 + 显式开关）。 */
export function ansiEnabled(
  opts: { force?: boolean; disable?: boolean; stream?: { readonly isTTY?: boolean } } = {},
): boolean {
  // NO_COLOR 规范（https://no-color.org）优先级最高——显式关闭优先于 force。
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') return false;
  if (opts.disable === true) return false;
  if (opts.force === true) return true;
  const s = opts.stream ?? process.stdout;
  if (!s || !s.isTTY) return false;
  // Windows 现代终端（Windows Terminal / VSCode）支持 ANSI；旧 ConHost 需要强制开启。
  return true;
}

/** 给文本上色（仅当 ANSI 启用时输出转义码）。 */
export function colorize(text: string, color: AnsiColor, enabled = true): string {
  if (!enabled) return text;
  const code = ANSI_CODES[color];
  return `${code}${text}${ANSI_CODES.reset}`;
}

/**
 * 256 色支持检测（DESIGN_SYSTEM §1.3 升级路径）。
 * 判定链：NO_COLOR 关闭 > force > WT_SESSION（Windows Terminal）> TERM=*256color* > COLORTERM=truecolor/24bit。
 * 保守默认 false——误判 256 色到不支持终端会输出乱码，误判降级只是色阶损失。
 */
export function ansi256Enabled(
  opts: { force?: boolean; env?: { readonly [k: string]: string | undefined } } = {},
): boolean {
  const env = opts.env ?? process.env;
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false;
  if (opts.force === true) return true;
  if (env.WT_SESSION !== undefined && env.WT_SESSION !== '') return true;
  if ((env.TERM ?? '').includes('256color')) return true;
  const ct = env.COLORTERM ?? '';
  return ct === 'truecolor' || ct === '24bit';
}

/**
 * 经设计 Token 上色（SSOT = platform/design_tokens.ts 单一事实源）。
 * 256 色终端用 token.ansi256（精确色），降级路径用 token.ansi8（语义族保持）。
 * 这是 CLI 语义色的**唯一 Token 出口**——禁止绕过它手写 38;5 转义。
 */
export function colorizeToken(
  text: string,
  token: { readonly ansi256: number; readonly ansi8: AnsiColor },
  enabled = true,
): string {
  if (!enabled) return text;
  if (ansi256Enabled()) {
    return `\x1b[38;5;${token.ansi256}m${text}${ANSI_CODES.reset}`;
  }
  return colorize(text, token.ansi8, true);
}

/**
 * 裁决五值直染唯一出口（DESIGN_SYSTEM 动作 3）。
 * 语义：CONFIRMED 绿 / REFUTED 红 / INCONCLUSIVE 琥珀 / DEGRADED_SCOPE 紫 / UNTESTED 灰
 * （SSOT = platform/design_tokens.ts；256 终端精确色，降级语义族）。
 * 默认随 ansiEnabled()——非 TTY / NO_COLOR / 管道场景输出纯文本（golden-text 零冲击）。
 * 未知裁决字符串 fail-closed 返回原文（不着色、不染色撒谎）。
 */
export function verdictText(verdict: string, opts: { enabled?: boolean } = {}): string {
  const token = VERDICT_COLORS[verdict as keyof typeof VERDICT_COLORS] as
    | { readonly ansi256: number; readonly ansi8: AnsiColor }
    | undefined;
  if (token === undefined) return verdict;
  return colorizeToken(verdict, token, opts.enabled ?? ansiEnabled());
}

/** 简单 spinner 帧序列。 */
export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * 创建异步 spinner。
 * 返回 stop 函数；stop(true) 显示完成标志，stop(false) 显示失败标志。
 * 非 TTY 环境安全降级为无输出。
 */
export function createSpinner(
  message: string,
  opts: { stream?: NodeJS.WriteStream; frameIntervalMs?: number } = {},
): { stop: (ok?: boolean) => void; update: (msg: string) => void } {
  const stream = opts.stream ?? process.stdout;
  const enabled = ansiEnabled({ stream });

  if (!enabled || stream === undefined) {
    // 非 TTY：静默（调用方自行决定是否打印最终状态）。
    return { stop: () => undefined, update: () => undefined };
  }

  let interval: ReturnType<typeof setInterval> | null = null;
  let frame = 0;
  let current = message;
  let stopped = false;

  const draw = (): void => {
    if (stopped) return;
    const frameChar = SPINNER_FRAMES[frame % SPINNER_FRAMES.length] ?? '|';
    stream.write(`\r${colorize(frameChar, 'cyan', true)} ${current}`);
    frame += 1;
  };

  interval = setInterval(draw, opts.frameIntervalMs ?? 100);
  draw();

  return {
    update(msg: string): void {
      current = msg;
      draw();
    },
    stop(ok = true): void {
      if (stopped) return;
      stopped = true;
      if (interval !== null) clearInterval(interval);
      const icon = ok ? colorize('✔', 'green', true) : colorize('✖', 'red', true);
      stream.write(`\r${icon} ${current}\n`);
    },
  };
}

/**
 * 渲染 ASCII 进度条（非 TTY 安全）。
 * @param progress - 0..1
 * @param width - 字符宽度
 */
export function renderProgressBar(progress: number, width = 20, enabled = true): string {
  const clamped = Math.max(0, Math.min(1, progress));
  const filled = Math.round(clamped * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  const pct = `${Math.round(clamped * 100).toString().padStart(3)}%`;
  const colored = enabled ? colorize(bar, 'green', true) : bar;
  return `${colored} ${pct}`;
}

/** Wide (2-cell) code point ranges: CJK, Hangul, Kana compat, fullwidth forms, emoji pictographs.
 * Data-driven table (behavior-identical to the previous boolean chain, split for complexity budget).
 */
const WIDE_CODEPOINT_RANGES: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2329, 0x232a],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1faff],
  [0x20000, 0x3fffd],
];

/** Narrow exceptions inside the wide blocks (U+303F IDEOGRAPHIC HALFWORD FILL SPACE etc.). */
const NARROW_CODEPOINT_EXCEPTIONS: ReadonlySet<number> = new Set([0x303f]);

function isWideCodePoint(code: number): boolean {
  if (code < 0x1100 || NARROW_CODEPOINT_EXCEPTIONS.has(code)) return false;
  return WIDE_CODEPOINT_RANGES.some(([lo, hi]) => code >= lo && code <= hi);
}

/** Return terminal display width, not UTF-16 code-unit length.
 * CJK/full-width glyphs occupy two terminal cells; combining marks occupy zero.
 * This intentionally stays dependency-free so CLI bootstrap remains reliable.
 */
export function displayWidth(value: string): number {
  let width = 0;
  for (const char of Array.from(value)) {
    if (/\p{Mark}/u.test(char)) continue;
    width += isWideCodePoint(char.codePointAt(0) ?? 0) ? 2 : 1;
  }
  return width;
}

function padDisplay(value: string, width: number): string {
  return value + ' '.repeat(Math.max(0, width - displayWidth(value)));
}

/**
 * CJK 安全截断（Phase 4 终端宽度折行契约的截断语义——截断而非折行：
 * 折行会破坏表格行对齐，截断保对齐 + `…` 单格标记如实声明信息缺失）。
 * ANSI 转义序列不参与宽度计算也不被截断（先剥离再截断——本渲染层约定
 * 上色在表格之外进行，见 renderTable 的 dim 处理）。
 */
export function truncateDisplay(value: string, width: number): string {
  if (width < 1) return '';
  if (displayWidth(value) <= width) return value;
  const marker = '…';
  const budget = width - 1; // 给 … 留一格
  if (budget <= 0) return marker;
  let used = 0;
  let out = '';
  for (const char of Array.from(value)) {
    const w = /\p{Mark}/u.test(char) ? 0 : isWideCodePoint(char.codePointAt(0) ?? 0) ? 2 : 1;
    if (used + w > budget) break;
    used += w;
    out += char;
  }
  return `${out}${marker}`;
}

/** 表格列宽下限（截断也不低于此——再窄就只剩省略号，无信息量）。 */
const MIN_COL_WIDTH = 6;

/**
 * 渲染简单的对齐表格（markdown 风格分隔，跨平台）。
 * Phase 4 契约：自然总宽超过 maxWidth（默认终端列数，非 TTY 80）时，
 * 从最宽列起逐格压缩至 ≥MIN_COL_WIDTH，单元格内容经 truncateDisplay 截断——
 * 保行对齐；绝不无声溢出终端（契约来源：指令 Phase 4.1「自动检测终端宽度折行」）。
 * @param headers - 列头
 * @param rows - 数据行
 */
export function renderTable(
  headers: readonly string[],
  rows: readonly (readonly (string | number | null)[])[],
  enabled = true,
  opts: { maxWidth?: number } = {},
): string {
  const maxWidth = opts.maxWidth ?? (process.stdout.isTTY ? process.stdout.columns : 80) ?? 80;

  const colWidths = headers.map((_, col) => {
    const headerCell = headers[col] ?? '';
    let max = displayWidth(headerCell);
    for (const row of rows) {
      const cell = row[col];
      const len = cell === null || cell === undefined ? 0 : displayWidth(String(cell));
      if (len > max) max = len;
    }
    return max;
  });

  // Phase 4 终端宽度契约：自然总宽超限 → 从最宽列起逐格压缩（保行对齐，截断不折行）。
  const borders = headers.length * 3 + 1;
  let total = colWidths.reduce((a, b) => a + b, 0) + borders;
  while (total > maxWidth) {
    let widest = -1;
    for (let i = 0; i < colWidths.length; i += 1) {
      const w = colWidths[i] ?? 0;
      if (w > MIN_COL_WIDTH && (widest === -1 || w > (colWidths[widest] ?? 0))) widest = i;
    }
    if (widest === -1) break; // 全部到下限：如实输出（宁窄不乱）
    colWidths[widest] = (colWidths[widest] ?? 0) - 1;
    total -= 1;
  }

  const fmtCell = (cell: string | number | null, width: number): string => {
    const s = cell === null ? '' : String(cell);
    const w = width < 0 ? 0 : width;
    return padDisplay(truncateDisplay(s, w), w);
  };

  const sep = `+-${colWidths.map((w) => '-'.repeat(w)).join('-+-')}-+`;
  const headerLine = `| ${headers.map((h, i) => fmtCell(h, colWidths[i] ?? 0)).join(' | ')} |`;

  const lines: string[] = [sep, headerLine, sep];
  for (const row of rows) {
    lines.push(`| ${row.map((c, i) => fmtCell(c, colWidths[i] ?? 0)).join(' | ')} |`);
  }
  lines.push(sep);

  const join = lines.join('\n');
  return enabled ? colorize(join, 'dim', true) : join;
}

/** 分隔线（跨平台）。 */
export function rule(ch = '─', width = 60, enabled = true): string {
  const line = ch.repeat(width);
  return enabled ? colorize(line, 'dim', true) : line;
}

/** 状态徽章（PASS / FAIL / WARN / SKIP）。 */
export function badge(status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP', enabled = true): string {
  const map: Record<string, { text: string; color: AnsiColor }> = {
    PASS: { text: 'PASS', color: 'green' },
    FAIL: { text: 'FAIL', color: 'red' },
    WARN: { text: 'WARN', color: 'yellow' },
    SKIP: { text: 'SKIP', color: 'gray' },
  };
  const entry = map[status] ?? { text: status, color: 'gray' as const };
  return colorize(`[${entry.text}]`, entry.color, enabled);
}
