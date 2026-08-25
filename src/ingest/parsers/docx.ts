import type { SdmBlock, SdmDocument, SdmFigure, SdmTable, SdmXref, SdmXrefTargetKind } from '../sdm.js';
import { parseXml, findAll, childrenNamed, textOf, attrAny, type XmlElement } from '../xml.js';
import { readZip } from '../zip.js';
import { guessLanguage, panelsFromCaption, scanXrefsInText, normText, IdGen, numberFromLabel } from '../parseutil.js';

/**
 * DOCX structure recovery (MULTIMODAL lane extension, 2026-08-25). Word .docx
 * is a zip of OOXML parts; the shared ZIP reader + strict XML parser recover
 * the REAL structure: heading hierarchy (outlineLvl with styles.xml fallback,
 * locale-proof), tables with gridSpan/vMerge merged cells and tblHeader
 * header rows, figure paragraphs linked to Caption-styled paragraphs with
 * image targets via document rels, footnotes part, and core.xml metadata.
 * Provenance is `elementPath` (no page concept exists in OOXML).
 * Failures are typed reasons — never a guessed empty document.
 */

export type DocxParseResult =
  | { ok: true; sdm: SdmDocument }
  | { ok: false; reason: string };

const MAX_BLOCKS = 20_000;
const MAX_FIGURES = 2_000;
const MAX_TABLES = 2_000;

const xmlPart = (entries: Map<string, Buffer>, key: string): { ok: true; root: XmlElement } | { ok: false; reason: string } => {
  const raw = entries.get(key);
  if (raw === undefined) return { ok: false, reason: `docx part ${key} missing from the archive` };
  const parsed = parseXml(raw.toString('utf8'));
  if (parsed.status === 'error') return { ok: false, reason: `docx part ${key} is not well-formed XML: ${parsed.message}` };
  return { ok: true, root: parsed.root };
};

/** styleId → paragraph style info from styles.xml (absent styles.xml = empty map). */
interface StyleInfo { name?: string; outlineLevel?: number; isCaption: boolean }
const readStyles = (entries: Map<string, Buffer>): Map<string, StyleInfo> => {
  const map = new Map<string, StyleInfo>();
  if (!entries.has('word/styles.xml')) return map;
  const raw = (entries.get('word/styles.xml') as Buffer).toString('utf8');
  const parsed = parseXml(raw);
  if (parsed.status === 'error') return map;
  for (const style of findAll(parsed.root, 'style')) {
    const id = style.attrs['w:styleId'] ?? style.attrs['styleId'];
    if (id === undefined) continue;
    const nameEl = childrenNamed(style, 'name')[0];
    const name = nameEl !== undefined ? attrAny(nameEl, 'val') : undefined;
    const outlineEl = findAll(style, 'outlineLvl')[0];
    const outlineLevel = outlineEl !== undefined ? Number(attrAny(outlineEl, 'val')) : undefined;
    map.set(id, {
      ...(name !== undefined ? { name } : {}),
      ...(Number.isInteger(outlineLevel) && (outlineLevel as number) >= 0 && (outlineLevel as number) <= 8 ? { outlineLevel: (outlineLevel as number) + 1 } : {}),
      isCaption: name !== undefined && /caption/i.test(name),
    });
  }
  return map;
};

/** rId → normalized part path ('media/image1.png' → 'word/media/image1.png'). */
const readRels = (entries: Map<string, Buffer>, partKey: string): Map<string, string> => {
  const map = new Map<string, string>();
  const relsKey = partKey.replace(/([^/]+)$/, '_rels/$1.rels');
  const raw = entries.get(relsKey);
  if (raw === undefined) return map;
  const parsed = parseXml(raw.toString('utf8'));
  if (parsed.status === 'error') return map;
  for (const rel of findAll(parsed.root, 'Relationship')) {
    const id = rel.attrs['Id'];
    const target = rel.attrs['Target'];
    if (id === undefined || target === undefined) continue;
    const clean = target.replace(/^\//, '');
    map.set(id, clean.startsWith('word/') ? clean : `word/${clean}`);
  }
  return map;
};

const readCoreProps = (entries: Map<string, Buffer>): { title?: string; authors: string[]; year?: number } => {
  if (!entries.has('docProps/core.xml')) return { authors: [] };
  const parsed = parseXml((entries.get('docProps/core.xml') as Buffer).toString('utf8'));
  if (parsed.status === 'error') return { authors: [] };
  const title = findAll(parsed.root, 'title').map(textOf).find((t) => t.trim().length > 0);
  const authors = findAll(parsed.root, 'creator').map((c) => normText(textOf(c))).filter((a) => a.length > 0);
  const dates = [...findAll(parsed.root, 'created'), ...findAll(parsed.root, 'modified')].map(textOf);
  const yearMatch = dates.map((d) => /^(\d{4})/.exec(d.trim())).find((m) => m !== null);
  return {
    ...(title !== undefined && title.trim().length > 0 ? { title: normText(title) } : {}),
    authors,
    ...(yearMatch !== undefined ? { year: Number(yearMatch[1]) } : {}),
  };
};

// ---------------------------------------------------------------------------
// table grid with gridSpan/vMerge
// ---------------------------------------------------------------------------

const readDocxTable = (tblEl: XmlElement, path: string, tabId: string, warnings: string[]): SdmTable => {
  const grid: string[][] = [];
  const merged: SdmTable['mergedCells'] = [];
  const openVmerge = new Set<number>();               // grid columns with an unfinished vertical merge
  const spanByStart = new Map<string, { rowSpan: number; colSpan: number }>();
  let headerRows = 0;

  const rows = childrenNamed(tblEl, 'tr');
  rows.forEach((tr, r) => {
    while (grid.length < r + 1) grid.push([]);
    if (findAll(tr, 'tblHeader').length > 0 && r === headerRows) headerRows += 1;
    const row = grid[r] as string[];
    const covered = new Set<number>();                // columns this row actually touches
    let col = 0;
    for (const tc of childrenNamed(tr, 'tc')) {
      while (covered.has(col)) col += 1;              // never reuse a column within one row
      const gridSpanEl = findAll(tc, 'gridSpan')[0];
      const colSpan = Math.max(1, Number(gridSpanEl !== undefined ? attrAny(gridSpanEl, 'val') ?? '1' : '1') || 1);
      const vMergeEl = findAll(tc, 'vMerge')[0]; // lives inside w:tcPr
      const vVal = vMergeEl !== undefined ? attrAny(vMergeEl, 'val') : undefined;
      const isContinue = vMergeEl !== undefined && vVal !== 'restart';
      const text = normText(findAll(tc, 't').map(textOf).join(' '));
      while (row.length < col + colSpan) row.push('');

      if (isContinue) {
        // Credit the restart cell above (its span record is keyed by restart coords).
        let credited = false;
        for (const [key, span] of spanByStart) {
          const [kr, kc] = key.split(',').map(Number) as [number, number];
          if (kc === col && span.rowSpan === r - kr) { span.rowSpan += 1; credited = true; break; }
        }
        if (!credited) row[col] = text;               // dangling continuation: keep its text (honest)
      } else {
        row[col] = text;
        if (vMergeEl !== undefined && vVal === 'restart') openVmerge.add(col);
        spanByStart.set(`${r},${col}`, { rowSpan: 1, colSpan });
      }
      for (let dc = 0; dc < colSpan; dc += 1) covered.add(col + dc);
      col += colSpan;
    }
    // Vertical merges this row did not continue are finished.
    for (const c of [...openVmerge]) if (!covered.has(c)) openVmerge.delete(c);
  });
  for (const [key, span] of spanByStart) {
    if (span.rowSpan > 1 || span.colSpan > 1) {
      const [r, c] = key.split(',').map(Number) as [number, number];
      merged.push({ row: r, col: c, rowSpan: span.rowSpan, colSpan: span.colSpan });
    }
  }
  const width = grid.reduce((m, row) => Math.max(m, row.length), 0);
  for (const row of grid) while (row.length < width) row.push('');
  while (grid.length > 0 && (grid[grid.length - 1] as string[]).every((c) => c === '')) grid.pop();
  if (merged.length > 0) warnings.push(`${merged.length} merged-cell region(s) recovered (gridSpan/vMerge) with placeholders keeping the grid rectangular`);
  return {
    id: tabId, label: '', // label/caption linked by the body walker (adjacent Caption paragraph)
    grid, headerRows, mergedCells: merged, footnotes: [],
    provenance: { elementPath: path },
  };
};

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

export const parseDocx = (bytes: Uint8Array, fileName: string): DocxParseResult => {
  const zip = readZip(Buffer.from(bytes));
  if (!zip.ok) return { ok: false, reason: `docx: ${zip.reason}` };
  const entries = zip.entries;
  if (!entries.has('word/document.xml')) {
    return { ok: false, reason: 'docx: no word/document.xml part — not a Word document (OOXML)' };
  }
  const doc = xmlPart(entries, 'word/document.xml');
  if (!doc.ok) return doc;
  const styles = readStyles(entries);
  const rels = readRels(entries, 'word/document.xml');
  const core = readCoreProps(entries);
  const warnings: string[] = [];

  const blk = new IdGen('blk');
  const fig = new IdGen('fig');
  const tab = new IdGen('tab');
  const blocks: SdmBlock[] = [];
  const figures: SdmFigure[] = [];
  const tables: SdmTable[] = [];
  const xrefs: SdmXref[] = [];
  const pendingScans: Array<{ blockId: string; text: string }> = [];
  const headingStack: string[] = [];
  let titleFromTitleStyle: string | undefined;

  const body = findAll(doc.root, 'body')[0];
  if (body === undefined) return { ok: false, reason: 'docx: word/document.xml has no w:body element' };
  // preserve document order of paragraphs and tables at body top level
  const ordered = body.children.filter((c): c is XmlElement => c.type === 'element' && (c.localName === 'p' || c.localName === 'tbl'));

  const paraInfo = (p: XmlElement): { level?: number; isCaption: boolean; isTitle: boolean; isListItem: boolean } => {
    const pPr = childrenNamed(p, 'pPr')[0];
    const pStyleEl = pPr !== undefined ? childrenNamed(pPr, 'pStyle')[0] : undefined;
    const styleId = pStyleEl !== undefined ? attrAny(pStyleEl, 'val') : undefined;
    const style = styleId !== undefined ? styles.get(styleId) : undefined;
    const outlineEl = pPr !== undefined ? findAll(pPr, 'outlineLvl')[0] : undefined;
    const directLvl = outlineEl !== undefined ? Number(attrAny(outlineEl, 'val')) : undefined;
    let level: number | undefined;
    if (Number.isInteger(directLvl) && (directLvl as number) >= 0 && (directLvl as number) <= 5) level = (directLvl as number) + 1;
    else if (style !== undefined && style.outlineLevel !== undefined && style.outlineLevel <= 6) level = style.outlineLevel;
    else if (style !== undefined && style.name !== undefined) {
      const m = /^heading (\d)$/i.exec(style.name);
      if (m !== null) level = Number(m[1]);
    }
    const isTitle = style !== undefined && style.name !== undefined && /^title$/i.test(style.name);
    const isListItem = pPr !== undefined && findAll(pPr, 'numPr').length > 0;
    const isCaption = style !== undefined && style.isCaption;
    return { ...(level !== undefined ? { level } : {}), isCaption, isTitle, isListItem };
  };

  const paraText = (p: XmlElement): string => normText(findAll(p, 't').map(textOf).join(''));

  const emitFigureFromParagraph = (p: XmlElement, path: string, caption: string): void => {
    if (figures.length >= MAX_FIGURES) { warnings.push('figure cap reached — later images counted only'); return; }
    const blips = findAll(p, 'blip');
    const embed = blips.length > 0 ? attrAny(blips[0] as XmlElement, 'embed') : undefined;
    const labelMatch = /^(Figure|Fig\.?|图)\s*\.?\s*(\d{1,3})/i.exec(caption.trim());
    const label = labelMatch !== null
      ? `${/^图$/.test(labelMatch[1] as string) ? '图' : 'Figure'} ${labelMatch[2] as string}`
      : `Figure ${fig.count}`;
    figures.push({
      id: fig.next(), label, caption, panels: panelsFromCaption(caption),
      ...(embed !== undefined && rels.has(embed) ? { graphicRef: rels.get(embed) as string } : {}),
      perception: { status: 'not_extracted' },
      provenance: { elementPath: path },
    });
    if (embed !== undefined && !rels.has(embed)) warnings.push(`drawing at ${path} references relationship ${embed} with no resolvable target — graphicRef omitted`);
    if (blips.length > 1) warnings.push(`paragraph at ${path} has ${blips.length} images — first linked, others unlinked`);
    if (caption.length > 0) {
      const id = blk.next();
      blocks.push({ id, kind: 'caption', text: `${label}: ${caption}`, provenance: { elementPath: path } });
    }
  };

  let truncated = false;
  ordered.forEach((el, idx) => {
    if (blocks.length >= MAX_BLOCKS) { truncated = true; return; }
    const sameSiblings = ordered.filter((e) => e.localName === el.localName).length;
    const posAmongSame = ordered.slice(0, idx + 1).filter((e) => e.localName === el.localName).length;
    const path = `document>body>${el.localName}${sameSiblings > 1 ? `[${posAmongSame}]` : ''}`;

    if (el.localName === 'tbl') {
      if (tables.length >= MAX_TABLES) { truncated = true; return; }
      const t = readDocxTable(el, path, tab.next(), warnings);
      // Caption linkage: Caption-styled paragraph directly BEFORE (Word's "above item" default) or directly AFTER.
      const prev = ordered[idx - 1];
      const next = ordered[idx + 1];
      let caption: string | undefined;
      let captionFrom: 'before' | 'after' | undefined;
      if (prev !== undefined && prev.localName === 'p' && paraInfo(prev).isCaption && paraText(prev).length > 0) {
        caption = paraText(prev); captionFrom = 'before';
      } else if (next !== undefined && next.localName === 'p' && paraInfo(next).isCaption && paraText(next).length > 0) {
        caption = paraText(next); captionFrom = 'after';
      }
      const labelMatch = caption !== undefined ? /^(Table|表)\s*\.?\s*(\d{1,3})/i.exec(caption.trim()) : null;
      t.label = labelMatch !== null ? `${/^表$/.test(labelMatch[1] as string) ? '表' : 'Table'} ${labelMatch[2] as string}` : `Table ${tab.count}`;
      if (caption !== undefined) t.caption = caption;
      if (captionFrom === 'after') warnings.push(`table at ${path} captioned from the paragraph below (Word captions usually sit above)`);
      tables.push(t);
      return;
    }

    // paragraph
    const info = paraInfo(el);
    const text = paraText(el);
    const hasDrawing = findAll(el, 'drawing').length > 0 || findAll(el, 'pict').length > 0;
    if (hasDrawing) {
      // Caption below the image is the Word default; above accepted as fallback.
      const next = ordered[idx + 1];
      const prev = ordered[idx - 1];
      let caption = '';
      if (next !== undefined && next.localName === 'p' && paraInfo(next).isCaption) caption = paraText(next);
      else if (prev !== undefined && prev.localName === 'p' && paraInfo(prev).isCaption) caption = paraText(prev);
      emitFigureFromParagraph(el, path, caption);
      if (text.length > 0 && !info.isCaption) {
        const id = blk.next();
        blocks.push({ id, kind: 'paragraph', text, parentHeadingId: headingStack[headingStack.length - 1] ?? null, provenance: { elementPath: path } });
        pendingScans.push({ blockId: id, text });
      }
      return;
    }
    if (text.length === 0) return;
    if (info.isTitle) {
      const id = blk.next();
      blocks.push({ id, kind: 'front_title', text, provenance: { elementPath: path } });
      if (titleFromTitleStyle === undefined) titleFromTitleStyle = text;
      return;
    }
    if (info.isCaption) {
      const id = blk.next();
      blocks.push({ id, kind: 'caption', text, provenance: { elementPath: path } });
      return;
    }
    if (info.level !== undefined) {
      const id = blk.next();
      blocks.push({ id, kind: 'heading', text, headingLevel: info.level, provenance: { elementPath: path } });
      while (headingStack.length >= info.level) headingStack.pop();
      headingStack.push(id);
      return;
    }
    const id = blk.next();
    blocks.push({
      id, kind: info.isListItem ? 'list_item' : 'paragraph', text,
      parentHeadingId: headingStack[headingStack.length - 1] ?? null,
      provenance: { elementPath: path },
    });
    pendingScans.push({ blockId: id, text });
  });

  // footnotes part (ids 0/-1 are Word's separator artifacts — skipped)
  if (entries.has('word/footnotes.xml')) {
    const fn = xmlPart(entries, 'word/footnotes.xml');
    if (fn.ok) {
      let n = 0;
      for (const footnote of childrenNamed(fn.root, 'footnote')) {
        const fid = footnote.attrs['w:id'] ?? footnote.attrs['id'];
        if (fid === '0' || fid === '-1') continue;
        const text = normText(findAll(footnote, 't').map(textOf).join(' '));
        if (text.length === 0) continue;
        n += 1;
        blocks.push({ id: blk.next(), kind: 'footnote', text, provenance: { elementPath: `footnotes>footnote[${n}]` } });
      }
    } else {
      warnings.push(`footnotes.xml unreadable: ${fn.reason} — footnotes skipped, body untouched`);
    }
  }

  const resolve = (kind: SdmXrefTargetKind, num: number): string | undefined => {
    const pool = kind === 'figure' ? figures : kind === 'table' ? tables : [];
    return (pool as Array<{ id: string; label: string }>).find((r) => numberFromLabel(r.label) === num)?.id;
  };
  for (const scan of pendingScans) xrefs.push(...scanXrefsInText(scan.blockId, scan.text, resolve));

  const bodyText = blocks.map((b) => b.text).join(' ');
  const title = core.title ?? titleFromTitleStyle;
  const lang = guessLanguage(bodyText);
  return {
    ok: true,
    sdm: {
      schemaVersion: 'sdm-1',
      extractor: { name: 'docx-ooxml-v1', route: 'docx_ooxml' },
      origin: { kind: 'upload', name: fileName },
      meta: {
        authors: core.authors,
        ...(title !== undefined ? { title } : {}),
        ...(core.year !== undefined ? { year: core.year } : {}),
        ...(lang !== undefined ? { language: lang } : {}),
      },
      blocks, figures, tables, equations: [], citations: [], xrefs,
      diagnostics: {
        parseStatus: blocks.length + figures.length + tables.length > 0 ? 'ok' : 'failed',
        warnings: [...warnings, ...(blocks.length + figures.length + tables.length > 0 ? [] : ['document body carried no recoverable content'])],
        truncated,
      },
    },
  };
};
