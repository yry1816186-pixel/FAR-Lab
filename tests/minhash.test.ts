import { describe, it, expect } from 'vitest';
import {
  shingle,
  minhashSignature,
  lshBands,
  jaccardFromSignatures,
  estimateThresholdParams,
  type MinhashConfig,
} from '../src/domain/minhash.js';

// RU-10 A2.8/A4.5 — deterministic MinHash-LSH near-dup detection, clean-room
// implementation of the public algorithm (Broder 1997; datasketch is the
// reference implementation for SEMANTICS only). Zero deps. Single owner for
// corpus dedup + hypothesis dedup per packet ruling.

describe('shingle unit extraction', () => {
  it('uses word 3-grams for Latin text', () => {
    const s = shingle('the quick brown fox jumps', 'en');
    expect(s.size).toBeGreaterThan(0);
    expect(s.has('the quick brown')).toBe(true);
    expect(s.has('quick brown fox')).toBe(true);
  });
  it('uses char bigrams for CJK text (script-detected)', () => {
    const s = shingle('记忆系统的巩固机制', 'zh');
    expect(s.has('记忆')).toBe(true);
    expect(s.has('忆系')).toBe(true);
  });
  it('is deterministic and order-stable', () => {
    const a = shingle('alpha beta gamma delta', 'en');
    const b = shingle('alpha beta gamma delta', 'en');
    expect(a).toEqual(b);
  });
});

describe('minhash signature', () => {
  const cfg: MinhashConfig = { numPerm: 128 };
  it('identical sets produce identical signatures', () => {
    const set = shingle('memory consolidation forgetting curve study', 'en');
    expect(minhashSignature(set, cfg)).toEqual(minhashSignature(new Set(shingle('memory consolidation forgetting curve study', 'en')), cfg));
  });
  it('similar texts yield higher jaccard estimate than dissimilar (true jaccard ~0.38 pair vs unrelated pair)', () => {
    const a = minhashSignature(shingle('hippocampal dependent memory consolidation during sleep spindles', 'en'), cfg);
    const b = minhashSignature(shingle('hippocampal dependent memory consolidation during slow wave sleep', 'en'), cfg);
    const c = minhashSignature(shingle('quantum chromodynamics gauge symmetry breaking lattice calculations', 'en'), cfg);
    const simAB = jaccardFromSignatures(a, b);
    const simAC = jaccardFromSignatures(a, c);
    expect(simAB).toBeGreaterThan(0.3); // true jaccard 0.375; estimator variance ±1/sqrt(128)≈0.09
    expect(simAC).toBeLessThan(0.1);
    expect(simAB).toBeGreaterThan(simAC * 2);
  });
  it('empty set signatures match each other but never claim similarity to non-empty sets', () => {
    const e1 = minhashSignature(new Set(), cfg);
    const e2 = minhashSignature(new Set(), cfg);
    // two empty sets are identical documents, but similarity is UNDEFINED —
    // fail-safe: report 0 so empty artifacts never collide in dedup.
    expect(jaccardFromSignatures(e1, e2)).toBe(0);
    const x = minhashSignature(shingle('anything at all here', 'en'), cfg);
    expect(jaccardFromSignatures(e1, x)).toBe(0);
  });
});

describe('LSH banding', () => {
  it('candidate pairs include true near-duplicates from planted mutations', () => {
    const docs = [
      'dopamine modulates reward prediction error signals in the ventral striatum',
      'dopamine modulates reward prediction error signals in the dorsal striatum',
      'serotonin regulates mood appetite and sleep in the human brainstem',
      'gabaergic interneurons control cortical oscillations via fast synaptic inhibition',
      'dopamine modulates reward prediction error signals inside the ventral striatum',
    ];
    const cfg: MinhashConfig = { numPerm: 128 };
    const params = estimateThresholdParams(0.5); // planted mutations sit ~0.45-0.63 true jaccard
    const sigs = docs.map((d) => minhashSignature(shingle(d, 'en'), cfg));
    const buckets = new Map<string, number[]>();
    sigs.forEach((sig, i) => {
      for (const key of lshBands(sig, params.bands, params.rows)) {
        const arr = buckets.get(key) ?? [];
        arr.push(i);
        buckets.set(key, arr);
      }
    });
    const candidates = new Set<string>();
    for (const arr of buckets.values()) {
      for (let i = 0; i < arr.length; i++)
        for (let j = i + 1; j < arr.length; j++)
          candidates.add(arr[i] < arr[j] ? `${arr[i]}:${arr[j]}` : `${arr[j]}:${arr[i]}`);
    }
    // planted dups: (0,1), (0,4), (1,4) — one-word mutations keep jaccard high
    expect(candidates.has('0:1')).toBe(true);
    expect(candidates.has('0:4')).toBe(true);
    expect(candidates.has('1:4')).toBe(true);
    expect(candidates.size).toBeLessThanOrEqual(7); // no candidate explosion
  });
  it('estimateThresholdParams keeps numPerm*bands == numPerm invariant', () => {
    const p = estimateThresholdParams(0.8);
    expect(p.rows * p.bands).toBeLessThanOrEqual(128);
    expect(p.rows).toBeGreaterThanOrEqual(1);
    expect(p.bands).toBeGreaterThanOrEqual(1);
  });
});
