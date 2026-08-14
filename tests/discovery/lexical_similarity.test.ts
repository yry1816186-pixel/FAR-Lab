/**
 * tests/discovery/lexical_similarity.test.ts — deterministic novelty floor
 * (directive §8.3). Pins: tokenization behavior, similarity bounds, the
 * paraphrase threshold semantics, nearest-neighbor distance, and — because
 * this module feeds candidate dedup — bit-level determinism across calls.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  tokenize,
  buildIdf,
  tfidfCosineSimilarity,
  jaccardNgramSimilarity,
  paraphraseSimilarity,
  nearestNeighborDistance,
  PARAPHRASE_THRESHOLD,
} from '../../src/discovery/novelty/lexical_similarity.ts';

describe('tokenize (deterministic, stopword-filtered)', () => {
  it('lowercases, splits on non-alphanumerics, drops stopwords and 1-char terms', () => {
    assert.deepEqual(tokenize('The Lipid-Oversupply impairs a mitochondrial function!'), [
      'lipid',
      'oversupply',
      'impairs',
      'mitochondrial',
      'function',
    ]);
  });

  it('returns an empty array for pure-stopword input', () => {
    assert.deepEqual(tokenize('the a of to and'), []);
  });
});

describe('tfidfCosineSimilarity', () => {
  const idf = buildIdf([
    'insulin resistance skeletal muscle lipid oversupply',
    'metformin lowers hepatic glucose output',
    'quasars accrete mass via magnetic turbulence',
  ]);

  it('identical texts score exactly 1', () => {
    assert.equal(tfidfCosineSimilarity('lipid oversupply impairs oxidation', 'lipid oversupply impairs oxidation', idf), 1);
  });

  it('disjoint topical texts score exactly 0', () => {
    assert.equal(tfidfCosineSimilarity('quasars accrete magnetic turbulence', 'metformin hepatic glucose output', idf), 0);
  });

  it('partial overlap lands strictly between 0 and 1', () => {
    const sim = tfidfCosineSimilarity(
      'insulin resistance lipid oversupply muscle',
      'insulin resistance mitochondrial oxidation muscle',
      idf,
    );
    assert.ok(sim > 0 && sim < 1, `expected 0 < sim < 1, got ${sim}`);
  });

  it('empty-token text scores 0 (never NaN)', () => {
    assert.equal(tfidfCosineSimilarity('the of', 'insulin resistance', idf), 0);
  });
});

describe('jaccardNgramSimilarity (character trigrams)', () => {
  it('identical texts score exactly 1', () => {
    assert.equal(jaccardNgramSimilarity('sleep deprivation hippocampus', 'sleep deprivation hippocampus'), 1);
  });

  it('disjoint texts score exactly 0', () => {
    assert.equal(jaccardNgramSimilarity('aaaa bbbb', 'zzzz yyyy'), 0);
  });
});

describe('paraphraseSimilarity (PARAPHRASE_RISK semantics)', () => {
  it('a near-identical rewrite scores at/above the flag threshold', () => {
    const a = 'Lipid oversupply impairs mitochondrial oxidative capacity in skeletal muscle.';
    const b = 'Lipid oversupply impairs mitochondrial oxidative capacity in skeletal muscle!';
    const sim = paraphraseSimilarity(a, b);
    assert.ok(
      sim >= PARAPHRASE_THRESHOLD,
      `near-identical pair must flag: sim=${sim.toFixed(4)} < threshold=${PARAPHRASE_THRESHOLD}`,
    );
  });

  it('topically disjoint pairs never flag', () => {
    const sim = paraphraseSimilarity(
      'Quasars accrete mass via magnetic disc turbulence.',
      'Metformin lowers hepatic glucose output in patients.',
    );
    assert.ok(sim < PARAPHRASE_THRESHOLD, `disjoint pair sim=${sim.toFixed(4)} must stay below threshold`);
  });

  it('a genuinely reordered paraphrase scores strictly higher than a disjoint pair (sensitivity documented, not threshold-pinned)', () => {
    const reordered = paraphraseSimilarity(
      'Sleep deprivation impairs memory consolidation in the hippocampus.',
      'Memory consolidation in the hippocampus is impaired by sleep deprivation.',
    );
    const disjoint = paraphraseSimilarity(
      'Sleep deprivation impairs memory consolidation in the hippocampus.',
      'Metformin lowers hepatic glucose output in patients.',
    );
    assert.ok(reordered > disjoint, `reordered (${reordered.toFixed(4)}) must exceed disjoint (${disjoint.toFixed(4)})`);
  });
});

describe('nearestNeighborDistance (directive §8.3)', () => {
  const corpus = [
    'Insulin resistance in skeletal muscle is driven by lipid oversupply.',
    'Metformin lowers hepatic glucose output across trials.',
  ];
  const idf = buildIdf(corpus);

  it('distance 0 for a corpus member (nearest neighbor is itself)', () => {
    assert.ok(Math.abs(nearestNeighborDistance(corpus[0]!, corpus, idf)) < 1e-12);
  });

  it('distance near 1 for text sharing nothing with the corpus', () => {
    const d = nearestNeighborDistance('Quasars accrete mass via magnetic turbulence.', corpus, idf);
    assert.ok(d > 0.9, `unrelated text distance ${d.toFixed(4)} should be near 1`);
  });

  it('empty corpus returns the honest maximum 1 (nothing to compare against)', () => {
    assert.equal(nearestNeighborDistance('anything', [], idf), 1);
  });
});

describe('determinism (zero-entropy discipline)', () => {
  it('repeated calls return bit-identical results', () => {
    const a = 'Lipid oversupply impairs mitochondrial oxidative capacity.';
    const b = 'Lipid oversupply impairs the mitochondrial oxidative capacity.';
    const first = paraphraseSimilarity(a, b);
    const second = paraphraseSimilarity(a, b);
    assert.equal(first, second);
    assert.ok(Number.isFinite(first));
  });
});
