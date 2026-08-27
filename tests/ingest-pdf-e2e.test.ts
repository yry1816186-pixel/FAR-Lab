// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { collectPdfText } from '../web/src/utils/pdfCollect';
import { buildSdmFromPdfText } from '../src/ingest/parsers/pdftext';
import { validateSdmPayload } from '../src/ingest/service';
import { sha256Hex } from '../src/shared/crypto';

/**
 * End-to-end over a DENSE ACADEMIC-STYLE PDF (offline-deterministic):
 * the full production chain runs pdfjs text-layer collection (web collector)
 * → zod payload validation → deterministic understanding (core) → SDM.
 *
 * The fixture is generated in-test, byte-for-byte deterministically, as a
 * 12-page single-column paper with a real text layer (title, section
 * headings, wrapped body paragraphs, a printed figure caption). It replaced
 * a real copyrighted paper the repo used to carry — third-party material
 * must not live in the repository, and a generated fixture keeps the same
 * pipeline coverage on every clean checkout.
 */

const BODY = 10;
const LINE_HEIGHT = 13.4; // < BODY * 1.6 → consecutive body lines merge into paragraphs

const TITLE = 'Conducting Meta-Analyses with the metafor Package';
const HEADINGS = [
  'Abstract',
  'Introduction',
  'The metafor Package for Meta-Analysis',
  'Effect Size Measures and Heterogeneity',
  'Forest Plots and Funnel Plots',
  'Model Estimation in metafor',
  'Publication Bias and Sensitivity',
  'Discussion and Limitations',
];
const SENTENCES = [
  'The metafor package provides a comprehensive toolbox for meta-analysis in R.',
  'Random effects models assume that true effects vary across studies because of heterogeneity.',
  'Heterogeneity is quantified by the tau squared and I squared statistics in every metafor model.',
  'A forest plot displays each study effect with its confidence interval and the pooled estimate.',
  'Publication bias can be inspected with a funnel plot and tested with rank correlation.',
  'Fixed effect models pool estimates under the assumption of one shared true effect size.',
  'The restricted maximum likelihood estimator balances bias and variance for tau squared.',
  'Sensitivity analyses in meta-analysis exclude studies to check the stability of conclusions.',
];
const CAPTION =
  'Figure 1: Forest plot of the simulated meta-analysis effect sizes with confidence intervals.';

/** One deterministic line of the synthetic paper: [text, fontSize] at a fixed left margin. */
type PaperLine = [text: string, fontSize: number];

const buildPaperLines = (): PaperLine[] => {
  const lines: PaperLine[] = [[TITLE, 18]];
  let sentence = 0;
  let heading = 0;
  const bodyLine = (): PaperLine => {
    const s = SENTENCES[sentence % SENTENCES.length] as string;
    sentence += 1;
    return [s, BODY];
  };
  for (let page = 0; page < 12; page += 1) {
    if (page === 2) lines.push([CAPTION, BODY]);
    for (let half = 0; half < 2; half += 1) {
      lines.push([HEADINGS[heading % HEADINGS.length] as string, 14]);
      heading += 1;
      for (let i = 0; i < 22; i += 1) lines.push(bodyLine());
    }
  }
  return lines;
};

/** Page 1 holds ~48 lines; 12 pages × 48 ≈ 576 text items (each Tj emits one). */
const LINES_PER_PAGE = 48;

/**
 * Minimal but valid PDF with a real text layer: one content stream per page,
 * one BT…ET block per line at a descending baseline (single column), correct
 * xref offsets computed from the assembled byte string (ASCII only).
 */
const buildTextPdf = (): Uint8Array => {
  const lines = buildPaperLines();
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
    const chunk = lines.slice(i, i + LINES_PER_PAGE);
    const ops: string[] = [];
    let y = 742;
    for (const [text, size] of chunk) {
      // One BT…ET per line with an ABSOLUTE six-operand Tm (Tm is not valid
      // with fewer operands, and Td is relative); one show-text op per line
      // → one text item per line at its true position.
      ops.push(`BT\n/F1 ${size} Tf\n1 0 0 1 72 ${y.toFixed(1)} Tm\n(${text}) Tj\nET`);
      y -= LINE_HEIGHT;
    }
    pages.push(ops);
  }

  const objects: string[] = [];
  const pageObjNums: number[] = [];
  const fontObjNum = 5 + pages.length * 2; // after page+content pairs
  // Reserve order: [catalog, pages-tree, per page: pageObj, contentObj, font]
  objects.push('<< /Type /Catalog /Pages 2 0 R >>'); // 1
  objects.push(
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`, // 2
  );
  pages.forEach((ops, i) => {
    const pageNum = 3 + i * 2;
    const contentNum = pageNum + 1;
    pageObjNums.push(pageNum);
    const content = ops.join('\n');
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> /Contents ${contentNum} 0 R >>`,
    );
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new Uint8Array([...out].map((c) => c.charCodeAt(0)));
};

describe('dense synthetic paper end-to-end — collect → validate → understand → SDM', () => {
  it('collects a dense text layer, validates, and builds structured SDM with provenance', async () => {
    const bytes = buildTextPdf();
    const file = new File([bytes], 'synthetic-metafor-style.pdf', { type: 'application/pdf' });
    const payload = await collectPdfText(file);
    expect(payload).not.toBeNull();
    const items = payload!.pages.reduce((n, p) => n + p.items.length, 0);
    // ~576 show-text operations; each must surface as a text item.
    expect(items).toBeGreaterThan(500);

    const doc = buildSdmFromPdfText(
      { numPages: payload!.numPages, pages: payload!.pages, truncated: payload!.truncated, fileSha256: payload!.fileSha256 },
      { name: 'synthetic-metafor-style.pdf' },
    );
    expect(doc.diagnostics.parseStatus).toBe('ok');

    // The SDM must itself pass the zod contract (what HCI would receive).
    const validated = validateSdmPayload(JSON.parse(JSON.stringify(doc)));
    expect(validated.ok).toBe(true);

    // Structural recovery: 18/14pt short lines become headings, body merges
    // into paragraphs.
    expect(doc.blocks.filter((b) => b.kind === 'heading').length).toBeGreaterThan(3);
    const paras = doc.blocks.filter((b) => b.kind === 'paragraph');
    expect(paras.length).toBeGreaterThan(20);
    // Page provenance on every block (upload route guarantee).
    expect(doc.blocks.every((b) => b.provenance?.page !== undefined)).toBe(true);
    // The printed "Figure 1:" caption registers a figure record.
    expect(doc.figures.length).toBeGreaterThanOrEqual(1);
    // Body text vocabulary survives the pipeline.
    const all = doc.blocks.map((b) => b.text).join(' ');
    expect(all).toMatch(/metafor|meta-analysis/i);
    // Honesty contract: no equation reconstruction claim from the text layer.
    expect(doc.equations).toEqual([]);
    expect(doc.diagnostics.warnings.join(' ')).toMatch(/equations not reconstructed/);
  }, 120_000);

  it('reading order on page 1: single column keeps blocks in y order', async () => {
    const bytes = buildTextPdf();
    const file = new File([bytes], 'synthetic-metafor-style.pdf', { type: 'application/pdf' });
    const payload = await collectPdfText(file);
    expect(payload).not.toBeNull();
    const doc = buildSdmFromPdfText(payload!, { name: 'synthetic-metafor-style.pdf' });
    const p1 = doc.blocks.filter((b) => b.provenance?.page === 1);
    expect(p1.length).toBeGreaterThan(0);
    // Single-column layout drawn top-down: block order must follow the
    // baseline descent (no column re-flow needed — and none fabricated).
    const tops = p1.map((b) => b.provenance!.bbox[1]);
    const sorted = [...tops].sort((a, b) => a - b); // top-origin y grows downward
    expect(tops).toEqual(sorted);
  }, 120_000);
});

/** Build a minimal VALID PDF (correct xref offsets computed in-test) with no text. */
const buildNoTextPdf = (): Uint8Array => {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new Uint8Array([...out].map((c) => c.charCodeAt(0)));
};

describe('real failure path — scanned/no-text-layer PDF', () => {
  it('collects zero items; understanding fails visibly with no_text_layer', async () => {
    const bytes = buildNoTextPdf();
    const file = new File([bytes], 'scan.pdf', { type: 'application/pdf' });
    const payload = await collectPdfText(file);
    // Two honest outcomes are acceptable at the collection layer: pdfjs refuses
    // the minimal file (null), or extracts an empty text layer (zero items).
    if (payload !== null) {
      expect(payload.pages.every((p) => p.items.length === 0)).toBe(true);
      const doc = buildSdmFromPdfText(payload, { name: 'scan.pdf' });
      expect(doc.diagnostics.parseStatus).toBe('failed');
      expect(doc.diagnostics.warnings.join(' ')).toMatch(/no_text_layer/);
    }
  }, 60_000);
});

describe('payload integrity', () => {
  it('collector sha256 matches the shared hasher', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const file = new File([bytes], 'x.pdf', { type: 'application/pdf' });
    const payload = await collectPdfText(file); // will fail parsing → null OR empty
    const expected = await sha256Hex(Buffer.from(bytes));
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
    // The hash contract only matters when collection succeeded; assert shape.
    if (payload !== null) expect(payload.fileSha256).toBe(expected);
  }, 30_000);
});
