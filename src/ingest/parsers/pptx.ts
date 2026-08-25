import type { SdmBlock, SdmDocument, SdmFigure, SdmTable } from '../sdm.js';
import { parseXml, findAll, childrenNamed, textOf, attrAny, type XmlElement } from '../xml.js';
import { readZip } from '../zip.js';
import { guessLanguage, normText, IdGen } from '../parseutil.js';

/**
 * PPTX structure recovery (MULTIMODAL lane extension, 2026-08-25). Slide
 * order follows presentation.xml's sldIdLst (not zip order); titles come from
 * title placeholders (p:ph type), never guessed from font size; shape text
 * reads in LAYOUT order (y, then x — the visual reading order) instead of
 * z-order; tables recover the DrawingML span model (gridSpan/rowSpan with
 * hMerge/vMerge continuations); speaker notes become footnote blocks from
 * the linked notesSlide parts. PPTX images are almost never captioned — the
 * parser records them WITHOUT invented captions and says so.
 */

export type PptxParseResult =
  | { ok: true; sdm: SdmDocument }
  | { ok: false; reason: string };

const MAX_SLIDES = 500;

const xmlPart = (entries: Map<string, Buffer>, key: string): { ok: true; root: XmlElement } | { ok: false; reason: string } => {
  const raw = entries.get(key);
  if (raw === undefined) return { ok: false, reason: `pptx part ${key} missing from the archive` };
  const parsed = parseXml(raw.toString('utf8'));
  if (parsed.status === 'error') return { ok: false, reason: `pptx part ${key} is not well-formed XML: ${parsed.message}` };
  return { ok: true, root: parsed.root };
};

/** Resolve a rel target against the directory of the part that owns the rels
 *  ('..' pops one segment; targets stay inside the package — real decks never
 *  escape ppt/, and a pathological '../..' collapses to the root harmlessly). */
const resolveRel = (baseDir: string, target: string): string => {
  if (target.startsWith('/')) return target.slice(1);
  const segs = baseDir.split('/').filter((s) => s.length > 0);
  for (const t of target.split('/')) {
    if (t === '..') segs.pop();
    else if (t !== '.' && t.length > 0) segs.push(t);
  }
  return segs.join('/');
};

/** rels of a part: rId → resolved part path within the zip. */
const relsOf = (entries: Map<string, Buffer>, partDir: string, partName: string): Map<string, string> => {
  const map = new Map<string, string>();
  const key = `${partDir}_rels/${partName}.rels`;
  const raw = entries.get(key);
  if (raw === undefined) return map;
  const parsed = parseXml(raw.toString('utf8'));
  if (parsed.status === 'error') return map;
  for (const rel of findAll(parsed.root, 'Relationship')) {
    const id = rel.attrs['Id'];
    const target = rel.attrs['Target'];
    if (id === undefined || target === undefined) continue;
    map.set(id, resolveRel(partDir, target));
  }
  return map;
};

interface ShapeInfo {
  el: XmlElement;
  kind: 'sp' | 'pic' | 'graphicFrame';
  phType: string | undefined;
  x: number; y: number;
  order: number;
}

const shapePos = (el: XmlElement): { x: number; y: number } => {
  const off = findAll(el, 'off')[0];
  if (off === undefined) return { x: Number.MAX_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER };
  return { x: Number(off.attrs['x'] ?? '0'), y: Number(off.attrs['y'] ?? '0') };
};

const phTypeOf = (el: XmlElement): string | undefined => {
  const ph = findAll(el, 'ph')[0];
  return ph !== undefined ? ph.attrs['type'] ?? 'body' : undefined;
};

const shapeText = (el: XmlElement): string[] =>
  findAll(el, 'p')                     // a:p paragraphs within txBody
    .map((p) => normText(findAll(p, 't').map(textOf).join('')))
    .filter((t) => t.length > 0);

/** DrawingML table grid: gridSpan/rowSpan attrs, hMerge/vMerge continuation cells. */
const readPptxTable = (tblEl: XmlElement): { grid: string[][]; headerRows: number; merged: SdmTable['mergedCells'] } => {
  const grid: string[][] = [];
  const merged: SdmTable['mergedCells'] = [];
  const occupied = new Set<string>();
  let headerRows = 0;
  const rows = childrenNamed(tblEl, 'tr');
  rows.forEach((tr, r) => {
    if (childrenNamed(tr, 'tc').length === 0) return;
    while (grid.length < r + 1) grid.push([]);
    let col = 0;
    let rowIsHeader = true;
    for (const tc of childrenNamed(tr, 'tc')) {
      while (occupied.has(`${r},${col}`)) col += 1;
      const colSpan = Math.max(1, Number(tc.attrs['gridSpan'] ?? '1') || 1);
      const rowSpan = Math.max(1, Number(tc.attrs['rowSpan'] ?? '1') || 1);
      const text = normText(findAll(tc, 't').map(textOf).join(' '));
      const row = grid[r] as string[];
      while (row.length < col + colSpan) row.push('');
      row[col] = text;
      for (let dr = 0; dr < rowSpan; dr += 1) {
        for (let dc = 0; dc < colSpan; dc += 1) {
          if (dr > 0 || dc > 0) occupied.add(`${r + dr},${col + dc}`);
        }
      }
      if (colSpan > 1 || rowSpan > 1) merged.push({ row: r, col, rowSpan, colSpan });
      if (r === 0 && tc.attrs['hMerge'] !== undefined) rowIsHeader = false;
      col += colSpan;
    }
    if (r === 0 && rowIsHeader) headerRows = 1;
  });
  const width = grid.reduce((m, row) => Math.max(m, row.length), 0);
  for (const row of grid) while (row.length < width) row.push('');
  while (grid.length > 0 && (grid[grid.length - 1] as string[]).every((c) => c === '')) grid.pop();
  return { grid, headerRows, merged };
};

export const parsePptx = (bytes: Uint8Array, fileName: string): PptxParseResult => {
  const zip = readZip(Buffer.from(bytes));
  if (!zip.ok) return { ok: false, reason: `pptx: ${zip.reason}` };
  const entries = zip.entries;
  if (!entries.has('ppt/presentation.xml')) {
    return { ok: false, reason: 'pptx: no ppt/presentation.xml part — not a PowerPoint (OOXML) file' };
  }
  const pres = xmlPart(entries, 'ppt/presentation.xml');
  if (!pres.ok) return pres;
  const presRels = relsOf(entries, 'ppt/', 'presentation.xml');

  // slide order from sldIdLst (spec order), resolved through presentation rels
  const slidePaths: string[] = [];
  for (const sldId of findAll(pres.root, 'sldId')) {
    const rid = sldId.attrs['r:id'] ?? sldId.attrs['id'];
    const target = rid !== undefined ? presRels.get(rid) : undefined;
    if (target === undefined) continue;
    slidePaths.push(target.replace(/^\//, ''));
  }
  if (slidePaths.length === 0) {
    return { ok: false, reason: 'pptx: presentation.xml declares no resolvable slides (sldIdLst empty or rels broken)' };
  }

  const core = entries.has('docProps/core.xml')
    ? parseXml((entries.get('docProps/core.xml') as Buffer).toString('utf8'))
    : null;
  const coreTitle = core !== null && core.status === 'ok' ? findAll(core.root, 'title').map(textOf).map(normText).find((t) => t.length > 0) : undefined;
  const coreAuthors = core !== null && core.status === 'ok'
    ? findAll(core.root, 'creator').map((c) => normText(textOf(c))).filter((a) => a.length > 0)
    : [];
  const coreDates = core !== null && core.status === 'ok' ? findAll(core.root, 'created').map(textOf) : [];
  const yearMatch = coreDates.map((d) => /^(\d{4})/.exec(d.trim())).find((m) => m !== null);

  const warnings: string[] = [];
  const blk = new IdGen('blk');
  const fig = new IdGen('fig');
  const tab = new IdGen('tab');
  const blocks: SdmBlock[] = [];
  const figures: SdmFigure[] = [];
  const tables: SdmTable[] = [];
  let truncated = false;

  const capped = slidePaths.slice(0, MAX_SLIDES);
  if (slidePaths.length > MAX_SLIDES) {
    truncated = true;
    warnings.push(`deck has ${slidePaths.length} slides — first ${MAX_SLIDES} read`);
  }

  capped.forEach((slidePath, slideIdx) => {
    const n = slideIdx + 1;
    const part = entries.has(slidePath) ? xmlPart(entries, slidePath) : { ok: false as const, reason: `slide part ${slidePath} missing` };
    if (!part.ok) { warnings.push(part.reason); return; }
    const slideRels = relsOf(entries, slidePath.slice(0, slidePath.lastIndexOf('/') + 1), slidePath.slice(slidePath.lastIndexOf('/') + 1));

    // collect shapes/pictures/frames in layout (reading) order: y, then x, then tree order
    const spTree = findAll(part.root, 'spTree')[0] ?? part.root;
    const shapes: ShapeInfo[] = [];
    let order = 0;
    const collect = (el: XmlElement): void => {
      for (const child of el.children) {
        if (child.type !== 'element') continue;
        if (child.localName === 'sp' || child.localName === 'pic' || child.localName === 'graphicFrame') {
          const pos = shapePos(child);
          shapes.push({ el: child, kind: child.localName as ShapeInfo['kind'], phType: phTypeOf(child), x: pos.x, y: pos.y, order: order++ });
        } else {
          collect(child);
        }
      }
    };
    collect(spTree);
    shapes.sort((a, b) => a.y - b.y || a.x - b.x || a.order - b.order);

    const slideHeadingId = blk.next();
    const titleText = shapes.find((s) => s.kind === 'sp' && (s.phType === 'title' || s.phType === 'ctrTitle'));
    const title = titleText !== undefined ? shapeText(titleText.el)[0] ?? '' : '';
    blocks.push({
      id: slideHeadingId, kind: 'heading',
      text: title.length > 0 ? title : `Slide ${n}`,
      headingLevel: 2,
      provenance: { elementPath: `${slidePath}>title` },
    });
    if (title.length === 0) warnings.push(`slide ${n} has no title placeholder — a positional "Slide ${n}" heading stands in (never a guessed title)`);

    for (const s of shapes) {
      if (s === titleText) continue;
      if (s.kind === 'pic') {
        const blip = findAll(s.el, 'blip')[0];
        const embed = blip !== undefined ? attrAny(blip, 'embed') : undefined;
        figures.push({
          id: fig.next(), label: `Slide ${n} image ${fig.count}`, caption: '', panels: [],
          ...(embed !== undefined && slideRels.has(embed) ? { graphicRef: slideRels.get(embed) as string } : {}),
          perception: { status: 'not_extracted' },
          provenance: { elementPath: `${slidePath}>pic` },
        });
        continue;
      }
      if (s.kind === 'graphicFrame') {
        const tblEl = findAll(s.el, 'tbl')[0];
        if (tblEl !== undefined) {
          const { grid, headerRows, merged } = readPptxTable(tblEl);
          if (grid.length > 0) {
            tables.push({
              id: tab.next(), label: `Slide ${n} table`, grid, headerRows, mergedCells: merged, footnotes: [],
              provenance: { elementPath: `${slidePath}>graphicFrame>tbl` },
            });
          }
          continue;
        }
      }
      // text shape: subtitle → paragraph, everything else → list_item (pptx body text is bulleted in practice)
      const paras = shapeText(s.el);
      const kind: SdmBlock['kind'] = s.phType === 'subTitle' ? 'paragraph' : 'list_item';
      for (const text of paras) {
        blocks.push({
          id: blk.next(), kind, text,
          parentHeadingId: slideHeadingId,
          provenance: { elementPath: `${slidePath}>sp@(${s.x},${s.y})` },
        });
      }
    }

    // speaker notes via the slide's rels (notesSlide relationship)
    for (const target of slideRels.values()) {
      if (!/notesSlides\/notesSlide\d+\.xml$/.test(target)) continue;
      if (!entries.has(target)) { warnings.push(`notes part ${target} declared but missing`); continue; }
      const notes = xmlPart(entries, target);
      if (!notes.ok) { warnings.push(notes.reason); continue; }
      const text = normText(findAll(notes.root, 't').map(textOf).join(' '));
      if (text.length > 0) {
        blocks.push({ id: blk.next(), kind: 'footnote', text, parentHeadingId: slideHeadingId, provenance: { elementPath: `${target}` } });
      }
    }
  });

  const bodyText = blocks.map((b) => b.text).join(' ');
  const hasContent = blocks.length + figures.length + tables.length > 0;
  return {
    ok: true,
    sdm: {
      schemaVersion: 'sdm-1',
      extractor: { name: 'pptx-ooxml-v1', route: 'pptx_ooxml' },
      origin: { kind: 'upload', name: fileName },
      meta: {
        authors: coreAuthors,
        ...(coreTitle !== undefined ? { title: coreTitle } : {}),
        ...(yearMatch !== undefined ? { year: Number(yearMatch[1]) } : {}),
        ...(guessLanguage(bodyText) !== undefined ? { language: guessLanguage(bodyText) } : {}),
      },
      blocks, figures, tables, equations: [], citations: [], xrefs: [],
      diagnostics: {
        parseStatus: hasContent ? (warnings.length > 0 ? 'partial' : 'ok') : 'failed',
        warnings: [...warnings, ...(hasContent ? [] : ['no slide content recovered'])],
        truncated,
      },
    },
  };
};
