// tests/discovery/adjudication.test.ts
// KERNEL_ADJUDICATED 回流（2.md §2.4）的契约：
//   - 编译门：观察必须「决断」——landscape/FAILED/非显著一律 REFUSED（无假裁决）
//   - 度量覆盖代理：预测文本必须提及相关/关联词族（必要非充分，声明在案）
//   - 方向推导：positive/negative 关键词族 → gt/lt 阈值契约；双向或无线索 → REFUSED
//   - 内核裁决：显著同向 → CONFIRMED；显著反向 → REFUTED（五值内核权威）
//   - 台账回流：未注册 CORROBORATED 拒绝；注册后追加 state_transition 行（evidence.adjudication 载 verdict）；
//     幂等（同 contentHash+state 跳过）；断链台账拒绝追加
//   - run 级裁决史：appendAdjudicationLog 追加+supersede（不重写）
//   - 记忆联动：REFUTED → markKernelRefuted 失效分支（不删除）

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  adjudicateRunObservation,
  decideAdjudication,
  recordKernelAdjudication,
  appendAdjudicationLog,
  readAdjudicationLog,
  runAdjudicationFlow,
} from '../../src/discovery/adjudication.ts';
import {
  buildDiscoveryRegistryRecord,
  registerRunDiscoveries,
  readDiscoveryRegistry,
  verifyDiscoveryRegistryChain,
  hypothesisContentHash,
  type RegistryProvenance,
} from '../../src/discovery/registry.ts';
import { recordRunToMemory } from '../../src/research/memory.ts';
import type { Observation, ResearchRun, HypothesisCandidate } from '../../src/research/types.ts';

const FIXED_NOW = () => new Date('2026-08-15T12:00:00.000Z');

function candidate(id: string, prediction: string): HypothesisCandidate {
  return {
    id,
    statement: `statement ${id}`,
    mechanism: `mechanism ${id}`,
    falsificationMethod: {
      prediction,
      metric: 'pearson r',
      comparator: 'gt',
      value: 0,
    },
    supportingCitations: ['10.1000/demo'],
    counterEvidenceCitations: [],
    relationToExistingTheory: 'theory',
    alternativeExplanations: [],
    observablePredictions: [],
    distinguishingObservations: [],
    noveltyRelativeToCorpus: 'novel',
    assumptions: [],
    risks: [],
    strategyOrigin: 'induction',
  };
}

function doc(doi: string) {
  return {
    documentId: `doc-${doi}`,
    sourceType: 'openalex' as const,
    sourceName: 'OpenAlex',
    title: 't',
    authors: [],
    year: 2024,
    doi,
    persistentIdentifier: doi,
    url: 'u',
    canonicalUrl: 'https://example.org/canonical',
    publicationDate: '2024-01-01',
    retrievedAt: '2026-08-15T00:00:00.000Z',
    retrievalQuery: 'q',
    retrievalMethod: 'live',
    citation: 'c',
    abstract: null,
    contentHash: 'x'.repeat(64),
    rawHash: 'r'.repeat(64),
    normalizedHash: 'n'.repeat(64),
    parserVersion: 'p1',
    licenseMetadata: null,
  };
}

function exoplanetObservation(overrides: {
  pearsonR?: number | null;
  significant?: boolean;
  status?: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  affects?: readonly string[];
} = {}): Observation {
  const pearsonR = overrides.pearsonR ?? 0.42;
  const significant = overrides.significant ?? true;
  return {
    id: 'obs-test-0001',
    adapter: 'exoplanet-archive-radius-insolation',
    affectsHypothesisIds: overrides.affects ?? ['h-1'],
    result: {
      status: overrides.status ?? 'SUCCESS',
      n: 142,
      excludedMissing: 3,
      pearsonR,
      pValue: significant ? 0.001 : 0.4,
      confidenceInterval: significant ? [0.27, 0.56] : [-0.1, 0.2],
      significantAt05: significant,
      meanInsolation: 120.5,
      params: {
        minRadiusEarth: 6,
        maxPeriodDays: 10,
        confidenceLevel: 0.95,
        source: 'plan',
      },
      inputHash: 'i'.repeat(64),
      analyzedAt: '2026-08-15T11:00:00.000Z',
      summary: 'significant positive correlation',
    },
    datasetCard: {
      source: 'nasa-exoplanet-archive',
      sourceUrl: 'https://exoplanetarchive.ipac.caltech.edu/',
      version: 'v1',
      persistentId: 'pid',
      license: 'CC0',
      downloadedAt: '2026-08-15T10:00:00.000Z',
      query: 'hot jupiters',
      rawChecksum: 'c'.repeat(64),
      rowCount: 145,
      fields: ['pl_radius', 'pl_orbper'],
      units: { pl_radius: 'Earth radii' },
      missingNotes: [],
      qualityNotes: [],
      allowedInference: 'association',
      forbiddenInference: 'causation',
      reproductionCommand: 'far research analyze',
      fetchMode: 'RECORDED_REPLAY',
    },
    mode: 'RECORDED_REPLAY',
    producedAt: '2026-08-15T11:00:00.000Z',
  };
}

function landscapeObservation(): Observation {
  return {
    id: 'obs-landscape-1',
    adapter: 'literature-landscape',
    affectsHypothesisIds: ['h-1'],
    result: {
      kind: 'literature-landscape',
      snapshotId: 'snap',
      rootHash: 'r'.repeat(64),
      totalDocuments: 10,
      supportingDocuments: 8,
      counterEvidenceDocuments: 2,
      counterEvidenceShare: 0.2,
      medianPublicationYear: 2020,
      unknownYearDocuments: 1,
      freshShare: 0.6,
      sourceFamilies: ['openalex'],
      queryCount: 3,
      producedAt: '2026-08-15T11:00:00.000Z',
    },
    datasetCard: {
      source: 'run corpus',
      sourceUrl: 'about:blank',
      version: 'v1',
      persistentId: 'snap',
      license: 'mixed',
      downloadedAt: '2026-08-15T10:00:00.000Z',
      checksumField: 'rootHash',
      checksumValue: 'r'.repeat(64),
      fields: ['title', 'abstract'],
      knownBias: 'openalex-only',
      allowedInference: 'descriptive',
      forbiddenInference: 'causal',
    },
    mode: 'RECORDED_REPLAY',
    producedAt: '2026-08-15T11:00:00.000Z',
  };
}

function liveRun(prediction: string): ResearchRun {
  const primary = candidate('h-1', prediction);
  return {
    runId: 'run-adj',
    question: 'do hot jupiters inflate with irradiation?',
    gateReport: {
      question: 'q?',
      verdict: 'RESEARCHABLE',
      reasons: [],
      safetyRisks: [],
      scope: { domain: 'astronomy', domainHints: [], questionLength: 2 },
      decomposition: null,
      requiresEthicsGate: false,
      assessedAt: 't',
      schemaVersion: 1,
    },
    corpus: {
      snapshotId: 'snap',
      rootHash: 'h'.repeat(64),
      documentCount: 1,
      documents: [doc('10.1000/a')],
      sourceQueries: ['q'],
      createdAt: 't',
    },
    hypotheses: [primary],
    bindings: {
      'h-1': {
        supportingIds: ['10.1000/a'],
        counterIds: [],
        boundSupporting: [doc('10.1000/a')],
        boundCounter: [],
        unbound: [],
        allBound: true,
        snapshotId: 'snap',
        relations: [],
      },
    },
    critiques: {},
    scorecards: {},
    discovery: null,
    plan: {
      objectives: [],
      primaryHypothesisId: 'h-1',
      alternativeHypothesisIds: [],
      preregisteredPredictions: [],
      dataRequirements: [],
      inclusionExclusionCriteria: [],
      variables: [],
      design: 'd',
      analysisDag: [],
      tools: [],
      statisticalMethods: [],
      sampleSizeRationale: 's',
      multiplicityHandling: 'm',
      missingOutlierStrategy: 'x',
      stoppingConditions: [],
      checkpoints: [],
      budget: 'b',
      risks: [],
      reproducibility: [],
      nextRoundDecisionRules: [],
      humanApprovalRequired: [],
    },
    revisions: [],
    observations: [],
    stageReceipts: [],
    citationGate: {
      boundRate: 1, totalCited: 0, boundCount: 0, unboundEvidenceCount: 0,
      resolvedViaRetrieval: [], perHypothesis: {},
      primaryRequiresAllBound: true, primaryAllBound: true, gateVerdict: 'PASS',
    },
    falsifiabilityGate: { perHypothesis: { 'h-1': { passed: true, errors: [] } }, allPassed: true },
    environment: { gitCommit: null, gitDirty: null, nodeVersion: 'v', platform: 't', lockfileHash: null, packageVersion: null },
    modes: { modelExecutionMode: 'LIVE', retrievalExecutionMode: 'LIVE', experimentExecutionMode: 'NOT_EXECUTED' },
    runMode: 'LIVE',
    startedAt: 't',
    schemaVersion: 4,
  } satisfies ResearchRun;
}

describe('adjudicateRunObservation — compile gates (no fake adjudication)', () => {
  it('REFUSED no_observation_for_hypothesis when the observation targets another hypothesis', () => {
    const run = liveRun('a positive correlation exists');
    const out = adjudicateRunObservation({
      run,
      hypothesisId: 'h-other',
      observation: exoplanetObservation(),
    });
    assert.equal(out.status, 'REFUSED');
    assert.equal(out.reason, 'no_observation_for_hypothesis');
  });

  it('REFUSED observation_not_decisive for landscape recommendations', () => {
    const out = adjudicateRunObservation({ run: liveRun('positive correlation'), observation: landscapeObservation() });
    assert.equal(out.status, 'REFUSED');
    assert.equal(out.reason, 'observation_not_decisive');
  });

  it('REFUSED observation_not_decisive for FAILED analysis (null preserved)', () => {
    const out = adjudicateRunObservation({
      run: liveRun('positive correlation'),
      observation: exoplanetObservation({ status: 'FAILED', pearsonR: null, significant: false }),
    });
    assert.equal(out.reason, 'observation_not_decisive');
  });

  it('REFUSED observation_not_decisive for non-significant results (no ladder climb on a null)', () => {
    const out = adjudicateRunObservation({
      run: liveRun('positive correlation'),
      observation: exoplanetObservation({ significant: false, pearsonR: 0.05 }),
    });
    assert.equal(out.reason, 'observation_not_decisive');
  });

  it('REFUSED metric_not_covered when the prediction never mentions the correlation family', () => {
    const out = adjudicateRunObservation({
      run: liveRun('the mean radius exceeds 8 Earth radii'),
      observation: exoplanetObservation(),
    });
    assert.equal(out.reason, 'metric_not_covered');
  });

  it('REFUSED direction_unknown when the prediction has no derivable direction', () => {
    const out = adjudicateRunObservation({
      run: liveRun('radius correlates with insolation in some way'),
      observation: exoplanetObservation(),
    });
    assert.equal(out.reason, 'direction_unknown');
  });

  it('COMPILED with gt threshold for a positive prediction', () => {
    const out = adjudicateRunObservation({
      run: liveRun('a positive correlation between insolation and radius'),
      observation: exoplanetObservation({ pearsonR: 0.42 }),
    });
    assert.equal(out.status, 'COMPILED');
    assert.equal(out.thresholdSemantics, 'gt');
    assert.equal(out.evidence!.metricValue, 0.42);
  });
});

describe('decideAdjudication — kernel authority (five-value)', () => {
  it('significant positive r + positive prediction → CONFIRMED', () => {
    const out = decideAdjudication(
      adjudicateRunObservation({
        run: liveRun('a positive correlation exists'),
        observation: exoplanetObservation({ pearsonR: 0.42, significant: true }),
      }),
    );
    assert.equal(out.status, 'VERDICT');
    assert.equal(out.verdict, 'CONFIRMED');
  });

  it('significant NEGATIVE r + positive prediction → REFUTED (direction mismatch)', () => {
    const out = decideAdjudication(
      adjudicateRunObservation({
        run: liveRun('a positive correlation exists'),
        observation: exoplanetObservation({ pearsonR: -0.38, significant: true }),
      }),
    );
    assert.equal(out.status, 'VERDICT');
    assert.equal(out.verdict, 'REFUTED');
  });

  it('significant negative r + negative prediction → CONFIRMED (direction honored)', () => {
    const out = decideAdjudication(
      adjudicateRunObservation({
        run: liveRun('radius decreases with stellar metallicity correlation'),
        observation: exoplanetObservation({ pearsonR: -0.31, significant: true }),
      }),
    );
    assert.equal(out.status, 'VERDICT');
    assert.equal(out.verdict, 'CONFIRMED');
  });

  it('REFUSED inputs never reach the kernel', () => {
    const out = decideAdjudication({ status: 'REFUSED', reason: 'direction_unknown' });
    assert.equal(out.status, 'REFUSED');
    assert.equal(out.reason, 'direction_unknown');
  });
});

describe('recordKernelAdjudication — registry backflow', () => {
  function registeredLedger(dir: string, run: ResearchRun): string {
    const ledger = join(dir, 'registry.jsonl');
    registerRunDiscoveries(run, { ledgerPath: ledger, now: FIXED_NOW });
    return ledger;
  }

  it('REFUSED not_registered_corroborated when the hypothesis never registered', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-adj-'));
    try {
      const ledger = join(dir, 'fresh.jsonl');
      const run = liveRun('a positive correlation exists');
      const out = recordKernelAdjudication({
        run,
        hypothesisId: 'h-1',
        observation: exoplanetObservation(),
        adjudication: { verdict: 'CONFIRMED', observationId: 'obs-1', adapter: 'exoplanet-archive-radius-insolation', metricValue: 0.42 },
        ledgerPath: ledger,
        now: FIXED_NOW,
      });
      assert.equal(out.status, 'REFUSED');
      assert.equal(out.reason, 'not_registered_corroborated');
      assert.equal(readDiscoveryRegistry(ledger).length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('APPENDED: state_transition line with typed adjudication evidence; chain stays valid', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-adj-'));
    try {
      const run = liveRun('a positive correlation exists');
      const ledger = registeredLedger(dir, run);
      const out = recordKernelAdjudication({
        run,
        hypothesisId: 'h-1',
        observation: exoplanetObservation(),
        adjudication: { verdict: 'CONFIRMED', observationId: 'obs-test-0001', adapter: 'exoplanet-archive-radius-insolation', metricValue: 0.42 },
        ledgerPath: ledger,
        now: FIXED_NOW,
      });
      assert.equal(out.status, 'APPENDED');
      const records = readDiscoveryRegistry(ledger);
      assert.equal(records.length, 2);
      const transition = records[1]!;
      assert.equal(transition.kind, 'state_transition');
      assert.equal(transition.state, 'KERNEL_ADJUDICATED');
      assert.equal(transition.evidence.adjudication?.verdict, 'CONFIRMED');
      assert.equal(transition.evidence.adjudication?.observationId, 'obs-test-0001');
      assert.equal(transition.contentHash, hypothesisContentHash(run.hypotheses[0]!));
      assert.ok(verifyDiscoveryRegistryChain(records).valid);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('idempotent: a second adjudication of the same content SKIPS (single KERNEL_ADJUDICATED line)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-adj-'));
    try {
      const run = liveRun('a positive correlation exists');
      const ledger = registeredLedger(dir, run);
      const args = {
        run,
        hypothesisId: 'h-1',
        observation: exoplanetObservation(),
        adjudication: { verdict: 'REFUTED', observationId: 'obs-2', adapter: 'exoplanet-archive-radius-insolation', metricValue: -0.2 } as const,
        ledgerPath: ledger,
        now: FIXED_NOW,
      };
      const first = recordKernelAdjudication(args);
      assert.equal(first.status, 'APPENDED');
      const second = recordKernelAdjudication(args);
      assert.equal(second.status, 'SKIPPED_DUPLICATE');
      assert.equal(readDiscoveryRegistry(ledger).length, 2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('registry evidence field is additive — pre-b5 records without it stay valid', () => {
    const provenance: RegistryProvenance = {
      corpusSnapshotId: 's', corpusRootHash: 'a'.repeat(64), modelProfile: 'live',
      supportingCitations: [], counterEvidenceCitations: [], receiptsDigest: 'b'.repeat(64),
    };
    const legacy = buildDiscoveryRegistryRecord({
      kind: 'registration', sequence: 1, contentHash: 'c'.repeat(64),
      registeredAt: FIXED_NOW().toISOString(), state: 'CORROBORATED',
      question: 'q', runId: 'r', provenance,
      evidence: { deterministicCheckRef: 'x' }, prevRecordHash: '',
    });
    assert.equal(legacy.evidence.adjudication, undefined, 'absent on legacy lines = not recorded then');
  });
});

describe('run-scoped adjudication log (bitemporal verdict history)', () => {
  it('appends and supersedes — a flipped verdict keeps both entries', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-adjlog-'));
    try {
      const runFile = join(dir, 'run.json');
      writeFileSync(runFile, '{}', 'utf8');
      const first = appendAdjudicationLog(runFile, {
        recordedAt: '2026-08-15T12:00:00.000Z', hypothesisId: 'h-1', observationId: 'obs-1',
        adapter: 'a', verdict: 'CONFIRMED', metricValue: 0.42, claim: 'c',
      });
      assert.equal(first.length, 1);
      const second = appendAdjudicationLog(runFile, {
        recordedAt: '2026-08-16T12:00:00.000Z', hypothesisId: 'h-1', observationId: 'obs-2',
        adapter: 'a', verdict: 'REFUTED', metricValue: -0.31, claim: 'c',
      });
      assert.equal(second.length, 2);
      assert.equal(second[0]!.supersededBy, second[1]!.id, 'first verdict superseded, never rewritten');
      assert.equal(second[1]!.supersededBy, undefined);
      const reread = readAdjudicationLog(runFile);
      assert.deepEqual(reread.map((e) => e.verdict), ['CONFIRMED', 'REFUTED']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('readAdjudicationLog on a run without history → empty', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-adjlog2-'));
    try {
      assert.equal(readAdjudicationLog(join(dir, 'run.json')).length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('runAdjudicationFlow — end-to-end wiring', () => {
  it('REFUTED verdict invalidates memory branches (kernel_refuted, never deleted)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-adjflow-'));
    try {
      const run = liveRun('a positive correlation exists');
      const ledger = join(dir, 'registry.jsonl');
      const memoryPath = join(dir, 'memory.json');
      registerRunDiscoveries(run, { ledgerPath: ledger, now: FIXED_NOW });
      recordRunToMemory(run, { memoryPath, now: FIXED_NOW });
      const result = runAdjudicationFlow({
        run,
        observation: exoplanetObservation({ pearsonR: -0.45, significant: true }),
        ledgerPath: ledger,
        memoryPath,
        now: FIXED_NOW,
      });
      assert.ok(result.decision.status === 'VERDICT');
      assert.equal(result.decision.verdict, 'REFUTED');
      assert.equal(result.backflow!.status, 'APPENDED');
      assert.equal(result.memoryRefutedBranches, 1, 'the branch for h-1 was invalidated');
      const memory = JSON.parse(readFileSync(memoryPath, 'utf8')) as { branchTree: { invalidReason: string | null }[] };
      assert.equal(memory.branchTree[0]!.invalidReason, 'kernel_refuted');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('CONFIRMED verdict touches no memory branches', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-adjflow2-'));
    try {
      const run = liveRun('a positive correlation exists');
      const ledger = join(dir, 'registry.jsonl');
      registerRunDiscoveries(run, { ledgerPath: ledger, now: FIXED_NOW });
      const result = runAdjudicationFlow({
        run,
        observation: exoplanetObservation({ pearsonR: 0.42, significant: true }),
        ledgerPath: ledger,
        now: FIXED_NOW,
      });
      assert.ok(result.decision.status === 'VERDICT');
      assert.equal(result.decision.verdict, 'CONFIRMED');
      assert.equal(result.memoryRefutedBranches, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a refused compilation returns no backflow at all', () => {
    const result = runAdjudicationFlow({
      run: liveRun('mean radius exceeds 8 Earth radii'),
      observation: exoplanetObservation(),
      now: FIXED_NOW,
    });
    assert.equal(result.decision.status, 'REFUSED');
    assert.equal(result.backflow, null);
  });
});
