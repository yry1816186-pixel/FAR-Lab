import { describe, expect, it } from 'vitest';
import { CitationIntegrityError, detectPandoc, renderWithPandoc } from '../src/report/pandoc.js';
import { isPandocFormat } from '../src/report/package.js';

// *** TEST-ONLY *** Lane-07 pandoc bridge. Pandoc is OPTIONAL infrastructure: these
// tests run the REAL local pandoc when present (the dev machine has 3.8.3) and skip
// with an explicit marker when absent — availability is an environment fact, never faked.

const pandoc = detectPandoc();
const maybe = pandoc !== null ? it : it.skip;

const BIB = '@article{Doe2020,\n  author = {John Doe},\n  title = {A Probe Study},\n  journal = {Journal of Probes},\n  year = {2020},\n}\n';
const MD = '# Probe paper\n\nCiting the probe [@Doe2020].\n';

describe('detectPandoc', () => {
  it('returns a parsed semver or null (never throws)', () => {
    if (pandoc !== null) expect(pandoc.version).toMatch(/^\d+\.\d+/);
    else console.log('pandoc absent on this machine — conversion tests below are SKIPPED (honest skip, not a pass)');
  });
});

describe('renderWithPandoc (real pandoc)', () => {
  maybe('converts to docx (OOXML zip magic bytes)', () => {
    const out = renderWithPandoc({ markdown: MD, bibliography: BIB, format: 'docx', pandoc: pandoc! });
    expect(out.bytes.subarray(0, 2).toString('latin1')).toBe('PK');
    expect(out.bytes.length).toBeGreaterThan(1000);
  });

  maybe('converts to standalone JATS with a resolved citation and a reference list', () => {
    const out = renderWithPandoc({ markdown: MD, bibliography: BIB, format: 'jats', pandoc: pandoc! });
    const xml = out.bytes.toString('utf8');
    expect(xml).toContain('<article');
    expect(xml).toContain('Doe');
    expect(xml).not.toContain('Doe2020?'); // unresolved citeproc keys render with a '?' suffix
    expect(xml.toLowerCase()).toContain('ref-list');
  });

  maybe('converts to standalone html', () => {
    const out = renderWithPandoc({ markdown: MD, bibliography: BIB, format: 'html', pandoc: pandoc! });
    expect(out.bytes.toString('utf8')).toContain('<html');
  });

  it('fails closed on unresolved citation keys BEFORE pandoc runs', () => {
    // pandoc is deliberately NOT required for this test: the gate is ours.
    const fakeInfo = { path: 'definitely-not-pandoc', version: '0' };
    expect(() =>
      renderWithPandoc({ markdown: '# x\n\n[@Ghost2020] and [@Doe2020]', bibliography: BIB, format: 'docx', pandoc: fakeInfo }),
    ).toThrow(CitationIntegrityError);
    try {
      renderWithPandoc({ markdown: '# x\n\n[@Ghost2020]', bibliography: BIB, format: 'docx', pandoc: fakeInfo });
      expect.unreachable('must throw');
    } catch (e) {
      expect(e).toBeInstanceOf(CitationIntegrityError);
      expect((e as CitationIntegrityError).unresolved).toEqual(['Ghost2020']);
      expect((e as Error).message).toContain('Ghost2020');
    }
  });

  it('rejects an unknown format name at the package layer (runtime guard)', () => {
    // the package gate (report/package.ts) throws `unknown pandoc format` for any
    // non-member — pin the predicate itself, both directions (a widened array or
    // a loosened comparison fails here).
    expect(isPandocFormat('docx')).toBe(true);
    expect(isPandocFormat('jats')).toBe(true);
    expect(isPandocFormat('html')).toBe(true);
    expect(isPandocFormat('doc')).toBe(false); // near-miss extension
    expect(isPandocFormat('DOCX')).toBe(false); // case-sensitive union
    expect(isPandocFormat('')).toBe(false);
  });
});
