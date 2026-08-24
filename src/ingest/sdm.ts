import { z } from 'zod';

/**
 * Structured Document Model (SDM-1) — the canonical contract for what
 * "the system understood a scientific artifact" means (MULTIMODAL lane,
 * 2026-08-24). Replaces "file uploaded → 50k-char flat text" with typed,
 * provenance-carrying structure: blocks, figures, tables, equations,
 * citations, cross-modal references.
 *
 * Contract rules (HCI consumers may rely on these):
 * 1. Every element id is stable within one document and prefixed by kind
 *    (`blk_`, `fig_`, `tab_`, `eq_`, `cit_`). Rendering may rely on the kind prefix.
 * 2. Provenance fields are OPTIONAL and never invented: a network-route block
 *    has an `elementPath` but no page; a pdfjs block has `page`/`bbox` but no
 *    elementPath. Absent ≠ zero — it means "this route cannot know it".
 * 3. Reserved perception tiers (figure axes/series/values, equation symbol
 *    resolution) carry `extractionStatus: 'not_extracted'` — honest absence,
 *    the VLM tier (BLOCKED-live) will fill them behind verification stamps.
 * 4. `parseStatus` is the honest top-level state; `diagnostics.warnings`
 *    carries every degradation the extractor actually took.
 */

export const SdmExtractionStatus = z.enum(['extracted', 'not_extracted', 'unsupported', 'blocked_live']);
export type SdmExtractionStatus = z.infer<typeof SdmExtractionStatus>;

/** Which deterministic extractor produced this document (provenance of understanding). */
export const SdmExtractor = z.object({
  name: z.string().min(1),          // e.g. 'jats-structure-v1', 'pdf-text-v1'
  route: z.enum(['jats_xml', 'grobid_tei', 'latexml_html', 'pdf_text_layer', 'markdown', 'latex_source', 'code_scan', 'notebook_json']),
});
export type SdmExtractor = z.infer<typeof SdmExtractor>;

/** [x0, y0, x1, y1] in PDF points, origin TOP-LEFT (pdfjs viewport convention). */
export const SdmBbox = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const SdmProvenance = z.object({
  /** 1-based page number (pdfjs route only). */
  page: z.number().int().positive().optional(),
  bbox: SdmBbox.optional(),
  /** Path within the source tree, e.g. `article>body>sec[2]>p[5]` (XML routes only). */
  elementPath: z.string().min(1).optional(),
  /** Character span in the ORIGINAL raw source (when the source is text). */
  charStart: z.number().int().nonnegative().optional(),
  charEnd: z.number().int().nonnegative().optional(),
});
export type SdmProvenance = z.infer<typeof SdmProvenance>;

export const SdmBlockKind = z.enum([
  'front_title', 'front_authors', 'abstract', 'keywords',
  'heading', 'paragraph', 'list_item', 'caption', 'code', 'quote', 'footnote',
]);
export type SdmBlockKind = z.infer<typeof SdmBlockKind>;

export const SdmBlock = z.object({
  id: z.string().regex(/^blk_[a-z0-9]+$/),
  kind: SdmBlockKind,
  text: z.string(),
  /** Heading level 1..6 (heading blocks only). */
  headingLevel: z.number().int().min(1).max(6).optional(),
  /** Hierarchy: id of the nearest ancestor heading block, when one exists. */
  parentHeadingId: z.string().regex(/^blk_[a-z0-9]+$/).nullable().optional(),
  provenance: SdmProvenance.optional(),
});
export type SdmBlock = z.infer<typeof SdmBlock>;

/**
 * Figure perception tier contract. v1 deterministic extractors populate only
 * label/caption/panels(+graphicRef/region where the route knows them) and leave
 * `perception.status = 'not_extracted'`. The T4 VLM tier must fill axis/series
 * ONLY through deterministic calibration/verification and stamp `verifiedBy`.
 */
export const SdmFigurePerception = z.object({
  status: SdmExtractionStatus,
  axes: z.array(z.object({
    kind: z.enum(['x', 'y', 'color', 'size', 'other']),
    label: z.string().optional(),
    unit: z.string().optional(),
    scale: z.enum(['linear', 'log', 'unknown']).optional(),
    /** Numeric range as read off the axis AFTER deterministic calibration. */
    range: z.tuple([z.number(), z.number()]).optional(),
  })).optional(),
  series: z.array(z.object({
    label: z.string().optional(),
    legendText: z.string().optional(),
    /** Artifact ref to extracted numeric points — never inline unverified numbers. */
    pointsRef: z.string().optional(),
  })).optional(),
  verifiedBy: z.enum(['deterministic-calibration', 'vlm_proposed_plus_verified', 'unverified_vlm_only']).optional(),
});
export type SdmFigurePerception = z.infer<typeof SdmFigurePerception>;

export const SdmFigurePanel = z.object({
  /** Panel letter as printed in the caption ("(a) ..." → 'a'). */
  label: z.string().min(1),
  captionSegment: z.string(),
});
export type SdmFigurePanel = z.infer<typeof SdmFigurePanel>;

export const SdmFigure = z.object({
  id: z.string().regex(/^fig_[a-z0-9]+$/),
  /** Printed label, e.g. "Figure 2" / "Fig. 1" / "图 3". */
  label: z.string().min(1),
  caption: z.string(),
  /** Panels parsed deterministically from the caption's "(a) … (b) …" segments. */
  panels: z.array(SdmFigurePanel).default([]),
  /** Image href (JATS xlink / LaTeX includegraphics arg) when the route carries one. */
  graphicRef: z.string().optional(),
  /** Rendered region on the page (pdfjs route only). */
  region: z.object({ page: z.number().int().positive(), bbox: SdmBbox }).optional(),
  perception: SdmFigurePerception.default({ status: 'not_extracted' }),
  provenance: SdmProvenance.optional(),
});
export type SdmFigure = z.infer<typeof SdmFigure>;

export const SdmMergedCell = z.object({
  row: z.number().int().nonnegative(),
  col: z.number().int().nonnegative(),
  /** A cell is listed when at least one span dimension is > 1 (parser guarantee). */
  rowSpan: z.number().int().min(1),
  colSpan: z.number().int().min(1),
});
export type SdmMergedCell = z.infer<typeof SdmMergedCell>;

export const SdmTable = z.object({
  id: z.string().regex(/^tab_[a-z0-9]+$/),
  label: z.string().min(1),
  caption: z.string().optional(),
  /** Raw cell grid in source order; empty string = empty cell (never dropped rows/cols).
   *  An EMPTY grid is honest: the route proved a table exists (caption/label)
   *  but could not reconstruct cells (e.g. PDF text-layer caption records). */
  grid: z.array(z.array(z.string())),
  /** Number of leading rows that are header rows (JATS thead / TEI label rows / pdfjs heuristic). */
  headerRows: z.number().int().min(0),
  mergedCells: z.array(SdmMergedCell).default([]),
  footnotes: z.array(z.string()).default([]),
  provenance: SdmProvenance.optional(),
});
export type SdmTable = z.infer<typeof SdmTable>;

export const SdmEquationSymbol = z.object({
  /** LaTeX token as extracted ("\beta", "x_i", "N"). */
  latex: z.string().min(1),
  kind: z.enum(['greek', 'latin', 'operator', 'other']),
  /** v1 leaves symbols unresolved — binding a symbol to its definition in surrounding
   * text is a semantic tier task; the contract reserves the field. */
  resolved: z.literal(false),
});
export type SdmEquationSymbol = z.infer<typeof SdmEquationSymbol>;

export const SdmEquation = z.object({
  id: z.string().regex(/^eq_[a-z0-9]+$/),
  /** Printed equation number, e.g. "(3)". */
  label: z.string().optional(),
  /** LaTeX source (LaTeXML alttext / JATS tex-math / LaTeX source). */
  latex: z.string().optional(),
  /** MathML payload preserved verbatim when the route emits it (GROBID TEI). */
  mathml: z.string().optional(),
  /** Display equations carry the block they appeared in; inline ones their paragraph. */
  contextBlockId: z.string().regex(/^blk_[a-z0-9]+$/).optional(),
  symbols: z.array(SdmEquationSymbol).default([]),
  provenance: SdmProvenance.optional(),
});
export type SdmEquation = z.infer<typeof SdmEquation>;

export const SdmCitation = z.object({
  id: z.string().regex(/^cit_[a-z0-9]+$/),
  /** In-text marker as printed, e.g. "[12]" or "Smith et al. 2019". */
  marker: z.string().optional(),
  title: z.string().optional(),
  authors: z.array(z.string()).default([]),
  year: z.number().int().optional(),
  doi: z.string().optional(),
  /** Where in the body this citation was referenced from (block ids). */
  citedFromBlocks: z.array(z.string().regex(/^blk_[a-z0-9]+$/)).default([]),
  provenance: SdmProvenance.optional(),
});
export type SdmCitation = z.infer<typeof SdmCitation>;

export const SdmXrefTargetKind = z.enum(['figure', 'table', 'equation', 'citation', 'section']);
export type SdmXrefTargetKind = z.infer<typeof SdmXrefTargetKind>;

/** Cross-modal reference: a body-text mention that points at a figure/table/equation/citation. */
export const SdmXref = z.object({
  /** Block containing the mention. */
  fromBlockId: z.string().regex(/^blk_[a-z0-9]+$/),
  targetKind: SdmXrefTargetKind,
  /** Resolved target id within this document, when resolution succeeded. */
  targetId: z.string().optional(),
  /** Raw mention text as printed ("Fig. 1a", "Table 2", "Eq. (4)", "[12]"). */
  rawText: z.string().min(1),
  /** 'resolved' | 'unresolved' — unresolved refs are PRESERVED as negative evidence. */
  status: z.enum(['resolved', 'unresolved']),
});
export type SdmXref = z.infer<typeof SdmXref>;

export const SdmDocument = z.object({
  schemaVersion: z.literal('sdm-1'),
  extractor: SdmExtractor,
  /** Where the bytes came from (upload filename or network URL) — never invented. */
  origin: z.object({
    kind: z.enum(['upload', 'network']),
    name: z.string().min(1),
    url: z.string().optional(),
    license: z.string().optional(),
  }),
  meta: z.object({
    title: z.string().optional(),
    authors: z.array(z.string()).default([]),
    year: z.number().int().optional(),
    venue: z.string().optional(),
    doi: z.string().optional(),
    arxivId: z.string().optional(),
    /** Document language guess (BCP-47-ish primary tag) from deterministic signals; absent = unknown. */
    language: z.string().optional(),
  }),
  blocks: z.array(SdmBlock).default([]),
  figures: z.array(SdmFigure).default([]),
  tables: z.array(SdmTable).default([]),
  equations: z.array(SdmEquation).default([]),
  citations: z.array(SdmCitation).default([]),
  xrefs: z.array(SdmXref).default([]),
  diagnostics: z.object({
    parseStatus: z.enum(['ok', 'partial', 'failed']),
    warnings: z.array(z.string()).default([]),
    truncated: z.boolean().default(false),
  }),
});
export type SdmDocument = z.infer<typeof SdmDocument>;

/**
 * Plain-text projection of an SDM document — the compatibility seam with the
 * existing seeds pipeline. Ordered blocks; captions and table grids rendered
 * readably; equations as LaTeX. Deterministic: same doc → same text.
 */
export const sdmToPlainText = (doc: SdmDocument): string => {
  const parts: string[] = [];
  for (const block of doc.blocks) {
    if (block.kind === 'heading') parts.push('', '#'.repeat(Math.min(block.headingLevel ?? 1, 6)) + ' ' + block.text, '');
    else parts.push(block.text);
  }
  for (const fig of doc.figures) {
    parts.push('', `[${fig.label}] ${fig.caption}`, ...(fig.panels.map((p) => `  (${p.label}) ${p.captionSegment}`)));
  }
  for (const tab of doc.tables) {
    parts.push('', `[${tab.label}]${tab.caption !== undefined ? ' ' + tab.caption : ''}`);
    for (const row of tab.grid) parts.push('  ' + row.join(' | '));
    for (const fn of tab.footnotes) parts.push('  ' + fn);
  }
  for (const eq of doc.equations) {
    if (eq.latex !== undefined) parts.push('', eq.label !== undefined ? `$$ ${eq.latex} ${eq.label} $$` : `$$ ${eq.latex} $$`);
  }
  return parts.join('\n').replace(/[ \t]+\n/g, '\n').trim();
};
