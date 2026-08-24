import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openArtifactStore } from '../src/persistence/artifacts';
import { validateSdmPayload, ingestSdm, projectSeedText, ingestPdfTextPayload, SEED_TEXT_MAX } from '../src/ingest/service';
import { parseJats } from '../src/ingest/parsers/jats';
import { sdmToPlainText } from '../src/ingest/sdm';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ingest-svc-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const JATS_MINIMAL = '<article><front><article-meta><article-title>T</article-title></article-meta></front><body><sec><title>S</title><p>Body text.</p></sec></body></article>';

describe('ingest service facade', () => {
  it('validateSdmPayload accepts a parser-produced document (zod round-trip)', () => {
    const doc = parseJats(JATS_MINIMAL, { name: 'x' });
    const r = validateSdmPayload(JSON.parse(JSON.stringify(doc)));
    expect(r.ok).toBe(true);
  });

  it('validateSdmPayload rejects a malformed payload with precise errors', () => {
    const r = validateSdmPayload({ schemaVersion: 'sdm-1', extractor: { name: '', route: 'jats_xml' }, origin: { kind: 'upload', name: 'x' }, meta: {}, blocks: [{ id: 'WRONG', kind: 'nope', text: '' }] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join(' ')).toMatch(/extractor\.name/);
      expect(r.errors.join(' ')).toMatch(/blocks\.0\.id/);
      expect(r.errors.join(' ')).toMatch(/blocks\.0\.kind/);
    }
  });

  it('ingestSdm persists the SDM artifact content-addressed and projects seed text', async () => {
    const store = openArtifactStore(join(dir, 'artifacts'));
    const doc = parseJats(JATS_MINIMAL, { name: 'x' });
    const out = await ingestSdm(store, doc);
    expect(out.artifactRef).toMatch(/^sha256:[0-9a-f]{64}$/);
    const stored = await store.get(out.artifactRef!);
    expect(stored).not.toBeNull();
    const round = validateSdmPayload(JSON.parse(stored!));
    expect(round.ok).toBe(true);
    expect(out.seedText).toContain('Body text.');
    expect(out.seedTextTruncated).toBe(false);
  });

  it('seed text projection respects the seeds-pipeline cap deterministically', () => {
    const doc = parseJats(JATS_MINIMAL, { name: 'x' });
    const a = projectSeedText(doc, 10);
    const b = projectSeedText(doc, 10);
    expect(a.text).toBe(b.text);
    expect(a.truncated).toBe(true);
    expect(a.text.length).toBe(10);
    expect(SEED_TEXT_MAX).toBe(50_000);
  });

  it('sdmToPlainText renders figures/tables/equations readably', () => {
    const doc = parseJats(`<?xml version="1.0"?><article><body><sec><title>S</title>
      <p>See <xref ref-type="fig" rid="F1">Figure 1</xref>.</p>
      <fig id="F1"><label>Figure 1</label><caption><p>Cap. (a) one.</p></caption></fig>
      <disp-formula id="E1"><tex-math>x=1</tex-math><label>(1)</label></disp-formula>
      </sec></body></article>`, { name: 'x' });
    const text = sdmToPlainText(doc);
    expect(text).toContain('# S');
    expect(text).toContain('[Figure 1] Cap. (a) one.');
    expect(text).toContain('(a) one.');
    expect(text).toContain('$$ x=1 (1) $$');
  });

  it('ingestPdfTextPayload validates then understands a pdfjs payload', () => {
    const payload = {
      numPages: 1,
      pages: [{ pageNumber: 1, width: 612, height: 792, items: [
        { str: 'Figure 1: A caption.', x: 40, y: 100, w: 200, h: 10, fontSize: 10 },
      ] }],
      truncated: false,
      fileSha256: 'b'.repeat(64),
    };
    const ok = ingestPdfTextPayload(payload, 'a.pdf');
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.sdm.figures.length).toBe(1);
    const bad = ingestPdfTextPayload({ ...payload, fileSha256: 'short' }, 'a.pdf');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.join(' ')).toMatch(/fileSha256/);
  });
});
