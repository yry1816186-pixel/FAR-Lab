import { describe, expect, it } from 'vitest';
import { parseCitation, parseCitationEntries } from '../web/src/utils/ingest';

const BIBTEX_TWO = `@article{dem2020,
  title = {Preference learning under noise},
  author = {Smith, John and Doe, Alice},
  year = {2020},
  doi = {10.1000/demo1},
  keywords = {preference learning, multi-objective; optimization}
}
@inproceedings{dem2021,
  title = {Multi-objective optimization survey},
  author = {Doe, Alice},
  year = {2021},
  doi = {10.1000/demo2},
  keywords = {optimization}
}`;

const RIS_TWO = `TY  - JOUR
TI  - Deep hypothesis ranking
AU  - Zhang, Wei
PY  - 2019
KW  - hypothesis; ranking
ER  - 

TY  - JOUR
TI  - Evidence graphs for science
AU  - Zhang, Wei
PY  - 2021
ER  - `;

describe('parseCitationEntries (multi-entry BibTeX/RIS)', () => {
  it('parses every BibTeX entry with authors, year, doi, and split keywords', async () => {
    const entries = await parseCitationEntries(BIBTEX_TWO);
    expect(entries).not.toBeNull();
    expect(entries!.length).toBe(2);
    expect(entries![0]?.title).toBe('Preference learning under noise');
    expect(entries![0]?.authors).toEqual(['John Smith', 'Alice Doe']);
    expect(entries![0]?.year).toBe(2020);
    expect(entries![0]?.doi).toBe('10.1000/demo1');
    expect(new Set(entries![0]?.keywords)).toEqual(new Set(['preference learning', 'multi-objective', 'optimization']));
    expect(entries![1]?.title).toBe('Multi-objective optimization survey');
  });

  it('parses every RIS entry (shared author joins the relation graph)', async () => {
    const entries = await parseCitationEntries(RIS_TWO);
    expect(entries).not.toBeNull();
    expect(entries!.length).toBe(2);
    expect(entries![0]?.title).toBe('Deep hypothesis ranking');
    expect(entries![0]?.keywords).toEqual(['hypothesis', 'ranking']);
    expect(entries!.every((e) => e.authors.includes('Wei Zhang'))).toBe(true);
  });

  it('returns null for non-citation payloads (no invented metadata)', async () => {
    expect(await parseCitationEntries('just some plain text about science')).toBeNull();
    expect(await parseCitationEntries('')).toBeNull();
  });

  it('parseCitation keeps returning only the first entry (paste path)', async () => {
    const seed = await parseCitation(BIBTEX_TWO);
    expect(seed?.title).toBe('Preference learning under noise');
    expect(seed?.identifiers?.[0]).toEqual({ kind: 'doi', value: '10.1000/demo1' });
  });
});
