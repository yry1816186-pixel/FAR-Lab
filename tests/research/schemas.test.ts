/**
 * tests/research/schemas.test.ts — canonical zod schemas for the research domain.
 *
 * Pins four contracts:
 *   1. Round-trip: a live-produced run serializes → parses → validates
 *      (boundary deserialization is fail-closed, not `as`).
 *   2. v2 compatibility: a pre-gate run file upgrades deterministically
 *      (relations + both gates recomputed, discovery: null, schemaVersion → 4).
 *   3. v3 compatibility: a pre-discovery run file upgrades with discovery: null
 *      (absence of accounting ≠ absence of discovery — never fabricated).
 *   4. Rejection: malformed runs fail with the offending path named.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseResearchRunJson,
  validateResearchRun,
  CitationGateReportZod,
  FalsificationMethodZod,
  AdjudicableFalsificationMethodZod,
} from '../../src/research/schemas.ts';
import type { ResearchRun } from '../../src/research/types.ts';

/** A minimal valid v3 run (gates present). */
function minimalV3Run(): unknown {
  return {
    runId: 'r1',
    question: 'q?',
    gateReport: {
      question: 'q?',
      verdict: 'RESEARCHABLE',
      reasons: [],
      safetyRisks: [],
      scope: { domain: 'astronomy', domainHints: [], questionLength: 3 },
      decomposition: null,
      requiresEthicsGate: false,
      assessedAt: 't',
      schemaVersion: 1,
    },
    corpus: { snapshotId: 's', rootHash: 'h', documentCount: 0, documents: [], sourceQueries: [], createdAt: 't' },
    hypotheses: [],
    bindings: {},
    critiques: {},
    scorecards: {},
    plan: {
      objectives: [],
      primaryHypothesisId: 'none',
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
    environment: { gitCommit: null, gitDirty: null, nodeVersion: 'v24', platform: 't', lockfileHash: null, packageVersion: null },
    modes: { modelExecutionMode: 'RECORDED_REPLAY', retrievalExecutionMode: 'RECORDED_REPLAY', experimentExecutionMode: 'NOT_EXECUTED' },
    runMode: 'RECORDED_REPLAY',
    startedAt: 't',
    schemaVersion: 3,
    citationGate: {
      boundRate: 1,
      totalCited: 0,
      boundCount: 0,
      unboundEvidenceCount: 0,
      resolvedViaRetrieval: [],
      perHypothesis: {},
      primaryRequiresAllBound: true,
      primaryAllBound: false,
      gateVerdict: 'PASS',
    },
    falsifiabilityGate: { perHypothesis: {}, allPassed: true },
  };
}

describe('parseResearchRunJson', () => {
  it('validates a v4 run directly (discovery present)', () => {
    const v4 = { ...(minimalV3Run() as Record<string, unknown>), discovery: null, schemaVersion: 4 };
    const run = validateResearchRun(v4);
    assert.equal(run.runId, 'r1');
    assert.equal(run.schemaVersion, 4);
    assert.equal(run.discovery, null);
    assert.equal(run.citationGate.gateVerdict, 'PASS');
  });

  it('rejects a v4-shaped run missing the discovery block (required since v4)', () => {
    const broken = minimalV3Run() as Record<string, unknown>;
    broken.schemaVersion = 4;
    delete broken.discovery;
    assert.throws(() => validateResearchRun(broken), /discovery/);
  });

  it('accepts a valid v3 run through the parse boundary (upgraded: discovery null)', () => {
    const run = parseResearchRunJson(JSON.stringify(minimalV3Run()));
    assert.equal(run.schemaVersion, 4, 'v3 files upgrade to the current shape');
    assert.equal(run.discovery, null, 'pre-discovery accounting is null, never fabricated');
  });

  it('rejects a malformed run and names the offending path', () => {
    const broken = minimalV3Run() as Record<string, unknown>;
    broken.plan = { objectives: [] }; // missing required fields
    assert.throws(() => validateResearchRun(broken), /plan\./);
  });

  it('rejects unknown future schema versions (fail-closed)', () => {
    const future = minimalV3Run() as Record<string, unknown>;
    future.schemaVersion = 99;
    assert.throws(() => validateResearchRun(future), /schemaVersion/);
  });

  it('upgrades a v2 run deterministically (relations + gates recomputed)', () => {
    const v2 = minimalV3Run() as Record<string, unknown>;
    delete v2.citationGate;
    delete v2.falsifiabilityGate;
    v2.schemaVersion = 2;
    const run = parseResearchRunJson(JSON.stringify(v2));
    assert.equal(run.schemaVersion, 4);
    assert.equal(run.discovery, null, 'v2 runs predate discovery persistence entirely');
    assert.equal(run.citationGate.boundRate, 1);
    assert.equal(run.falsifiabilityGate.allPassed, true);
  });
});

describe('CitationGateReportZod', () => {
  it('bounds boundRate to [0,1] and enforces the verdict enum', () => {
    const gate = (minimalV3Run() as { citationGate: Record<string, unknown> }).citationGate;
    assert.throws(() => CitationGateReportZod.parse({ ...gate, boundRate: 2 }), /boundRate/);
    assert.throws(() => CitationGateReportZod.parse({ ...gate, gateVerdict: 'MAYBE' }), /gateVerdict/);
  });
});

// ── b6-S1: structured adjudicability fields on FalsificationMethod ────────────
describe('FalsificationMethodZod — structured adjudicability (b6-S1)', () => {
  const base = { prediction: 'p', metric: 'm', comparator: 'gt', value: 1 };

  it('parses a pre-b6 method with NO adjudicability fields (absent = not recorded)', () => {
    const out = FalsificationMethodZod.parse(base);
    assert.equal(out.direction, undefined);
    assert.equal(out.metricShape, undefined);
  });

  it('parses and preserves valid structured fields', () => {
    const out = FalsificationMethodZod.parse({ ...base, direction: 'either', metricShape: 'ratio' });
    assert.equal(out.direction, 'either');
    assert.equal(out.metricShape, 'ratio');
  });

  it('rejects values outside the closed enums (fail-closed)', () => {
    assert.throws(() => FalsificationMethodZod.parse({ ...base, direction: 'up' }), /direction/);
    assert.throws(() => FalsificationMethodZod.parse({ ...base, metricShape: 'slope' }), /metricShape/);
  });

  it('threshold coherence is orthogonal to the new fields (gt without value still rejected)', () => {
    assert.throws(
      () => FalsificationMethodZod.parse({ prediction: 'p', metric: 'm', comparator: 'gt', direction: 'positive' }),
      /value/,
    );
  });
});

describe('AdjudicableFalsificationMethodZod — new-generation contract (b6-S1)', () => {
  const complete = {
    prediction: 'p', metric: 'm', comparator: 'gt', value: 1,
    direction: 'negative', metricShape: 'difference',
  };

  it('requires direction and metricShape', () => {
    const { direction: _dropD, ...missingDirection } = complete;
    void _dropD;
    const { metricShape: _dropM, ...missingShape } = complete;
    void _dropM;
    assert.throws(() => AdjudicableFalsificationMethodZod.parse(missingDirection), /direction/);
    assert.throws(() => AdjudicableFalsificationMethodZod.parse(missingShape), /metricShape/);
  });

  it('accepts a complete method and keeps threshold coherence', () => {
    const out = AdjudicableFalsificationMethodZod.parse(complete);
    assert.equal(out.direction, 'negative');
    assert.equal(out.metricShape, 'difference');
    assert.throws(
      () => AdjudicableFalsificationMethodZod.parse({ ...complete, comparator: 'range' }),
      /lower/,
    );
  });
});

describe('ResearchRun boundary round-trip preserves the structured fields (b6-S1)', () => {
  it('a run whose hypotheses carry direction/metricShape deserializes with them intact', () => {
    const run = minimalV3Run() as Record<string, unknown>;
    run.discovery = null;
    run.schemaVersion = 4;
    run.hypotheses = [
      {
        id: 'h1',
        statement: 's',
        mechanism: 'm',
        falsificationMethod: {
          prediction: 'p', metric: 'm', comparator: 'lt', value: 0,
          direction: 'negative', metricShape: 'correlation',
        },
        supportingCitations: [], counterEvidenceCitations: [],
        relationToExistingTheory: 't', alternativeExplanations: [],
        observablePredictions: [], distinguishingObservations: [],
        noveltyRelativeToCorpus: 'n', assumptions: [], risks: [],
      },
    ];
    const parsed = validateResearchRun(run);
    assert.equal(parsed.hypotheses[0]!.falsificationMethod.direction, 'negative');
    assert.equal(parsed.hypotheses[0]!.falsificationMethod.metricShape, 'correlation');
  });
});

// The imported type keeps the ResearchRun shape honest in this test module.
export type { ResearchRun };
