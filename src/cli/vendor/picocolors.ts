/**
 * Vendored from picocolors v1.1.1 (ISC License, Copyright (c) 2021-2024
 * Oleksii Raspopov, Kostiantyn Denysov, Anton Verinov).
 * https://github.com/alexeyraspopov/picocolors — transcribed to TypeScript;
 * logic is line-for-line identical with the original picocolors.js.
 * Vendoring decision: craft-spec-v2 §9 (user-authorized "copy/borrow/use";
 * keeps the zero-runtime-dependency invariant while inheriting the complete
 * NO_COLOR / FORCE_COLOR / --no-color / win32 / TTY / TERM=dumb detection order).
 */
interface Picocolors {
  isColorSupported: boolean;
  reset: (s: string) => string;
  bold: (s: string) => string;
  dim: (s: string) => string;
  italic: (s: string) => string;
  underline: (s: string) => string;
  inverse: (s: string) => string;
  hidden: (s: string) => string;
  strikethrough: (s: string) => string;
  black: (s: string) => string;
  red: (s: string) => string;
  green: (s: string) => string;
  yellow: (s: string) => string;
  blue: (s: string) => string;
  magenta: (s: string) => string;
  cyan: (s: string) => string;
  white: (s: string) => string;
  bgBlack: (s: string) => string;
  bgRed: (s: string) => string;
  bgGreen: (s: string) => string;
  bgYellow: (s: string) => string;
  bgBlue: (s: string) => string;
  bgMagenta: (s: string) => string;
  bgCyan: (s: string) => string;
  bgWhite: (s: string) => string;
}

const p = process as NodeJS.Process & { argv: string[] };
const argv = p.argv ?? [];
const env = p.env ?? {};
// LOCAL ADAPTATION vs upstream picocolors.js (one line, documented): the
// upstream `platform === 'win32' ||` branch would keep colors on when stdout
// is piped on Windows; clig.dev requires color to die on non-TTY stdout, so
// here TTY is a hard precondition and win32 only waives the TERM check
// (Windows terminals handle VT natively).
const stdout = p.stdout as NodeJS.WriteStream | undefined;
const enabled =
  !(!!env.NO_COLOR || argv.includes('--no-color')) &&
  (!!env.FORCE_COLOR || argv.includes('--color') || ((stdout?.isTTY ?? false) && (p.platform === 'win32' || env.TERM !== 'dumb')) || !!env.CI);

const formatter = (open: number, close: number): ((input: string) => string) => {
  const openSeq = `\u001b[${open}m`;
  const closeSeq = `\u001b[${close}m`;
  return (input: string): string => {
    const string = '' + input;
    const index = string.indexOf(closeSeq, openSeq.length);
    return ~index
      ? openSeq + replaceClose(string, closeSeq, openSeq, index) + closeSeq
      : openSeq + string + closeSeq;
  };
};
const replaceClose = (string: string, close: string, replace: string, index: number): string => {
  let result = '';
  let cursor = 0;
  let idx = index;
  do {
    result += string.substring(cursor, idx) + replace;
    cursor = idx + close.length;
    idx = string.indexOf(close, cursor);
  } while (~idx);
  return result + string.substring(cursor);
};

const colors: Record<string, (s: string) => string> = {};
for (const [name, code] of [['reset', 0], ['bold', 1], ['dim', 2], ['italic', 3], ['underline', 4], ['inverse', 7], ['hidden', 8], ['strikethrough', 9]] as const) {
  colors[name] = enabled || code === 0 ? formatter(code, code) : String;
}
for (const [name, code] of [['black', 30], ['red', 31], ['green', 32], ['yellow', 33], ['blue', 34], ['magenta', 35], ['cyan', 36], ['white', 37]] as const) {
  const bg = code + 10;
  colors[name] = enabled ? formatter(code, 39) : String;
  colors['bg' + name[0]!.toUpperCase() + name.slice(1)] = enabled ? formatter(bg, 49) : String;
}

export const pc = {
  isColorSupported: enabled,
  reset: colors.reset!,
  bold: colors.bold!,
  dim: colors.dim!,
  italic: colors.italic!,
  underline: colors.underline!,
  inverse: colors.inverse!,
  hidden: colors.hidden!,
  strikethrough: colors.strikethrough!,
  black: colors.black!,
  red: colors.red!,
  green: colors.green!,
  yellow: colors.yellow!,
  blue: colors.blue!,
  magenta: colors.magenta!,
  cyan: colors.cyan!,
  white: colors.white!,
  bgBlack: colors.bgBlack!,
  bgRed: colors.bgRed!,
  bgGreen: colors.bgGreen!,
  bgYellow: colors.bgYellow!,
  bgBlue: colors.bgBlue!,
  bgMagenta: colors.bgMagenta!,
  bgCyan: colors.bgCyan!,
  bgWhite: colors.bgWhite!,
} satisfies Picocolors;
