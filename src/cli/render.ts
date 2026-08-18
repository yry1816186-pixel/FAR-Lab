// src/cli/render.ts
// 跨平台 CLI 渲染层（用户愿景「图形化 CLI 稳态交互与动态显示」）。
//
// 设计原则：
//   · 零外部依赖（不引入 cli-color/ora/boxen），ANSI 转义手写且跨平台安全。
//   · Windows 旧终端（ConHost）自动降级为纯文本；新 Windows Terminal 支持 ANSI。
//   · 所有渲染函数返回字符串，由调用方决定写 stdout（便于测试与管道）。
//   · 非 TTY 环境（管道/CI）自动关闭 spinner/进度条，避免污染结构化输出。
//   · ADDITIVE ONLY — 不修改现有命令输出。

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

/** Unicode ranges that conventionally occupy two terminal cells.
 * The U+303F gap is intentionally excluded to preserve the previous classifier.
 */
const WIDE_RANGES: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3040, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1faff],
  [0x20000, 0x3fffd],
];

const WIDE_SINGLE_CODE_POINTS = new Set([0x2329, 0x232a]);

function isWideCodePoint(code: number): boolean {
  if (WIDE_SINGLE_CODE_POINTS.has(code)) return true;
  return WIDE_RANGES.some(([start, end]) => code >= start && code <= end);
}

/** Return terminal display width, not UTF-16 code-unit length.
 * CJK/full-width glyphs occupy two terminal cells; combining marks occupy zero.
 * This intentionally stays dependency-free so CLI bootstrap remains reliable.
 */
export function displayWidth(value: string): number {
  let width = 0;
  for (const char of Array.from(value)) {
    if (/\p{Mark}/u.test(char)) continue;
    const code = char.codePointAt(0) ?? 0;
    width += isWideCodePoint(code) ? 2 : 1;
  }
  return width;
}

function padDisplay(value: string, width: number): string {
  return value + ' '.repeat(Math.max(0, width - displayWidth(value)));
}

/**
 * 渲染简单的对齐表格（markdown 风格分隔，跨平台）。
 * @param headers - 列头
 * @param rows - 数据行
 */
export function renderTable(headers: readonly string[], rows: readonly (readonly (string | number | null)[])[], enabled = true): string {
  const allRows: Array<readonly (string | number | null)[]> = [headers as readonly (string | number | null)[], ...rows];
  if (allRows.length === 0) return '';

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

  const fmtCell = (cell: string | number | null, width: number): string => {
    const s = cell === null ? '' : String(cell);
    const w = width < 0 ? 0 : width;
    return padDisplay(s, w);
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
