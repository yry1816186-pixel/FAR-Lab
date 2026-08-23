import { describe, expect, it } from 'vitest';
import { extractIdentifiers } from '../web/src/utils/ingest';

describe('extractIdentifiers (batch link/DOI/arXiv recognition)', () => {
  it('recognizes a mixed multi-line batch: URL, bare DOI, doi: prefix, arXiv forms', () => {
    const text = [
      'https://www.nature.com/articles/s41586-021-03819-2',
      '10.1038/s41586-021-03819-2',
      'doi:10.1109/ICCV.2019.00123',
      'arXiv:2401.12345',
      '2401.99996v2',
    ].join('\n');
    const { found, rest } = extractIdentifiers(text);
    expect(rest).toEqual([]);
    expect(found.map((f) => `${f.kind}:${f.value}`)).toEqual([
      'url:https://www.nature.com/articles/s41586-021-03819-2',
      'doi:10.1038/s41586-021-03819-2',
      'doi:10.1109/ICCV.2019.00123',
      'arxiv:2401.12345',
      'arxiv:2401.99996', // version suffix intentionally normalized away
    ]);
  });

  it('splits on CJK and ASCII separators and dedupes repeats', () => {
    const { found, rest } = extractIdentifiers('https://a.com/x，10.1000/a;b； https://a.com/x 、无关词');
    expect(found.length).toBe(2);
    expect(rest).toEqual(['b', '无关词']);
  });

  it('keeps prose out of found (no false identifiers inside sentences)', () => {
    const { found, rest } = extractIdentifiers('研究机器学习中偏好的影响，并讨论其局限。');
    expect(found).toEqual([]);
    expect(rest.length).toBeGreaterThan(0);
  });

  it('trims surrounding quotes/brackets from pasted citation fragments', () => {
    const { found } = extractIdentifiers('"https://doi.org/10.1000/x" [10.1000/y]');
    expect(found.map((f) => f.value)).toEqual(['https://doi.org/10.1000/x', '10.1000/y']);
  });
});
