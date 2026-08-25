import type { SdmBlock, SdmCitation, SdmDocument, SdmEquation, SdmFigure, SdmTable, SdmXref } from '../sdm.js';
import { guessLanguage, panelsFromCaption, scanLatexSymbols, scanXrefsInText, normText, IdGen, numberFromLabel } from '../parseutil.js';

/**
 * LaTeX source → SDM structure recovery (MULTIMODAL lane). Researchers keep .tex;
 * this recovers what the SOURCE already encodes — the highest-fidelity route for
 * equations (verbatim LaTeX), figures (\includegraphics + \caption + \label),
 * tables (tabular rows split on & and \\), the section tree, and \cite ↔ \bibitem
 * linkage. Paragraph extraction is heuristic (macro stripping) and labeled so in
 * the extractor name — the structured elements are exact, the prose is honest best-effort.
 */

export interface LatexOrigin { name: string }

/** Read one {...} group at src[i] (src[i] must be '{'); returns [content, endIndexExclusive]. Handles nesting. */
const readBraced = (src: string, i: number): [string, number] | null => {
  if (src[i] !== '{') return null;
  let depth = 0;
  for (let j = i; j < src.length; j += 1) {
    const c = src[j];
    if (c === '\\') { j += 1; continue; } // escaped next char
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return [src.slice(i + 1, j), j + 1];
    }
  }
  return null;
};

/** Read a command argument: \cmd{...} or \cmd␣{...} */
const readCommandArg = (src: string, cmdEnd: number): [string, number] | null => {
  let j = cmdEnd;
  while (j < src.length && /\s/.test(src[j] as string)) j += 1;
  return readBraced(src, j);
};

const stripMacros = (s: string): string =>
  s
    .replace(/\\(?:textbf|textit|emph|texttt|textrm|textsc|mbox|text)\{([^{}]*)\}/g, '$1')
    .replace(/\\(?:textbf|textit|emph|texttt|textrm|textsc|mbox|text)\{([^{}]*\{[^{}]*\}[^{}]*)\}/g, '$1')
    .replace(/\\\\/g, ' ')
    .replace(/~|\\,/g, ' ')
    .replace(/[$]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const parseLatex = (src: string, origin: LatexOrigin): SdmDocument => {
  const warnings: string[] = [];
  const blocks: SdmBlock[] = [];
  const pendingScans: Array<{ blockId: string; text: string }> = [];
  const figures: SdmFigure[] = [];
  const tables: SdmTable[] = [];
  const equations: SdmEquation[] = [];
  const citations: SdmCitation[] = [];
  const xrefs: SdmXref[] = [];
  const labelToSdm = new Map<string, string>(); // \label{..} → SDM id
  const bibKeyToSdm = new Map<string, string>(); // \bibitem{..} key → SDM id

  const blk = new IdGen('blk');
  const fig = new IdGen('fig');
  const tab = new IdGen('tab');
  const eq = new IdGen('eq');
  const cit = new IdGen('cit');
  const headingStack: string[] = [];
  const meta: SdmDocument['meta'] = { authors: [] };

  const sectionRe = /\\(section|subsection|subsubsection|paragraph|subparagraph)\*?\s*\{/g;
  const matches: Array<{ kind: 'section' | 'env'; m: RegExpExecArray; start: number }> = [];
  const envRe = /\\begin\{(figure|figure\*|table|table\*|equation|equation\*|align|align\*|gather|abstract|thebibliography|displaymath)\*?\}/g;
  for (let m = sectionRe.exec(src); m !== null; m = sectionRe.exec(src)) matches.push({ kind: 'section', m, start: m.index });
  for (let m = envRe.exec(src); m !== null; m = envRe.exec(src)) matches.push({ kind: 'env', m, start: m.index });
  matches.sort((a, b) => a.start - b.start);

  // ---- title & author ----
  const titleCmd = /\\title\s*\{/.exec(src);
  if (titleCmd !== null) {
    const arg = readBraced(src, titleCmd.index + titleCmd[0].length - 1);
    if (arg !== null) {
      meta.title = stripMacros(arg[0]);
      blocks.push({ id: blk.next(), kind: 'front_title', text: meta.title ?? '', provenance: { charStart: titleCmd.index, charEnd: arg[1] } });
    }
  } else warnings.push('no \\title command found');
  const authorCmd = /\\author\s*\{/.exec(src);
  if (authorCmd !== null) {
    const arg = readBraced(src, authorCmd.index + authorCmd[0].length - 1);
    if (arg !== null) {
      meta.authors = arg[0].split(/\\and\b/).map((a) => stripMacros(a)).filter((a) => a.length > 0);
      if (meta.authors.length > 0) blocks.push({ id: blk.next(), kind: 'front_authors', text: meta.authors.join(', '), provenance: { charStart: authorCmd.index, charEnd: arg[1] } });
    }
  }

  const emitParagraph = (text: string, start: number, end: number): void => {
    const t = normText(stripMacros(text));
    if (t.length < 2) return;
    const id = blk.next();
    blocks.push({
      id, kind: 'paragraph', text: t,
      parentHeadingId: headingStack[headingStack.length - 1] ?? null,
      provenance: { charStart: start, charEnd: end },
    });
    // \cite linkage and printed-pattern scans are DEFERRED: bibliography keys and
    // figure/table numbers are complete only after the full walk (forward refs).
    pendingScans.push({ blockId: id, text: t });
  };

  // ---- walk constructs in document order; between them, heuristic paragraphs ----
  let cursor = 0;
  const nNumbered = { eq: 0 };

  const emitEnvironment = (name: string, beginIdx: number): void => {
    const endMarker = `\\end{${name}}`;
    const endIdx = src.indexOf(endMarker, beginIdx);
    const bodyEnd = endIdx === -1 ? src.length : endIdx;
    const beginEnd = src.indexOf('}', beginIdx) + 1;
    const body = src.slice(beginEnd, bodyEnd);
    if (name === 'abstract') {
      const t = normText(stripMacros(body));
      if (t.length > 0) blocks.push({ id: blk.next(), kind: 'abstract', text: t, provenance: { charStart: beginIdx, charEnd: bodyEnd + endMarker.length } });
      return;
    }
    if (name === 'thebibliography') {
      const itemRe = /\\bibitem(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;
      for (let m = itemRe.exec(body); m !== null; m = itemRe.exec(body)) {
        const key = (m[1] ?? '').trim();
        const nextItem = body.indexOf('\\bibitem', m.index + 1);
        const raw = body.slice(m.index + m[0].length, nextItem === -1 ? body.length : nextItem);
        const id = cit.next();
        if (key.length > 0) bibKeyToSdm.set(key, id);
        const year = /\b(19|20)\d{2}\b/.exec(raw)?.[0];
        citations.push({
          id, marker: `[${cit.count}]`,
          ...(raw.length > 0 ? { title: stripMacros(raw).slice(0, 200) } : {}),
          authors: [], ...(year !== undefined ? { year: Number(year) } : {}),
          citedFromBlocks: [],
        });
      }
      return;
    }
    if (name === 'figure' || name === 'figure*') {
      const id = fig.next();
      const label = `Figure ${fig.count}`;
      const capMatch = /\\caption\s*(?:\[[^\]]*\])?\s*\{/.exec(body);
      let caption = '';
      if (capMatch !== null) {
        const arg = readBraced(body, capMatch.index + capMatch[0].length - 1);
        if (arg !== null) caption = stripMacros(arg[0]);
      } else warnings.push(`${label}: no \\caption`);
      const grMatch = /\\includegraphics(?:\[[^\]]*\])?\s*\{([^}]*)\}/.exec(body);
      const lblMatch = /\\label\{([^}]*)\}/.exec(body);
      figures.push({
        id, label, caption, panels: panelsFromCaption(caption),
        ...(grMatch !== null ? { graphicRef: grMatch[1] ?? '' } : {}),
        perception: { status: 'not_extracted' },
        provenance: { charStart: beginIdx, charEnd: bodyEnd + endMarker.length },
      });
      if (lblMatch !== null) labelToSdm.set((lblMatch[1] ?? '').trim(), id);
      if (caption.length > 0) blocks.push({ id: blk.next(), kind: 'caption', text: `${label}: ${caption}` });
      return;
    }
    if (name === 'table' || name === 'table*') {
      const id = tab.next();
      const label = `Table ${tab.count}`;
      const capMatch = /\\caption\s*(?:\[[^\]]*\])?\s*\{/.exec(body);
      let caption: string | undefined;
      if (capMatch !== null) {
        const arg = readBraced(body, capMatch.index + capMatch[0].length - 1);
        if (arg !== null) caption = stripMacros(arg[0]);
      }
      const tabMatch = /\\begin\{tabular\*?\}(?:\[[^\]]*\])?\{([^}]*)\}/.exec(body);
      const grid: string[][] = [];
      const merged: SdmTable['mergedCells'] = [];
      let headerRows = 0;
      if (tabMatch !== null) {
        const tabEnd = body.lastIndexOf('\\end{tabular');
        const rows = body.slice(tabMatch.index + tabMatch[0].length, tabEnd === -1 ? body.length : tabEnd);
        // header = rows before \midline (booktabs convention); fallback: first row.
        const midline = rows.indexOf('\\midrule');
        headerRows = midline === -1 ? 1 : rows.slice(0, midline).split('\\\\').filter((r) => r.trim().length > 0).length;
        for (const rawRow of rows.split('\\\\')) {
          let row = rawRow;
          for (;;) {
            const h = /^\s*\\(top|mid|bottom)rule\s*/.exec(row);
            if (h === null) break;
            row = row.slice(h[0].length);
          }
          if (row.trim().length === 0) continue;
          const cells: string[] = [];
          let col = 0;
          for (const cell of row.split('&')) {
            const multi = /^\s*\\multicolumn\{(\d+)\}\{[^}]*\}\{([\s\S]*)\}\s*$/.exec(cell.trim());
            if (multi !== null) {
              cells.push(stripMacros(multi[2] ?? ''));
              merged.push({ row: grid.length, col, rowSpan: 2, colSpan: Number(multi[1] ?? '2') });
              col += Number(multi[1] ?? '2');
            } else {
              cells.push(normText(stripMacros(cell.replace(/\\(top|mid|bottom)rule/g, ''))));
              col += 1;
            }
          }
          if (cells.some((c) => c.length > 0)) grid.push(cells);
        }
      } else warnings.push(`${label}: no tabular environment`);
      const lblMatch = /\\label\{([^}]*)\}/.exec(body);
      tables.push({
        id, label, ...(caption !== undefined && caption.length > 0 ? { caption } : {}),
        grid, headerRows, mergedCells: merged, footnotes: [],
        provenance: { charStart: beginIdx, charEnd: bodyEnd + endMarker.length },
      });
      if (lblMatch !== null) labelToSdm.set((lblMatch[1] ?? '').trim(), id);
      if (caption !== undefined && caption.length > 0) blocks.push({ id: blk.next(), kind: 'caption', text: `${label}: ${caption}` });
      return;
    }
    // equation-like environments
    const numbered = !name.endsWith('*');
    if (numbered) nNumbered.eq += 1;
    const id = eq.next();
    const lblMatch = /\\label\{([^}]*)\}/.exec(body);
    const latex = body.replace(/\\label\{[^}]*\}/g, '').replace(/\\nonumber/g, '').trim();
    equations.push({
      id,
      ...(numbered ? { label: `(${nNumbered.eq})` } : {}),
      ...(latex.length > 0 ? { latex } : {}),
      symbols: scanLatexSymbols(latex),
      provenance: { charStart: beginIdx, charEnd: bodyEnd + endMarker.length },
    });
    if (lblMatch !== null) labelToSdm.set((lblMatch[1] ?? '').trim(), id);
  };

  for (const item of matches) {
    // Paragraph heuristic: plain text between cursor and construct start.
    const between = src.slice(cursor, item.start);
    if (between.trim().length > 0) emitParagraph(between, cursor, item.start);
    if (item.kind === 'section') {
      const level = { section: 1, subsection: 2, subsubsection: 3, paragraph: 4, subparagraph: 5 }[item.m[1] as string] ?? 1;
      const arg = readCommandArg(src, item.m.index + item.m[0].length - 1);
      if (arg !== null) {
        const t = stripMacros(arg[0] ?? '');
        if (t.length > 0) {
          const id = blk.next();
          blocks.push({
            id, kind: 'heading', text: t, headingLevel: level,
            parentHeadingId: headingStack[headingStack.length - 1] ?? null,
            provenance: { charStart: item.start, charEnd: arg[1] },
          });
          while (headingStack.length >= level) headingStack.pop();
          headingStack.push(id);
        }
        cursor = arg[1];
      } else {
        warnings.push(`unparsable \\${item.m[1]} at offset ${item.start}`);
        cursor = item.m.index + item.m[0].length;
      }
    } else {
      const name = (item.m[1] ?? '').trim();
      emitEnvironment(name, item.start);
      const endMarker = `\\end{${name}}`;
      const endIdx = src.indexOf(endMarker, item.start);
      cursor = endIdx === -1 ? src.length : endIdx + endMarker.length;
    }
  }
  if (cursor < src.length && src.slice(cursor).trim().length > 0) {
    const tail = src.slice(cursor);
    // After the bibliography we stop emitting prose (appendix boilerplate).
    if (!/\\bibliography|\\end\{document\}/.test(tail.slice(0, 200))) emitParagraph(tail, cursor, src.length);
  }

  // Post-pass: resolve deferred cite-key and printed-pattern xrefs.
  const citeKeyRe = /\\cite[tp]?\*?(?:\[[^\]]*\])?\{([^}]*)\}/g;
  for (const pscan of pendingScans) {
    for (const c of pscan.text.matchAll(citeKeyRe)) {
      for (const keyRaw of (c[1] ?? '').split(',')) {
        const key = keyRaw.trim();
        if (key.length === 0) continue;
        const targetId = bibKeyToSdm.get(key);
        xrefs.push({
          fromBlockId: pscan.blockId, targetKind: 'citation',
          ...(targetId !== undefined ? { targetId } : {}),
          rawText: `\\cite{${key}}`,
          status: targetId !== undefined ? 'resolved' : 'unresolved',
        });
      }
    }
    xrefs.push(...scanXrefsInText(pscan.blockId, pscan.text, (kind, num) => {
      const pool = kind === 'figure' ? figures : kind === 'table' ? tables : kind === 'equation' ? equations : [];
      return (pool as Array<{ id: string; label: string }>).find((r) => numberFromLabel(r.label) === num)?.id;
    }));
  }

  // Backfill citation citedFrom from xrefs.
  const citById = new Map(citations.map((c) => [c.id, c]));
  for (const x of xrefs) {
    if (x.targetKind !== 'citation' || x.targetId === undefined) continue;
    const c = citById.get(x.targetId);
    if (c !== undefined && !c.citedFromBlocks.includes(x.fromBlockId)) c.citedFromBlocks.push(x.fromBlockId);
  }

  const bodyText = blocks.map((b) => b.text).join(' ');
  return {
    schemaVersion: 'sdm-1',
    extractor: { name: 'latex-source-v1', route: 'latex_source' },
    origin: { kind: 'upload', name: origin.name },
    meta: { ...meta, language: guessLanguage(bodyText) },
    blocks, figures, tables, equations, citations, xrefs,
    diagnostics: {
      parseStatus: blocks.length > 0 || equations.length > 0 ? 'ok' : 'failed',
      warnings: [...warnings, 'paragraph extraction is heuristic (macro stripping); structured elements are exact'],
      truncated: false,
    },
  };
};
