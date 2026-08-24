import { parseXml, findAll, childrenNamed, textOf, serializeXml, type XmlElement } from '../xml.js';
import type { SdmBlock, SdmCitation, SdmDocument, SdmEquation, SdmFigure, SdmTable, SdmXref } from '../sdm.js';
import { guessLanguage, panelsFromCaption, scanXrefsInText, normText, IdGen, numberFromLabel } from '../parseutil.js';

/**
 * GROBID TEI XML → SDM structure recovery (MULTIMODAL lane, OpenAlex content route
 * `src/sources/fulltext.ts` openalex_tei). GROBID is the server-side parser; this
 * recovers what it already knows: teiHeader metadata, profileDesc abstract, div/head
 * section hierarchy, figure + figDesc captions, figure[type=table] with role=label
 * header rows and cols/rows spans, formula elements (MathML preserved, latex when
 * GROBID emitted it), listBibl/biblStruct references with idno DOI, and <ref target>
 * cross-modal linkage. GROBID `coords` attributes (page-space regions) are recovered
 * when present and never synthesized.
 */

export interface TeiOrigin {
  name: string;
  url?: string;
  license?: string;
}

const coordsAttr = (el: XmlElement): { page: number; bbox: [number, number, number, number] } | undefined => {
  const raw = el.attrs['coords'];
  if (raw === undefined) return undefined;
  // GROBID coords: "page,x0,y0,x1,y1" (page 1-based).
  const parts = raw.split(',').map((x) => Number(x));
  if (parts.length !== 5 || parts.some((n) => !Number.isFinite(n))) return undefined;
  const [page, x0, y0, x1, y1] = parts as [number, number, number, number, number];
  if (!Number.isInteger(page) || page < 1) return undefined;
  return { page, bbox: [x0, y0, x1, y1] };
};

export const parseTei = (xml: string, origin: TeiOrigin): SdmDocument => {
  const warnings: string[] = [];
  const parsed = parseXml(xml);
  if (parsed.status === 'error') return emptyDoc(origin, `xml parse error: ${parsed.message}`);
  const root = parsed.root;
  if (root.localName !== 'TEI') return emptyDoc(origin, `root element is <${root.name}>, not <TEI> — not GROBID TEI`);

  const blocks: SdmBlock[] = [];
  const figures: SdmFigure[] = [];
  const tables: SdmTable[] = [];
  const equations: SdmEquation[] = [];
  const citations: SdmCitation[] = [];
  const xrefs: SdmXref[] = [];
  const pendingXrefs: Array<{ fromBlockId: string; target?: string; rawText: string; text: string }> = [];
  const targetToSdm = new Map<string, string>(); // '#b12' / xml:id → SDM id

  const blk = new IdGen('blk');
  const fig = new IdGen('fig');
  const tab = new IdGen('tab');
  const eq = new IdGen('eq');
  const cit = new IdGen('cit');
  const headingStack: string[] = [];
  let lastParagraphId: string | null = null;

  // ---- header metadata ----------------------------------------------------
  const meta: SdmDocument['meta'] = { authors: [] };
  const headerTitle = findAll(root, 'title')[0];
  if (headerTitle !== undefined && headerTitle.localName === 'title') {
    meta.title = normText(textOf(headerTitle));
    blocks.push({ id: blk.next(), kind: 'front_title', text: meta.title ?? '' });
  }
  for (const pn of findAll(root, 'persName')) {
    const surname = findAll(pn, 'surname')[0];
    const fore = findAll(pn, 'forename')[0];
    const full = surname !== undefined && fore !== undefined
      ? `${normText(textOf(fore))} ${normText(textOf(surname))}`
      : surname !== undefined ? normText(textOf(surname)) : '';
    if (full.length > 0 && meta.authors.length < 40) meta.authors.push(full);
  }
  const dateEl = findAll(root, 'date').find((d) => /^\d{4}/.test(d.attrs['when'] ?? ''));
  if (dateEl !== undefined) meta.year = Number((/^\d{4}/.exec(dateEl.attrs['when'] ?? '') ?? [])[0]);
  const doiEl = findAll(root, 'idno').find((i) => i.attrs['type'] === 'doi');
  if (doiEl !== undefined) meta.doi = normText(textOf(doiEl));
  const abstract = findAll(root, 'abstract')[0];
  if (abstract !== undefined) {
    const paras = childrenNamed(abstract, 'p').map((p) => normText(textOf(p))).filter((s) => s.length > 0);
    if (paras.length > 0) blocks.push({ id: blk.next(), kind: 'abstract', text: paras.join(' ') });
  }

  const figureCaptionOf = (el: XmlElement): string => {
    const figDesc = childrenNamed(el, 'figDesc')[0];
    if (figDesc !== undefined) return normText(textOf(figDesc));
    const head = childrenNamed(el, 'head')[0];
    return head !== undefined ? normText(textOf(head)) : '';
  };

  function emitFigure(el: XmlElement, path: string): void {
    const id = fig.next();
    const caption = figureCaptionOf(el);
    // GROBID puts the printed label ("Figure 2") at the head of the caption text.
    const labelMatch = /^(Figure|Fig\.?|图)\s*\d{1,3}\s*[:.]?/.exec(caption);
    const label = labelMatch !== null ? labelMatch[0].replace(/[:.]$/, '').trim() : `Figure ${fig.count}`;
    if (caption.length === 0) warnings.push(`${label}: no figDesc/head caption`);
    const graphic = childrenNamed(el, 'graphic')[0];
    const url = graphic?.attrs['url'];
    const region = coordsAttr(el);
    figures.push({
      id, label, caption, panels: panelsFromCaption(caption),
      ...(url !== undefined ? { graphicRef: url } : {}),
      ...(region !== undefined ? { region } : {}),
      perception: { status: 'not_extracted' },
      provenance: { ...(region !== undefined ? { page: region.page, bbox: region.bbox } : {}), elementPath: path },
    });
    const xmlId = el.attrs['xml:id'] ?? el.attrs['id'];
    if (xmlId !== undefined) targetToSdm.set(xmlId, id);
    if (caption.length > 0) blocks.push({ id: blk.next(), kind: 'caption', text: caption, provenance: { elementPath: path } });
  }

  function emitTableFigure(el: XmlElement, path: string): void {
    const id = tab.next();
    const caption = figureCaptionOf(el);
    const labelMatch = /^(Table|表)\s*\d{1,3}\s*[:.]?/.exec(caption);
    const label = labelMatch !== null ? labelMatch[0].replace(/[:.]$/, '').trim() : `Table ${tab.count}`;
    const tableEl = childrenNamed(el, 'table')[0];
    const grid: string[][] = [];
    const merged: SdmTable['mergedCells'] = [];
    let headerRows = 0;
    if (tableEl !== undefined) {
      const rows = childrenNamed(tableEl, 'row');
      for (const row of rows) {
        const isHeader = row.attrs['role'] === 'label' || childrenNamed(row, 'cell').some((c) => c.attrs['role'] === 'label');
        if (isHeader && grid.length === headerRows) headerRows += 1;
        const cells: string[] = [];
        let col = 0;
        for (const cell of childrenNamed(row, 'cell')) {
          cells.push(normText(textOf(cell)));
          const cols = Number(cell.attrs['cols'] ?? '1');
          const rowsAttr = Number(cell.attrs['rows'] ?? '1');
          if (cols > 1 || rowsAttr > 1) merged.push({ row: grid.length, col, rowSpan: rowsAttr, colSpan: cols });
          col += cols;
        }
        grid.push(cells);
      }
    }
    if (grid.length === 0) warnings.push(`${label}: no rows recovered`);
    // TEI notes ride as <note> children of the figure/table element.
    const footnotes = childrenNamed(el, 'note').map((n) => normText(textOf(n))).filter((s) => s.length > 0);
    tables.push({
      id, label, ...(caption.length > 0 ? { caption } : {}),
      grid, headerRows, mergedCells: merged, footnotes, provenance: { elementPath: path },
    });
    const xmlId = el.attrs['xml:id'] ?? el.attrs['id'];
    if (xmlId !== undefined) targetToSdm.set(xmlId, id);
    if (caption.length > 0) blocks.push({ id: blk.next(), kind: 'caption', text: caption, provenance: { elementPath: path } });
  }

  function emitFormula(el: XmlElement, path: string): void {
    const id = eq.next();
    const mathmlEl = childrenNamed(el, 'math')[0];
    // GROBID sometimes emits plain-text formula content (no MathML child).
    const contentText = normText(textOf(el));
    const rec: SdmEquation = {
      id,
      ...(el.attrs['label'] !== undefined ? { label: el.attrs['label'] } : {}),
      symbols: [],
      ...(lastParagraphId !== null ? { contextBlockId: lastParagraphId } : {}),
      provenance: { elementPath: path },
    };
    if (mathmlEl !== undefined) rec.mathml = serializeXml(mathmlEl);
    if (contentText.length > 0 && contentText.length < 2000) rec.latex = contentText; // honest: GROBID text content, not guaranteed LaTeX
    if (rec.mathml === undefined && rec.latex === undefined) warnings.push(`equation ${id}: empty formula element`);
    equations.push(rec);
    const xmlId = el.attrs['xml:id'] ?? el.attrs['id'];
    if (xmlId !== undefined) targetToSdm.set(xmlId, id);
  }

  function emitParagraphRefs(el: XmlElement, blockId: string, text: string): void {
    // Forward refs are the norm — collect now, resolve post-pass.
    const refs = findAll(el, 'ref');
    if (refs.length > 0) {
      for (const r of refs) {
        const target = (r.attrs['target'] ?? '').replace(/^#/, '');
        pendingXrefs.push({ fromBlockId: blockId, ...(target.length > 0 ? { target } : {}), rawText: normText(textOf(r)), text });
      }
    } else if (text.trim().length > 0) {
      pendingXrefs.push({ fromBlockId: blockId, rawText: '', text });
    }
  }

  function walkDiv(div: XmlElement, depth: number, path: string): void {
    const divType = div.attrs['type'];
    if (divType === 'references') {
      for (const bibl of findAll(div, 'biblStruct')) {
        const id = cit.next();
        const xmlId = bibl.attrs['xml:id'] ?? bibl.attrs['id'];
        if (xmlId !== undefined) targetToSdm.set(xmlId, id);
        const rec: SdmCitation = { id, authors: [], citedFromBlocks: [] };
        const titleEl = findAll(bibl, 'title')[0];
        if (titleEl !== undefined) rec.title = normText(textOf(titleEl));
        for (const pn of findAll(bibl, 'persName').slice(0, 12)) {
          const surname = findAll(pn, 'surname')[0];
          const fore = findAll(pn, 'forename')[0];
          const full = surname !== undefined && fore !== undefined
            ? `${normText(textOf(fore))} ${normText(textOf(surname))}`
            : surname !== undefined ? normText(textOf(surname)) : '';
          if (full.length > 0) rec.authors.push(full);
        }
        const date = findAll(bibl, 'date').find((d) => /^\d{4}/.test(d.attrs['when'] ?? ''));
        if (date !== undefined) rec.year = Number((/^\d{4}/.exec(date.attrs['when'] ?? '') ?? [])[0]);
        const doi = findAll(bibl, 'idno').find((i) => i.attrs['type'] === 'doi');
        if (doi !== undefined) rec.doi = normText(textOf(doi));
        citations.push(rec);
      }
      return;
    }
    const head = childrenNamed(div, 'head')[0];
    if (head !== undefined) {
      const t = normText(textOf(head));
      if (t.length > 0) {
        const id = blk.next();
        blocks.push({
          id, kind: 'heading', text: t, headingLevel: Math.min(depth, 6),
          parentHeadingId: headingStack[headingStack.length - 1] ?? null,
          provenance: { elementPath: `${path}/head:${t.slice(0, 40)}` },
        });
        headingStack.push(id);
      }
    }
    const childPath = `${path}>div[${depth}]`;
    for (const child of div.children) {
      if (child.type !== 'element') continue;
      switch (child.localName) {
        case 'p': {
          const t = normText(textOf(child));
          if (t.length === 0) break;
          const id = blk.next();
          blocks.push({
            id, kind: 'paragraph', text: t,
            parentHeadingId: headingStack[headingStack.length - 1] ?? null,
            provenance: { elementPath: `${childPath}>p[${blk.count}]` },
          });
          emitParagraphRefs(child, id, t);
          lastParagraphId = id;
          break;
        }
        case 'div': walkDiv(child, depth + 1, childPath); break;
        case 'list': {
          for (const item of childrenNamed(child, 'item')) {
            const t = normText(textOf(item));
            if (t.length > 0) blocks.push({ id: blk.next(), kind: 'list_item', text: t, provenance: { elementPath: `${childPath}>list>item` } });
          }
          break;
        }
        case 'figure': {
          const hasTable = childrenNamed(child, 'table').length > 0 || child.attrs['type'] === 'table';
          if (hasTable) emitTableFigure(child, `${childPath}>figure[type=table]`);
          else emitFigure(child, `${childPath}>figure`);
          break;
        }
        case 'formula': emitFormula(child, `${childPath}>formula`); break;
        default: break;
      }
    }
    if (head !== undefined && headingStack.length > 0) headingStack.pop();
  }

  const body = findAll(root, 'body')[0];
  if (body !== undefined) {
    for (const child of childrenNamed(body, 'div')) walkDiv(child, 1, 'text>body');
  } else {
    warnings.push('no <body> — header only');
  }

  // Post-pass: resolve pending refs now that every xml:id target is registered.
  for (const px of pendingXrefs) {
    if (px.target === undefined || px.rawText === '') {
      xrefs.push(...scanXrefsInText(px.fromBlockId, px.text, (kind, num) => {
        const pool = kind === 'figure' ? figures : kind === 'table' ? tables : kind === 'equation' ? equations : [];
        return (pool as Array<{ id: string; label: string }>).find((r) => numberFromLabel(r.label) === num)?.id;
      }));
      continue;
    }
    const targetId = targetToSdm.get(px.target);
    const kind: SdmXref['targetKind'] = /^b/i.test(px.target) ? 'citation'
      : /^fig/i.test(px.target) ? 'figure' : /^tab/i.test(px.target) ? 'table' : 'section';
    xrefs.push({
      fromBlockId: px.fromBlockId, targetKind: kind,
      ...(targetId !== undefined ? { targetId } : {}),
      rawText: px.rawText.length > 0 ? px.rawText : `target:${px.target}`,
      status: targetId !== undefined ? 'resolved' : 'unresolved',
    });
  }

  // Backfill citation markers/citedFrom from xrefs.
  const citById = new Map(citations.map((c) => [c.id, c]));
  for (const x of xrefs) {
    if (x.targetKind !== 'citation' || x.targetId === undefined) continue;
    const c = citById.get(x.targetId);
    if (c === undefined) continue;
    if (c.marker === undefined && x.rawText.length > 0 && !x.rawText.startsWith('target:')) c.marker = x.rawText;
    if (!c.citedFromBlocks.includes(x.fromBlockId)) c.citedFromBlocks.push(x.fromBlockId);
  }

  const bodyText = blocks.map((b) => b.text).join(' ');
  return {
    schemaVersion: 'sdm-1',
    extractor: { name: 'grobid-tei-v1', route: 'grobid_tei' },
    origin: { kind: 'network', name: origin.name, ...(origin.url !== undefined ? { url: origin.url } : {}), ...(origin.license !== undefined ? { license: origin.license } : {}) },
    meta: { ...meta, language: guessLanguage(bodyText) },
    blocks, figures, tables, equations, citations, xrefs,
    diagnostics: {
      parseStatus: body !== undefined && blocks.length > 0 ? 'ok' : blocks.length > 0 ? 'partial' : 'failed',
      warnings, truncated: false,
    },
  };
};

const emptyDoc = (origin: TeiOrigin, warning: string): SdmDocument => ({
  schemaVersion: 'sdm-1',
  extractor: { name: 'grobid-tei-v1', route: 'grobid_tei' },
  origin: { kind: 'network', name: origin.name },
  meta: { authors: [] },
  blocks: [], figures: [], tables: [], equations: [], citations: [], xrefs: [],
  diagnostics: { parseStatus: 'failed', warnings: [warning], truncated: false },
});
