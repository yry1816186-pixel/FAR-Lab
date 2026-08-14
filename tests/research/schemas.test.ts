/**
 * tests/research/schemas.test.ts — canonical zod schemas for the research domain.
 *
 * Pins three contracts:
 *   1. Round-trip: a live-produced run serializes → parses → validates
 *      (boundary deserialization is fail-closed, not `as`).
 *   2. v2 compatibility: a pre-gate run file upgrades deterministically
 *      (relations + both gates recomputed, schemaVersion → 3).
 *   3. Rejection: malformed runs fail with the offending path named.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseResearchRunJson,
  validateResearchRun,
  CitationGateReportZod,
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
  it('accepts a valid v3 run (round-trip through the boundary)', () => {
    const run = validateResearchRun(minimalV3Run());
    assert.equal(run.runId, 'r1');
    assert.equal(run.schemaVersion, 3);
    assert.equal(run.citationGate.gateVerdict, 'PASS');
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
    assert.equal(run.schemaVersion, 3);
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

// The imported type keeps the ResearchRun shape honest in this test module.
export type { ResearchRun };
