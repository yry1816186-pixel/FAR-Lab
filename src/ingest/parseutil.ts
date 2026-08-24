import type { SdmBlock, SdmEquationSymbol, SdmFigurePanel, SdmXref, SdmXrefTargetKind } from './sdm.js';

/**
 * Shared deterministic extraction helpers for the SDM parsers (MULTIMODAL lane).
 * Pure functions only — every parser in this lane must stay deterministic and
 * side-effect free so identical input yields byte-identical SDM output.
 */

/** CJK ratio above this → language guess 'zh' (deterministic heuristic, honest guess). */
export const guessLanguage = (text: string): 'zh' | 'en' | undefined => {
  const sample = text.slice(0, 4000);
  if (sample.trim().length === 0) return undefined;
  const cjk = (sample.match(/[\u4E00-\u9FFF\u3400-\u4DBF]/g) ?? []).length;
  const letters = (sample.match(/[A-Za-z]/g) ?? []).length;
  if (cjk + letters === 0) return undefined;
  return cjk / (cjk + letters) > 0.3 ? 'zh' : 'en';
};

/**
 * Split a figure caption into panels on printed "(a) … (b) …" / "（a）…" segments.
 * Deterministic; returns [] when the caption carries no panel markers (single-panel
 * or unmarked figures — absence of panels is honest, not an error).
 */
export const panelsFromCaption = (caption: string): SdmFigurePanel[] => {
  const panels: SdmFigurePanel[] = [];
  // Marker: (a) or （A） at start or after whitespace/punctuation — including
  // full-width CJK punctuation (。，、；) which separates caption segments in
  // Chinese/Japanese figures (found by the mixed-language payload test 2026-08-24).
  const re = /(?:^|[\s;,.\u3002\uFF0C\u3001\uFF1B])\(?（?\([a-z]\)）?/g;
  const marks: { label: string; start: number; contentStart: number }[] = [];
  for (const m of caption.matchAll(re)) {
    const labelMatch = /\(([a-z])\)|（([a-z])）/.exec(m[0]);
    if (labelMatch === null) continue;
    const label = (labelMatch[1] ?? labelMatch[2]) as string;
    if (marks.length > 0 && marks[marks.length - 1]!.label === label) continue;
    marks.push({ label, start: m.index, contentStart: m.index + m[0].length });
  }
  for (let i = 0; i < marks.length; i += 1) {
    const end = i + 1 < marks.length ? marks[i + 1]!.start : caption.length;
    const segment = caption.slice(marks[i]!.contentStart, end).trim().replace(/[;,.]$/, '');
    if (segment.length > 0) panels.push({ label: marks[i]!.label, captionSegment: segment });
  }
  return panels;
};

const GREEK_TOKENS = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa',
  'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
]);

/**
 * Deterministic LaTeX symbol scan: Greek commands, single Latin variables with
 * optional subscript, and operator names (\mathrm{X}, \operatorname{avg}).
 * All symbols are emitted UNRESOLVED — binding to definitions is a later semantic
 * tier; this index only makes them countable and searchable.
 */
export const scanLatexSymbols = (latex: string, cap = 40): SdmEquationSymbol[] => {
  const out: SdmEquationSymbol[] = [];
  const seen = new Set<string>();
  const push = (tok: string, kind: SdmEquationSymbol['kind']): void => {
    if (seen.has(tok) || out.length >= cap) return;
    seen.add(tok);
    out.push({ latex: tok, kind, resolved: false });
  };
  for (const m of latex.matchAll(/\\([A-Za-z]+)/g)) {
    const name = m[1] as string;
    if (GREEK_TOKENS.has(name)) push(`\\${name}`, 'greek');
    else if (/^(mathrm|mathit|mathbf|operatorname)$/.test(name)) {
      const arg = new RegExp(`\\\\${name}\\{([^{}]{1,24})\\}`).exec(latex.slice(m.index));
      if (arg !== null) push(arg[1] as string, 'operator');
    }
    // other commands (\frac, \sum) are structure, not symbols
  }
  for (const m of latex.matchAll(/(^|[^\\A-Za-z])([A-Za-z])(_|(?![A-Za-z]))/g)) {
    const letter = m[2] as string;
    const after = latex.slice((m.index ?? 0) + m[0].length);
    const sub = /^_\{?([A-Za-z0-9]{1,8})/.exec(after);
    push(sub !== null ? `${letter}_{${sub[1]}}` : letter, 'latin');
  }
  return out;
};

/**
 * Printed cross-reference patterns in body text, language-tolerant (en/zh).
 * Used by routes without explicit xref markup (pdfjs, LaTeX source, markdown).
 */
export interface XrefPattern {
  kind: SdmXrefTargetKind;
  re: RegExp;
}

export const XREF_PATTERNS: readonly XrefPattern[] = [
  // Boundary is "not preceded by an ASCII alnum" rather than \b: \b never
  // holds adjacent to CJK (CJK is outside \w), so mid-sentence 图 N / 表 N /
  // 式 (N) references in Chinese text would silently never match (fixed
  // 2026-08-24, mixed-language payload test). For Latin prefixes the
  // lookbehind is equivalent to the old \b (blocks mid-word matches).
  { kind: 'figure', re: /(?<![A-Za-z0-9])(?:Fig(?:ure)?s?\.?|图)\s*(\d{1,3})([a-z])?/g },
  { kind: 'table', re: /(?<![A-Za-z0-9])(?:Tables?\.?|表)\s*(\d{1,3})/g },
  { kind: 'equation', re: /(?<![A-Za-z0-9])(?:Eqs?\.?|Eqs?\.?\s*\(|式)\s*\(?\(?(\d{1,3})\)?\)?/g },
  { kind: 'citation', re: /\[(\d{1,3}(?:\s*,\s*\d{1,3})*(?:\s*[-–]\s*\d{1,3})?)\]/g },
];

/** Match raw xref text against records keyed by printed number (fig 2 → fig with label Figure 2). */
export const numberFromLabel = (label: string): number | null => {
  const m = /(\d{1,3})/.exec(label);
  return m === null ? null : Number(m[1]);
};

/** Scan one block's text for printed cross-references; resolution against provided lookup. */
export const scanXrefsInText = (
  blockId: string,
  text: string,
  resolve: (kind: SdmXrefTargetKind, num: number, sub?: string) => string | undefined,
): SdmXref[] => {
  const out: SdmXref[] = [];
  for (const { kind, re } of XREF_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const numTok = m[1] ?? '';
      // Citation ranges "3-7" expand to each number.
      const nums = numTok.includes('-') || numTok.includes('–')
        ? (() => {
            const parts = numTok.split(/[-–]/).map((x) => Number(x.trim()));
            const lo = parts[0] ?? 0;
            const hi = parts[1] ?? lo;
            const list: number[] = [];
            for (let n = lo; Number.isFinite(lo) && Number.isFinite(hi) && n <= Math.min(hi, lo + 50); n += 1) list.push(n);
            return list;
          })()
        : numTok.split(',').map((x) => Number(x.trim()));
      for (const n of nums) {
        if (!Number.isInteger(n) || n < 1 || n > 999) continue;
        const sub = m[2];
        const targetId = resolve(kind, n, sub);
        out.push({
          fromBlockId: blockId,
          targetKind: kind,
          ...(targetId !== undefined ? { targetId } : {}),
          rawText: m[0].replace(/\s+/g, ' ').trim(),
          status: targetId !== undefined ? 'resolved' : 'unresolved',
        });
      }
    }
  }
  return out;
};

/** Block-id counter helper — deterministic sequential ids per document. */
export class IdGen {
  private n = 0;
  constructor(private readonly prefix: string) {}
  next(): string {
    this.n += 1;
    return `${this.prefix}_${this.n}`;
  }
  get count(): number { return this.n; }
}

/** Whitespace-normalize extracted text (block text discipline across all parsers). */
export const normText = (s: string): string => s.replace(/\s+/g, ' ').trim();

export const blockText = (id: string, kind: SdmBlock['kind'], text: string): SdmBlock => ({ id, kind, text });
