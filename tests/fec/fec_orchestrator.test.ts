import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  fecAppendClaim,
} from '../../src/fec/index.ts';
import { makeValidFec } from './fixtures.ts';
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
      fecV2: { contract: makeValidFec() },
    });

    assert.equal(result.callRecord.seq, 1);
    assert.equal(result.evidence.callRecordSeq, 1);
    assert.equal(result.decision.verdict, 'UNTESTED');
    assert.equal(result.kernelOutput.decisiveRuleId, 'NO_DECISION_PATH');
    assert.equal(result.decision.untestedReason, 'NO_DECISION_PATH');
    assert.equal(result.verdictNode.evidenceId, result.evidence.evidenceId);
    assert.equal(result.verdictNode.verdict, 'UNTESTED');
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
          fecV2: { contract: makeValidFec() },
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
      fecV2: { contract: makeValidFec() },
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

type FecArgs = Parameters<typeof fecAppendClaim>[1];

function baseFecArgs(
  evidences: EvidenceRecord[],
  overrides: Partial<FecArgs> = {},
): FecArgs {
  const base: FecArgs = {
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
    fecV2: { contract: makeValidFec() },
  };
  return { ...base, ...overrides, fecV2: overrides.fecV2 ?? base.fecV2 };
}

// metricValue=0.91 > 阈值 0.85：旧 makeVerdict 会重算 supportsClaim 后落 CONFIRMED；
// V2 kernel 需要真实统计字段（adjustedPValue/CI），不能把 metric-only 证据伪造成 confirmed。
const confirmingEvidence: EvidenceRecord = {
  claim: 'measured accuracy is 0.91',
  metricValue: 0.91,
  supportsClaim: false,
  refutesClaim: true,
  scopeNarrowerThanClaim: false,
  sourceAnchor,
};

test('fecAppendClaim.fecV2: 合法 FEC 放行 → metric-only legacy evidence 不得伪造成 CONFIRMED', () => {
  const db = openDb();
  try {
    const result = fecAppendClaim(
      db,
      baseFecArgs([confirmingEvidence], { fecV2: { contract: makeValidFec() } }),
    );
    assert.equal(result.fecGate?.allowed, true);
    assert.equal(result.fecGate?.ciBlocked, false);
    assert.equal(result.kernelOutput.decisiveRuleId, 'NO_DECISION_PATH');
    assert.equal(result.decision.verdict, 'UNTESTED');
    assert.equal(result.decision.untestedReason, 'NO_DECISION_PATH');
  } finally {
    db.close();
  }
});

test('fecAppendClaim.fecV2: 缺/坏 FEC fail-closed UNTESTED，禁止落 CONFIRMED（W2-A 硬门·P0-3 RED→GREEN）', () => {
  const db = openDb();
  try {
    const result = fecAppendClaim(
      db,
      baseFecArgs([confirmingEvidence], {
        // measurableImplication 空 → compileFec 报 FEC_NOT_COMPILABLE（HARD_FAIL_UNTESTED）。
        fecV2: { contract: makeValidFec({ measurableImplication: '' }) },
      }),
    );
    assert.equal(result.fecGate?.allowed, false);
    assert.equal(result.fecGate?.ciBlocked, false);
    // 无门禁时本会 CONFIRMED；W2-A 接线后强制 UNTESTED。
    assert.equal(result.decision.verdict, 'UNTESTED');
    assert.equal(result.verdictNode.verdict, 'UNTESTED');
    assert.match(result.decision.untestedReason ?? '', /FEC_NOT_COMPILABLE/);
  } finally {
    db.close();
  }
});

test('fecAppendClaim.fecV2: LLM_FROZEN → CI 阻断 throw 并回滚事务（§2.3 禁静默吞 LLM-as-judge）', () => {
  const db = openDb();
  try {
    // 测试专用：构造非法 frozenBy 绕过字面量类型（frozenBy 为 'deterministic_freezer' 字面量）。
    const valid = makeValidFec();
    const tampered = {
      ...valid,
      freeze: { ...valid.freeze, frozenBy: 'llm_as_judge' as 'deterministic_freezer' },
    };
    assert.throws(
      () => fecAppendClaim(db, baseFecArgs([confirmingEvidence], { fecV2: { contract: tampered } })),
      /LLM_FROZEN/,
    );
    const counts = db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM call_records) AS call_count,
          (SELECT COUNT(*) FROM verdict_nodes) AS verdict_count`,
      )
      .get() as { call_count: number; verdict_count: number };
    assert.deepEqual(counts, { call_count: 0, verdict_count: 0 });
  } finally {
    db.close();
  }
});
