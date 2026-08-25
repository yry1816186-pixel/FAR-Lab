import type { SdmBlock, SdmDocument } from './sdm.js';
import { guessLanguage, normText, IdGen } from './parseutil.js';

/**
 * Jupyter notebook indexing (MULTIMODAL lane): .ipynb is JSON — parsed fully
 * zero-dep. Each cell becomes a block with execution provenance (cell index,
 * execution_count); markdown cells keep their text; code cells keep source +
 * a LAST-ERROR record when the stored output says the cell failed (research
 * code that errored is evidence, not noise). Image outputs are counted and
 * referenced by output index — pixels are never inlined into the model.
 */

interface RawCell {
  cell_type?: unknown;
  execution_count?: unknown;
  source?: unknown;
  outputs?: unknown;
}

export interface NotebookOrigin { name: string }

export const buildSdmFromNotebook = (raw: string, origin: NotebookOrigin): SdmDocument => {
  const warnings: string[] = [];
  let nb: Record<string, unknown>;
  try {
    nb = JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    return fail(origin.name, `notebook is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!Array.isArray(nb.cells)) return fail(origin.name, 'notebook has no cells array (not a Jupyter .ipynb)');
  const kernel = nb.metadata !== undefined && typeof nb.metadata === 'object'
    ? (nb.metadata as Record<string, unknown>).kernelspec
    : undefined;
  const kernelName = kernel !== undefined && typeof kernel === 'object'
    ? normText(String((kernel as Record<string, unknown>).name ?? ''))
    : '';

  const blk = new IdGen('blk');
  const blocks: SdmBlock[] = [];
  let errorCount = 0;
  let imageOutputs = 0;
  blocks.push({
    id: blk.next(), kind: 'heading',
    text: `Notebook: ${origin.name}${kernelName.length > 0 ? ` [kernel: ${kernelName}]` : ''}`,
    headingLevel: 1,
  });
  const headerId = blocks[0] as SdmBlock;

  const cells = nb.cells as RawCell[];
  cells.forEach((cell, i) => {
    const source = joinSource(cell.source);
    const exec = typeof cell.execution_count === 'number' ? cell.execution_count : null;
    if (cell.cell_type === 'markdown') {
      const firstLine = source.split('\n')[0] ?? '';
      const heading = /^(#{1,6})\s+(.*)$/.exec(firstLine.trim());
      if (heading !== null) {
        blocks.push({
          id: blk.next(), kind: 'heading', text: normText(heading[2] ?? ''),
          headingLevel: (heading[1] ?? '#').length, parentHeadingId: headerId.id,
          provenance: { elementPath: `cell[${i}].markdown` },
        });
      } else if (source.trim().length > 0) {
        blocks.push({ id: blk.next(), kind: 'paragraph', text: normText(source), parentHeadingId: headerId.id, provenance: { elementPath: `cell[${i}].markdown` } });
      }
      return;
    }
    if (cell.cell_type === 'code') {
      if (source.trim().length > 0) {
        blocks.push({
          id: blk.next(), kind: 'code', text: source,
          parentHeadingId: headerId.id,
          provenance: { elementPath: `cell[${i}].code${exec !== null ? `@exec${exec}` : '@never-run'}` },
        });
      }
      if (Array.isArray(cell.outputs)) {
        for (let o = 0; o < (cell.outputs as unknown[]).length; o += 1) {
          const out = (cell.outputs as Array<Record<string, unknown>>)[o] as Record<string, unknown> | undefined;
          if (out === undefined) continue;
          if (out.output_type === 'error') {
            errorCount += 1;
            blocks.push({
              id: blk.next(), kind: 'footnote',
              text: `cell[${i}] errored: ${String(out.ename ?? 'Error')}: ${normText(String(out.evalue ?? '')).slice(0, 300)}`,
              parentHeadingId: headerId.id,
              provenance: { elementPath: `cell[${i}].outputs[${o}].error` },
            });
          }
          if (typeof out.data === 'object' && out.data !== null && 'image/png' in (out.data as Record<string, unknown>)) {
            imageOutputs += 1;
          }
        }
      }
      return;
    }
    // raw cells: kept as one-line note
    if (source.trim().length > 0) {
      blocks.push({ id: blk.next(), kind: 'quote', text: source.trim().slice(0, 200), parentHeadingId: headerId.id, provenance: { elementPath: `cell[${i}].raw` } });
    }
  });

  if (imageOutputs > 0) warnings.push(`${imageOutputs} image outputs present (referenced by cell/output index; pixels not extracted — T4)`);
  if (errorCount > 0) warnings.push(`${errorCount} cells have stored error outputs — research truth, preserved as footnotes`);

  return {
    schemaVersion: 'sdm-1',
    extractor: { name: 'notebook-json-v1', route: 'notebook_json' },
    origin: { kind: 'upload', name: origin.name },
    meta: { title: origin.name, authors: [], language: guessLanguage(cells.map((c) => joinSource(c.source)).join(' ')) },
    blocks, figures: [], tables: [], equations: [], citations: [], xrefs: [],
    diagnostics: { parseStatus: blocks.length > 1 ? 'ok' : 'partial', warnings, truncated: false },
  };
};

const joinSource = (src: unknown): string => {
  if (typeof src === 'string') return src;
  if (Array.isArray(src)) return src.map((s) => (typeof s === 'string' ? s : '')).join('');
  return '';
};

const fail = (name: string, message: string): SdmDocument => ({
  schemaVersion: 'sdm-1',
  extractor: { name: 'notebook-json-v1', route: 'notebook_json' },
  origin: { kind: 'upload', name },
  meta: { authors: [] },
  blocks: [], figures: [], tables: [], equations: [], citations: [], xrefs: [],
  diagnostics: { parseStatus: 'failed', warnings: [message], truncated: false },
});
