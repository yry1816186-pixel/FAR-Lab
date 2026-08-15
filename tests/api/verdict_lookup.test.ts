// tests/api/verdict_lookup.test.ts
//
// F-5-10-003 RED→GREEN: fetchHonestVerdictByEvidenceId 必须返回当前活跃（未被 supersede）的裁决,
// 而非 ORDER BY created_at ASC 的最旧裁决。
//
// 旧实现（bug）: SELECT verdict_id FROM verdict_nodes WHERE evidence_id=? ORDER BY created_at ASC LIMIT 1
//   → supersede 后返回已被取代的 old verdict（correctness bug·与 getActiveVerdicts 语义不一致）。
// 新实现（修复）: 加 AND superseded_by IS NULL + ORDER BY created_at DESC → 返回最新活跃裁决。
//
// 单一真实依赖: 真实 recordVerdict + supersedeVerdict 落库 →
// fetchHonestVerdictByEvidenceId SQL 查询。非 Fake 后端、非硬编码指标。
//
// Authority: F-5-10-003 + src/falsifiability/repository.ts:197 getActiveVerdicts（WHERE superseded_by IS NULL）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/index.ts';
import {
  appendEvidenceLog,
  appendRecord,
  GENESIS_PREV_HASH,
} from '../../src/evidence_log/index.ts';
import {
  recordVerdict,
  supersedeVerdict,
} from '../../src/falsifiability/index.ts';
import { fetchHonestVerdictByEvidenceId } from '../../src/api/internal/verdict_lookup.ts';
import type {
  FalsificationSpec,
  RecordVerdictArgs,
  SourceAnchor,
  ThresholdSpec,
  VerdictTracePersisted,
} from '../../src/falsifiability/index.ts';
import { FIXTURE_VERDICT_TRACE } from '../falsifiability/_verdict_trace_fixture.ts';

const SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'b'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'c'.repeat(64),
};

const BASE_SPEC: FalsificationSpec = {
  prediction: 'accuracy should be at least 0.85',
  metric: 'accuracy',
  falsificationThreshold: 0.85,
  thresholdSemantics: 'gt',
};

const BASE_THRESHOLD: ThresholdSpec = { semantics: 'gt', value: 0.85 };

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

function seedEvidence(db: Database.Database, evidenceId: string): void {
  const record = appendRecord(
    db,
    {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'a'.repeat(64),
        gitCommitSha: SOURCE_ANCHOR.gitCommitSha,
        isoTimestamp: SOURCE_ANCHOR.isoTimestamp,
      },
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
      prevHash: GENESIS_PREV_HASH,
    },
    {
      requestPayload: '{}',
      responsePayload: '{}',
      finishReason: 'stop',
      usageTokensTotal: 0,
    },
    {
      providerProfile: 'offline_replay',
    },
  );
  appendEvidenceLog(db, {
    evidenceId,
    callRecordSeq: record.seq,
    evidencePayload: { claim: 'verdict_lookup fixture' },
    sourceAnchor: SOURCE_ANCHOR,
  });
}

function makeVerdictArgs(
  evidenceId: string,
  verdict: RecordVerdictArgs['verdict'],
  trace: VerdictTracePersisted,
  untestedReason: string | null = null,
): RecordVerdictArgs {
  return {
    evidenceId,
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    verdict,
    falsificationSpec: BASE_SPEC,
    thresholdSpec: BASE_THRESHOLD,
    metricValue: null,
    conflictingEvidenceCount: 0,
    scopeSlipText: null,
    untestedReason,
    sourceAnchor: SOURCE_ANCHOR,
    replayProver: null,
    verdictTrace: trace,
  };
}

test('fetchHonestVerdictByEvidenceId: supersede 后返回最新活跃裁决（非最旧）', () => {
  const db = openDb();
  try {
    seedEvidence(db, 'ev-lookup');
    const oldVerdict = recordVerdict(
      db,
      makeVerdictArgs('ev-lookup', 'INCONCLUSIVE', FIXTURE_VERDICT_TRACE, 'initial'),
    );
    const { newVerdict } = supersedeVerdict(db, {
      oldVerdictId: oldVerdict.verdictId,
      newVerdictArgs: makeVerdictArgs('ev-lookup', 'REFUTED', {
        reasonCodes: ['R5_REFUTED'],
        ruleTrace: [{ ruleId: 'R5_REFUTED', triggered: true }],
        decisiveRuleId: 'R5_REFUTED',
        evidenceSufficiency: { status: 'sufficient', powerStatus: 'adequate' },
      }),
    });

    const honest = fetchHonestVerdictByEvidenceId(db, 'ev-lookup');
    assert.notEqual(honest, null, '须返回非 null 活跃裁决');
    assert.equal(honest?.verdictId, newVerdict.verdictId, '须返回 new（活跃）而非 old（已 supersede）');
    assert.equal(honest?.verdict, 'REFUTED', '活跃裁决值须为 REFUTED');
  } finally {
    db.close();
  }
});

test('fetchHonestVerdictByEvidenceId: 无裁决时返回 null', () => {
  const db = openDb();
  try {
    seedEvidence(db, 'ev-empty');
    const honest = fetchHonestVerdictByEvidenceId(db, 'ev-empty');
    assert.equal(honest, null);
  } finally {
    db.close();
  }
});

test('fetchHonestVerdictByEvidenceId: 无 supersede 时返回唯一活跃裁决', () => {
  const db = openDb();
  try {
    seedEvidence(db, 'ev-single');
    const v = recordVerdict(
      db,
      makeVerdictArgs('ev-single', 'CONFIRMED', {
        reasonCodes: ['R3_CONFIRMED'],
        ruleTrace: [{ ruleId: 'R3_CONFIRMED', triggered: true }],
        decisiveRuleId: 'R3_CONFIRMED',
        evidenceSufficiency: { status: 'sufficient', powerStatus: 'adequate' },
      }),
    );
    const honest = fetchHonestVerdictByEvidenceId(db, 'ev-single');
    assert.equal(honest?.verdictId, v.verdictId);
    assert.equal(honest?.verdict, 'CONFIRMED');
  } finally {
    db.close();
  }
});
