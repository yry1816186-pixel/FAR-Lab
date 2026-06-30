import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  fecAppendClaim,
} from '../../src/fec/index.ts';
import {
  verifyChainHead,
} from '../../src/evidence_log/index.ts';
import type {
  EvidenceRecord,
  FalsificationSpec,
  SourceAnchor,
  ThresholdSpec,
} from '../../src/falsifiability/index.ts';
import { runMigrations } from '../../src/db/index.ts';

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

test('fecAppendClaim links call_records, evidence_log, and verdict_nodes', () => {
  const db = openDb();
  try {
    const evidences: EvidenceRecord[] = [
      {
        claim: 'measured accuracy is 0.91',
        metricValue: 0.91,
        supportsClaim: false,
        refutesClaim: true,
        scopeNarrowerThanClaim: false,
        sourceAnchor,
      },
    ];

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
      evidences,
      parentVerdictId: null,
      nodeKind: 'hypothesis',
    });

    assert.equal(result.callRecord.seq, 1);
    assert.equal(result.evidence.callRecordSeq, 1);
    assert.equal(result.decision.verdict, 'CONFIRMED');
    assert.equal(result.verdictNode.evidenceId, result.evidence.evidenceId);
    assert.equal(result.verdictNode.verdict, 'CONFIRMED');
    assert.equal(verifyChainHead(db).ok, true);

    const counts = db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM call_records) AS call_count,
          (SELECT COUNT(*) FROM evidence_log) AS evidence_count,
          (SELECT COUNT(*) FROM verdict_nodes) AS verdict_count`,
      )
      .get() as { call_count: number; evidence_count: number; verdict_count: number };
    assert.deepEqual(counts, {
      call_count: 1,
      evidence_count: 1,
      verdict_count: 1,
    });
  } finally {
    db.close();
  }
});

test('fecAppendClaim rolls back all rows when falsifiability gate fails', () => {
  const db = openDb();
  try {
    assert.throws(
      () =>
        fecAppendClaim(db, {
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
          falsificationSpec: {
            ...falsificationSpec,
            prediction: '',
          },
          thresholdSpec,
          evidences: [],
          parentVerdictId: null,
          nodeKind: 'hypothesis',
        }),
      /prediction is empty/,
    );

    const counts = db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM call_records) AS call_count,
          (SELECT COUNT(*) FROM evidence_log) AS evidence_count,
          (SELECT COUNT(*) FROM verdict_nodes) AS verdict_count`,
      )
      .get() as { call_count: number; evidence_count: number; verdict_count: number };
    assert.deepEqual(counts, {
      call_count: 0,
      evidence_count: 0,
      verdict_count: 0,
    });
  } finally {
    db.close();
  }
});

test('fecAppendClaim preregisters falsifiability contract when contractInput provided (F8 · §2-M2 接线)', () => {
  const db = openDb();
  try {
    const evidences: EvidenceRecord[] = [
      {
        claim: 'measured accuracy is 0.91',
        metricValue: 0.91,
        supportsClaim: false,
        refutesClaim: true,
        scopeNarrowerThanClaim: false,
        sourceAnchor,
      },
    ];

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
      evidences,
      parentVerdictId: null,
      nodeKind: 'hypothesis',
      // F8 预登记(§2-M2 接线):makeVerdict 前锁定可证伪契约。
      contractInput: {
        claimId: 'claim-accuracy-0001',
        measurableImplication: falsificationSpec.prediction,
        metric: falsificationSpec.metric,
        comparator: 'gt',
        thresholdValue: falsificationSpec.falsificationThreshold,
        compiledAt: sourceAnchor.isoTimestamp,
      },
    });

    // F8: contract 预登记成功(原死代码现接线)。
    assert.ok(result.contract);
    assert.match(result.contract.preregistrationHash, /^[0-9a-f]{64}$/);
    assert.equal(result.contract.locked, true);
    assert.equal(result.contract.metric, 'accuracy');
    assert.equal(result.contract.comparator, 'gt');

    const counts = db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM call_records) AS call_count,
          (SELECT COUNT(*) FROM evidence_log) AS evidence_count,
          (SELECT COUNT(*) FROM verdict_nodes) AS verdict_count,
          (SELECT COUNT(*) FROM falsifiability_contracts) AS contract_count`,
      )
      .get() as {
        call_count: number;
        evidence_count: number;
        verdict_count: number;
        contract_count: number;
      };
    assert.deepEqual(counts, {
      call_count: 1,
      evidence_count: 1,
      verdict_count: 1,
      contract_count: 1,
    });
  } finally {
    db.close();
  }
});
