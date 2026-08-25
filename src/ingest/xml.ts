import { decodeXmlEntities } from '../sources/text.js';

/**
 * Minimal strict XML parser (MULTIMODAL lane, 2026-08-24) — the shared foundation
 * for structure recovery from the three network fulltext routes (EuropePMC JATS,
 * OpenAlex GROBID TEI, arXiv LaTeXML XHTML). Zero dependencies (zod-only invariant);
 * entity decoding reuses the sources' named-entity table.
 *
 * Scope discipline: elements, attributes, text, comments, processing instructions,
 * XML declaration, CDATA. NOT supported (rejected with a precise error): DTDs,
 * entity declarations, arbitrary malformed input. Callers degrade honestly to
 * parseStatus 'partial'/'failed' — never a silent empty document.
 */

export interface XmlElement {
  readonly type: 'element';
  /** Qualified tag name as written (`tei:fileDesc`); localName is the suffix. */
  readonly name: string;
  readonly localName: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: readonly XmlNode[];
}

export interface XmlText {
  readonly type: 'text';
  readonly text: string;
}

export type XmlNode = XmlElement | XmlText;

export type XmlParseResult =
  | { status: 'ok'; root: XmlElement }
  | { status: 'error'; message: string; offset: number };

const isNameStart = (c: string): boolean =>
  /[A-Za-z_:]/.test(c);
const isNameChar = (c: string): boolean =>
  /[A-Za-z0-9_.:-]/.test(c);

class Cursor {
  private pos = 0;
  constructor(private readonly s: string) {}

  get offset(): number { return this.pos; }
  eof(): boolean { return this.pos >= this.s.length; }
  startsWith(prefix: string): boolean { return this.s.startsWith(prefix, this.pos); }
  eat(prefix: string): boolean {
    if (this.startsWith(prefix)) { this.pos += prefix.length; return true; }
    return false;
  }
  /** Next char without consuming; undefined at EOF. */
  peek(): string | undefined { return this.s[this.pos]; }
  take(): string | undefined { return this.s[this.pos++]; }

  readName(): string | null {
    const first = this.peek();
    if (first === undefined || !isNameStart(first)) return null;
    let name = this.take() as string;
    for (;;) {
      const c = this.peek();
      if (c === undefined || !isNameChar(c)) break;
      name += this.take();
    }
    return name;
  }
}

/** Skip whitespace; returns false at EOF. */
const skipWs = (cur: Cursor): boolean => {
  for (;;) {
    const c = cur.peek();
    if (c === undefined) return false;
    if (/\s/.test(c)) { cur.take(); continue; }
    return true;
  }
};

const parseAttrs = (cur: Cursor, out: Record<string, string>): string | null => {
  for (;;) {
    if (!skipWs(cur)) return 'unexpected EOF in attributes';
    const c = cur.peek();
    if (c === '>' || c === '/' || c === '?') return null;
    const name = cur.readName();
    if (name === null) return `expected attribute name near "${cur.peek() ?? 'EOF'}"`;
    if (!skipWs(cur)) return 'unexpected EOF after attribute name';
    if (!cur.eat('=')) return `expected '=' after attribute ${name}`;
    if (!skipWs(cur)) return 'unexpected EOF before attribute value';
    const quote = cur.take();
    if (quote !== '"' && quote !== "'") return `expected quoted value for ${name}`;
    let raw = '';
    for (;;) {
      const ch = cur.take();
      if (ch === undefined) return 'unexpected EOF in attribute value';
      if (ch === quote) break;
      raw += ch;
    }
    out[name] = decodeXmlEntities(raw);
  }
};

/**
 * Try to consume non-element markup with the cursor ON '<' (comment / PI /
 * doctype / CDATA). Returns 'consumed', 'not-markup' (cursor untouched), or
 * an error message.
 */
const trySkipMarkup = (cur: Cursor): 'consumed' | 'not-markup' | string => {
  if (cur.eat('<!--')) {
    for (;;) {
      if (cur.eof()) return 'unterminated comment';
      if (cur.eat('-->')) return 'consumed';
      cur.take();
    }
  }
  if (cur.eat('<?')) {
    for (;;) {
      if (cur.eof()) return 'unterminated processing instruction';
      if (cur.eat('?>')) return 'consumed';
      cur.take();
    }
  }
  if (cur.startsWith('<!DOCTYPE')) {
    // DTDs are out of scope: reject loudly instead of mis-parsing.
    return '<!DOCTYPE> not supported';
  }
  if (cur.startsWith('<![CDATA[')) {
    return 'CDATA not supported';
  }
  return 'not-markup';
};

interface ElemeResult {
  node: XmlElement | null;
  /** 'selfClosed' | 'open' | 'close' — close returns null node with name. */
  kind: 'selfClosed' | 'open' | 'close';
  closeName?: string;
  error?: string;
}

const parseTag = (cur: Cursor): ElemeResult => {
  // Cursor sits on '<'. Non-element markup first (cursor still on '<').
  const markup = trySkipMarkup(cur);
  if (markup !== 'not-markup') {
    if (markup === 'consumed') return { node: null, kind: 'selfClosed', error: 'skip' };
    return { node: null, kind: 'selfClosed', error: markup };
  }
  const openAt = cur.offset;
  cur.take(); // consume '<'
  if (cur.peek() === '/') {
    cur.take();
    const name = cur.readName();
    if (name === null) return { node: null, kind: 'close', error: `malformed close tag at offset ${openAt}` };
    if (!skipWs(cur)) return { node: null, kind: 'close', error: 'unexpected EOF in close tag' };
    if (!cur.eat('>')) return { node: null, kind: 'close', error: `missing '>' in </${name}>` };
    return { node: null, kind: 'close', closeName: name };
  }
  const name = cur.readName();
  if (name === null) {
    return { node: null, kind: 'selfClosed', error: `unexpected '<' at offset ${openAt}` };
  }
  const attrs: Record<string, string> = {};
  const attrErr = parseAttrs(cur, attrs);
  if (attrErr !== null) return { node: null, kind: 'selfClosed', error: `${attrErr} in <${name}>` };
  if (cur.eat('/>')) {
    return { node: { type: 'element', name, localName: name.includes(':') ? name.slice(name.indexOf(':') + 1) : name, attrs, children: [] }, kind: 'selfClosed' };
  }
  if (!cur.eat('>')) return { node: null, kind: 'selfClosed', error: `missing '>' after <${name} ${Object.keys(attrs).join(' ')}>` };
  return { node: { type: 'element', name, localName: name.includes(':') ? name.slice(name.indexOf(':') + 1) : name, attrs, children: [] }, kind: 'open' };
};

const parseChildren = (cur: Cursor, parent: XmlElement, depth: number): string | null => {
  if (depth > 400) return 'maximum nesting depth exceeded (400) — cyclic or malformed input';
  let textBuf = '';
  const flushText = (): void => {
    if (textBuf.length > 0) {
      const decoded = decodeXmlEntities(textBuf);
      if (decoded.trim().length > 0 || parent.children.length > 0) {
        (parent.children as XmlNode[]).push({ type: 'text', text: decoded });
      }
      textBuf = '';
    }
  };
  for (;;) {
    const c = cur.peek();
    if (c === undefined) return `unexpected EOF inside <${parent.name}> (unclosed element)`;
    if (c === '<') {
      flushText();
      const tagAt = cur.offset;
      const r = parseTag(cur);
      if (r.error === 'skip') continue; // comment/PI consumed; keep scanning
      if (r.error !== undefined) return r.error;
      if (r.kind === 'close') {
        if (r.closeName !== parent.name) {
          return `mismatched close tag </${r.closeName ?? '?'}> for <${parent.name}> (at offset ${tagAt})`;
        }
        return null;
      }
      if (r.node !== null) {
        (parent.children as XmlNode[]).push(r.node);
        if (r.kind === 'open') {
          const err = parseChildren(cur, r.node, depth + 1);
          if (err !== null) return err;
        }
      }
      continue;
    }
    textBuf += cur.take();
  }
};

export const parseXml = (input: string): XmlParseResult => {
  const cur = new Cursor(input);
  skipWs(cur);
  if (cur.eof()) return { status: 'error', message: 'empty document', offset: 0 };
  for (;;) {
    if (cur.eof()) return { status: 'error', message: 'no root element found (only declarations/comments?)', offset: cur.offset };
    if (cur.peek() !== '<') return { status: 'error', message: `content before root element at offset ${cur.offset}`, offset: cur.offset };
    const before = cur.offset;
    const r = parseTag(cur);
    if (r.error === 'skip') { skipWs(cur); continue; } // XML decl / comment before root
    if (r.error !== undefined) return { status: 'error', message: r.error, offset: before };
    if (r.node === null) return { status: 'error', message: 'root element cannot be a close tag', offset: before };
    if (r.kind === 'open') {
      const err = parseChildren(cur, r.node, 1);
      if (err !== null) return { status: 'error', message: err, offset: cur.offset };
    }
    skipWs(cur);
    if (!cur.eof()) return { status: 'error', message: `trailing content after root element at offset ${cur.offset}`, offset: cur.offset };
    return { status: 'ok', root: r.node };
  }
};

/** Depth-first search for elements whose localName matches; namespace-agnostic. */
export const findAll = (node: XmlNode, localName: string, out: XmlElement[] = []): XmlElement[] => {
  if (node.type === 'element') {
    if (node.localName === localName) out.push(node);
    for (const child of node.children) findAll(child, localName, out);
  }
  return out;
};

/** First descendant element with localName, or null. */
export const findFirst = (node: XmlNode, localName: string): XmlElement | null =>
  findAll(node, localName)[0] ?? null;

/** Direct children elements with localName (no recursion). */
export const childrenNamed = (el: XmlElement, localName: string): XmlElement[] =>
  el.children.filter((c): c is XmlElement => c.type === 'element' && c.localName === localName);

/** Concatenated descendant text of a node (entities decoded at parse time). */
export const textOf = (node: XmlNode): string => {
  if (node.type === 'text') return node.text;
  return node.children.map(textOf).join('');
};

/**
 * Attribute lookup tolerant of the common prefixes (xlink:href, xmlns:href),
 * because figure hrefs ride in on xlink in both JATS and TEI.
 */
export const attrAny = (el: XmlElement, localAttr: string): string | undefined => {
  for (const [k, v] of Object.entries(el.attrs)) {
    if (k === localAttr || k.endsWith(`:${localAttr}`)) return v;
  }
  return undefined;
};

/** Re-serialize a subtree back to XML text (MathML preservation; entities re-escaped). */
const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const serializeXml = (node: XmlNode): string => {
  if (node.type === 'text') return escapeXml(node.text);
  const attrs = Object.entries(node.attrs).map(([k, v]) => ` ${k}="${escapeXml(v)}"`).join('');
  if (node.children.length === 0) return `<${node.name}${attrs}/>`;
  return `<${node.name}${attrs}>${node.children.map(serializeXml).join('')}</${node.name}>`;
};
