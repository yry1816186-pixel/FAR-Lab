import type { SdmBlock, SdmDocument, SdmEquation, SdmFigure, SdmTable, SdmXref, SdmXrefTargetKind } from '../sdm.js';
import { guessLanguage, panelsFromCaption, scanLatexSymbols, scanXrefsInText, normText, IdGen, numberFromLabel } from '../parseutil.js';

/**
 * Markdown → SDM structure recovery (MULTIMODAL lane). GFM subset, deterministic
 * line grammar: ATX headings, pipe tables (header + alignment row), fenced code
 * blocks with language, $$ display math, blockquotes, list items, and markdown
 * images (alt text = caption). Cross-references recovered by printed-pattern
 * scan and resolved against the extracted figure/table/equation numbers.
 */

export interface MarkdownOrigin { name: string; url?: string }

export const parseMarkdown = (src: string, origin: MarkdownOrigin): SdmDocument => {
  const warnings: string[] = [];
  const lines = src.split(/\r?\n/);
  const blocks: SdmBlock[] = [];
  const figures: SdmFigure[] = [];
  const tables: SdmTable[] = [];
  const equations: SdmEquation[] = [];
  const xrefs: SdmXref[] = [];

  const blk = new IdGen('blk');
  const fig = new IdGen('fig');
  const tab = new IdGen('tab');
  const eq = new IdGen('eq');
  const headingStack: string[] = [];
  const meta: SdmDocument['meta'] = { authors: [] };
  let title: string | undefined;

  let i = 0;
  let paraStart: number | null = null;
  let paraBuf: string[] = [];
  const flushPara = (): void => {
    if (paraBuf.length === 0) { paraStart = null; return; }
    const text = normText(paraBuf.join(' '));
    if (text.length > 0) {
      const id = blk.next();
      blocks.push({
        id, kind: 'paragraph', text,
        parentHeadingId: headingStack[headingStack.length - 1] ?? null,
        ...(paraStart !== null ? { provenance: { charStart: paraStart, charEnd: paraStart + paraBuf.join('\n').length } } : {}),
      });
      pendingScans.push({ blockId: id, text });
    }
    paraBuf = [];
    paraStart = null;
  };
  // Forward references (mention before the image/table line) are the norm —
  // defer pattern-scan resolution to a post-pass.
  const pendingScans: Array<{ blockId: string; text: string }> = [];
  const resolveByNumber = (kind: SdmXrefTargetKind, num: number): string | undefined => {
    const pool = kind === 'figure' ? figures : kind === 'table' ? tables : kind === 'equation' ? equations : [];
    return (pool as Array<{ id: string; label: string }>).find((r) => numberFromLabel(r.label) === num)?.id;
  };

  // Offset of each line for char provenance.
  const lineOffsets: number[] = [];
  let acc = 0;
  for (const l of lines) { lineOffsets.push(acc); acc += l.length + 1; }

  while (i < lines.length) {
    const line = lines[i] as string;
    const trimmed = line.trim();

    // fenced code block
    const fence = /^```([\w+-]*)\s*$/.exec(trimmed);
    if (fence !== null) {
      flushPara();
      const lang = fence[1] ?? '';
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test((lines[i] as string).trim())) { body.push(lines[i] as string); i += 1; }
      blocks.push({ id: blk.next(), kind: 'code', text: body.join('\n'), ...(lang.length > 0 ? { provenance: { elementPath: `code:${lang}` } } : {}) });
      i += 1;
      continue;
    }

    // display math $$
    if (/^\$\$\s*$/.test(trimmed)) {
      flushPara();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^\$\$\s*$/.test((lines[i] as string).trim())) { body.push(lines[i] as string); i += 1; }
      const latex = body.join('\n').trim();
      if (latex.length > 0) {
        equations.push({ id: eq.next(), latex, symbols: scanLatexSymbols(latex) });
      }
      i += 1;
      continue;
    }

    // heading
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h !== null) {
      flushPara();
      const level = (h[1] ?? '#').length;
      const text = normText(h[2] ?? '');
      if (text.length > 0) {
        const id = blk.next();
        blocks.push({ id, kind: 'heading', text, headingLevel: level, parentHeadingId: headingStack[headingStack.length - 1] ?? null, provenance: { charStart: lineOffsets[i] } });
        if (level === 1 && title === undefined) title = text;
        while (headingStack.length >= level) headingStack.pop();
        headingStack.push(id);
      }
      i += 1;
      continue;
    }

    // pipe table: current line has |, next line is alignment row
    if (trimmed.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test((lines[i + 1] as string))) {
      flushPara();
      const headerCells = splitPipeRow(trimmed);
      const grid: string[][] = [headerCells];
      i += 2;
      while (i < lines.length && (lines[i] as string).trim().includes('|') && (lines[i] as string).trim().length > 0) {
        grid.push(splitPipeRow((lines[i] as string).trim()));
        i += 1;
      }
      const id = tab.next();
      const label = `Table ${tab.count}`;
      tables.push({ id, label, grid, headerRows: 1, mergedCells: [], footnotes: [], provenance: { charStart: lineOffsets[i] } });
      continue;
    }

    // list item
    if (/^([-*+]|\d+\.)\s+/.test(trimmed)) {
      flushPara();
      const text = normText(trimmed.replace(/^([-*+]|\d+\.)\s+/, ''));
      if (text.length > 0) {
        const id = blk.next();
        blocks.push({ id, kind: 'list_item', text, parentHeadingId: headingStack[headingStack.length - 1] ?? null, provenance: { charStart: lineOffsets[i] } });
        pendingScans.push({ blockId: id, text });
      }
      i += 1;
      continue;
    }

    // blockquote
    if (trimmed.startsWith('>')) {
      flushPara();
      const text = normText(trimmed.replace(/^>\s?/, ''));
      if (text.length > 0) blocks.push({ id: blk.next(), kind: 'quote', text, provenance: { charStart: lineOffsets[i] } });
      i += 1;
      continue;
    }

    // markdown image on its own line → figure record
    const img = /^!\[([^\]]*)\]\(([^)\s]+)[^)]*\)$/.exec(trimmed);
    if (img !== null) {
      flushPara();
      const id = fig.next();
      const alt = normText(img[1] ?? '');
      const label = `Image ${fig.count}`;
      // Caption convention: next non-empty italic/plain line directly below the image.
      let caption = alt;
      // Caption convention: an italic line directly below (one blank line allowed).
      for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j += 1) {
        const cand = (lines[j] as string).trim();
        if (cand.length === 0) continue;
        if (/^\*[^*]+\*$/.test(cand)) { caption = cand.slice(1, -1).trim(); i = j; }
        break;
      }
      figures.push({
        id, label, caption, panels: panelsFromCaption(caption),
        graphicRef: img[2] ?? '', perception: { status: 'not_extracted' },
      });
      if (caption.length > 0) blocks.push({ id: blk.next(), kind: 'caption', text: `${label}: ${caption}` });
      i += 1;
      continue;
    }

    // blank line → paragraph boundary
    if (trimmed.length === 0) { flushPara(); i += 1; continue; }

    // paragraph accumulation
    if (paraStart === null) paraStart = lineOffsets[i] ?? 0;
    paraBuf.push(trimmed);
    i += 1;
  }
  flushPara();

  for (const pscan of pendingScans) {
    xrefs.push(...scanXrefsInText(pscan.blockId, pscan.text, resolveByNumber));
  }

  const bodyText = blocks.map((b) => b.text).join(' ');
  return {
    schemaVersion: 'sdm-1',
    extractor: { name: 'markdown-structure-v1', route: 'markdown' },
    origin: { kind: 'upload', name: origin.name, ...(origin.url !== undefined ? { url: origin.url } : {}) },
    meta: { ...meta, ...(title !== undefined ? { title } : {}), language: guessLanguage(bodyText) },
    blocks, figures, tables, equations, citations: [], xrefs,
    diagnostics: { parseStatus: blocks.length > 0 ? 'ok' : 'failed', warnings, truncated: false },
  };
};

const splitPipeRow = (row: string): string[] => {
  const noEdges = row.replace(/^\|/, '').replace(/\|$/, '');
  return noEdges.split('|').map((c) => normText(c));
};
