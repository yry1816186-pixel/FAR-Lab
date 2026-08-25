import { describe, expect, it } from 'vitest';
import { profileDataset, parseDelimited, datasetLanguage } from '../src/ingest/dataset';

const CSV = [
  'study,year,effect_size (Hedges g),n,significance,cohort,notes',
  'Smith,2021,0.42***,120,0.001,control,"quoted, with comma"',
  'Jones,2022,0.15,88,0.21,treatment,NA',
  'Wang,2020,,45,,control,missing effect',
  'Lee,2023,-0.33**,210,0.008,treatment,replication',
  'Smith,2021,0.42***,120,0.001,control,"quoted, with comma"',
  'Dıaz,2019,1.2e-3,300,0.5,control,"embedded\nnewline"',
].join('\n');

describe('dataset profiling', () => {
  const doc = profileDataset(CSV, 'effects.csv');

  it('header, format, delimiter, row/column counts', () => {
    expect(doc.schemaVersion).toBe('dsdp-1');
    expect(doc.format).toBe('csv');
    expect(doc.delimiter).toBe(',');
    expect(doc.rowCount).toBe(6);
    expect(doc.columnCount).toBe(7);
    expect(doc.columns[0]!.name).toBe('study');
  });

  it('type inference: string / integer / float / mixed-significance', () => {
    const byName = new Map(doc.columns.map((c) => [c.name, c]));
    expect(byName.get('study')!.inferredType).toBe('string');
    expect(byName.get('year')!.inferredType).toBe('integer');
    expect(byName.get('n')!.inferredType).toBe('integer');
    expect(byName.get('effect_size (Hedges g)')!.inferredType).toBe('float');
    expect(byName.get('significance')!.inferredType).toBe('float');
  });

  it('unit hint from header parenthetical', () => {
    expect(doc.columns.find((c) => c.name.startsWith('effect_size'))!.unitHint).toBe('Hedges g');
  });

  it('missingness counts and fractions', () => {
    const eff = doc.columns.find((c) => c.name.startsWith('effect_size'))!;
    expect(eff.missingCount).toBe(1);
    expect(eff.missingFraction).toBeCloseTo(1 / 6, 3);
    expect(doc.columns.find((c) => c.name === 'notes')!.missingCount).toBe(1); // 'NA'
  });

  it('numeric stats (min/max/mean/median) over significance-stripped values', () => {
    const eff = doc.columns.find((c) => c.name.startsWith('effect_size'))!;
    // 0.42, 0.15, -0.33, 0.42, 0.0012 → min -0.33, max 0.42
    expect(eff.numeric!.min).toBeCloseTo(-0.33, 3);
    expect(eff.numeric!.max).toBeCloseTo(0.42, 3);
    expect(eff.numeric!.median).toBeCloseTo(0.15, 3);
  });

  it('significance notation flagged, values preserved', () => {
    const eff = doc.columns.find((c) => c.name.startsWith('effect_size'))!;
    expect(eff.significanceNotation).toBe(true);
    expect(eff.examples).toContain('0.42***');
  });

  it('categorical levels for string columns', () => {
    const cohort = doc.columns.find((c) => c.name === 'cohort')!;
    expect(cohort.categorical?.levels.map((l) => l.value)).toEqual(['control', 'treatment']);
    expect(cohort.categorical?.levels[0]!.count).toBe(4);
  });

  it('quoted fields with commas and embedded newlines parse (RFC4180)', () => {
    const notes = doc.columns.find((c) => c.name === 'notes')!;
    expect(notes.examples).toContain('quoted, with comma');
    expect(notes.uniqueCount).toBe(4); // 6 values − 1 missing − 1 duplicate pair collapses
  });

  it('duplicate rows counted', () => {
    expect(doc.quality.duplicateRowCount).toBe(1); // Smith/Chen duplicate
  });

  it('zh column headers give language hint', () => {
    const zh = profileDataset('研究,样本量\nA,30\nB,40\n', 'zh.csv');
    expect(datasetLanguage(zh)).toBe('zh');
  });

  it('ragged rows reported honestly', () => {
    const doc2 = profileDataset('a,b\n1,2\n3\n', 'ragged.csv');
    expect(doc2.quality.raggedRows).toBe(1);
    expect(doc2.diagnostics.warnings.join(' ')).toMatch(/ragged/);
  });

  it('empty / delimiter-less files fail honestly', () => {
    expect(profileDataset('', 'e.csv').diagnostics.parseStatus).toBe('failed');
    expect(profileDataset('just some words here', 'w.txt').diagnostics.parseStatus).toBe('failed');
  });

  it('tsv sniffing by extension', () => {
    const doc2 = profileDataset('a\tb\n1\t2\n', 'x.tsv');
    expect(doc2.format).toBe('tsv');
    expect(doc2.columns.length).toBe(2);
  });
});

describe('parseDelimited — RFC4180 core', () => {
  it('escaped quotes inside quoted fields', () => {
    const rows = parseDelimited('a,b\n"say ""hi""",2\n', ',');
    expect(rows[1]![0]).toBe('say "hi"');
  });
  it('CRLF line endings', () => {
    const rows = parseDelimited('a,b\r\n1,2\r\n', ',');
    expect(rows.length).toBe(2);
    expect(rows[1]).toEqual(['1', '2']);
  });
  it('quoted field containing delimiter', () => {
    const rows = parseDelimited('x\n"a,b",c\n', ',');
    expect(rows[1]).toEqual(['a,b', 'c']);
  });
});

describe('large-spreadsheet stress (BENCHMARK.md gap closed 2026-08-24)', () => {
  const buildCsv = (dataRows: number): string => {
    const lines: string[] = ['study,effect (g),n,group'];
    for (let i = 0; i < dataRows; i += 1) {
      lines.push(`s${i},0.${(i % 90 + 10)},${100 + i},${i % 2 === 0 ? 'A' : 'B'}`);
    }
    return `${lines.join('\n')}\n`;
  };

  it('profiles 150k rows correctly (types, stats, no truncation)', () => {
    const p = profileDataset(buildCsv(150_000), 'big.csv');
    expect(p.diagnostics.truncated).toBe(false);
    expect(p.rowCount).toBe(150_000);
    expect(p.columns.map((c) => `${c.name}:${c.inferredType}`)).toEqual(['study:string', 'effect (g):float', 'n:integer', 'group:string']);
    expect(p.columns[1]!.unitHint).toBe('g');
    expect(p.columns[2]!.numeric?.min).toBe(100);
    expect(p.columns[2]!.numeric?.max).toBe(150_099);
    expect(p.columns[3]!.categorical?.levels).toHaveLength(2);
  });

  it('row cap 200k fires honestly past the limit', () => {
    const p = profileDataset(buildCsv(200_010), 'over.csv');
    expect(p.diagnostics.truncated).toBe(true);
    expect(p.diagnostics.warnings.join(' ')).toMatch(/row limit 200000 reached/);
    // cap applies to ROWS INCLUDING the header: 200_000 total → 199_999 body
    expect(p.rowCount).toBe(199_999);
    expect(p.columns[0]!.rowCount).toBe(199_999);
  });
});
