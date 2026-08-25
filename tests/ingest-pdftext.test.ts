import { describe, expect, it } from 'vitest';
import { buildSdmFromPdfText, PdfTextPayload } from '../src/ingest/parsers/pdftext';

/**
 * Synthetic geometry fixtures — the deterministic understanding core is tested
 * here against hand-computable layouts; the real-PDF end-to-end lives in
 * tests/ingest-pdf-e2e.test.ts.
 */

const it_ = (str: string, x: number, y: number, fontSize: number, w?: number): { str: string; x: number; y: number; w: number; h: number; fontSize: number } =>
  ({ str, x, y, w: w ?? str.length * fontSize * 0.5, h: fontSize, fontSize });

const payloadOf = (pages: Array<{ items: ReturnType<typeof it_>; width?: number; height?: number }>): PdfTextPayload =>
  PdfTextPayload.parse({
    numPages: pages.length,
    pages: pages.map((p, i) => ({ pageNumber: i + 1, width: p.width ?? 612, height: p.height ?? 792, items: p.items })),
    truncated: false,
    fileSha256: 'a'.repeat(64),
  });

describe('pdf text-layer understanding', () => {
  it('reconstructs lines from items with space-gap heuristics and page provenance', () => {
    const doc = buildSdmFromPdfText(payloadOf([{ items: [
      it_('Memory', 40, 100, 10), it_('consolidation', 115, 100, 10),
      it_('improves', 40, 115, 10), it_('retention.', 95, 115, 10),
    ] }]), { name: 'p.pdf' });
    const paras = doc.blocks.filter((b) => b.kind === 'paragraph');
    // Tight leading (5pt < 1.6em) = one wrapped paragraph, lines joined — correct.
    expect(paras.length).toBe(1);
    expect(paras[0]!.text).toBe('Memory consolidation improves retention.');
    expect(paras[0]!.provenance?.page).toBe(1);
    expect(paras[0]!.provenance?.bbox?.[0]).toBeCloseTo(40, 0);
  });

  it('detects headings by dominant-font ratio', () => {
    const doc = buildSdmFromPdfText(payloadOf([{ items: [
      it_('Results', 40, 100, 18),
      it_('Body text body text body text body text body text.', 40, 130, 10),
      it_('Discussion', 40, 200, 14),
    ] }]), { name: 'p.pdf' });
    const heads = doc.blocks.filter((b) => b.kind === 'heading');
    expect(heads.map((h) => h.text)).toEqual(['Results', 'Discussion']);
    expect(heads[0]!.headingLevel).toBe(1); // 18/10 = 1.8 → level 1
    const para = doc.blocks.find((b) => b.kind === 'paragraph');
    expect(para?.parentHeadingId).toBe(heads[0]!.id);
  });

  it('two-column reading order re-flows left column before right', () => {
    const doc = buildSdmFromPdfText(payloadOf([{ items: [
      // Full-width title spans the future corridor.
      it_('Two-Column Paper Title', 40, 60, 16, 500),
      // Left column lines (x 40..260), right column lines (x 330..560).
      it_('L1 first line of left', 40, 100, 10, 200),
      it_('L2 second line left', 40, 115, 10, 200),
      it_('L3 third line left', 40, 130, 10, 200),
      it_('L4 fourth line left', 40, 145, 10, 200),
      it_('R1 first line right', 330, 100, 10, 200),
      it_('R2 second line right', 330, 115, 10, 200),
      it_('R3 third line right', 330, 130, 10, 200),
      it_('R4 fourth line right', 330, 145, 10, 200),
    ] }]), { name: 'p.pdf' });
    expect(doc.diagnostics.warnings.join(' ')).toMatch(/two-column layout detected/);
    const paras = doc.blocks.filter((b) => b.kind === 'paragraph').map((b) => b.text);
    // Left-column paragraph must precede the right-column one in reading order.
    const li = paras.findIndex((t) => t.startsWith('L1'));
    const ri = paras.findIndex((t) => t.startsWith('R1'));
    expect(li).toBeGreaterThanOrEqual(0);
    expect(ri).toBeGreaterThan(li);
  });

  it('captions become figure records with panels and caption-anchor region', () => {
    const doc = buildSdmFromPdfText(payloadOf([{ items: [
      it_('Body before figure.', 40, 100, 10),
      it_('Figure 2: Recovery curves. (a) noisy. (b) denoised.', 40, 200, 10, 500),
      it_('Figure 2 continued caption text.', 40, 214, 9, 400),
    ] }]), { name: 'p.pdf' });
    expect(doc.figures.length).toBe(1);
    const fig = doc.figures[0]!;
    expect(fig.label).toBe('Figure 2');
    expect(fig.caption).toContain('continued caption text');
    expect(fig.panels.map((p) => p.label)).toEqual(['a', 'b']);
    expect(fig.region?.page).toBe(1);
    expect(fig.perception.status).toBe('not_extracted'); // honest T4 reservation
    const xr = doc.xrefs.find((x) => x.targetKind === 'figure');
    expect(xr?.status).toBe('resolved');
    expect(xr?.targetId).toBe(fig.id);
  });

  it('table captions become table records; aligned rows reconstruct a grid', () => {
    const doc = buildSdmFromPdfText(payloadOf([{ items: [
      it_('Table 1: Benchmarks.', 40, 100, 10, 300),
      // Aligned 3-column rows: large x gaps between cells.
      it_('Dataset', 40, 130, 10), it_('PSNR', 200, 130, 10), it_('SSIM', 320, 130, 10),
      it_('A', 40, 145, 10), it_('31.2', 200, 145, 10), it_('0.95', 320, 145, 10),
      it_('B', 40, 160, 10), it_('28.7', 200, 160, 10), it_('0.91', 320, 160, 10),
    ] }]), { name: 'p.pdf' });
    expect(doc.tables.length).toBe(2); // caption record + aligned reconstruction
    const aligned = doc.tables.find((t) => t.grid.length >= 3);
    expect(aligned?.grid[0]).toEqual(['Dataset', 'PSNR', 'SSIM']);
    expect(aligned?.grid[2]).toEqual(['B', '28.7', '0.91']);
    expect(aligned?.headerRows).toBe(1);
  });

  it('no text layer fails visibly with no_text_layer (scanned PDFs)', () => {
    const doc = buildSdmFromPdfText(payloadOf([{ items: [] }]), { name: 'scan.pdf' });
    expect(doc.diagnostics.parseStatus).toBe('failed');
    expect(doc.diagnostics.warnings.join(' ')).toMatch(/no_text_layer/);
    expect(doc.blocks).toEqual([]);
  });

  it('equations list stays empty on this route — stated, not hidden', () => {
    const doc = buildSdmFromPdfText(payloadOf([{ items: [it_('x = 1 text', 40, 100, 10)] }]), { name: 'p.pdf' });
    expect(doc.equations).toEqual([]);
    expect(doc.diagnostics.warnings.join(' ')).toMatch(/equations not reconstructed/);
  });

  it('mixed-language document (zh+Latin): CJK captions/panels/xrefs/paragraphs survive intact', () => {
    // BENCHMARK.md fixture gap closed 2026-08-24: a full mixed-language payload
    // through the deterministic core (synthetic geometry — the collector is a
    // web-client capability; a real mixed-language PDF E2E stays listed).
    const doc = buildSdmFromPdfText(payloadOf([{ items: [
      it_('结果与讨论', 40, 60, 18),
      it_('如图 3 所示，记忆巩固效应显著 (p < .05)。', 40, 100, 10, 300),
      it_('这与 Table 2 的汇总统计一致。', 40, 132, 10, 240),
      it_('图 3: 不同睡眠条件下的保持率。(a) 对照组。(b) 剥夺组。', 40, 200, 9, 320),
    ] }]), { name: 'mixed.pdf' });
    const heads = doc.blocks.filter((b) => b.kind === 'heading');
    expect(heads.map((h) => h.text)).toEqual(['结果与讨论']);
    const fig = doc.figures[0];
    expect(fig).toBeDefined();
    expect(fig!.label).toBe('图 3');
    expect(fig!.panels.map((p) => p.label)).toEqual(['a', 'b']);
    // CJK xref pattern (图 N) resolves against the 图-labeled figure record
    const figRef = doc.xrefs.find((x) => x.targetKind === 'figure');
    expect(figRef?.status).toBe('resolved');
    expect(figRef?.targetId).toBe(fig!.id);
    const para = doc.blocks.find((b) => b.kind === 'paragraph' && b.text.includes('记忆巩固'));
    expect(para?.text).toBe('如图 3 所示，记忆巩固效应显著 (p < .05)。');
    // nothing mojibake'd: full-width punctuation and CJK pass through verbatim
    expect(doc.blocks.some((b) => b.text.includes('（'))).toBe(false); // we used half-width parens in fixtures
    expect(doc.diagnostics.parseStatus).not.toBe('failed');
  });
});
