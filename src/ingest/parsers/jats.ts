import { parseXml, findAll, childrenNamed, textOf, attrAny, serializeXml, type XmlElement } from '../xml.js';
import type { SdmBlock, SdmCitation, SdmDocument, SdmEquation, SdmFigure, SdmTable, SdmXref, SdmXrefTargetKind } from '../sdm.js';
import { guessLanguage, panelsFromCaption, scanLatexSymbols, scanXrefsInText, normText, IdGen, numberFromLabel } from '../parseutil.js';

/**
 * JATS XML → SDM structure recovery (MULTIMODAL lane, EuropePMC fulltext route).
 * Recovers: frontmatter, abstract, section hierarchy, paragraphs, figures with
 * captions/panels/graphics, tables with header rows + merged cells + footnotes,
 * display equations (tex-math / MathML) with symbol index, the reference list,
 * and explicit <xref> cross-modal linkage (rid-resolved, honest when unresolved).
 * Deterministic: identical XML → identical SDM. Never invents absent structure.
 */

export interface JatsOrigin {
  name: string;
  url?: string;
  license?: string;
}

export const parseJats = (xml: string, origin: JatsOrigin): SdmDocument => {
  const warnings: string[] = [];
  const parsed = parseXml(xml);
  if (parsed.status === 'error') {
    return emptyDoc(origin, 'failed', [`xml parse error: ${parsed.message}`]);
  }
  const root = parsed.root;
  if (root.localName !== 'article') {
    return emptyDoc(origin, 'failed', [`root element is <${root.name}>, not <article> — not JATS`]);
  }

  const blocks: SdmBlock[] = [];
  const figures: SdmFigure[] = [];
  const tables: SdmTable[] = [];
  const equations: SdmEquation[] = [];
  const citations: SdmCitation[] = [];
  const xrefs: SdmXref[] = [];
  const pendingXrefs: Array<{ fromBlockId: string; rid?: string; refType?: string; rawText: string; text: string }> = [];
  const ridToSdm = new Map<string, string>();     // JATS rid → SDM id
  const inlineFormulaCount = { n: 0 };

  const blk = new IdGen('blk');
  const fig = new IdGen('fig');
  const tab = new IdGen('tab');
  const eq = new IdGen('eq');
  const cit = new IdGen('cit');
  const headingStack: string[] = [];

  // ---- front matter -------------------------------------------------------
  const meta: SdmDocument['meta'] = { authors: [] };
  const articleMeta = findAll(root, 'article-meta')[0];
  if (articleMeta !== undefined) {
    const title = findAll(articleMeta, 'article-title')[0];
    if (title !== undefined) {
      meta.title = normText(textOf(title));
      blocks.push({ id: blk.next(), kind: 'front_title', text: meta.title ?? '' });
    } else {
      warnings.push('no <article-title> found');
    }
    for (const name of findAll(articleMeta, 'name')) {
      const surname = normText(textOf(findAll(name, 'surname')[0] ?? name));
      const given = findAll(name, 'given-names')[0];
      const full = given !== undefined ? `${normText(textOf(given))} ${surname}` : surname;
      if (full.length > 0) meta.authors.push(full);
    }
    if (meta.authors.length > 0) {
      blocks.push({ id: blk.next(), kind: 'front_authors', text: meta.authors.join(', ') });
    }
    const yearEl = findAll(articleMeta, 'pub-date')[0];
    if (yearEl !== undefined) {
      const y = /^\d{4}$/.exec(normText(textOf(yearEl)))?.[0];
      if (y !== undefined) meta.year = Number(y);
    }
    for (const idEl of findAll(articleMeta, 'article-id')) {
      const t = idEl.attrs['pub-id-type'];
      if (t === 'doi' && meta.doi === undefined) meta.doi = normText(textOf(idEl));
    }
    const abstract = findAll(articleMeta, 'abstract')[0];
    if (abstract !== undefined) {
      const paras = collectParas(abstract);
      if (paras.length > 0) blocks.push({ id: blk.next(), kind: 'abstract', text: paras.join(' ') });
    }
    const kwds = findAll(articleMeta, 'kwd').map((k) => normText(textOf(k))).filter((s) => s.length > 0);
    if (kwds.length > 0) blocks.push({ id: blk.next(), kind: 'keywords', text: kwds.join('; ') });
  } else {
    warnings.push('no <article-meta> found — metadata depth only');
  }

  // ---- helpers ------------------------------------------------------------
  function collectParas(el: XmlElement): string[] {
    const out: string[] = [];
    for (const p of findAll(el, 'p')) {
      const t = normText(textOf(p));
      if (t.length > 0) out.push(t);
      countInlineFormulas(p);
    }
    return out;
  }
  function countInlineFormulas(el: XmlElement): void {
    inlineFormulaCount.n += findAll(el, 'inline-formula').length;
  }

  function emitXrefsFromElement(container: XmlElement, blockId: string, text: string): void {
    // Explicit <xref> linkage beats pattern scanning on this route. Targets may
    // appear AFTER the reference (forward refs are the norm) — collect now,
    // resolve in the post-pass once ridToSdm is complete.
    const refs = findAll(container, 'xref');
    for (const x of refs) {
      pendingXrefs.push({ fromBlockId: blockId, rid: x.attrs['rid'], refType: x.attrs['ref-type'], rawText: normText(textOf(x)), text });
    }
    if (refs.length === 0 && text.trim().length > 0) {
      // Fall back to printed-pattern scan only when the container lacks explicit xrefs.
      pendingXrefs.push({ fromBlockId: blockId, rawText: '', text });
    }
  }

  function resolveByNumber(kind: SdmXrefTargetKind, num: number): string | undefined {
    const pool = kind === 'figure' ? figures : kind === 'table' ? tables : kind === 'equation' ? equations : [];
    const match = (pool as Array<{ id: string; label: string }>).find((r) => numberFromLabel(r.label) === num);
    return match?.id;
  }

  function emitFigure(el: XmlElement, path: string): void {
    const id = fig.next();
    const labelEl = childrenNamed(el, 'label')[0];
    const label = labelEl !== undefined ? normText(textOf(labelEl)) : `Figure ${fig.count}`;
    const captionEl = childrenNamed(el, 'caption')[0];
    const caption = captionEl !== undefined
      ? childrenNamed(captionEl, 'title').map((t) => normText(textOf(t))).concat(childrenNamed(captionEl, 'p').map((p) => normText(textOf(p)))).filter((s) => s.length > 0).join(' ')
      : '';
    if (caption.length === 0) warnings.push(`${label}: no caption text`);
    const graphic = findAll(el, 'graphic')[0];
    const href = graphic !== undefined ? attrAny(graphic, 'href') : undefined;
    const figRec: SdmFigure = {
      id, label, caption, panels: panelsFromCaption(caption),
      ...(href !== undefined ? { graphicRef: href } : {}),
      perception: { status: 'not_extracted' },
      provenance: { elementPath: path },
    };
    figures.push(figRec);
    const rid = el.attrs['id'];
    if (rid !== undefined) ridToSdm.set(rid, id);
    if (caption.length > 0) {
      blocks.push({ id: blk.next(), kind: 'caption', text: `${label}: ${caption}`, provenance: { elementPath: path } });
    }
  }

  function emitTableWrap(el: XmlElement, path: string): void {
    const id = tab.next();
    const labelEl = childrenNamed(el, 'label')[0];
    const label = labelEl !== undefined ? normText(textOf(labelEl)) : `Table ${tab.count}`;
    const captionEl = childrenNamed(el, 'caption')[0];
    const caption = captionEl !== undefined ? normText(textOf(captionEl)) : undefined;
    const tableEl = findAll(el, 'table')[0];
    const grid: string[][] = [];
    const merged: SdmTable['mergedCells'] = [];
    let headerRows = 0;
    if (tableEl !== undefined) {
      const thead = childrenNamed(tableEl, 'thead')[0];
      if (thead !== undefined) {
        const rows = childrenNamed(thead, 'tr');
        headerRows = rows.length;
        for (const tr of rows) grid.push(childrenNamed(tr, 'th').map((c) => normText(textOf(c))));
      }
      const tbody = childrenNamed(tableEl, 'tbody')[0] ?? tableEl;
      for (const tr of childrenNamed(tbody, 'tr')) {
        const row: string[] = [];
        let col = 0;
        for (const cell of tr.children.filter((c): c is XmlElement => c.type === 'element' && (c.localName === 'td' || c.localName === 'th'))) {
          row.push(normText(textOf(cell)));
          const colspan = Number(cell.attrs['colspan'] ?? '1');
          const rowspan = Number(cell.attrs['rowspan'] ?? '1');
          if (colspan > 1 || rowspan > 1) merged.push({ row: grid.length, col, rowSpan: rowspan, colSpan: colspan });
          col += colspan;
        }
        grid.push(row);
      }
    }
    if (grid.length === 0) warnings.push(`${label}: no rows recovered`);
    const footEl = childrenNamed(el, 'table-wrap-foot')[0];
    const footnotes = footEl !== undefined ? findAll(footEl, 'fn').map((f) => normText(textOf(f))).filter((s) => s.length > 0) : [];
    tables.push({
      id, label, ...(caption !== undefined && caption.length > 0 ? { caption } : {}),
      grid, headerRows, mergedCells: merged, footnotes, provenance: { elementPath: path },
    });
    const rid = el.attrs['id'];
    if (rid !== undefined) ridToSdm.set(rid, id);
    if (caption !== undefined && caption.length > 0) {
      blocks.push({ id: blk.next(), kind: 'caption', text: `${label}: ${caption}`, provenance: { elementPath: path } });
    }
  }

  function emitDisplayFormula(el: XmlElement, path: string): void {
    const id = eq.next();
    const tex = findAll(el, 'tex-math')[0];
    const mathml = findAll(el, 'math')[0];
    const labelEl = childrenNamed(el, 'label')[0];
    const latex = tex !== undefined ? textOf(tex).trim() : undefined;
    equations.push({
      id,
      ...(labelEl !== undefined ? { label: normText(textOf(labelEl)) } : {}),
      ...(latex !== undefined && latex.length > 0 ? { latex } : {}),
      ...(mathml !== undefined ? { mathml: serializeXml(mathml) } : {}),
      symbols: latex !== undefined ? scanLatexSymbols(latex) : [],
      ...(lastParagraphId !== null ? { contextBlockId: lastParagraphId } : {}),
      provenance: { elementPath: path },
    });
    if (latex === undefined && mathml === undefined) warnings.push(`equation ${id}: neither tex-math nor MathML present`);
    const rid = el.attrs['id'];
    if (rid !== undefined) ridToSdm.set(rid, id);
  }

  let lastParagraphId: string | null = null;

  function walkSec(sec: XmlElement, depth: number, path: string): void {
    const title = childrenNamed(sec, 'title')[0];
    if (title !== undefined) {
      const t = normText(textOf(title));
      if (t.length > 0) {
        const id = blk.next();
        blocks.push({
          id, kind: 'heading', text: t, headingLevel: Math.min(depth, 6),
          parentHeadingId: headingStack[headingStack.length - 1] ?? null,
          provenance: { elementPath: `${path}/sec:${t.slice(0, 40)}` },
        });
        headingStack.push(id);
      }
    }
    const childPathBase = `${path}>sec[${depth}]`;
    for (const child of sec.children) {
      if (child.type !== 'element') continue;
      switch (child.localName) {
        case 'p': {
          const t = normText(textOf(child));
          countInlineFormulas(child);
          if (t.length === 0) break;
          const id = blk.next();
          blocks.push({
            id, kind: 'paragraph', text: t,
            parentHeadingId: headingStack[headingStack.length - 1] ?? null,
            provenance: { elementPath: `${childPathBase}>p[${blk.count}]` },
          });
          emitXrefsFromElement(child, id, t);
          lastParagraphId = id;
          break;
        }
        case 'fig': emitFigure(child, `${childPathBase}>fig`); break;
        case 'table-wrap': emitTableWrap(child, `${childPathBase}>table-wrap`); break;
        case 'disp-formula': emitDisplayFormula(child, `${childPathBase}>disp-formula`); break;
        case 'sec': walkSec(child, depth + 1, childPathBase); break;
        case 'list': {
          for (const li of childrenNamed(child, 'list-item')) {
            const t = normText(textOf(li));
            if (t.length > 0) {
              const id = blk.next();
              blocks.push({ id, kind: 'list_item', text: t, parentHeadingId: headingStack[headingStack.length - 1] ?? null, provenance: { elementPath: `${childPathBase}>list>li` } });
            }
          }
          break;
        }
        default: break; // notes, statements etc. stay unmodeled (v1) — count nothing, claim nothing
      }
    }
    if (title !== undefined && headingStack.length > 0) headingStack.pop();
  }

  const body = childrenNamed(root, 'body')[0];
  if (body !== undefined) {
    for (const child of body.children) {
      if (child.type !== 'element') continue;
      if (child.localName === 'sec') walkSec(child, 1, 'article>body');
      else if (child.localName === 'p') {
        const t = normText(textOf(child));
        if (t.length > 0) {
          const id = blk.next();
          blocks.push({ id, kind: 'paragraph', text: t, provenance: { elementPath: 'article>body>p' } });
          emitXrefsFromElement(child, id, t);
          lastParagraphId = id;
        }
      }
    }
  } else {
    warnings.push('no <body> — frontmatter only');
  }

  // ---- reference list -----------------------------------------------------
  const refList = findAll(root, 'ref-list')[0];
  if (refList !== undefined) {
    for (const ref of findAll(refList, 'ref')) {
      const id = cit.next();
      const rid = ref.attrs['id'];
      if (rid !== undefined) ridToSdm.set(rid, id);
      const citRec: SdmCitation = { id, authors: [], citedFromBlocks: [] };
      const ec = findAll(ref, 'element-citation')[0] ?? findAll(ref, 'mixed-citation')[0] ?? ref;
      const titleEl = findAll(ec, 'article-title')[0] ?? findAll(ec, 'source')[0];
      if (titleEl !== undefined) citRec.title = normText(textOf(titleEl));
      const names = findAll(ec, 'name');
      for (const name of names.slice(0, 12)) {
        const surname = normText(textOf(findAll(name, 'surname')[0] ?? name));
        const given = findAll(name, 'given-names')[0];
        const full = given !== undefined ? `${normText(textOf(given))} ${surname}` : surname;
        if (full.length > 0) citRec.authors.push(full);
      }
      const year = findAll(ec, 'year')[0];
      if (year !== undefined) {
        const y = /^\d{4}/.exec(normText(textOf(year)))?.[0];
        if (y !== undefined) citRec.year = Number(y);
      }
      const doiEl = findAll(ec, 'pub-id').find((p) => p.attrs['pub-id-type'] === 'doi');
      if (doiEl !== undefined) citRec.doi = normText(textOf(doiEl));
      citations.push(citRec);
    }
  }

  // Post-pass: resolve pending xrefs now that every rid is registered.
  const kindMap: Record<string, SdmXrefTargetKind> = {
    'fig': 'figure', 'table': 'table', 'disp-formula': 'equation', 'bibr': 'citation', 'sec': 'section',
  };
  for (const px of pendingXrefs) {
    if (px.rid === undefined || px.refType === undefined || px.rawText === '') {
      // pattern-scan fallback (no explicit xref elements in that block)
      xrefs.push(...scanXrefsInText(px.fromBlockId, px.text, (kind, num) => resolveByNumber(kind, num)));
      continue;
    }
    const kind = kindMap[px.refType];
    if (kind === undefined) continue;
    const byNumber = numberFromLabel(px.rawText);
    const targetId = ridToSdm.get(px.rid) ?? (byNumber !== null ? resolveByNumber(kind, byNumber) : undefined);
    xrefs.push({
      fromBlockId: px.fromBlockId,
      targetKind: kind,
      ...(targetId !== undefined ? { targetId } : {}),
      rawText: px.rawText.length > 0 ? px.rawText : `rid:${px.rid}`,
      status: targetId !== undefined ? 'resolved' : 'unresolved',
    });
  }

  // Backfill in-text citation linkage from xrefs (marker + citedFrom).
  const citById = new Map(citations.map((c) => [c.id, c]));
  for (const x of xrefs) {
    if (x.targetKind !== 'citation' || x.targetId === undefined) continue;
    const c = citById.get(x.targetId);
    if (c === undefined) continue;
    if (c.marker === undefined && x.rawText.length > 0 && x.rawText !== `rid:${x.rawText}`) c.marker = x.rawText;
    if (!c.citedFromBlocks.includes(x.fromBlockId)) c.citedFromBlocks.push(x.fromBlockId);
  }

  if (inlineFormulaCount.n > 0) {
    warnings.push(`${inlineFormulaCount.n} inline formulas kept in paragraph text only (display equations are structured)`);
  }

  const bodyText = blocks.map((b) => b.text).join(' ');
  return {
    schemaVersion: 'sdm-1',
    extractor: { name: 'jats-structure-v1', route: 'jats_xml' },
    origin: { kind: 'network', name: origin.name, ...(origin.url !== undefined ? { url: origin.url } : {}), ...(origin.license !== undefined ? { license: origin.license } : {}) },
    meta: { ...meta, language: guessLanguage(bodyText) },
    blocks, figures, tables, equations, citations, xrefs,
    diagnostics: {
      parseStatus: body !== undefined && blocks.length > 0 ? 'ok' : blocks.length > 0 ? 'partial' : 'failed',
      warnings, truncated: false,
    },
  };
};

const emptyDoc = (origin: JatsOrigin, status: 'failed' | 'partial', warnings: string[]): SdmDocument => ({
  schemaVersion: 'sdm-1',
  extractor: { name: 'jats-structure-v1', route: 'jats_xml' },
  origin: { kind: 'network', name: origin.name },
  meta: { authors: [] },
  blocks: [], figures: [], tables: [], equations: [], citations: [], xrefs: [],
  diagnostics: { parseStatus: status, warnings, truncated: false },
});
