/**
 * tests/research/rediscovery_engine.test.ts — the temporal-holdout replay
 * engine (§4.1): tokenizer pins, three-level matching, cutoff enforcement,
 * spec validation, end-to-end offline replay determinism, and the honesty
 * guards (mandatory leakage section; NO capability-score language).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertNoCapabilityScore,
  enforceTemporalCutoff,
  leadTimeMonthsFrom,
  matchTarget,
  renderRediscoveryReport,
  replayRediscoverySpec,
  tokenize,
  validateSpec,
} from '../../src/research/evaluation/rediscovery/engine.ts';
import type {
  TargetDiscovery,
  TemporalHoldoutSpec,
} from '../../src/research/evaluation/rediscovery/types.ts';
import { LEAKAGE_DISCLAIMER } from '../../src/research/evaluation/rediscovery/types.ts';
import { REDISCOVERY_SPECS } from '../../src/research/evaluation/rediscovery/targets.ts';

// ─── Minimal synthetic target/hypothesis builders for pure matcher tests ───

function fakeTarget(overrides: Partial<TargetDiscovery> = {}): TargetDiscovery {
  return {
    id: 't-test',
    statement: 'A Jupiter-mass planet orbits a Sun-like star, found by radial velocity.',
    publishedAfter: '1995-11-23',
    doi: '10.1038/378355',
    doiStatus: 'CONFIRMED',
    verificationStatus: 'VERIFIED_DISCOVERY',
    unverifiedNote: null,
    matchKeywords: ['jupiter mass planet', 'radial velocity', 'sun like star'],
    synonyms: { 'radial velocity': ['doppler periodicity'] },
    groundingDocumentIds: ['doc-ground'],
    ...overrides,
  };
}

function fakeHypothesis(statement: string, citations: readonly string[] = []): {
  id: string;
  statement: string;
  mechanism: string;
  supportingCitations: readonly string[];
} {
  return { id: `h-${statement.length}-${citations.length}`, statement, mechanism: '', supportingCitations: citations };
}

// ─── Tokenizer pins (determinism surface of the matcher) ────────────────────

describe('rediscovery tokenizer', () => {
  it('splits hyphenated compounds, drops stopwords, collapses simple plurals', () => {
    assert.deepEqual(tokenize('Jupiter-mass planets are detected by the radial-velocity shifts'),
      ['jupiter', 'mass', 'planet', 'detected', 'radial', 'velocity', 'shift']);
  });

  it('keeps latin plurals distinct (conservative: no over-stemming)', () => {
    // 'supernovae' and 'supernova' are NOT merged — keyword sets must use the
    // exact morphological form; this conservatism is deliberate (fewer false
    // hits beats more).
    assert.deepEqual(tokenize('supernovae and supernova'), ['supernovae', 'supernova']);
  });
});

// ─── Three-level matching ────────────────────────────────────────────────────

describe('rediscovery three-level matching', () => {
  it('L1_KEYWORD: two direct keyword phrases hit, no citation needed', () => {
    const t = fakeTarget();
    const m = matchTarget(t, [
      fakeHypothesis('Jupiter-mass planets around nearby stars imprint radial-velocity shifts.'),
    ]);
    assert.equal(m.matched, true);
    assert.equal(m.matchLevel, 'L1_KEYWORD');
    assert.ok(m.matchedKeywords.length >= 2);
  });

  it('NO_MATCH when only one direct keyword hits and no grounding citation', () => {
    const t = fakeTarget();
    const m = matchTarget(t, [fakeHypothesis('A radial-velocity survey of the galactic bulge.')]);
    assert.equal(m.matchLevel, 'NO_MATCH');
    assert.equal(m.matched, false);
  });

  it('L2_CITATION: one direct keyword + a grounding citation', () => {
    const t = fakeTarget();
    const m = matchTarget(t, [
      fakeHypothesis('A radial-velocity monitoring campaign on nearby stars.', ['doc-ground']),
    ]);
    assert.equal(m.matched, true);
    assert.equal(m.matchLevel, 'L2_CITATION');
  });

  it('L3_SEMANTIC: synonym hit + token-overlap floor, without a full keyword-phrase hit', () => {
    const t = fakeTarget({
      statement: 'Double-stranded RNA triggers gene silencing',
      matchKeywords: ['double stranded rna', 'gene silencing'],
      synonyms: { 'gene silencing': ['target mrna degradation'] },
    });
    // Shares the token 'rna' (jaccard ~0.08) and the synonym phrase, but the
    // full keyword phrases do not appear contiguously — weak evidence only.
    const m = matchTarget(t, [
      fakeHypothesis('Injected double-stranded RNA causes target mRNA degradation in animal cells.'),
    ]);
    assert.equal(m.matched, true);
    assert.equal(m.matchLevel, 'L3_SEMANTIC');
    assert.deepEqual(m.matchedKeywords, ['target mrna degradation']);
  });

  it('L3 does NOT fire when tokens shared but no synonym phrase appears', () => {
    const t = fakeTarget({
      statement: 'Double-stranded RNA triggers gene silencing',
      matchKeywords: ['double stranded rna', 'gene silencing'],
      synonyms: { 'gene silencing': ['target mrna degradation'] },
    });
    // One direct keyword phrase ('double stranded rna') but no citation and
    // no synonym phrase — that is a miss, not weak evidence.
    const m = matchTarget(t, [
      fakeHypothesis('Double-stranded RNA chemistry is studied in solution.'),
    ]);
    assert.equal(m.matchLevel, 'NO_MATCH');
  });

  it('level precedence: L1 beats L2 when both hypotheses exist', () => {
    const t = fakeTarget();
    const m = matchTarget(t, [
      fakeHypothesis('A radial-velocity study.', ['doc-ground']), // L2 candidate
      fakeHypothesis('Jupiter-mass planets around Sun-like stars imprint radial-velocity shifts.'), // L1
    ]);
    assert.equal(m.matchLevel, 'L1_KEYWORD');
  });

  it('a non-cited hypothesis cannot reach L2 even with one keyword', () => {
    const t = fakeTarget();
    const m = matchTarget(t, [
      fakeHypothesis('A radial-velocity study.', ['doc-unrelated']),
    ]);
    assert.equal(m.matchLevel, 'NO_MATCH');
  });
});

// ─── Cutoff enforcement ──────────────────────────────────────────────────────

describe('temporal cutoff enforcement', () => {
  const baseSpec = REDISCOVERY_SPECS.find((s) => s.specId === 'rediscovery-cosmology-1994')!;
  // Real fixture docs, cloned with mutated dates (full RetrievedDocument shape).
  const realDoc = baseSpec.corpusFixture[0]!;
  const docs = [
    realDoc,
    { ...realDoc, persistentIdentifier: 'boundary-clone', publicationDate: '1994-06-30' },
    { ...realDoc, persistentIdentifier: 'future-clone', publicationDate: '1994-07-01' },
    { ...realDoc, persistentIdentifier: 'nodate-clone', publicationDate: null },
  ];

  it('drops post-cutoff documents and counts them', () => {
    const { kept, stats } = enforceTemporalCutoff(docs, '1994-06-30');
    assert.equal(stats.inputDocumentCount, 4);
    assert.equal(stats.retainedDocumentCount, 3);
    assert.equal(stats.droppedPostCutoffDocumentCount, 1);
    assert.equal(kept.some((d) => d.persistentIdentifier === 'future-clone'), false);
  });

  it('keeps the boundary document (publicationDate == cutoff is pre-cutoff)', () => {
    const { kept } = enforceTemporalCutoff(docs, '1994-06-30');
    assert.equal(kept.some((d) => d.persistentIdentifier === 'boundary-clone'), true);
  });

  it('validateSpec rejects a target published at/before the cutoff', () => {
    const spec = {
      specId: 'bad',
      domain: 'd',
      researchQuestion: 'q',
      cutoffDate: '1994-06-30',
      corpusFixture: [],
      targetDiscoveries: [fakeTarget({ publishedAfter: '1994-06-30' })],
      runConfig: { targetHypothesisCount: 3, hypothesisGenerationStrategy: 'legacy', maxPerQuery: 8 },
      llmFixtures: {},
    } satisfies TemporalHoldoutSpec;
    assert.throws(() => validateSpec(spec), /publishedAfter > cutoffDate/);
  });

  it('lead time is the month distance from cutoff to the establishing publication', () => {
    assert.equal(leadTimeMonthsFrom('1994-06-30', '1995-11-23'), 17);
    assert.equal(leadTimeMonthsFrom('2015-01-01', '2016-02-11'), 13);
  });
});

// ─── End-to-end offline replay (real runResearch pipeline) ───────────────────

describe('rediscovery replay (offline, deterministic)', () => {
  it('spec cosmology-1994: both targets matched at their designed levels', async () => {
    const spec = REDISCOVERY_SPECS.find((s) => s.specId === 'rediscovery-cosmology-1994');
    assert.ok(spec, 'spec missing from registry');
    const report = await replayRediscoverySpec(spec);
    assert.equal(report.runMode, 'RECORDED_REPLAY');
    assert.equal(report.corpusStats.droppedPostCutoffDocumentCount, 0);
    const t1 = report.targetResults.find((r) => r.targetId === 'exoplanet-51peg-radial-velocity');
    const t2 = report.targetResults.find((r) => r.targetId === 'cosmic-acceleration-snia');
    assert.ok(t1 && t2);
    assert.equal(t1.matchLevel, 'L1_KEYWORD');
    assert.equal(t2.matchLevel, 'L2_CITATION');
    assert.equal(report.hitRate, 1);
    assert.equal(t1.leadTimeMonths, 17);
  });

  it('spec gravwave-2015: shipped intentional MISS target stays a miss', async () => {
    const spec = REDISCOVERY_SPECS.find((s) => s.specId === 'rediscovery-gravitational-wave-2015');
    assert.ok(spec, 'spec missing from registry');
    const report = await replayRediscoverySpec(spec);
    const t1 = report.targetResults.find((r) => r.targetId === 'gw150914-bbh-direct-detection');
    const t2 = report.targetResults.find((r) => r.targetId === 'gw170817-multimessenger-kilonova');
    assert.ok(t1 && t2);
    assert.equal(t1.matched, true);
    // Negative control: the benchmark proves it can report misses honestly.
    assert.equal(t2.matched, false);
    assert.equal(t2.matchLevel, 'NO_MATCH');
    assert.equal(report.hitRate, 0.5);
  });

  it('replaying the same spec reproduces the same replayChecksum', async () => {
    const spec = REDISCOVERY_SPECS.find((s) => s.specId === 'rediscovery-materials-physics-2003');
    assert.ok(spec);
    const a = await replayRediscoverySpec(spec);
    const b = await replayRediscoverySpec(spec, { runIndex: 0 });
    assert.equal(a.replayChecksum, b.replayChecksum);
    assert.deepEqual(a.targetResults.map((r) => [r.targetId, r.matchLevel]),
      b.targetResults.map((r) => [r.targetId, r.matchLevel]));
  });
});

// ─── Honesty guards on rendering ─────────────────────────────────────────────

describe('rendering honesty guards', () => {
  it('every rendered report carries the leakage disclaimer and offline probe status', async () => {
    const spec = REDISCOVERY_SPECS.find((s) => s.specId === 'rediscovery-molecular-biology-1997');
    assert.ok(spec);
    const report = await replayRediscoverySpec(spec);
    const text = renderRediscoveryReport(report);
    assert.ok(text.includes(LEAKAGE_DISCLAIMER), 'disclaimer must appear verbatim');
    assert.ok(text.includes('NOT_RUN_OFFLINE'), 'probe status must be visible');
    assert.ok(text.includes('CANNOT_BE_EXCLUDED_OFFLINE'));
    const t2 = report.targetResults.find((r) => r.targetId === 'crispr-cas9-programmable-cleavage');
    assert.ok(t2?.matched);
    assert.equal(t2?.matchLevel, 'L3_SEMANTIC');
  });

  it('assertNoCapabilityScore throws on forbidden score language', () => {
    assert.throws(() => assertNoCapabilityScore('overall discovery capability score: 0.9'), /forbidden/);
    assert.doesNotThrow(() => assertNoCapabilityScore('hit rate (this run): 0.500'));
  });
});
