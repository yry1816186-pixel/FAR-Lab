import { parseXml, findAll, childrenNamed, textOf, type XmlElement } from '../xml.js';
import type { SdmBlock, SdmCitation, SdmDocument, SdmEquation, SdmFigure, SdmTable, SdmXref } from '../sdm.js';
import { guessLanguage, panelsFromCaption, scanLatexSymbols, scanXrefsInText, normText, IdGen, numberFromLabel } from '../parseutil.js';

/**
 * arXiv LaTeXML HTML → SDM structure recovery (MULTIMODAL lane, arxiv_html route).
 * LaTeXML emits well-formed XHTML with semantic classes (ltx_title_section,
 * ltx_figure, ltx_table, ltx_equationgroup, ltx_biblist) and — decisive for
 * equations — `alttext` LaTeX sources on <math>. Anchor ids (S1.F2 / S4.T1 /
 * S2.E3 / bib.b12) resolve in-text <a href="#…"> links to their targets.
 * The HTML is parsed as strict XML; LaTeXML output qualifies, arbitrary web
 * HTML does not (honest failure, never a silent empty document).
 */

export interface LatexmlOrigin {
  name: string;
  url?: string;
  license?: string;
}

const hasClass = (el: XmlElement, cls: string): boolean =>
  (el.attrs['class'] ?? '').split(/\s+/).includes(cls);

export const parseLatexml = (html: string, origin: LatexmlOrigin): SdmDocument => {
  const warnings: string[] = [];
  const parsed = parseXml(html);
  if (parsed.status === 'error') return emptyDoc(origin, `xhtml parse error: ${parsed.message}`);
  const root = parsed.root;

  const blocks: SdmBlock[] = [];
  const figures: SdmFigure[] = [];
  const tables: SdmTable[] = [];
  const equations: SdmEquation[] = [];
  const citations: SdmCitation[] = [];
  const xrefs: SdmXref[] = [];
  const anchorToSdm = new Map<string, string>();

  const blk = new IdGen('blk');
  const fig = new IdGen('fig');
  const tab = new IdGen('tab');
  const eq = new IdGen('eq');
  const cit = new IdGen('cit');
  const headingStack: string[] = [];
  let lastParagraphId: string | null = null;
  let inlineMathCount = 0;

  // Title: <head><title>; LaTeXML appends " — arXiv id" which we strip honestly.
  const meta: SdmDocument['meta'] = { authors: [] };
  const htmlTitle = findAll(root, 'title')[0];
  if (htmlTitle !== undefined) {
    meta.title = normText(textOf(htmlTitle)).replace(/\s*[—–-]\s*\d{4}\.\d{4,5}(v\d+)?\s*$/, '').trim();
    if (meta.title.length > 0) blocks.push({ id: blk.next(), kind: 'front_title', text: meta.title });
  }
  // Authors: LaTeXML marks creator meta or ltx_creator — best-effort from <meta name="author">.
  for (const m of findAll(root, 'meta')) {
    if ((m.attrs['name'] ?? '') === 'author' && m.attrs['content'] !== undefined) {
      meta.authors.push(m.attrs['content']);
    }
  }

  const abstract = findAll(root, 'div').find((d) => hasClass(d, 'ltx_abstract'));
  if (abstract !== undefined) {
    const paras = childrenNamed(abstract, 'p').map((p) => normText(textOf(p))).filter((s) => s.length > 0);
    if (paras.length > 0) blocks.push({ id: blk.next(), kind: 'abstract', text: paras.join(' ') });
  }

  function emitFigure(el: XmlElement): void {
    const id = fig.next();
    const capEl = childrenNamed(el, 'figcaption')[0];
    const captionAll = capEl !== undefined ? normText(textOf(capEl)) : '';
    // The ltx_tag span carries "Figure 2: " — strip it from caption, keep as label.
    const labelMatch = /^(Figure|Fig\.?|图)\s*\d{1,3}\s*:?\s*/.exec(captionAll);
    const label = labelMatch !== null ? labelMatch[0].replace(/[:.]\s*$/, '').trim() : `Figure ${fig.count}`;
    const caption = labelMatch !== null ? captionAll.slice(labelMatch[0].length).trim() : captionAll;
    const img = findAll(el, 'img')[0];
    const src = img?.attrs['src'];
    figures.push({
      id, label, caption, panels: panelsFromCaption(caption),
      ...(src !== undefined ? { graphicRef: src } : {}),
      perception: { status: 'not_extracted' },
    });
    const anchor = el.attrs['id'];
    if (anchor !== undefined) anchorToSdm.set(anchor, id);
    if (caption.length > 0) blocks.push({ id: blk.next(), kind: 'caption', text: `${label}: ${caption}` });
  }

  function emitTable(el: XmlElement): void {
    const id = tab.next();
    const capEl = childrenNamed(el, 'figcaption')[0];
    const captionAll = capEl !== undefined ? normText(textOf(capEl)) : '';
    const labelMatch = /^(Table|表)\s*\d{1,3}\s*:?\s*/.exec(captionAll);
    const label = labelMatch !== null ? labelMatch[0].replace(/[:.]\s*$/, '').trim() : `Table ${tab.count}`;
    const caption = labelMatch !== null ? captionAll.slice(labelMatch[0].length).trim() : captionAll;
    const tableEl = findAll(el, 'table')[0];
    const grid: string[][] = [];
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
        grid.push(tr.children.filter((c): c is XmlElement => c.type === 'element' && (c.localName === 'td' || c.localName === 'th')).map((c) => normText(textOf(c))));
      }
    }
    if (grid.length === 0) warnings.push(`${label}: no rows recovered`);
    tables.push({ id, label, ...(caption.length > 0 ? { caption } : {}), grid, headerRows, mergedCells: [], footnotes: [] });
    const anchor = el.attrs['id'];
    if (anchor !== undefined) anchorToSdm.set(anchor, id);
    if (caption.length > 0) blocks.push({ id: blk.next(), kind: 'caption', text: `${label}: ${caption}` });
  }

  function emitEquation(mathEl: XmlElement, container: XmlElement | null): void {
    const alttext = mathEl.attrs['alttext'];
    if (alttext === undefined || alttext.trim().length === 0) return;
    const id = eq.next();
    // Equation number: LaTeXML renders "(3)" in a span with ltx_eqn_eqno.
    const eqno = container !== null
      ? findAll(container, 'span').find((s) => hasClass(s, 'ltx_eqn_eqno'))
      : undefined;
    equations.push({
      id,
      ...(eqno !== undefined ? { label: normText(textOf(eqno)) } : {}),
      latex: alttext,
      symbols: scanLatexSymbols(alttext),
      ...(lastParagraphId !== null ? { contextBlockId: lastParagraphId } : {}),
    });
    const anchor = (container ?? mathEl).attrs['id'];
    if (anchor !== undefined) anchorToSdm.set(anchor, id);
  }

  function emitParagraphRefs(el: XmlElement, blockId: string, text: string): void {
    const anchors = findAll(el, 'a').filter((a) => (a.attrs['href'] ?? '').startsWith('#'));
    if (anchors.length > 0) {
      for (const a of anchors) {
        const href = (a.attrs['href'] ?? '').slice(1);
        const targetId = anchorToSdm.get(href);
        const kindOf = (h: string): SdmXref['targetKind'] =>
          /\.F\d/i.test(h) ? 'figure' : /\.T\d/i.test(h) ? 'table' : /\.E\d/i.test(h) ? 'equation' : /^bib\./i.test(h) ? 'citation' : 'section';
        xrefs.push({
          fromBlockId: blockId, targetKind: kindOf(href),
          ...(targetId !== undefined ? { targetId } : {}),
          rawText: normText(textOf(a)) || `#${href}`,
          status: targetId !== undefined ? 'resolved' : 'unresolved',
        });
      }
    } else if (text.trim().length > 0) {
      xrefs.push(...scanXrefsInText(blockId, text, (kind, num) => {
        const pool = kind === 'figure' ? figures : kind === 'table' ? tables : kind === 'equation' ? equations : [];
        return (pool as Array<{ id: string; label: string }>).find((r) => numberFromLabel(r.label) === num)?.id;
      }));
    }
  }

  // Bibliography first pass (anchors must resolve for in-text refs).
  const bib = findAll(root, 'ul').find((u) => hasClass(u, 'ltx_biblist'));
  if (bib !== undefined) {
    const items = childrenNamed(bib, 'li');
    for (let i = 0; i < items.length; i += 1) {
      const li = items[i] as XmlElement;
      const id = cit.next();
      const anchor = li.attrs['id'];
      if (anchor !== undefined) anchorToSdm.set(anchor, id);
      const raw = normText(textOf(li));
      const year = /\b(19|20)\d{2}\b/.exec(raw)?.[0];
      citations.push({
        id, marker: `#${anchor ?? 'bib'}`,
        ...(raw.length > 0 ? { title: raw.slice(0, 200) } : {}),
        authors: [],
        ...(year !== undefined ? { year: Number(year) } : {}),
        citedFromBlocks: [],
      });
    }
  }

  // Figures/tables/equations before body walk (anchor resolution).
  for (const f of findAll(root, 'figure')) {
    if (hasClass(f, 'ltx_table')) emitTable(f); else emitFigure(f);
  }
  for (const container of findAll(root, 'div')) {
    if (hasClass(container, 'ltx_equation') || hasClass(container, 'ltx_equationgroup')) {
      for (const mathEl of findAll(container, 'math')) emitEquation(mathEl, container);
    }
  }

  // Body walk: headings, paragraphs, lists — in document order.
  const body = findAll(root, 'body')[0];
  if (body !== undefined) {
    walk(body);
  } else {
    warnings.push('no <body> element');
  }

  function walk(el: XmlElement): void {
    for (const child of el.children) {
      if (child.type !== 'element') continue;
      if (child.localName === 'math') {
        // Inline math inside paragraphs: count, do not structure (floods the model).
        if (!child.attrs['display']) inlineMathCount += 1;
        continue;
      }
      const isSectionTitle = /^h[1-6]$/.test(child.localName) && hasClass(child, 'ltx_title');
      if (isSectionTitle) {
        const t = normText(textOf(child)).replace(/^\d+(?:\.\d+)*\s+/, '');
        if (t.length > 0) {
          const id = blk.next();
          const level = Number(child.localName.slice(1));
          blocks.push({
            id, kind: 'heading', text: t, headingLevel: level,
            parentHeadingId: headingStack[headingStack.length - 1] ?? null,
          });
          headingStack.push(id);
          const anchor = child.attrs['id'];
          if (anchor !== undefined) anchorToSdm.set(anchor, id);
        }
        continue;
      }
      if (child.localName === 'p' && hasClass(child, 'ltx_p')) {
        const t = normText(textOf(child));
        if (t.length > 0) {
          const id = blk.next();
          blocks.push({ id, kind: 'paragraph', text: t, parentHeadingId: headingStack[headingStack.length - 1] ?? null });
          emitParagraphRefs(child, id, t);
          lastParagraphId = id;
        }
        continue;
      }
      if (child.localName === 'figure') continue; // already structured above
      walk(child);
    }
  }

  // Backfill citation citedFrom from resolved xrefs.
  const citById = new Map(citations.map((c) => [c.id, c]));
  for (const x of xrefs) {
    if (x.targetKind !== 'citation' || x.targetId === undefined) continue;
    const c = citById.get(x.targetId);
    if (c !== undefined) {
      if (c.marker === undefined && !x.rawText.startsWith('#') && x.rawText.length > 0) c.marker = x.rawText;
      if (!c.citedFromBlocks.includes(x.fromBlockId)) c.citedFromBlocks.push(x.fromBlockId);
    }
  }

  if (inlineMathCount > 0) warnings.push(`${inlineMathCount} inline math elements kept in paragraph text only`);
  const bodyText = blocks.map((b) => b.text).join(' ');
  return {
    schemaVersion: 'sdm-1',
    extractor: { name: 'latexml-html-v1', route: 'latexml_html' },
    origin: { kind: 'network', name: origin.name, ...(origin.url !== undefined ? { url: origin.url } : {}), ...(origin.license !== undefined ? { license: origin.license } : {}) },
    meta: { ...meta, language: guessLanguage(bodyText) },
    blocks, figures, tables, equations, citations, xrefs,
    diagnostics: {
      parseStatus: blocks.length > 0 ? 'ok' : 'failed',
      warnings, truncated: false,
    },
  };
};

const emptyDoc = (origin: LatexmlOrigin, warning: string): SdmDocument => ({
  schemaVersion: 'sdm-1',
  extractor: { name: 'latexml-html-v1', route: 'latexml_html' },
  origin: { kind: 'network', name: origin.name },
  meta: { authors: [] },
  blocks: [], figures: [], tables: [], equations: [], citations: [], xrefs: [],
  diagnostics: { parseStatus: 'failed', warnings: [warning], truncated: false },
});
