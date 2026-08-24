import { SdmDocument } from '../sdm.js';
import { IdGen, guessLanguage } from '../parseutil.js';

/**
 * Plain-text / log understanding (MULTIMODAL lane extension, 2026-08-25).
 * Honest T1.5: the format carries NO structural markup, so the parser claims
 * nothing beyond paragraph segmentation — no invented headings, no fake
 * tables. Every block keeps its exact character span in the source file so
 * any downstream consumer can re-verify the split. Log files (timestamps,
 * severity tags) route here too: guessing "ERROR lines are important" is a
 * semantic-tier decision, not a deterministic one.
 */

const PARAGRAPH_MAX_CHARS = 20_000;
const MAX_BLOCKS = 20_000;

export const buildSdmFromPlainText = (text: string, opts: { name: string }): SdmDocument => {
  const ids = new IdGen('blk');
  const blocks: SdmDocument['blocks'] = [];
  const warnings: string[] = [];

  // Split on blank-line runs (≥2 newlines, whitespace-tolerant, CRLF-safe).
  const paraRe = /[ \t]*\n[ \t]*\n[ \t]*\r?\n?|\r\n[ \t]*\r\n/g;
  const spans: Array<{ start: number; end: number }> = [];
  let last = 0;
  for (const m of text.matchAll(paraRe)) {
    if (m.index > last) spans.push({ start: last, end: m.index });
    last = m.index + m[0].length;
  }
  if (last < text.length) spans.push({ start: last, end: text.length });
  const nonEmpty = spans.filter((s) => text.slice(s.start, s.end).trim().length > 0);
  if (nonEmpty.length === 0) {
    return {
      schemaVersion: 'sdm-1',
      extractor: { name: 'plain-text-v1', route: 'plain_text' },
      origin: { kind: 'upload', name: opts.name },
      meta: { authors: [] },
      blocks: [], figures: [], tables: [], equations: [], citations: [], xrefs: [],
      diagnostics: { parseStatus: 'failed', warnings: ['file contains no non-whitespace text'], truncated: false },
    };
  }
  if (nonEmpty.length > MAX_BLOCKS) {
    warnings.push(`paragraph count ${nonEmpty.length} exceeded the cap ${MAX_BLOCKS} — first ${MAX_BLOCKS} kept`);
  }
  let cut = 0;
  for (const span of nonEmpty) {
    if (cut >= MAX_BLOCKS) break;
    let body = text.slice(span.start, span.end);
    let end = span.end;
    if (body.length > PARAGRAPH_MAX_CHARS) {
      body = body.slice(0, PARAGRAPH_MAX_CHARS);
      end = span.start + PARAGRAPH_MAX_CHARS;
      if (warnings.filter((w) => w.startsWith('paragraphs longer than')).length === 0) {
        warnings.push(`paragraphs longer than ${PARAGRAPH_MAX_CHARS} chars were hard-cut (provenance charEnd marks the cut)`);
      }
    }
    blocks.push({
      id: ids.next(),
      kind: 'paragraph',
      text: body.replace(/[ \t]*\n[ \t]*/g, ' ').trim(),
      provenance: { charStart: span.start, charEnd: end },
    });
    cut += 1;
  }
  return {
    schemaVersion: 'sdm-1',
    extractor: { name: 'plain-text-v1', route: 'plain_text' },
    origin: { kind: 'upload', name: opts.name },
    meta: { authors: [], ...(guessLanguage(text) !== undefined ? { language: guessLanguage(text) } : {}) },
    blocks,
    figures: [], tables: [], equations: [], citations: [], xrefs: [],
    diagnostics: { parseStatus: 'ok', warnings, truncated: nonEmpty.length > MAX_BLOCKS },
  };
};
