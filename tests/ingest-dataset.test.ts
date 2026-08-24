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
