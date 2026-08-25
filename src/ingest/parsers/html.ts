import type { SdmBlock, SdmDocument, SdmFigure, SdmTable, SdmXref, SdmXrefTargetKind } from '../sdm.js';
import { parseXml, findAll, childrenNamed, textOf, attrAny, type XmlElement } from '../xml.js';
import { guessLanguage, panelsFromCaption, scanXrefsInText, normText, IdGen, numberFromLabel } from '../parseutil.js';

/**
 * HTML structure recovery (MULTIMODAL lane extension, 2026-08-25). HTML is
 * where scientific supplements, preprint landing pages and EPUB chapters
 * live. Strategy: a DETERMINISTIC tolerance pre-pass (doctype/comments/
 * script-style removal, void-element closing, attribute normalization) feeds
 * the lane's strict XML parser — we never guess-repair broken trees. Tag-soup
 * that still fails the strict parse degrades honestly to parseStatus 'failed'
 * with the parser's precise offset, never a silently-empty document.
 *
 * The tree walker is shared with the EPUB route (spine-ordered XHTML parts).
 */

// ---------------------------------------------------------------------------
// tolerance pre-pass
// ---------------------------------------------------------------------------

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

const ATTR_RE = /([A-Za-z_:][-A-Za-z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

const escapeAttr = (v: string): string => v.replace(/&(?![A-Za-z#0-9])/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * HTML optional-end-tag semantics: which OPEN element (key) is implicitly
 * closed when tag T starts. `li` is deliberately NOT closed by ul/ol — nested
 * lists inside list items are legal and common.
 */
const IMPLIED_CLOSE: Readonly<Record<string, ReadonlySet<string>>> = {
  p: new Set(['address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'main', 'menu', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul']),
  li: new Set(['li']),
  dt: new Set(['dt', 'dd', 'dl']),
  dd: new Set(['dt', 'dd', 'dl']),
  td: new Set(['td', 'th', 'tr', 'tbody', 'tfoot', 'thead', 'table']),
  th: new Set(['td', 'th', 'tr', 'tbody', 'tfoot', 'thead', 'table']),
  tr: new Set(['tr', 'tbody', 'tfoot', 'thead', 'table']),
  thead: new Set(['tbody', 'tfoot', 'table']),
  tbody: new Set(['tbody', 'tfoot', 'table']),
  tfoot: new Set(['tbody', 'tfoot', 'table']),
  head: new Set(['body']),
};

export const normalizeHtml = (src: string): { xml: string; warnings: string[] } => {
  const warnings: string[] = [];
  let s = src.replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?[^>]*>/gi, '');
  s = s.replace(/<!--[\s\S]*?(?:-->|$)/g, '');
  s = s.replace(/<(script|style)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, (_m, tag: string, body: string) => {
    if (body.trim().length > 0) warnings.push(`<${String(tag).toLowerCase()}> block dropped — presentational/executable content, not scientific text`);
    return '';
  });

  // Tag stream pass: normalize names/attributes, close void elements, apply
  // HTML's optional-end-tag rules (unclosed <p>/<li>/<td> are legal HTML),
  // drop stray closers, and close anything still open at EOF. What this pass
  // does NOT do is guess-repair genuinely broken nesting — mismatches that
  // survive still fail the strict parse honestly.
  const tagRe = /<\/?([A-Za-z][^\s/>]*)([^>]*)>/g;
  const stack: string[] = [];
  let out = '';
  let last = 0;
  let strayClosers = 0;
  for (const m of s.matchAll(tagRe)) {
    const idx = m.index ?? 0;
    out += s.slice(last, idx);
    last = idx + m[0].length;
    const whole = m[0] as string;
    const rawName = m[1] as string;
    const name = rawName.toLowerCase();
    if (name.includes(':')) { out += whole; continue; } // namespaced (svg/math) — already well-formed
    if (whole.startsWith('</')) {
      if (VOID_TAGS.has(name)) { strayClosers += 1; continue; }
      if (!stack.includes(name)) { strayClosers += 1; continue; }
      while (stack.length > 0 && stack[stack.length - 1] !== name) out += `</${stack.pop() as string}>`;
      out += `</${stack.pop() as string}>`;
      continue;
    }
    while (stack.length > 0) {
      const top = stack[stack.length - 1] as string;
      const closers = IMPLIED_CLOSE[top];
      if (closers === undefined || !closers.has(name)) break;
      out += `</${stack.pop() as string}>`;
    }
    const selfClosed = /\/\s*$/.test(m[2] ?? '');
    const attrs: string[] = [];
    for (const am of (m[2] ?? '').replace(/\/\s*$/, '').matchAll(ATTR_RE)) {
      const aname = (am[1] as string).toLowerCase();
      if (aname === '') continue;
      const val = am[2] ?? am[3] ?? am[4];
      attrs.push(val === undefined ? ` ${aname}=""` : ` ${aname}="${escapeAttr(val)}"`);
    }
    const tag = `<${name}${attrs.join('')}`;
    if (selfClosed || VOID_TAGS.has(name)) {
      out += `${tag}/>`;
    } else {
      out += `${tag}>`;
      stack.push(name);
    }
  }
  out += s.slice(last);
  while (stack.length > 0) out += `</${stack.pop() as string}>`;
  if (strayClosers > 0) warnings.push(`${strayClosers} stray close tag(s) dropped (no matching open element in scope)`);
  return { xml: out, warnings };
};

// ---------------------------------------------------------------------------
// shared tree walker (HTML upload + EPUB spine parts)
// ---------------------------------------------------------------------------

const CONTAINERS = new Set(['html', 'body', 'head', 'div', 'section', 'article', 'main', 'aside', 'nav', 'header', 'footer', 'figure', 'picture', 'span', 'a', 'em', 'strong', 'b', 'i', 'u', 'small', 'sub', 'sup', 'font', 'center', 'ul', 'ol', 'dl', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'figcaption', 'pre', 'code', 'blockquote', 'li', 'dt', 'dd', 'hgroup']);
const BLOCK_CHILDREN = new Set(['p', 'div', 'section', 'article', 'ul', 'ol', 'table', 'blockquote', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'figure', 'li']);
const INLINE_ELEMENTS = new Set(['span', 'a', 'em', 'strong', 'b', 'i', 'u', 'small', 'sub', 'sup', 'code', 'font', 'mark', 'abbr', 'cite', 'q', 's', 'tt', 'kbd', 'label']);

const MAX_BLOCKS = 20_000;
const MAX_FIGURES = 2_000;
const MAX_TABLES = 2_000;

export interface HtmlWalkCtx {
  blk: IdGen;
  fig: IdGen;
  tab: IdGen;
  blocks: SdmBlock[];
  figures: SdmFigure[];
  tables: SdmTable[];
  xrefs: SdmXref[];
  warnings: string[];
  truncated: boolean;
  pathPrefix: string;
  headingStack: string[];
  pendingScans: Array<{ blockId: string; text: string }>;
}

export const makeWalkCtx = (pathPrefix = ''): HtmlWalkCtx => ({
  blk: new IdGen('blk'), fig: new IdGen('fig'), tab: new IdGen('tab'),
  blocks: [], figures: [], tables: [], xrefs: [], warnings: [], truncated: false,
  pathPrefix, headingStack: [], pendingScans: [],
});

const elementPathOf = (parentPath: string, el: XmlElement, indexAmongSame: number, sameNameSiblings: number): string =>
  `${parentPath}${parentPath.length > 0 ? '>' : ''}${el.localName}${sameNameSiblings > 1 ? `[${indexAmongSame}]` : ''}`;

const pushBlock = (ctx: HtmlWalkCtx, kind: SdmBlock['kind'], text: string, path: string, extra?: Partial<SdmBlock>): void => {
  if (ctx.blocks.length >= MAX_BLOCKS) { ctx.truncated = true; return; }
  const id = ctx.blk.next();
  ctx.blocks.push({
    id, kind, text,
    parentHeadingId: kind === 'heading' ? undefined : ctx.headingStack[ctx.headingStack.length - 1] ?? null,
    provenance: { elementPath: `${ctx.pathPrefix}${ctx.pathPrefix.length > 0 ? '>' : ''}${path}` },
    ...extra,
  });
  if (kind !== 'heading' && kind !== 'caption') ctx.pendingScans.push({ blockId: id, text });
};

const labelPrefixOf = (caption: string): string | undefined => {
  const m = /^(Figure|Fig\.?|Table|图|表|式)\s*\.?\s*(\d{1,3})/i.exec(caption.trim());
  if (m === null) return undefined;
  const printed = m[1] as string;
  const prefix = /^fig\./i.test(printed) || /^fig$/i.test(printed) || /^figure$/i.test(printed) ? 'Figure' : printed;
  return `${prefix} ${m[2] as string}`;
};

/** Walk a parsed (X)HTML tree into the shared context. Pure; no store access.
 *  Cross-reference resolution is a SEPARATE pass (`resolveXrefs`) so multi-part
 *  callers (EPUB spine) resolve forward references across parts. */
export const walkHtmlInto = (ctx: HtmlWalkCtx, root: XmlElement): void => {
  const body = findAll(root, 'body')[0] ?? root;
  walkChildren(ctx, body, body.localName);
};

export const resolveXrefs = (ctx: HtmlWalkCtx): void => {
  const resolve = (kind: SdmXrefTargetKind, num: number): string | undefined => {
    const pool = kind === 'figure' ? ctx.figures : kind === 'table' ? ctx.tables : [];
    return (pool as Array<{ id: string; label: string }>).find((r) => numberFromLabel(r.label) === num)?.id;
  };
  for (const scan of ctx.pendingScans) {
    ctx.xrefs.push(...scanXrefsInText(scan.blockId, scan.text, resolve));
  }
};

const walkChildren = (ctx: HtmlWalkCtx, el: XmlElement, path: string): void => {
  const counts = new Map<string, number>();
  for (const c of el.children) if (c.type === 'element') counts.set(c.localName, (counts.get(c.localName) ?? 0) + 1);
  const seen = new Map<string, number>();
  // Inline run buffer: bare text and inline elements inside a container (div
  // text, body prose without <p>) coalesce into ONE paragraph per run instead
  // of being dropped or split mid-sentence.
  let run = '';
  const flushRun = (): void => {
    const text = normText(run);
    if (text.length > 0) pushBlock(ctx, 'paragraph', text, path);
    run = '';
  };
  for (const child of el.children) {
    if (child.type === 'text') { run += child.text; continue; }
    if (INLINE_ELEMENTS.has(child.localName)) {
      const t = normText(textOf(child));
      if (t.length > 0) run += (run.length > 0 && !run.endsWith(' ') ? ' ' : '') + t;
      continue;
    }
    flushRun();
    const n = (seen.get(child.localName) ?? 0) + 1;
    seen.set(child.localName, n);
    const childPath = elementPathOf(path, child, n, counts.get(child.localName) ?? 1);
    walkElement(ctx, child, childPath);
  }
  flushRun();
};

const walkElement = (ctx: HtmlWalkCtx, el: XmlElement, path: string): void => {
  const name = el.localName;
  if (ctx.blocks.length >= MAX_BLOCKS) { ctx.truncated = true; return; }

  if (/^h[1-6]$/.test(name)) {
    const text = normText(textOf(el));
    if (text.length > 0) {
      const level = Number(name[1]);
      const id = ctx.blk.next();
      ctx.blocks.push({
        id, kind: 'heading', text, headingLevel: level,
        provenance: { elementPath: `${ctx.pathPrefix}${ctx.pathPrefix.length > 0 ? '>' : ''}${path}` },
      });
      while (ctx.headingStack.length >= level) ctx.headingStack.pop();
      ctx.headingStack.push(id);
    }
    return;
  }
  if (name === 'p') {
    const hasBlockChild = el.children.some((c) => c.type === 'element' && BLOCK_CHILDREN.has(c.localName));
    if (hasBlockChild) { walkChildren(ctx, el, path); return; } // unclosed-p HTML: act as container
    const text = normText(textOf(el));
    if (text.length > 0) pushBlock(ctx, 'paragraph', text, path);
    return;
  }
  if (name === 'li' || name === 'dd') {
    const text = normText(textOf(el));
    if (text.length > 0) pushBlock(ctx, 'list_item', text, path);
    return;
  }
  if (name === 'dt') {
    const text = normText(textOf(el));
    if (text.length > 0) pushBlock(ctx, 'paragraph', text, path);
    return;
  }
  if (name === 'blockquote') {
    const text = normText(findAll(el, 'p').map(textOf).join(' ') || textOf(el));
    if (text.length > 0) pushBlock(ctx, 'quote', text, path);
    return;
  }
  if (name === 'pre') {
    const text = textOf(el).replace(/\n{3,}/g, '\n\n').trim();
    if (text.length > 0) pushBlock(ctx, 'code', text, path);
    return;
  }
  if (name === 'figcaption') {
    const text = normText(textOf(el));
    if (text.length > 0) pushBlock(ctx, 'caption', text, path);
    return;
  }
  if (name === 'figure') {
    if (ctx.figures.length < MAX_FIGURES) emitFigure(ctx, el, path);
    else ctx.truncated = true;
    return;
  }
  if (name === 'img') {
    // Image outside a <figure> wrapper: record honestly with no caption guess.
    if (ctx.figures.length < MAX_FIGURES) {
      const src = attrAny(el, 'src');
      const label = `Image ${ctx.fig.count}`;
      ctx.figures.push({
        id: ctx.fig.next(), label, caption: '', panels: [],
        ...(src !== undefined ? { graphicRef: src } : {}),
        perception: { status: 'not_extracted' },
        provenance: { elementPath: `${ctx.pathPrefix}${ctx.pathPrefix.length > 0 ? '>' : ''}${path}` },
      });
      ctx.warnings.push(`image without <figure>/<figcaption> at ${path} — caption absent in source, not guessed`);
    }
    return;
  }
  if (name === 'table') {
    if (ctx.tables.length < MAX_TABLES) emitTable(ctx, el, path);
    else ctx.truncated = true;
    return;
  }
  if (CONTAINERS.has(name)) { walkChildren(ctx, el, path); return; }
  // Unknown element: recurse (structure unknown ≠ content worthless).
  walkChildren(ctx, el, path);
};

const emitFigure = (ctx: HtmlWalkCtx, el: XmlElement, path: string): void => {
  const captionEl = findAll(el, 'figcaption')[0];
  const caption = captionEl !== undefined ? normText(textOf(captionEl)) : '';
  const imgs = findAll(el, 'img');
  const src = imgs.length > 0 ? attrAny(imgs[0] as XmlElement, 'src') : undefined;
  const label = labelPrefixOf(caption) ?? `Figure ${ctx.fig.count}`;
  ctx.figures.push({
    id: ctx.fig.next(), label, caption, panels: panelsFromCaption(caption),
    ...(src !== undefined ? { graphicRef: src } : {}),
    perception: { status: 'not_extracted' },
    provenance: { elementPath: `${ctx.pathPrefix}${ctx.pathPrefix.length > 0 ? '>' : ''}${path}` },
  });
  if (imgs.length > 1) ctx.warnings.push(`figure at ${path} contains ${imgs.length} images — graphicRef carries the first, others listed here: ${imgs.slice(1).map((i) => attrAny(i, 'src') ?? '?').join(', ')}`);
  if (caption.length > 0) pushBlock(ctx, 'caption', `${label}: ${caption}`, path);
};

const emitTable = (ctx: HtmlWalkCtx, el: XmlElement, path: string): void => {
  const captionEl = childrenNamed(el, 'caption')[0];
  const caption = captionEl !== undefined ? normText(textOf(captionEl)) : undefined;
  const theadRows = findAll(el, 'thead').flatMap((th) => childrenNamed(th, 'tr')).length;
  const allTrs = findAll(el, 'tr');
  let headerRows = theadRows;
  if (headerRows === 0 && allTrs.length > 0) {
    const firstCells = childrenNamed(allTrs[0] as XmlElement, 'td').length === 0
      ? childrenNamed(allTrs[0] as XmlElement, 'th')
      : [];
    if (firstCells.length > 0) headerRows = 1;
  }

  // HTML grid expansion with colspan/rowspan (placeholders keep the grid rectangular).
  const grid: string[][] = [];
  const merged: SdmTable['mergedCells'] = [];
  const occupied = new Set<string>();
  allTrs.forEach((tr, r) => {
    const cells = tr.children.filter((c): c is XmlElement => c.type === 'element' && (c.localName === 'td' || c.localName === 'th'));
    if (cells.length === 0 && textOf(tr).trim().length === 0) return;
    while (grid.length < r + 1) grid.push([]);
    let col = 0;
    for (const cell of cells) {
      while (occupied.has(`${r},${col}`)) col += 1;
      const cs = Math.max(1, Number(attrAny(cell, 'colspan') ?? '1') || 1);
      const rs = Math.max(1, Number(attrAny(cell, 'rowspan') ?? '1') || 1);
      const text = normText(textOf(cell));
      for (let dr = 0; dr < rs; dr += 1) {
        for (let dc = 0; dc < cs; dc += 1) {
          if (dr === 0 && dc === 0) continue;
          occupied.add(`${r + dr},${col + dc}`);
        }
      }
      const row = grid[r] as string[];
      while (row.length < col) row.push('');
      row[col] = text;
      if (cs > 1) for (let dc = 1; dc < cs; dc += 1) { while (row.length < col + dc + 1) row.push(''); row[col + dc] = ''; }
      if (rs > 1) {
        for (let dr = 1; dr < rs; dr += 1) {
          while (grid.length < r + dr + 1) grid.push([]);
          const trow = grid[r + dr] as string[];
          while (trow.length < col + cs) trow.push('');
        }
      }
      if (cs > 1 || rs > 1) merged.push({ row: r, col, rowSpan: rs, colSpan: cs });
      col += cs;
    }
  });
  const width = grid.reduce((m, row) => Math.max(m, row.length), 0);
  for (const row of grid) while (row.length < width) row.push('');
  while (grid.length > 0 && grid[grid.length - 1]!.every((c) => c === '')) grid.pop();

  const label = labelPrefixOf(caption ?? '') ?? `Table ${ctx.tab.count}`;
  ctx.tables.push({
    id: ctx.tab.next(), label,
    ...(caption !== undefined && caption.length > 0 ? { caption } : {}),
    grid, headerRows, mergedCells: merged, footnotes: [],
    provenance: { elementPath: `${ctx.pathPrefix}${ctx.pathPrefix.length > 0 ? '>' : ''}${path}` },
  });
};

// ---------------------------------------------------------------------------
// standalone HTML entry point
// ---------------------------------------------------------------------------

export const parseHtml = (text: string, opts: { name: string; url?: string }): SdmDocument => {
  const { xml, warnings } = normalizeHtml(text);
  const parsed = parseXml(xml);
  const failed = (ws: string[]): SdmDocument => ({
    schemaVersion: 'sdm-1',
    extractor: { name: 'html-structure-v1', route: 'html_structured' },
    origin: { kind: 'upload', name: opts.name, ...(opts.url !== undefined ? { url: opts.url } : {}) },
    meta: { authors: [] },
    blocks: [], figures: [], tables: [], equations: [], citations: [], xrefs: [],
    diagnostics: { parseStatus: 'failed', warnings: ws, truncated: false },
  });
  if (parsed.status === 'error') {
    return failed([...warnings, `HTML failed strict parse after tolerance normalization: ${parsed.message} — tag-soup trees are not guessed into structure`]);
  }
  const ctx = makeWalkCtx();
  const titleEl = findAll(parsed.root, 'title')[0];
  const title = titleEl !== undefined ? normText(textOf(titleEl)) : undefined;
  walkHtmlInto(ctx, parsed.root);
  resolveXrefs(ctx);
  const bodyText = ctx.blocks.map((b) => b.text).join(' ');
  const hasContent = ctx.blocks.length + ctx.figures.length + ctx.tables.length > 0;
  return {
    schemaVersion: 'sdm-1',
    extractor: { name: 'html-structure-v1', route: 'html_structured' },
    origin: { kind: 'upload', name: opts.name, ...(opts.url !== undefined ? { url: opts.url } : {}) },
    meta: {
      authors: [],
      ...(title !== undefined && title.length > 0 ? { title } : {}),
      ...(guessLanguage(bodyText) !== undefined ? { language: guessLanguage(bodyText) } : {}),
    },
    blocks: ctx.blocks, figures: ctx.figures, tables: ctx.tables, equations: [], citations: [], xrefs: ctx.xrefs,
    diagnostics: {
      parseStatus: hasContent ? 'ok' : 'partial',
      warnings: [...warnings, ...ctx.warnings, ...(hasContent ? [] : ['no block-level content recovered (empty body?)'])],
      truncated: ctx.truncated,
    },
  };
};
