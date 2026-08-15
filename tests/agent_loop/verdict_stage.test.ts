/**
 * verdict_stage 测试——裁决接通（agent_loop 第 7 阶段）。
 *
 * 历史溯源（已归档）: 07_falsifiability_verdict.md +
 *            41_可证伪证据链_FEC.md（hypothesis→VerdictNode 协议）.
 *
 * 覆盖：
 *   纯转换逻辑：
 *     - convertEvidenceRecords：过滤 neutral + supports/refutes 投票映射 + 不设 metricValue
 *     - resolveThresholdSpec：gt→value / range→lower+upper / range 缺界抛错
 *   runVerdictStage 端到端（真 :memory: DB）：
 *     - 2 supports + 1 neutral → CONFIRMED（全 supports 投票·legacy 桥接 R7·恢复 V1 契约）
 *     - 全 refutes → REFUTED（R6 触发·恢复 V1 契约）
 *     - 全 neutral → UNTESTED（过滤后无投票证据）
 *     - 缺 hypothesis → null
 *     - 缺 evidence → null
 *     - 空证据链 → null
 *     - CONFIRMED 落 evidence_log 行（evidenceId 存在·payload 非空·满足 Red Line #7 守卫）
 *     - 不新建 call_record（链长不变·verifiedCount 仍===seed 数·证明裁决是衍生计算）
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/index.ts';
import { appendRecord } from '../../src/evidence_log/index.ts';
import type {
  AppendRecordOptions,
  ProviderNeutralCredential,
  CallAuditData,
} from '../../src/evidence_log/index.ts';
import { getVerdict } from '../../src/falsifiability/index.ts';
import {
  convertEvidenceRecords,
  resolveThresholdSpec,
  runVerdictStage,
} from '../../src/agent_loop/verdict_stage.ts';
import type { FalsificationSpec, SourceAnchor } from '../../src/falsifiability/index.ts';
import type {
  EvidenceRecord,
  FalsificationMethod,
  LlmResponse,
  StageArtifact,
} from '../../src/agent_loop/types.ts';

const OFFLINE_OPTIONS: AppendRecordOptions = { providerProfile: 'offline_replay' };

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

function fixtureResponse(): LlmResponse {
  return {
    credential: {
      providerProfile: 'offline_replay',
      providerRequestId: null,
      modelId: 'offline-replay-fixture',
      modelVersion: null,
      capability: 'structured',
      isoTimestamp: '2026-06-30T00:00:00.000Z',
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    },
    content: '',
    raw: null,
  };
}

const GT_METHOD: FalsificationMethod = {
  prediction: 'pred',
  metric: 'effect_size_cohens_d',
  comparator: 'gt',
  value: 0.8,
};

function hypothesisArtifact(claim: string, method: FalsificationMethod = GT_METHOD): StageArtifact {
  return {
    stageId: 'stage3_hypothesis',
    payloadKind: 'hypothesis',
    structured: {
      kind: 'hypothesis',
      claim,
      falsificationMethod: method,
      supportingCitations: [],
      scopeSlipText: 'test scope-slip statement',
    },
    callResult: fixtureResponse(),
    degraded: false,
    degradationReason: null,
  };
}

function evidenceArtifact(records: readonly EvidenceRecord[]): StageArtifact {
  return {
    stageId: 'stage4_evidence',
    payloadKind: 'experiment',
    structured: {
      kind: 'evidence',
      evidenceRecords: records,
      conflictingEvidenceCount: 0,
    },
    callResult: fixtureResponse(),
    degraded: false,
    degradationReason: null,
  };
}

const FIXTURE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'b'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-30T00:00:00.000Z',
  rawResponseHash: 'c'.repeat(64),
};

function ev(id: string, dir: 'supports' | 'refutes' | 'neutral'): EvidenceRecord {
  return {
    evidenceId: id,
    supportsOrRefutes: dir,
    entailmentScore: 0.9,
    source: { evidenceId: id, source: 'arxiv', doi: null, title: 't' },
  };
}

/**
 * 种一条 stage3 call_record（裁决 evidence_log 行将关联它的 seq）。
 * 返回 db 便于后续断言链长。
 */
function seedStage3CallRecord(db: Database.Database): void {
  const cred: ProviderNeutralCredential = {
    modelId: 'offline-replay-fixture',
    dashscopeRequestId: null,
    reproHash: 'a'.repeat(64),
    gitCommitSha: 'b'.repeat(40),
    isoTimestamp: '2026-06-30T00:00:00.000Z',
  };
  const audit: CallAuditData = {
    requestPayload: '{"q":1}',
    responsePayload: '{"a":1}',
    finishReason: 'stop',
    usageTokensTotal: 0,
  };
  appendRecord(
    db,
    { stageId: 'stage3_hypothesis', cred, payloadKind: 'hypothesis', purposeTag: 'hypothesis' },
    audit,
    OFFLINE_OPTIONS,
  );
}

function callRecordCount(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM call_records').get() as { n: number };
  return row.n;
}

function verdictNodeCount(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM verdict_nodes').get() as { n: number };
  return row.n;
}

// ==================== 纯转换逻辑 ====================

test('convertEvidenceRecords filters neutral and maps supports/refutes votes (no metricValue)', () => {
  const out = convertEvidenceRecords(
    [ev('e1', 'supports'), ev('e2', 'refutes'), ev('e3', 'neutral')],
    'claim-x',
    FIXTURE_ANCHOR,
  );
  assert.equal(out.length, 2, 'neutral must be filtered (no vote signal)');
  assert.equal(out[0]?.supportsClaim, true);
  assert.equal(out[0]?.refutesClaim, false);
  assert.equal(out[1]?.supportsClaim, false);
  assert.equal(out[1]?.refutesClaim, true);
  for (const r of out) {
    assert.equal(r.claim, 'claim-x');
    assert.equal(r.scopeNarrowerThanClaim, false, 'must not fabricate scope-slip');
    assert.equal(r.sourceAnchor, FIXTURE_ANCHOR, 'must attach verdict-level sourceAnchor');
    assert.equal('metricValue' in r, false, 'must NOT map entailmentScore to metricValue (dimension mismatch)');
  }
});

test('convertEvidenceRecords returns empty for all-neutral evidence', () => {
  const out = convertEvidenceRecords([ev('e1', 'neutral'), ev('e2', 'neutral')], 'c', FIXTURE_ANCHOR);
  assert.equal(out.length, 0);
});

test('resolveThresholdSpec maps gt to {semantics,value}', () => {
  const spec: FalsificationSpec = {
    prediction: 'p',
    metric: 'm',
    falsificationThreshold: 0.8,
    thresholdSemantics: 'gt',
  };
  const ts = resolveThresholdSpec(spec, undefined);
  assert.deepEqual(ts, { semantics: 'gt', value: 0.8 });
});

test('resolveThresholdSpec maps range to {semantics,lower,upper}', () => {
  const spec: FalsificationSpec = {
    prediction: 'p',
    metric: 'm',
    falsificationThreshold: 0,
    thresholdSemantics: 'range',
  };
  const ts = resolveThresholdSpec(spec, { semantics: 'range', lower: 1, upper: 5 });
  assert.deepEqual(ts, { semantics: 'range', lower: 1, upper: 5 });
});

test('resolveThresholdSpec throws when range lacks lower/upper', () => {
  const spec: FalsificationSpec = {
    prediction: 'p',
    metric: 'm',
    falsificationThreshold: 0,
    thresholdSemantics: 'range',
  };
  assert.throws(() => resolveThresholdSpec(spec, undefined), /range semantics require lower\+upper/);
});

// ==================== runVerdictStage 端到端 ====================

test('runVerdictStage: 2 supports + 1 neutral → CONFIRMED + persisted + evidence_log row (no new call_record)', () => {
  const db = openDb();
  seedStage3CallRecord(db);
  const beforeCount = callRecordCount(db);
  try {
    const verdictNode = runVerdictStage({
      db,
      artifacts: [
        hypothesisArtifact('Hot Jupiters P<1d show |dP/dt|>10ms/yr at >=3sigma'),
        evidenceArtifact([ev('e1', 'supports'), ev('e2', 'supports'), ev('e3', 'neutral')]),
      ],
      gitCommitSha: 'b'.repeat(40),
      runId: 'run-001',
    });

    // 裁决产出 + CONFIRMED（demo 同源语义·过滤 neutral 后全 supports·legacy 桥接 R7·恢复 V1 契约）。
    assert.ok(verdictNode !== null, 'happy path must produce a non-null verdict');
    assert.equal(verdictNode.verdict, 'CONFIRMED');
    assert.equal(verdictNode.nodeKind, 'root');
    assert.equal(verdictNode.parentVerdictId, null);

    // 持久化：verdict_nodes 落一行·getVerdict 读回一致
    assert.equal(verdictNodeCount(db), 1);
    const reread = getVerdict(db, verdictNode.verdictId);
    assert.ok(reread !== null);
    assert.equal(reread.verdict, 'CONFIRMED');

    // CONFIRMED 守卫（Red Line #7）：evidenceId 在 evidence_log 有非空 payload
    const evRow = db
      .prepare('SELECT evidence_payload FROM evidence_log WHERE evidence_id = ?')
      .get(verdictNode.evidenceId) as { evidence_payload?: string } | undefined;
    assert.ok(evRow !== undefined, 'CONFIRMED must have an evidence_log row');
    assert.ok(
      (evRow.evidence_payload ?? '').length > 0,
      'CONFIRMED evidence_payload must be non-empty (Red Line #7)',
    );

    // 不新建 call_record（裁决是衍生计算·复用既有链）
    assert.equal(callRecordCount(db), beforeCount, 'verdict stage must NOT append a call_record');
  } finally {
    db.close();
  }
});

test('runVerdictStage: all refutes → REFUTED (R6 fires on decisive vote)', () => {
  const db = openDb();
  seedStage3CallRecord(db);
  try {
    const verdictNode = runVerdictStage({
      db,
      artifacts: [
        hypothesisArtifact('claim-r'),
        evidenceArtifact([ev('e1', 'refutes'), ev('e2', 'refutes')]),
      ],
      gitCommitSha: 'b'.repeat(40),
      runId: 'run-002',
    });
    assert.ok(verdictNode !== null);
    // evidenceToStatisticalResult 注入 adjustedPValue=0 → refutes 显著 → R6 REFUTED（恢复 V1 契约）。
    assert.equal(verdictNode.verdict, 'REFUTED');
  } finally {
    db.close();
  }
});

test('runVerdictStage: all neutral → UNTESTED (no vote evidence after filter)', () => {
  const db = openDb();
  seedStage3CallRecord(db);
  try {
    const verdictNode = runVerdictStage({
      db,
      artifacts: [
        hypothesisArtifact('claim-u'),
        evidenceArtifact([ev('e1', 'neutral'), ev('e2', 'neutral')]),
      ],
      gitCommitSha: 'b'.repeat(40),
      runId: 'run-003',
    });
    assert.ok(verdictNode !== null);
    assert.equal(verdictNode.verdict, 'UNTESTED');
    assert.ok(
      verdictNode.untestedReason !== null && verdictNode.untestedReason.length > 0,
      'UNTESTED must carry a non-empty reason',
    );
  } finally {
    db.close();
  }
});

test('runVerdictStage: missing hypothesis artifact → null', () => {
  const db = openDb();
  seedStage3CallRecord(db);
  try {
    const verdictNode = runVerdictStage({
      db,
      artifacts: [evidenceArtifact([ev('e1', 'supports')])],
      gitCommitSha: 'b'.repeat(40),
      runId: 'run-004',
    });
    assert.equal(verdictNode, null);
    assert.equal(verdictNodeCount(db), 0, 'no verdict must be persisted on missing hypothesis');
  } finally {
    db.close();
  }
});

test('runVerdictStage: missing evidence artifact → null', () => {
  const db = openDb();
  seedStage3CallRecord(db);
  try {
    const verdictNode = runVerdictStage({
      db,
      artifacts: [hypothesisArtifact('claim-m')],
      gitCommitSha: 'b'.repeat(40),
      runId: 'run-005',
    });
    assert.equal(verdictNode, null);
  } finally {
    db.close();
  }
});

test('runVerdictStage: empty evidence chain (no call_records) → null', () => {
  const db = openDb();
  // 不 seed 任何 call_record
  try {
    const verdictNode = runVerdictStage({
      db,
      artifacts: [hypothesisArtifact('claim-e'), evidenceArtifact([ev('e1', 'supports')])],
      gitCommitSha: 'b'.repeat(40),
      runId: 'run-006',
    });
    assert.equal(verdictNode, null, 'empty chain cannot anchor evidence_log row → null verdict');
  } finally {
    db.close();
  }
});
