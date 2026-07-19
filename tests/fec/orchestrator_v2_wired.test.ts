import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/index.ts';
import { fecAppendClaim } from '../../src/fec/index.ts';
import { makeValidFec } from './fixtures.ts';
import type {
  EvidenceRecord,
  FalsificationSpec,
  SourceAnchor,
  ThresholdSpec,
} from '../../src/falsifiability/index.ts';

const sourceAnchor: SourceAnchor = {
  gitCommitSha: 'b'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'c'.repeat(64),
};

const falsificationSpec: FalsificationSpec = {
  prediction: 'accuracy should be at least 0.85',
  metric: 'accuracy',
  falsificationThreshold: 0.85,
  thresholdSemantics: 'gt',
};

const thresholdSpec: ThresholdSpec = {
  semantics: 'gt',
  value: 0.85,
};

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

test('verdict_uses_v2_kernel', () => {
  const db = openDb();
  try {
    const metricOnlyEvidence: EvidenceRecord = {
      claim: 'measured accuracy is 0.91',
      metricValue: 0.91,
      supportsClaim: false,
      refutesClaim: true,
      scopeNarrowerThanClaim: false,
      sourceAnchor,
    };

    const result = fecAppendClaim(db, {
      callRecord: {
        stageId: 'stage3_hypothesis',
        cred: {
          modelId: 'offline-replay-fixture',
          dashscopeRequestId: null,
          reproHash: 'a'.repeat(64),
          gitCommitSha: sourceAnchor.gitCommitSha,
          isoTimestamp: sourceAnchor.isoTimestamp,
        },
        payloadKind: 'hypothesis',
        purposeTag: 'hypothesis',
      },
      callAudit: {
        requestPayload: '{"prompt":"claim"}',
        responsePayload: '{"claim":"accuracy should be high"}',
        finishReason: 'stop',
        usageTokensTotal: 12,
      },
      appendOptions: {
        providerProfile: 'offline_replay',
      },
      evidencePayload: {
        claim: 'accuracy should be at least 0.85',
      },
      sourceAnchor,
      claim: 'accuracy should be at least 0.85',
      falsificationSpec,
      thresholdSpec,
      evidences: [metricOnlyEvidence],
      parentVerdictId: null,
      nodeKind: 'hypothesis',
      fecV2: {
        contract: makeValidFec({
          metric: {
            metricKey: 'accuracy',
            description: 'classification accuracy',
            unit: 'unitless',
            computationRef: 'metrics/accuracy.py',
            isDeterministic: false,
          },
          statisticalPlan: {
            primaryMetric: 'accuracy',
            nullHypothesis: 'accuracy < 0.85',
            alternativeHypothesis: 'accuracy >= 0.85',
            alpha: 0.05,
            effectDirection: 'greater',
            confidenceIntervalMethod: 'wilson',
            multipleTestingCorrection: 'none',
            missingDataPolicy: 'none',
            outlierPolicy: 'none',
            stoppingRule: 'fixed-n',
          },
          threshold: {
            value: 0.85,
            unit: 'unitless',
            thresholdSemantics: 'gt',
            preregistered: true,
          },
          direction: 'greater',
        }),
      },
    });

    assert.equal(result.fecGate?.allowed, true);
    assert.equal(result.kernelOutput.decisiveRuleId, 'NO_DECISION_PATH');
    assert.equal(result.kernelOutput.statisticalReport.primaryEffectSize, 0.91);
    assert.equal(result.decision.verdict, 'UNTESTED');
    assert.equal(result.decision.untestedReason, 'NO_DECISION_PATH');
    assert.equal(result.verdictNode.verdict, 'UNTESTED');
  } finally {
    db.close();
  }
});
