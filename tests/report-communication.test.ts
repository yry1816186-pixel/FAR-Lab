import { describe, expect, it } from 'vitest';
import { PaperOutline, newId } from '../src/domain/index.js';
import type { PaperReference } from '../src/domain/index.js';
import { checkCitationIntegrity, extractCitationKeys, renderBibliographyFile } from '../src/report/citations.js';
import { buildClaimBindingTable, buildCorpusTable, buildResultsTable, tableToCsv, tableToMarkdown } from '../src/report/tables.js';
import { buildCorpusDepthFigure, buildWinRateFigure } from '../src/report/figures.js';
import { buildRoCrate } from '../src/report/rocrate.js';

// *** TEST-ONLY *** Lane-07 unit layer: citation integrity, table/figure determinism,
// RO-Crate structure. No store involved — the projection inputs are built by hand and
// the package integration lives in tests/report-package.test.ts.

const ref = (key: string, overrides: Partial<PaperReference> = {}): PaperReference => ({
  key,
  bibtex: `@misc{${key},\n  title = {T ${key}}\n}`,
  sourceDocumentId: `src_${key}`,
  ...overrides,
});

const minimalOutline = (results: PaperOutline['results']): PaperOutline =>
  PaperOutline.parse({
    title: 'Probe title',
    runId: newId('run'),
    introduction: { gapStatement: 'gap', contributions: [] },
    methods: { planRef: null, stepsSummary: [], preregistration: { frozen: false } },
    results,
    discussion: { orderingInterpretation: 'ach', counterEvidenceHighlights: [] },
    conclusion: { openFalsificationConditions: [], openUncertainties: [] },
    limitations: [],
    references: [],
    provenance: { generatedAt: '2026-08-25T00:00:00.000Z', deterministic: true, note: 'test' },
  });

describe('extractCitationKeys', () => {
  it('extracts single, multiple and suppressed-form keys in order', () => {
    expect(extractCitationKeys('a [@one] b [@two;@three] c [-@four] d [@one]')).toEqual([
      'one', 'two', 'three', 'four', 'one',
    ]);
  });
  it('keeps key charset (dashes/underscores) and ignores bare @words', () => {
    expect(extractCitationKeys('mail a@b.com plus [@ke-y_1]')).toEqual(['ke-y_1']);
    expect(extractCitationKeys('no citations here')).toEqual([]);
  });
});

describe('checkCitationIntegrity', () => {
  const refs = [ref('one'), ref('two'), ref('unused')];
  it('classifies resolved / unresolved / uncited', () => {
    const r = checkCitationIntegrity('x [@one] y [@two;@ghost]', refs);
    expect(r.citedKeys).toEqual(['ghost', 'one', 'two']);
    expect(r.unresolved).toEqual(['ghost']);
    expect(r.uncited).toEqual(['unused']);
  });
  it('is clean when every inline key is in the bibliography', () => {
    const r = checkCitationIntegrity('[@one] and [@two] and [@one]', refs);
    expect(r.unresolved).toEqual([]);
    expect(r.citedKeys).toEqual(['one', 'two']);
  });
});

describe('renderBibliographyFile', () => {
  it('joins entries with a blank line and terminates with a newline', () => {
    const out = renderBibliographyFile([ref('a'), ref('b')]);
    expect(out).toBe('@misc{a,\n  title = {T a}\n}\n\n@misc{b,\n  title = {T b}\n}\n');
  });
  it('renders an empty bibliography as an empty string', () => {
    expect(renderBibliographyFile([])).toBe('');
  });
});

describe('tables', () => {
  it('keeps conflicting experiment verdicts as distinct entries (never averaged)', () => {
    const outline = minimalOutline([
      {
        hypothesisId: 'hyp_probe0000000000000000000000' as never,
        statement: 'H',
        rank: 1,
        btScore: 0.5,
        winRate: 0.62,
        evidenceBand: 'moderate_support',
        experimentVerdicts: [
          { comparison: 'cmp-a', metric: 'auc', verdict: 'supported', ciLow: 0.1, ciHigh: 0.3, threshold: 0.2 },
          { comparison: 'cmp-b', metric: 'auc', verdict: 'refuted', ciLow: 0.05, ciHigh: 0.15, threshold: 0.2 },
        ],
      },
    ]);
    const csv = tableToCsv(buildResultsTable(outline));
    expect(csv).toContain('cmp-a[auc]: supported');
    expect(csv).toContain('cmp-b[auc]: refuted');
    // both CIs travel with their verdict — the conflict stays inspectable
    expect(csv).toContain('[0.1, 0.3]');
    expect(csv).toContain('[0.05, 0.15]');
    expect(csv).toContain('thr 0.2');
  });
  it('CSV-escapes commas, quotes and newlines (RFC 4180: quotes doubled, CRLF rows)', () => {
    const t = buildClaimBindingTable([
      {
        id: 'clm_probe00000000000000000000000',
        runId: newId('run'),
        text: 'claim, with "quotes"\nand newline',
        locators: [{ sourceDocumentId: 'src_x000000000000000000000000000', quote: 'q' }],
        bindingStatus: 'verified',
        alignmentChecked: true,
        uncertainties: [],
      } as never,
    ]);
    const csv = tableToCsv(t);
    const dataLine = csv.split('\r\n')[1]!;
    expect(dataLine).toContain('"claim, with ""quotes""');
    expect(dataLine).toContain('and newline"');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
  it('markdown-escapes pipes and renders null cells as em dash', () => {
    const outline = minimalOutline([
      { hypothesisId: 'hyp_probe0000000000000000000000' as never, statement: 'a|b', rank: null, btScore: null, winRate: null, evidenceBand: null, experimentVerdicts: [] },
    ]);
    const md = tableToMarkdown(buildResultsTable(outline));
    expect(md).toContain('a\\|b');
    expect(md).toContain('—'); // null cells never fabricated as 0
    expect(md).toContain('<!-- table: results-overview');
    expect(md).toContain('scorecard+tournament+evidence_body+stat_report'); // provenance inline
  });
  it('corpus table carries retraction status and resolved flags from stored sources', () => {
    const t = buildCorpusTable([
      {
        id: 'src_probe000000000000000000000000',
        runId: newId('run'),
        family: 'openalex',
        identifiers: [{ kind: 'doi', value: '10.1/x' }],
        title: 'Retracted work',
        publicationYear: 2023,
        contentDepth: 'abstract',
        accessState: 'open',
        contentHash: 'a'.repeat(64),
        retrievedAt: '2026-08-01T00:00:00.000Z',
        parseStatus: 'ok',
        verification: { method: 'crossref_doi', resolved: true, retractionStatus: 'retracted', checkedAt: '2026-08-01T00:00:00.000Z' },
      } as never,
    ]);
    const csv = tableToCsv(t);
    expect(csv).toContain('retracted');
    expect(csv).toContain('true'); // resolved  expect(csv).toContain('doi:10.1/x'); // W4: identifier rides the citation surface, not just the lossy title
  });
});

describe('figures (deterministic SVG)', () => {
  const outline = minimalOutline([
    { hypothesisId: 'hyp_probe0000000000000000000000' as never, statement: 'H1', rank: 1, btScore: 1.2, winRate: 0.62, evidenceBand: null, experimentVerdicts: [] },
    { hypothesisId: 'hyp_probe0000000000000000000001' as never, statement: 'H2', rank: 2, btScore: 0.8, winRate: null, evidenceBand: null, experimentVerdicts: [] },
  ]);
  const prov = { runId: newId('run'), generatedAt: '2026-08-25T00:00:00.000Z' };

  it('is byte-deterministic across calls', () => {
    expect(buildWinRateFigure(outline, prov)).toBe(buildWinRateFigure(outline, prov));
    expect(buildCorpusDepthFigure([], prov)).toBe(buildCorpusDepthFigure([], prov));
  });
  it('renders stored values only: winRate bar + honest no-data row, provenance in <desc>', () => {
    const svg = buildWinRateFigure(outline, prov);
    expect(svg).toContain('>0.62<');
    expect(svg).toContain('no data (not contested)');
    expect(svg).toContain(prov.runId);
    expect(svg).toContain('generated 2026-08-25T00:00:00.000Z');
    expect(svg).toMatch(/<desc>[^<]*winRate[^<]*<\/desc>/);
  });
  it('discloses zero-result state instead of an empty axis frame', () => {
    const svg = buildWinRateFigure(minimalOutline([]), prov);
    expect(svg).toContain('No ranked hypotheses are stored');
  });
  it('escapes XML specials and keeps all four depth categories at zero sources', () => {
    const svg = buildCorpusDepthFigure([], prov);
    for (const cat of ['metadata_only', 'abstract', 'full_text', 'data']) expect(svg).toContain(`>${cat}<`);
    expect(svg).toContain('n=0');
    const hostile = minimalOutline([]);
    const withAmp = buildWinRateFigure(hostile, { ...prov, runId: 'run<&>"x' });
    expect(withAmp).toContain('run&lt;&amp;&gt;&quot;x');
  });
});

describe('RO-Crate metadata', () => {
  const crate = buildRoCrate({
    name: 'pkg',
    description: 'd',
    datePublished: '2026-08-25T00:00:00.000Z',
    license: { '@id': 'https://spdx.org/licenses/Apache-2.0', name: 'Apache License 2.0' },
    files: [
      { path: 'paper.md', sha256: 'a'.repeat(64), encodingFormat: 'text/markdown', name: 'paper' },
      { path: 'figures/f.svg', sha256: 'b'.repeat(64), encodingFormat: 'image/svg+xml', name: 'fig' },
    ],
    software: { name: 'FAR-Lab', version: 'deadbeef' },
  }) as { '@context': string; '@graph': Array<Record<string, unknown>> };

  it('carries the 1.1 context and a self-describing descriptor about the root', () => {
    expect(crate['@context']).toBe('https://w3id.org/ro/crate/1.1/context');
    const descriptor = crate['@graph'].find((e) => e['@id'] === 'ro-crate-metadata.json')!;
    expect(descriptor['@type']).toBe('CreativeWork');
    expect(descriptor['about']).toEqual({ '@id': './' });
    expect(descriptor['conformsTo']).toEqual({ '@id': 'https://w3id.org/ro/crate/1.1' });
  });
  it('root Dataset hasPart covers every file; files carry sha256 + encodingFormat', () => {
    const root = crate['@graph'].find((e) => e['@id'] === './')!;
    expect(root['@type']).toBe('Dataset');
    expect(root['hasPart']).toEqual([{ '@id': 'paper.md' }, { '@id': 'figures/f.svg' }]);
    const file = crate['@graph'].find((e) => e['@id'] === 'paper.md')!;
    expect(file['sha256']).toBe('a'.repeat(64));
    expect(file['encodingFormat']).toBe('text/markdown');
    expect(root['datePublished']).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});
