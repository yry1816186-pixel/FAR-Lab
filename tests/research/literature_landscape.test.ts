/**
 * tests/research/literature_landscape.test.ts — domain-general adapter.
 *
 * Pins the adapter that removed the "exoplanet-only" experiment limitation:
 * every run with a non-empty corpus gets an honest deterministic landscape
 * analysis over its OWN grounding corpus (2026-08-14). Verifies: metric
 * computation (support/counter attribution via retrievalQuery, freshness,
 * median year), adapter routing (astro → exoplanet, everything else →
 * landscape), honest interpretation thresholds (skew proposes; healthy mix
 * proposes nothing), and the Observation schema round-trip.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeLiteratureLandscape,
  isCounterEvidenceQuery,
  LANDSCAPE_THRESHOLDS,
} from '../../src/research/adapters/literature_landscape.ts';
import { createCorpusSnapshot } from '../../src/retrieval/corpus.ts';
import type { CorpusSnapshot } from '../../src/retrieval/corpus.ts';
import type { RetrievedDocument } from '../../src/retrieval/types.ts';
import { runPlanExperiment, interpretObservation, isLandscapeObservation } from '../../src/research/experiment.ts';
import { ObservationZod, parseResearchRunJson } from '../../src/research/schemas.ts';
import type { ResearchRun } from '../../src/research/types.ts';

function doc(
  id: string,
  query: string,
  publicationDate: string | null,
  sourceType: RetrievedDocument['sourceType'] = 'openalex',
): RetrievedDocument {
  return {
    documentId: id,
    sourceType,
    sourceName: sourceType === 'openalex' ? 'OpenAlex' : sourceType === 'arxiv' ? 'arXiv' : 'Crossref',
    persistentIdentifier: id,
    doi: null,
    canonicalUrl: `https://example.org/${id}`,
    title: `Doc ${id}`,
    authors: ['A. Author'],
    publicationDate,
    retrievedAt: '2026-08-14T00:00:00.000Z',
    retrievalQuery: query,
    retrievalMethod: 'api-query',
    rawHash: `raw-${id}`,
    normalizedHash: `norm-${id}`,
    parserVersion: '1',
    licenseMetadata: 'cc-by-4.0',
    abstract: null,
  };
}

const Q = 'does intermittent fasting reduce insulin resistance';
const COUNTER_Q = `${Q} null result`;

function corpusOf(docs: readonly RetrievedDocument[], queries: readonly string[]): CorpusSnapshot {
  return createCorpusSnapshot(docs, queries, '2026-08-14T00:00:00.000Z');
}

describe('analyzeLiteratureLandscape (pure metrics)', () => {
  test('attributes documents via retrievalQuery and computes shares', () => {
    const docs = [
      doc('a', Q, '2024-01-01'),
      doc('b', Q, '2025-06-01'),
      doc('c', COUNTER_Q, '2020-01-01'),
      doc('d', `${Q} criticism`, null), // counter + unknown year
    ];
    const corpus = corpusOf(docs, [Q, COUNTER_Q, `${Q} criticism`]);
    const { result } = analyzeLiteratureLandscape(corpus, '2026-08-14T00:00:00.000Z', 2026);
    assert.equal(result.totalDocuments, 4);
    assert.equal(result.supportingDocuments, 2);
    assert.equal(result.counterEvidenceDocuments, 2);
    assert.equal(result.counterEvidenceShare, 0.5);
    assert.equal(result.unknownYearDocuments, 1);
    assert.equal(result.freshShare, 0.5); // 2024 & 2025 are within 5y of 2026
    assert.equal(result.medianPublicationYear, 2024); // median of [2020, 2024, 2025]
    assert.deepEqual([...result.sourceFamilies], ['openalex']);
    assert.equal(result.snapshotId, corpus.snapshotId);
  });

  test('multi-family corpus counts families; empty corpus is all-zero honest', () => {
    const multi = corpusOf(
      [doc('a', Q, '2026-01-01', 'openalex'), doc('b', COUNTER_Q, '2026-01-01', 'crossref')],
      [Q, COUNTER_Q],
    );
    const { result: r1 } = analyzeLiteratureLandscape(multi, 't', 2026);
    assert.deepEqual([...r1.sourceFamilies], ['crossref', 'openalex']);

    const empty = corpusOf([], []);
    const { result: r2 } = analyzeLiteratureLandscape(empty, 't', 2026);
    assert.equal(r2.totalDocuments, 0);
    assert.equal(r2.counterEvidenceShare, 0);
    assert.equal(r2.medianPublicationYear, null);
  });

  test('isCounterEvidenceQuery matches the SSOT adversarial suffixes only', () => {
    for (const q of ['X failure to replicate', 'X null result', 'X no effect', 'X criticism', 'X alternative explanation']) {
      assert.equal(isCounterEvidenceQuery(q), true, q);
    }
    assert.equal(isCounterEvidenceQuery('X mechanism review'), false);
    assert.equal(isCounterEvidenceQuery(Q), false);
  });
});

describe('adapter routing + interpretation', () => {
  const baseRun = (corpus: CorpusSnapshot): ResearchRun => ({
      runId: 'r-land',
      question: Q,
      gateReport: {
        question: Q,
        verdict: 'RESEARCHABLE',
        reasons: [],
        safetyRisks: [],
        scope: { domain: 'endocrinology', domainHints: [], questionLength: 40 },
        decomposition: null,
        requiresEthicsGate: false,
        assessedAt: 't',
        schemaVersion: 1,
      },
      corpus,
      hypotheses: [],
      bindings: {},
      critiques: {},
      scorecards: {},
      plan: {
        objectives: [], primaryHypothesisId: 'h1', alternativeHypothesisIds: [],
        preregisteredPredictions: [], dataRequirements: [], inclusionExclusionCriteria: [],
        variables: [], design: 'd', analysisDag: [], tools: [], statisticalMethods: [],
        sampleSizeRationale: 's', multiplicityHandling: 'm', missingOutlierStrategy: 'x',
        stoppingConditions: [], checkpoints: [], budget: 'b', risks: [], reproducibility: [],
        nextRoundDecisionRules: [], humanApprovalRequired: [],
      },
      revisions: [],
      observations: [],
      stageReceipts: [],
      environment: { gitCommit: null, gitDirty: null, nodeVersion: 'v24', platform: 'test', lockfileHash: null, packageVersion: null },
      modes: { modelExecutionMode: 'RECORDED_REPLAY', retrievalExecutionMode: 'RECORDED_REPLAY', experimentExecutionMode: 'NOT_EXECUTED' },
      runMode: 'RECORDED_REPLAY',
      startedAt: 't',
      schemaVersion: 3,
      citationGate: {
        boundRate: 1, totalCited: 0, boundCount: 0, unboundEvidenceCount: 0, resolvedViaRetrieval: [],
        perHypothesis: {}, primaryRequiresAllBound: true, primaryAllBound: false, gateVerdict: 'PASS',
      },
      falsifiabilityGate: { perHypothesis: {}, allPassed: true },
  });

  test('a non-exoplanet run with a corpus gets the landscape analysis (no more refusal)', async () => {
    // 2/8 counter share → above the 0.10 floor; fresh docs → no triggers.
    const docs = [
      doc('a', Q, '2025-01-01'), doc('b', Q, '2024-01-01'),
      doc('c', COUNTER_Q, '2025-01-01'), doc('d', `${Q} criticism`, '2024-01-01'),
    ];
    const run = baseRun(corpusOf(docs, [Q, COUNTER_Q, `${Q} criticism`]));
    const result = await runPlanExperiment({ run, now: () => new Date('2026-08-14T00:00:00.000Z') });

    assert.equal(isLandscapeObservation(result.observation), true);
    assert.equal(result.observation.adapter === 'literature-landscape' ? result.observation.result.totalDocuments : null, 4);
    assert.equal(result.observation.mode, 'RECORDED_REPLAY');
    assert.deepEqual([...result.feedback.triggers], ['none'], 'balanced mix proposes nothing (never forced)');
    assert.match(result.feedback.text, /no change proposed/);
    assert.equal(result.updatedRun.observations.length, 1);
    assert.equal(result.updatedRun.modes.experimentExecutionMode, 'RECORDED_REPLAY');
  });

  test('confirmation-skewed corpus proposes adversarial retrieval + plan rewrite', async () => {
    // 0/5 counter share → below floor; stale years → below fresh floor.
    const docs = [
      doc('a', Q, '2005-01-01'), doc('b', Q, '2008-01-01'), doc('c', Q, '2001-01-01'),
      doc('d', Q, '2009-01-01'), doc('e', Q, '2003-01-01'),
    ];
    const run = baseRun(corpusOf(docs, [Q]));
    const result = await runPlanExperiment({ run, now: () => new Date('2026-08-14T00:00:00.000Z') });
    assert.ok(isLandscapeObservation(result.observation));
    assert.equal(result.observation.result.counterEvidenceShare, 0);
    assert.equal(result.observation.result.freshShare, 0);
    assert.deepEqual([...result.feedback.triggers], ['new_retrieval', 'plan_rewrite']);
    assert.match(result.feedback.text, /confirmation-skewed/);
    assert.match(result.feedback.text, /updated search window/);
    assert.equal(result.feedback.changesScore, false, 'diagnostics never silently rescore hypotheses');
  });

  test('empty corpus still refused honestly (nothing to analyze)', async () => {
    const run = baseRun(corpusOf([], []));
    await assert.rejects(
      runPlanExperiment({ run }),
      /no available ExperimentAdapter matches this run — the corpus is empty/,
    );
  });

  test('interpretObservation branches per adapter kind', () => {
    // Balanced + fresh corpus → the landscape branch proposes nothing.
    const docs = [doc('a', Q, '2026-01-01'), doc('b', COUNTER_Q, '2025-01-01')];
    const { result } = analyzeLiteratureLandscape(corpusOf(docs, [Q, COUNTER_Q]), 't', 2026);
    const healthy = interpretObservation({
      id: 'x', adapter: 'literature-landscape', affectsHypothesisIds: ['h1'],
      result, datasetCard: {
        source: 's', sourceUrl: 'u', version: 'v', persistentId: 'p', license: 'l',
        downloadedAt: 't', checksumField: 'f', checksumValue: 'c', fields: ['f'],
        knownBias: 'k', allowedInference: 'a', forbiddenInference: 'f',
      },
      mode: 'RECORDED_REPLAY', producedAt: 't',
    });
    assert.deepEqual([...healthy.triggers], ['none']);
    void LANDSCAPE_THRESHOLDS;
  });

  test('landscape observation survives the ResearchRun schema round-trip', async () => {
    const docs = [doc('a', Q, '2025-01-01'), doc('b', COUNTER_Q, '2024-01-01')];
    const run = baseRun(corpusOf(docs, [Q, COUNTER_Q]));
    const { updatedRun } = await runPlanExperiment({ run, now: () => new Date('2026-08-14T00:00:00.000Z') });
    // Direct observation validation…
    const parsed = ObservationZod.safeParse(updatedRun.observations[0]);
    assert.equal(parsed.success, true, parsed.success ? '' : JSON.stringify(parsed.error.issues));
    // …and full-run round-trip.
    const reRun = parseResearchRunJson(JSON.stringify(updatedRun));
    assert.equal(reRun.observations.length, 1);
    assert.ok(isLandscapeObservation(reRun.observations[0]!));
  });
});
