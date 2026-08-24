import { describe, expect, it } from 'vitest';
import { ingestTextToSdm, ingestBytes, jsonRefusalReason } from '../src/ingest/service';
import { writeZip } from '../src/ingest/zip';

/** Router-level dispatch for the 2026-08-25 format-matrix extension:
 *  text kinds (html/txt/log/json), byte kinds (docx/pptx/epub), and the
 *  dataset quartile addition. Real formats, typed refusals. */

describe('ingestTextToSdm — extended text kinds', () => {
  it('routes .html/.htm to the structure parser', () => {
    const r = ingestTextToSdm('a.htm', '<html><body><h1>T</h1><p>p</p></body></html>');
    expect(r?.type).toBe('sdm');
    if (r?.type === 'sdm') expect(r.doc.extractor.route).toBe('html_structured');
  });

  it('routes .txt/.log to the honest plain-text parser with char provenance', () => {
    const r = ingestTextToSdm('run.log', 'line one\n\nline two');
    expect(r?.type).toBe('sdm');
    if (r?.type === 'sdm') {
      expect(r.doc.extractor.route).toBe('plain_text');
      expect(r.doc.blocks).toHaveLength(2);
      expect(r.doc.blocks[0]!.provenance?.charStart).toBe(0);
      expect(r.doc.blocks[0]!.provenance?.charEnd).toBe(8);
      // no invented structure kinds
      expect(r.doc.blocks.every((b) => b.kind === 'paragraph')).toBe(true);
    }
  });

  it('profiles a JSON record array through the dsdp-1 pipeline (format json)', () => {
    const r = ingestTextToSdm('trials.json', JSON.stringify([
      { study: 'A', year: 2020, effect: 0.42 },
      { study: 'B', year: 2021, effect: null },
    ]));
    expect(r?.type).toBe('dataset');
    if (r?.type === 'dataset') {
      expect(r.profile.format).toBe('json');
      expect(r.profile.rowCount).toBe(2);
      expect(r.profile.columns.map((c) => c.name)).toEqual(['study', 'year', 'effect']);
      const effect = r.profile.columns.find((c) => c.name === 'effect')!;
      expect(effect.missingCount).toBe(1);
    }
  });

  it('profiles a columnar JSON object (keys → equal-length arrays)', () => {
    const r = ingestTextToSdm('cols.json', JSON.stringify({ dose: [1, 2, 3], resp: [10, 20, 25] }));
    expect(r?.type).toBe('dataset');
    if (r?.type === 'dataset') expect(r.profile.rowCount).toBe(3);
  });

  it('refuses nested JSON with the precise reason (no pseudo-cells)', () => {
    const text = JSON.stringify({ a: [{ b: 1 }] });
    const r = ingestTextToSdm('nested.json', text);
    expect(r).toBeNull();
    expect(jsonRefusalReason(text)).toMatch(/nested/);
  });

  it('refuses a JSON scalar', () => {
    expect(ingestTextToSdm('x.json', '42')).toBeNull();
  });
});

describe('ingestBytes — zip container family', () => {
  const MINIMAL_DOCX = writeZip([
    { name: 'word/document.xml', data: '<?xml version="1.0"?><w:document xmlns:w="u"><w:body><w:p><w:r><w:t>hi</w:t></w:r></w:p></w:body></w:document>' },
  ]);

  it('routes .docx to the SDM path', () => {
    const r = ingestBytes('doc.docx', MINIMAL_DOCX);
    expect(r.type).toBe('sdm');
    if (r.type === 'sdm') expect(r.doc.extractor.route).toBe('docx_ooxml');
  });

  it('refuses unknown binaries with the full supported list', () => {
    const r = ingestBytes('image.png', new Uint8Array([1]));
    expect(r.type).toBe('refused');
    if (r.type === 'refused') expect(r.reason).toMatch(/xlsx.*docx.*pptx.*epub/);
  });

  it('still refuses .doc (legacy binary) rather than parsing it as text', () => {
    const r = ingestBytes('old.doc', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]));
    expect(r.type).toBe('refused');
  });
});

describe('dataset quartiles (additive dsdp-1 extension)', () => {
  it('adds p25/p75 to numeric columns and keeps categorical columns without them', () => {
    const r = ingestTextToSdm('q.csv', 'v,group\n1,a\n2,a\n3,b\n4,b\n5,a\n');
    expect(r?.type).toBe('dataset');
    if (r?.type !== 'dataset') return;
    const v = r.profile.columns.find((c) => c.name === 'v')!;
    expect(v.numeric?.p25).toBe(2);
    expect(v.numeric?.p75).toBe(4);
    expect(v.numeric?.median).toBe(3);
    const g = r.profile.columns.find((c) => c.name === 'group')!;
    expect(g.numeric).toBeUndefined();
  });
});
