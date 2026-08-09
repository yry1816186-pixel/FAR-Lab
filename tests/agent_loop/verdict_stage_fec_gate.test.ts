/**
 * verdict_stage FEC 门接线测试（阶段 7 P0-1 SY5-1 修复）。
 *
 * 背景（findings SY5-1 / TK4-1 三重确认）：verdict_stage 生产路径（API/CLI ask）此前跳过
 * compileFec + enforceFecMandatoryGate + assertFecGate（强制门仅在 fec/orchestrator.fecAppendClaim），
 * 且 appendEvidenceLog 仅落裁决摘要、无 canonical 裁决输入锚点——「证据链→裁决」可审计性在
 * 真实用户入口断裂。本测试锁死修复后的契约：
 *
 *   1. computeVerdictDecision 必须经过 FEC 强制门（fecGate 存在且 allowed=true——
 *      legacy FEC 恒编译通过，探针已验证 compileFec(legacyFec).ok === true）。
 *   2. runVerdictStage 落库的 evidence_payload 必须含 verdictInputHash（canonical 锚点），
 *      审计者可重放裁决输入（claim + falsificationSpec + thresholdSpec + evidenceVotes）。
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
import {
  computeVerdictDecision,
  runVerdictStage,
} from '../../src/agent_loop/verdict_stage.ts';
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

function hypothesisArtifact(claim: string): StageArtifact {
  return {
    stageId: 'stage3_hypothesis',
    payloadKind: 'hypothesis',
    structured: {
      kind: 'hypothesis',
      claim,
      falsificationMethod: GT_METHOD,
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

function ev(id: string, dir: 'supports' | 'refutes' | 'neutral'): EvidenceRecord {
  return {
    evidenceId: id,
    supportsOrRefutes: dir,
    entailmentScore: 0.9,
    source: { evidenceId: id, source: 'arxiv', doi: null, title: 't' },
  };
}

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

test('P0-1: computeVerdictDecision passes the FEC mandatory gate (fecGate present, allowed, not CI-blocked)', () => {
  const computation = computeVerdictDecision({
    artifacts: [
      hypothesisArtifact('gate-probe claim'),
      evidenceArtifact([ev('e1', 'supports'), ev('e2', 'supports')]),
    ],
    runId: 'gate-probe-run',
    gitCommitSha: 'b'.repeat(40),
  });
  assert.notEqual(computation, null, 'computation must exist for hypothesis+evidence artifacts');
  // RED 契约：fecGate 字段必须存在（SY5-1 修复前 computeVerdictDecision 不产 fecGate）。
  assert.ok(
    computation !== null && 'fecGate' in computation,
    'computation must carry fecGate (FEC mandatory gate wired)',
  );
  assert.equal(computation!.fecGate.allowed, true, 'legacy FEC compiles → gate allowed');
  assert.equal(computation!.fecGate.ciBlocked, false, 'no LLM_FROZEN → not CI-blocked');
});

test('P0-1: runVerdictStage persists verdictInputHash canonical anchor in evidence_payload', () => {
  const db = openDb();
  seedStage3CallRecord(db);
  const runId = 'anchor-run-001';
  const artifacts = [
    hypothesisArtifact('Hot Jupiters P<1d show |dP/dt|>10ms/yr at >=3sigma'),
    evidenceArtifact([ev('e1', 'supports'), ev('e2', 'refutes')]),
  ];
  // 计算端（纯函数）的 canonical 锚点 = 落库断言基准。
  const computation = computeVerdictDecision({ artifacts, runId, gitCommitSha: 'b'.repeat(40) });
  assert.notEqual(computation, null);
  const expectedHash = computation!.verdictInputHash;
  assert.match(expectedHash, /^[0-9a-f]{64}$/, 'verdictInputHash must be a sha256 hex string');

  try {
    const node = runVerdictStage({ db, artifacts, runId, gitCommitSha: 'b'.repeat(40) });
    assert.notEqual(node, null, 'verdict node must be produced');
    const row = db
      .prepare('SELECT evidence_payload FROM evidence_log ORDER BY rowid DESC LIMIT 1')
      .get() as { evidence_payload: string } | undefined;
    assert.ok(row !== undefined, 'evidence_log row must exist');
    const payload = JSON.parse(row.evidence_payload) as {
      kind?: string;
      verdictInputHash?: string;
      [key: string]: unknown;
    };
    assert.equal(
      payload.kind,
      'hypothesis_verdict_input',
      'latest evidence_log row must be the verdict input summary',
    );
    // RED 契约：payload 必须含 canonical 裁决输入锚点（修复前只有 kind/runId/claim/evidenceCount/conflictingEvidenceCount）。
    assert.equal(
      payload.verdictInputHash,
      expectedHash,
      'evidence_payload must carry verdictInputHash matching the pure-computation anchor',
    );
  } finally {
    db.close();
  }
});
