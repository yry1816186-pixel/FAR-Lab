import { z } from 'zod';
import type { SdmBlock, SdmDocument, SdmFigure, SdmTable, SdmXref, SdmXrefTargetKind } from '../sdm.js';
import { guessLanguage, panelsFromCaption, scanXrefsInText, IdGen, numberFromLabel } from '../parseutil.js';

/**
 * pdfjs text-layer → SDM structure recovery (MULTIMODAL lane, upload route).
 * The web client is a THIN COLLECTOR (pdfjs text items with geometry); ALL
 * understanding lives here, deterministic and testable: line reconstruction,
 * two-column detection, reading-order re-flow, heading/caption classification,
 * text-layer table-grid reconstruction (x-gap alignment evidence), and printed
 * cross-reference resolution. Page coordinates are preserved on every block.
 *
 * Honesty contract (what this route does NOT claim):
 * - No image pixels: figure records carry caption + caption-anchor region only;
 *   axis/panel perception is T4 (BLOCKED-live) and stays 'not_extracted'.
 * - No equations from glyph soup: reconstructing LaTeX from PDF glyphs requires
 *   OCR/VLM. The equations list stays empty on this route — stated, not hidden.
 * - Scanned/no-text-layer PDFs fail visibly with 'no_text_layer'.
 */

export const PdfTextItem = z.object({
  str: z.string(),
  /** Left edge, PDF points, top-left origin. */
  x: z.number(),
  /** TOP edge, PDF points (collector converts from pdfjs's bottom-origin transform). */
  y: z.number(),
  w: z.number(),
  h: z.number(),
  fontSize: z.number().positive(),
  fontName: z.string().optional(),
});
export type PdfTextItem = z.infer<typeof PdfTextItem>;

export const PdfTextPage = z.object({
  pageNumber: z.number().int().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  items: z.array(PdfTextItem),
});
export type PdfTextPage = z.infer<typeof PdfTextPage>;

/** Web-collector payload contract (stable for HCI; zod-validated server-side). */
export const PdfTextPayload = z.object({
  numPages: z.number().int().positive(),
  pages: z.array(PdfTextPage).min(1),
  truncated: z.boolean().default(false),
  fileSha256: z.string().length(64),
});
export type PdfTextPayload = z.infer<typeof PdfTextPayload>;

interface Line {
  text: string;
  x0: number; y0: number; x1: number; y1: number;
  fontSize: number;
  page: number;
  items: PdfTextItem[];
}

const CAPTION_RE = /^(Figure|Fig\.|Table|图|表)\s*(\d{1,3})\s*[:.]\s*/;

export interface PdfOrigin { name: string }

export const buildSdmFromPdfText = (payload: PdfTextPayload, origin: PdfOrigin): SdmDocument => {
  const warnings: string[] = [];
  const blocks: SdmBlock[] = [];
  const figures: SdmFigure[] = [];
  const tables: SdmTable[] = [];
  const xrefs: SdmXref[] = [];
  const blk = new IdGen('blk');
  const fig = new IdGen('fig');
  const tab = new IdGen('tab');

  const totalItems = payload.pages.reduce((n, p) => n + p.items.length, 0);
  if (totalItems === 0) {
    return failDoc(origin, ['no_text_layer: PDF has no extractable text (scanned or image-only) — OCR is a separate capability, refusing to pretend']);
  }

  // Body font size = the size carrying the most characters.
  const sizeWeights = new Map<number, number>();
  for (const p of payload.pages) for (const it of p.items) {
    if (it.str.trim().length === 0) continue;
    sizeWeights.set(it.fontSize, (sizeWeights.get(it.fontSize) ?? 0) + it.str.length);
  }
  let bodySize = 10;
  let maxWeight = 0;
  for (const [size, w] of sizeWeights) if (w > maxWeight) { maxWeight = w; bodySize = size; }

  const resolveByNumber = (kind: SdmXrefTargetKind, num: number): string | undefined => {
    const pool = kind === 'figure' ? figures : kind === 'table' ? tables : [];
    return (pool as Array<{ id: string; label: string }>).find((r) => numberFromLabel(r.label) === num)?.id;
  };

  let currentHeadingId: string | null = null;
  for (const page of payload.pages) {
    const ordered = columnAwareLines(page, warnings);
    if (ordered.length === 0) continue;

    let buf: Line[] = [];
    let bufKind: 'paragraph' | 'caption' | 'heading' | null = null;
    let openFigure: SdmFigure | null = null;
    let openTable: SdmTable | null = null;

    const flush = (): void => {
      if (buf.length > 0 && bufKind !== null) {
        const text = buf.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
        if (text.length > 0) {
          const id = blk.next();
          blocks.push({
            id,
            kind: bufKind,
            text,
            ...(bufKind === 'heading'
              ? { headingLevel: headingLevelFor(buf[0] as Line, bodySize), parentHeadingId: currentHeadingId }
              : { parentHeadingId: currentHeadingId }),
            provenance: { page: page.pageNumber, bbox: unionBbox(buf) },
          });
          if (bufKind === 'heading') currentHeadingId = id;
          else xrefs.push(...scanXrefsInText(id, text, resolveByNumber));
          if (bufKind === 'paragraph') {
            const t = alignedTableOf(buf, page.pageNumber);
            if (t !== null) {
              t.id = tab.next();
              tables.push(t);
              warnings.push(`${t.label}: grid reconstructed from aligned text rows (text-layer evidence, page ${page.pageNumber})`);
            }
          }
        }
      }
      buf = []; bufKind = null; openFigure = null; openTable = null;
    };

    for (let li = 0; li < ordered.length; li += 1) {
      const line = ordered[li] as Line;
      const prev = li > 0 ? ordered[li - 1] as Line : undefined;
      const capMatch = CAPTION_RE.exec(line.text);
      const isHeading = capMatch === null && isHeadingLine(line, bodySize, page.width);
      // Gap from the previous line in reading order. A BACKWARD y-jump means a
      // reading-order column switch (right column follows left) — always a block
      // break. Forward overlap (0 gap) stays tight: wrapped lines.
      const rawGap = prev !== undefined ? line.y0 - prev.y1 : Number.POSITIVE_INFINITY;
      const gap = rawGap < -0.5 ? -1 : Math.max(rawGap, 0);
      const tightGap = gap >= 0 && gap < line.fontSize * 1.6;

      if (capMatch !== null) {
        flush();
        const isTable = (capMatch[1] ?? '') === 'Table' || (capMatch[1] ?? '') === '表';
        const num = Number(capMatch[2] ?? '0');
        // Printed label verbatim ("图 3", "Fig. 3", "Table 2") — the schema
        // contract says printed label; normalizing CJK captions to English
        // would erase the document's own language (fixed 2026-08-24).
        const label = `${capMatch[1] ?? (isTable ? 'Table' : 'Figure')} ${num}`;
        const bbox: [number, number, number, number] = [line.x0, line.y0, line.x1, line.y1];
        const captionText = line.text.slice((capMatch[0] ?? '').length).trim();
        if (isTable) {
          openTable = { id: tab.next(), label, caption: captionText, grid: [], headerRows: 0, mergedCells: [], footnotes: [], provenance: { page: page.pageNumber, bbox } };
          tables.push(openTable);
        } else {
          openFigure = { id: fig.next(), label, caption: captionText, panels: panelsFromCaption(captionText), region: { page: page.pageNumber, bbox }, perception: { status: 'not_extracted' }, provenance: { page: page.pageNumber, bbox } };
          figures.push(openFigure);
        }
        bufKind = 'caption';
        buf.push(line);
        continue;
      }

      const continuesCaption = bufKind === 'caption' && !isHeading && line.fontSize <= bodySize * 1.05 && tightGap;
      if (continuesCaption) {
        buf.push(line);
        const target = openFigure ?? openTable;
        if (target !== null) {
          target.caption = `${target.caption} ${line.text}`.trim();
          if (openFigure !== null) openFigure.panels = panelsFromCaption(openFigure.caption);
        }
        continue;
      }
      if (isHeading) {
        flush();
        bufKind = 'heading';
        buf.push(line);
        continue;
      }
      // A heading continues only while subsequent lines stay heading-sized;
      // body text directly below must not be absorbed into the heading.
      if (bufKind === 'heading') {
        if (!(tightGap && line.fontSize >= bodySize * 1.15)) {
          flush();
          bufKind = 'paragraph';
        }
      } else if (bufKind === null || !tightGap) {
        flush();
        bufKind = 'paragraph';
      }
      buf.push(line);
    }
    flush();
  }

  const bodyText = blocks.map((b) => b.text).join(' ');
  // Forward references (the mention flushes before the caption on a later
  // line/page registers the record) get one re-resolution pass against the
  // FINAL pools — single-pass resolution left them unresolved even though the
  // target exists in the same document (fixed 2026-08-24; intros routinely
  // cite figures pages ahead).
  const xrefsResolved = xrefs.map((x) => {
    if (x.status === 'resolved') return x;
    const num = numberFromLabel(x.rawText);
    if (num === null) return x;
    const targetId = resolveByNumber(x.targetKind, num);
    return targetId === undefined ? x : { ...x, targetId, status: 'resolved' as const };
  });
  return {
    schemaVersion: 'sdm-1',
    extractor: { name: 'pdf-text-layer-v1', route: 'pdf_text_layer' },
    origin: { kind: 'upload', name: origin.name },
    meta: { authors: [], language: guessLanguage(bodyText) },
    blocks, figures, tables, equations: [], citations: [], xrefs: xrefsResolved,
    diagnostics: {
      parseStatus: blocks.length > 0 ? 'ok' : 'failed',
      warnings: [...warnings, 'equations not reconstructed from PDF text layer (requires OCR/VLM — T4)'],
      truncated: payload.truncated,
    },
  };
};

// ---- line reconstruction ----------------------------------------------------

/**
 * Column-aware page processing: corridor detection runs on ITEM coverage (same-y
 * items in different columns must never merge into one line, or the corridor
 * disappears); lines are then built per column and interleaved into reading
 * order — bands separated by full-width lines, left column before right within
 * each band. Single-column pages skip straight to y-ordered lines.
 */
const columnAwareLines = (page: PdfTextPage, warnings: string[]): Line[] => {
  const items = page.items.filter((it) => it.str.trim().length > 0);
  const splitX = detectCorridor(items, page.width);
  if (splitX === null) return buildLinesFromItems(items, page.pageNumber).sort((a, b) => a.y0 - b.y0);
  const left = items.filter((it) => it.x + it.w <= splitX);
  const right = items.filter((it) => it.x >= splitX);
  const spanning = items.filter((it) => it.x < splitX && it.x + it.w > splitX);
  const linesL = buildLinesFromItems(left, page.pageNumber);
  const linesR = buildLinesFromItems(right, page.pageNumber);
  const linesS = buildLinesFromItems(spanning, page.pageNumber);
  const isSpanLine = (l: Line): boolean => l.x0 < splitX - 10 && l.x1 > splitX + 10;
  const events = [...linesL, ...linesR, ...linesS].sort((a, b) => a.y0 - b.y0);
  const ordered: Line[] = [];
  let bandL: Line[] = [];
  let bandR: Line[] = [];
  const flushBand = (): void => {
    ordered.push(...bandL.sort((a, b) => a.y0 - b.y0), ...bandR.sort((a, b) => a.y0 - b.y0));
    bandL = []; bandR = [];
  };
  for (const l of events) {
    if (isSpanLine(l)) { flushBand(); ordered.push(l); }
    else if (l.x1 <= splitX + 10) bandL.push(l);
    else bandR.push(l);
  }
  flushBand();
  warnings.push(`page ${page.pageNumber}: two-column layout detected (split ≈ ${Math.round(splitX)}pt), reading order re-flowed`);
  return ordered;
};

/** Corridor detection over ITEM x-coverage: a persistent zero-coverage vertical band. */
const detectCorridor = (items: PdfTextItem[], pageWidth: number): number | null => {
  if (items.length < 8) return null;
  const bins = new Array(Math.ceil(pageWidth / 4) + 1).fill(0);
  // Histogram only NARROW items (< 50% page width): column text is narrow by
  // construction, while titles/headers span the full width and would cover the
  // corridor — they are spanning elements, not corridor evidence.
  for (const it of items) {
    if (it.w > pageWidth * 0.5) continue;
    for (let x = Math.floor(it.x / 4); x <= Math.floor((it.x + it.w) / 4) && x < bins.length; x += 1) bins[x] = (bins[x] ?? 0) + 1;
  }
  const lo = Math.floor((pageWidth * 0.3) / 4);
  const hi = Math.floor((pageWidth * 0.7) / 4);
  let best: { x: number; w: number } | null = null;
  let runStart: number | null = null;
  for (let x = lo; x <= hi; x += 1) {
    const empty = (bins[x] ?? 0) === 0;
    if (empty && runStart === null) runStart = x;
    if ((!empty || x === hi) && runStart !== null) {
      const w = (x - runStart) * 4;
      if (best === null || w > best.w) best = { x: runStart * 4, w };
      runStart = null;
    }
  }
  if (best === null || best.w < 18) return null;
  const splitX = best.x + best.w / 2;
  const left = items.filter((it) => it.x + it.w <= splitX).length;
  const right = items.filter((it) => it.x >= splitX).length;
  const spanning = items.length - left - right;
  if (left < items.length * 0.25 || right < items.length * 0.25 || spanning > items.length * 0.5) return null;
  return splitX;
};

const buildLinesFromItems = (items: PdfTextItem[], pageNumber: number): Line[] => {
  const sorted = items
    .slice()
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const lines: Line[] = [];
  let cur: PdfTextItem[] = [];
  let curY: number | null = null;
  const emit = (group: PdfTextItem[]): void => {
    const sorted = group.slice().sort((a, b) => a.x - b.x);
    const parts: string[] = [];
    for (let i = 0; i < sorted.length; i += 1) {
      const it = sorted[i] as PdfTextItem;
      if (i > 0) {
        const prev = sorted[i - 1] as PdfTextItem;
        const gap = it.x - (prev.x + prev.w);
        if (gap > prev.fontSize * 0.25 && !/\s$/.test(parts[parts.length - 1] ?? '') && !/^\s/.test(it.str)) parts.push(' ');
      }
      parts.push(it.str);
    }
    const text = parts.join('').replace(/\s+/g, ' ').trim();
    if (text.length === 0) return;
    lines.push({
      text,
      x0: sorted[0]?.x ?? 0,
      y0: Math.min(...sorted.map((s) => s.y)),
      x1: Math.max(...sorted.map((s) => s.x + s.w)),
      y1: Math.max(...sorted.map((s) => s.y + s.h)),
      fontSize: Math.max(...sorted.map((s) => s.fontSize)),
      page: pageNumber,
      items: sorted,
    });
  };
  for (const it of sorted) {
    if (curY !== null && Math.abs(it.y - curY) > Math.max(2, it.fontSize * 0.5)) {
      emit(cur);
      cur = [];
    }
    cur.push(it);
    curY = it.y;
  }
  if (cur.length > 0) emit(cur);
  return lines;
};

// ---- classification -----------------------------------------------------------

const isHeadingLine = (line: Line, bodySize: number, pageWidth: number): boolean => {
  const short = line.text.length <= 120;
  const bigger = line.fontSize >= bodySize * 1.15;
  const noEndPunct = !/[.,;:]$/.test(line.text);
  const narrow = line.x1 - line.x0 < pageWidth * 0.92;
  return short && bigger && noEndPunct && narrow;
};

const headingLevelFor = (line: Line, bodySize: number): number => {
  const ratio = line.fontSize / bodySize;
  if (ratio >= 1.8) return 1;
  if (ratio >= 1.4) return 2;
  return 3;
};

const unionBbox = (lines: Line[]): [number, number, number, number] => [
  Math.min(...lines.map((l) => l.x0)),
  Math.min(...lines.map((l) => l.y0)),
  Math.max(...lines.map((l) => l.x1)),
  Math.max(...lines.map((l) => l.y1)),
];

/**
 * Aligned-gap table heuristic: EVERY line in the paragraph block splits at
 * x-gaps > 1.5×fontSize into the SAME segment count (≥2, ≤12) → grid rows.
 * One non-conforming line aborts — no partial guesses.
 */
const alignedTableOf = (lines: Line[], page: number): SdmTable | null => {
  const rows: string[][] = [];
  let colCount: number | null = null;
  for (const line of lines.slice(0, 80)) {
    const segs: string[] = [];
    let seg = '';
    for (let i = 0; i < line.items.length; i += 1) {
      const it = line.items[i] as PdfTextItem;
      if (i > 0) {
        const prev = line.items[i - 1] as PdfTextItem;
        if (it.x - (prev.x + prev.w) > it.fontSize * 1.5) { segs.push(seg.trim()); seg = ''; }
      }
      seg += it.str + ' ';
    }
    segs.push(seg.trim());
    if (segs.length < 2 || segs.length > 12) return null;
    if (colCount === null) colCount = segs.length;
    else if (segs.length !== colCount) return null;
    rows.push(segs);
  }
  if (rows.length < 2 || colCount === null || colCount < 2) return null;
  return {
    id: 'tab_pending', label: 'Table (text-aligned)', grid: rows, headerRows: 1, mergedCells: [], footnotes: [],
    provenance: { page, bbox: unionBbox(lines) },
  };
};

const failDoc = (origin: PdfOrigin, warnings: string[]): SdmDocument => ({
  schemaVersion: 'sdm-1',
  extractor: { name: 'pdf-text-layer-v1', route: 'pdf_text_layer' },
  origin: { kind: 'upload', name: origin.name },
  meta: { authors: [] },
  blocks: [], figures: [], tables: [], equations: [], citations: [], xrefs: [],
  diagnostics: { parseStatus: 'failed', warnings, truncated: false },
});
