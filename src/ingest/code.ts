import type { SdmBlock, SdmDocument } from './sdm.js';
import { guessLanguage, normText, IdGen } from './parseutil.js';

/**
 * Research code indexing (MULTIMODAL lane): Python / JS / TS → SDM with a
 * symbol index (definitions with line ranges), imports list, and docstrings.
 * This is a line-anchored HEURISTIC scanner (extractor name says so) — the
 * symbol list is a candidate index for inspect/reference/provenance, not an
 * AST truth claim. Deeper semantic understanding is the LLM tier's job on top
 * of this index; execution remains governed by the experiment-runtime lane.
 */

export type CodeLanguage = 'python' | 'javascript' | 'typescript';

export const detectCodeLanguage = (fileName: string): CodeLanguage | null => {
  if (/\.py$/i.test(fileName)) return 'python';
  if (/\.tsx?$/i.test(fileName)) return 'typescript';
  if (/\.m?js$/i.test(fileName)) return 'javascript';
  return null;
};

export interface CodeSymbol {
  kind: 'function' | 'class' | 'method';
  name: string;
  params: string;
  /** 1-based inclusive line range of the definition header line. */
  lineStart: number;
  lineEnd: number;
  docstring: string | undefined;
}

export const scanPython = (src: string): { symbols: CodeSymbol[]; imports: string[] } => {
  const lines = src.split(/\r?\n/);
  const symbols: CodeSymbol[] = [];
  const imports: string[] = [];
  const defRe = /^(\s*)(def|class)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?\s*(?:->\s*[^:]+)?:/;
  // Params optional because 'class Foo:' carries none; the trailing colon is
  // what makes the definition line, so over-matching stays bounded.
  const asyncRe = /^(\s*)async\s+def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:->\s*[^:]+)?:/;
  const importRe = /^\s*(?:from\s+([.\w]+)\s+import\s+(.+)|import\s+(.+))$/;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] as string;
    const im = importRe.exec(line);
    if (im !== null) {
      if (im[1] !== undefined) imports.push(`${im[1]}:${normText(im[2] ?? '')}`);
      else imports.push(...(im[3] ?? '').split(',').map((s) => {
        const alias = /^(.+?)\s+as\s+(\w+)$/.exec(s.trim());
        return alias !== null ? `${alias[1]}:${alias[2]}` : s.trim();
      }).filter((s) => s.length > 0));
      continue;
    }
    const am = asyncRe.exec(line);
    const m = am !== null ? null : defRe.exec(line);
    if (am !== null || m !== null) {
      const hit = (am ?? m) as RegExpExecArray;
      const indent = hit[1] ?? '';
      const kind: CodeSymbol['kind'] = am !== null ? 'function' : ((m![2] ?? 'function') === 'class' ? 'class' : 'function');
      const name = am !== null ? am[2] ?? '' : m![3] ?? '';
      const params = am !== null ? am[3] ?? '' : m![4] ?? '';
      // Body extent: following lines with greater indentation (or blank).
      let end = i + 1;
      while (end < lines.length) {
        const l = lines[end] as string;
        const lead = /^(\s*)/.exec(l);
        if (l.trim().length > 0 && lead !== null && lead[1] !== undefined && lead[1].length <= indent.length) break;
        end += 1;
      }
      // Docstring: first body line triple-quoted.
      let doc: string | undefined;
      const first = (lines[i + 1] ?? '').trim();
      const docOpen = /^("""|''')/.exec(first);
      if (docOpen !== null) {
        const quote = docOpen[1] as string;
        const rest = first.slice(3);
        if (rest.endsWith(quote)) doc = rest.slice(0, -3);
        else {
          const parts: string[] = [rest];
          for (let j = i + 2; j < lines.length; j += 1) {
            const l = (lines[j] ?? '').trim();
            if (l.endsWith(quote)) { parts.push(l.slice(0, -3)); break; }
            parts.push(l);
          }
          doc = parts.join(' ');
        }
        doc = normText(doc ?? '');
        if (doc.length === 0) doc = undefined;
      }
      symbols.push({
        kind: indent.length > 0 && kind === 'function' ? 'method' : kind,
        name, params: normText(params), lineStart: i + 1, lineEnd: end, docstring: doc,
      });
    }
  }
  return { symbols, imports };
};

export const scanJsTs = (src: string, lang: CodeLanguage): { symbols: CodeSymbol[]; imports: string[] } => {
  const lines = src.split(/\r?\n/);
  const symbols: CodeSymbol[] = [];
  const imports: string[] = [];
  const fnRe = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/;
  const methodRe = /^\s{2,}(?:public|private|protected|static|readonly|async|\s)*([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*(?::\s*[^{]*)?\{/;
  const classRe = /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/;
  const arrowRe = /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::\s*[^=]+)?=>/;
  const importRe = /^\s*import\s+[^'"]*['"]([^'"]+)['"]/;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] as string;
    const im = importRe.exec(line);
    if (im !== null && (lang === 'typescript' || lang === 'javascript')) { imports.push(im[1] ?? ''); continue; }
    const cm = classRe.exec(line);
    if (cm !== null) { symbols.push({ kind: 'class', name: cm[1] ?? '', params: '', lineStart: i + 1, lineEnd: i + 1, docstring: undefined }); continue; }
    const fm = fnRe.exec(line);
    if (fm !== null) { symbols.push({ kind: 'function', name: fm[1] ?? '', params: normText(fm[2] ?? ''), lineStart: i + 1, lineEnd: i + 1, docstring: undefined }); continue; }
    const am = arrowRe.exec(line);
    if (am !== null) { symbols.push({ kind: 'function', name: am[1] ?? '', params: normText(am[2] ?? ''), lineStart: i + 1, lineEnd: i + 1, docstring: undefined }); continue; }
    if (lang === 'typescript') {
      const mm = methodRe.exec(line);
      if (mm !== null && !/^(if|for|while|switch|catch|function|return)$/.test(mm[1] ?? '')) {
        symbols.push({ kind: 'method', name: mm[1] ?? '', params: normText(mm[2] ?? ''), lineStart: i + 1, lineEnd: i + 1, docstring: undefined });
      }
    }
  }
  return { symbols, imports };
};

export interface CodeOrigin { name: string }

export const buildSdmFromCode = (src: string, origin: CodeOrigin): SdmDocument => {
  const lang = detectCodeLanguage(origin.name) ?? 'python';
  const warnings: string[] = [];
  const { symbols, imports } = lang === 'python' ? scanPython(src) : scanJsTs(src, lang);
  const blk = new IdGen('blk');
  const blocks: SdmBlock[] = [];
  const header: SdmBlock = { id: blk.next(), kind: 'heading', text: `${lang} source: ${origin.name}`, headingLevel: 1 };
  blocks.push(header);
  if (imports.length > 0) {
    blocks.push({ id: blk.next(), kind: 'paragraph', text: `Imports (${imports.length}): ${imports.join(', ')}`, parentHeadingId: header.id });
  }
  if (symbols.length === 0) warnings.push('no top-level definitions detected (script-style or minified code)');
  for (const sym of symbols) {
    const desc = sym.docstring !== undefined ? ` — ${sym.docstring}` : '';
    blocks.push({
      id: blk.next(), kind: 'paragraph',
      text: `${sym.kind} ${sym.name}(${sym.params}) [lines ${sym.lineStart}-${sym.lineEnd}]${desc}`,
      parentHeadingId: header.id,
      provenance: { charStart: 0, charEnd: 0, elementPath: `L${sym.lineStart}-L${sym.lineEnd}` },
    });
  }
  return {
    schemaVersion: 'sdm-1',
    extractor: { name: 'code-scan-v1', route: 'code_scan' },
    origin: { kind: 'upload', name: origin.name },
    meta: { title: origin.name, authors: [], language: lang === 'python' ? 'python' : guessLanguage(src) },
    blocks, figures: [], tables: [], equations: [], citations: [], xrefs: [],
    diagnostics: {
      parseStatus: 'ok',
      warnings: [...warnings, 'heuristic line-scanner index — not an AST parse'],
      truncated: false,
    },
  };
};
