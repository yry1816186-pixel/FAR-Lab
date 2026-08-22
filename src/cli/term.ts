/**
 * Terminal presentation layer (craft-spec-v2 §9, terminal-agent paradigm).
 * Semantics sourced from opencode/claude-code/gh/OpenROAD case studies:
 *   - stdout = clean human report (no prefixes); stderr = progress/log lines
 *   - 6-color ANSI minimal set; color dies entirely under NO_COLOR / non-TTY
 *     / TERM=dumb / --no-color (inherited from vendored picocolors)
 *   - ⏺ stage lines with ASCII fallback for non-darwin glyph divergence
 *   - static text progress only — no spinners, no invented percentages
 */
import { pc } from './vendor/picocolors.js';

/** Print to stdout: the report channel (pipe-clean, no decoration prefix). */
export const out = (line = ''): void => {
  process.stdout.write(line + '\n');
};

/** Print to stderr: the progress/log channel (keeps stdout parseable). */
export const log = (line = ''): void => {
  process.stderr.write(line + '\n');
};

/** Epistemic semantic colors (same mapping as web tones.ts). */
export const ink = {
  ok: pc.green,
  err: pc.red,
  warn: pc.yellow,
  info: pc.cyan,
  muted: pc.dim,
  bold: pc.bold,
  mono: (s: string): string => s, // terminal is already monospace
};

/** Stage marker: claude-code style dot with ASCII fallback on Windows. */
export const marker = (): string => (process.platform === 'darwin' ? '⏺' : '●');

/** Banner block (OpenROAD-style report channel, honest header). */
export function banner(lines: string[]): void {
  out(pc.bold('FAR-Lab') + pc.dim(' — evidence-constrained research workbench'));
  for (const line of lines) out(pc.dim('  ' + line));
}

/** ⏺ Stage line (one line per stage, no flooding) + optional sub-action mirror. */
export function stageLine(stage: string, detail?: string): void {
  const head = `${marker()} ${ink.bold(stage)}`;
  log(detail !== undefined ? `${head} ${pc.dim(detail)}` : head);
}

/** Sub-action mirror line (opencode style ↳ single-line activity). */
export function subLine(text: string): void {
  log(pc.dim(`  ↳ ${text}`));
}

/** Static determinate progress: "Stage k of N" — never a percentage we don't have. */
export function progressLine(done: number, total: number, label: string): void {
  log(`${ink.info(`[${done}/${total}]`)} ${label}`);
}

/** Structured error block (Snakemake-style: title + indented fields + hint). */
export function errorBlock(title: string, fields: Record<string, string | undefined>, hint?: string): void {
  const bar = pc.red('─'.repeat(52));
  out('');
  out(bar);
  out(`${marker()} ${pc.red(pc.bold(title))}`);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value.length > 0) out(`  ${pc.bold(key)}: ${value}`);
  }
  if (hint !== undefined) out(`  ${pc.yellow('fix')} : ${hint}`);
  out(bar);
}

/**
 * CJK-aware display width (East Asian Wide/Fullwidth count as 2 columns).
 * Needed because padEnd measures UTF-16 units, not terminal columns.
 */
export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    const wide =
      (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
      (code >= 0x2e80 && code <= 0xa4cf) || // CJK Radicals..Yi
      (code >= 0xac00 && code <= 0xd7a3) || // Hangul syllables
      (code >= 0xf900 && code <= 0xfaff) || // CJK compat ideographs
      (code >= 0xfe30 && code <= 0xfe4f) || // CJK compat forms
      (code >= 0xff00 && code <= 0xff60) || // Fullwidth forms
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x20000 && code <= 0x3fffd); // CJK ext
    w += wide ? 2 : 1;
  }
  return w;
}

/** padEnd by terminal columns (CJK-safe), so mixed-width rows stay aligned. */
export function padColumns(s: string, width: number): string {
  const pad = width - displayWidth(s);
  return pad > 0 ? s + ' '.repeat(pad) : s;
}

/** Simple aligned table renderer with CJK-safe padding. */
export function table(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) => Math.max(displayWidth(h), ...rows.map((r) => displayWidth(r[i] ?? ''))));
  const headerLine = headers.map((h, i) => pc.bold(pc.dim(padColumns(h, widths[i]!)))).join('  ');
  out(headerLine);
  for (const row of rows) {
    out(row.map((cell, i) => padColumns(cell ?? '', widths[i]!)).join('  '));
  }
}
