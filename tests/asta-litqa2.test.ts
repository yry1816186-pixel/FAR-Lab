import { describe, it, expect } from 'vitest';
import { sampleQuestions, buildChoices, buildSearchQuery, parseAnswer, scoreAnswer, aggregate, scoreRowsForMetrics, hashString, parseQueries, mergePools } from '../eval/asta-litqa2.mjs';

/**
 * FA-SCI-07 adapter unit tests: the deterministic core (sampling, choice permutation,
 * query discipline, AstaBench scorer semantics) must be reproducible by construction —
 * no LLM in the scored path.
 */
const q = (id, ideal = 'ans', distractors = ['d1', 'd2']) => ({
  id, question: 'Q ' + id, ideal, distractors, sources: [], is_opensource: true, key_passage: null, version: '1.1-dev', subtask: 'litqa-v2-public',
});

describe('sampleQuestions', () => {
  const pool = Array.from({ length: 50 }, (_, i) => q('id' + i));
  it('same seed -> identical sample; different seed -> (almost surely) different', () => {
    const a = sampleQuestions(pool, 8, 42);
    const b = sampleQuestions(pool, 8, 42);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    const c = sampleQuestions(pool, 8, 43);
    expect(a.map((x) => x.id)).not.toEqual(c.map((x) => x.id));
  });
  it('returns exactly n distinct rows in pool-index order', () => {
    const s = sampleQuestions(pool, 8, 7);
    expect(s).toHaveLength(8);
    expect(new Set(s.map((x) => x.id)).size).toBe(8);
  });
});

describe('buildChoices (LAB-bench semantics)', () => {
  it('injects the unsure choice and tracks target/unsure letters consistently', () => {
    const ch = buildChoices(q('x', 'ideal', ['a', 'b', 'c']), 99);
    expect(ch.choices).toHaveLength(5);
    expect(ch.choices).toContain('ideal');
    expect(ch.choices).toContain('Insufficient information to answer the question');
    expect(ch.choices[ch.letters.indexOf(ch.targetLetter)]).toBe('ideal');
    expect(ch.choices[ch.letters.indexOf(ch.unsureLetter)]).toBe('Insufficient information to answer the question');
    expect(new Set(ch.permutation).size).toBe(5);
  });
  it('is deterministic for a fixed seed', () => {
    const a = buildChoices(q('x', 'i', ['a', 'b']), 5);
    const b = buildChoices(q('x', 'i', ['a', 'b']), 5);
    expect(a).toEqual(b);
  });
  it('per-question hash seeds give same-length ids DIFFERENT permutations (position-bias leak regression: LitQA2 ids are all 36-char UUIDs, so id.length-derived seeds once produced one shared permutation)', () => {
    const ids = ['a214f5f8-0de8-43cf-82e0-7930003e4a0c', '8d7fa642-ee46-4a13-8ea9-61cc2d4f4ddd', '487539f9-2f17-4009-aa4a-c41322445f11'];
    expect(new Set(ids.map((i) => i.length)).size).toBe(1);
    const perms = ids.map((id) => buildChoices(q(id, 'i', ['a', 'b', 'c']), 20260906 ^ hashString(id)).permutation.join(','));
    expect(new Set(perms).size).toBe(ids.length);
    const targets = ids.map((id) => buildChoices(q(id, 'i', ['a', 'b', 'c']), 20260906 ^ hashString(id)).targetLetter);
    expect(new Set(targets).size).toBeGreaterThan(1);
  });
});

describe('buildSearchQuery', () => {
  it('strips wildcards, collapses whitespace, appends the year-precision date clause verbatim', () => {
    expect(buildSearchQuery('Why?  A *gene*? network')).toBe(
      'Why A gene network AND (PUB_YEAR:[2010 TO 2024])',
    );
  });
});

describe('parseAnswer', () => {
  const letters = ['A', 'B', 'C'];
  it('accepts an offered letter (case/space tolerant) and keeps bounded evidence', () => {
    const p = parseAnswer({ answer: ' b ', evidence: 'e'.repeat(900) }, letters);
    expect(p).toEqual({ ok: true, answer: 'B', evidence: 'e'.repeat(400) });
  });
  it('rejects non-object payloads and letters outside the offered set', () => {
    expect(parseAnswer(null, letters).ok).toBe(false);
    expect(parseAnswer({ answer: 'Z' }, letters).ok).toBe(false);
    expect(parseAnswer({ answer: 7 }, letters).ok).toBe(false);
  });
});

describe('parseQueries (planned-query validation)', () => {
  it('accepts 1-5 non-empty strings and caps at 5', () => {
    expect(parseQueries({ queries: ['a', 'b', 'c'] })).toEqual({ ok: true, queries: ['a', 'b', 'c'] });
    expect(parseQueries({ queries: ['1', '2', '3', '4', '5', '6'] }).queries).toHaveLength(5);
  });
  it('rejects non-objects, missing arrays, and all-empty arrays', () => {
    expect(parseQueries(null).ok).toBe(false);
    expect(parseQueries({ queries: 'a' }).ok).toBe(false);
    expect(parseQueries({ queries: ['  ', ''] }).ok).toBe(false);
  });
});

describe('mergePools (multi-list dedup)', () => {
  it('dedupes by doi across query pools, keeps first occurrence, tolerates null doi via title key', () => {
    const pools = [
      [{ doi: '10.1/a', title: 'T1' }, { doi: null, title: 'Shared Title' }],
      [{ doi: '10.1/a', title: 'T1-dup' }, { doi: null, title: 'shared title' }, { doi: '10.1/b', title: 'T2' }],
    ];
    const merged = mergePools(pools);
    expect(merged).toHaveLength(3);
    expect(merged[0].title).toBe('T1'); // first occurrence wins over the dup
    expect(merged.map((x) => x.doi)).toEqual(['10.1/a', null, '10.1/b']);
  });
});

describe('scoreAnswer / aggregate (AstaBench metric semantics)', () => {
  it('wrong-and-sure, right-and-sure, and unsure are distinct outcomes', () => {
    expect(scoreAnswer('A', 'A', 'D')).toEqual({ is_correct: true, is_sure: true });
    expect(scoreAnswer('B', 'A', 'D')).toEqual({ is_correct: false, is_sure: true });
    expect(scoreAnswer('D', 'A', 'D')).toEqual({ is_correct: false, is_sure: false });
  });
  it('precision = correct among sure; coverage = sure fraction; empty sure -> precision 0', () => {
    const rows = [
      { is_correct: true, is_sure: true },
      { is_correct: false, is_sure: true },
      { is_correct: false, is_sure: false },
    ];
    expect(aggregate(rows)).toMatchObject({ n: 3, correct: 1, sure: 2, accuracy: 1 / 3, precision: 1 / 2, coverage: 2 / 3 });
    expect(aggregate([{ is_correct: false, is_sure: false }])).toMatchObject({ n: 1, precision: 0, coverage: 0 });
    expect(aggregate([])).toMatchObject({ n: 0, accuracy: 0, accuracyStderr: 0 });
  });
  it('fail-closed denominator: recorded provider/parse failures score incorrect, never vanish', () => {
    // 2026-09-06 audit fix: dropping failed rows from the denominator inflated
    // accuracy exactly when the model produced garbage (5 garbage rows used to
    // leave accuracy computed over the 15 good ones only).
    const scored = scoreRowsForMetrics([
      { ok: true, answer: 'A', score: { is_correct: true, is_sure: true } },
      { ok: false, answer: null, score: undefined },               // provider failure
      { ok: true, answer: null, score: undefined, error: { kind: 'parse' } }, // unparseable
    ]);
    expect(aggregate(scored)).toMatchObject({ n: 3, correct: 1, sure: 3, accuracy: 1 / 3, coverage: 1 });
    expect(scored[1]).toEqual({ is_correct: false, is_sure: true, failed: true });
    expect(scored[2]).toEqual({ is_correct: false, is_sure: true, failed: true });
  });
});
