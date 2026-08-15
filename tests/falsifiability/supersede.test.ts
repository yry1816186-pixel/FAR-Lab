// tests/falsifiability/supersede.test.ts
//
// FUSION-OS-12 端到端 RED→GREEN：重评 supersede —— 写新 verdict 行 + UPDATE 旧行 superseded_by 指针 +
// getActiveVerdicts 过滤被取代行。superseded_by 不进 current_hash 白名单（链完整性不变）。
//
// 单一真实依赖（CLAUDE.md §1）：真实 recordVerdict 落库（verdict_nodes INSERT + current_hash 链式）→
// supersedeVerdict 事务（recordVerdict new + UPDATE old.superseded_by）→ getActiveVerdicts SQL 过滤。
// 非 Fake 后端、非硬编码指标。
//
// RED→GREEN 论证：
//   RED（接线前）：verdict_nodes 无 superseded_by 列；无 supersedeVerdict/getActiveVerdicts —— 重评只能
//     删旧行（违反 append-only）或改旧行 verdict（违反 terminal-rollback + immutable_fields trigger）。
//   GREEN（接线后）：重评写新行 + 设指针，旧行 append-only 保留（审计）+ getActiveVerdicts 过滤。
//
// Authority: archived-plan §C FUSION-OS-12 +
//            archived-plan §4 FUSION-OS-12（Open Science memories.superseded_by 范式）。

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
  getActiveVerdicts,
  getVerdict,
  recordVerdict,
  supersedeVerdict,
  verifyVerdictNodes,
} from '../../src/falsifiability/index.ts';
import type {
  FalsificationSpec,
  RecordVerdictArgs,
  SourceAnchor,
  ThresholdSpec,
  VerdictTracePersisted,
} from '../../src/falsifiability/index.ts';
import { FIXTURE_VERDICT_TRACE } from './_verdict_trace_fixture.ts';

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
    evidencePayload: { claim: 'supersede fixture' },
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

test('reverdict_supersedes_old_active_row: 重评写新行 + 设指针 + getActiveVerdicts 过滤旧行', () => {
  const db = openDb();
  try {
    seedEvidence(db, 'ev-shared');
    const oldVerdict = recordVerdict(
      db,
      makeVerdictArgs('ev-shared', 'INCONCLUSIVE', FIXTURE_VERDICT_TRACE, 'initial inconclusive'),
    );

    const { oldVerdict: oldAfter, newVerdict } = supersedeVerdict(db, {
      oldVerdictId: oldVerdict.verdictId,
      newVerdictArgs: makeVerdictArgs('ev-shared', 'REFUTED', {
        reasonCodes: ['R5_REFUTED'],
        ruleTrace: [{ ruleId: 'R5_REFUTED', triggered: true }],
        decisiveRuleId: 'R5_REFUTED',
        evidenceSufficiency: { status: 'sufficient', powerStatus: 'adequate' },
      }),
    });

    assert.equal(oldAfter.supersededBy, newVerdict.verdictId, 'old.supersededBy 须指向 new verdict_id');
    assert.equal(newVerdict.supersededBy, null, 'new verdict 须活跃（supersededBy=null）');
    assert.equal(oldAfter.verdict, 'INCONCLUSIVE', 'old verdict 值不变（append-only·不删不改内容）');

    const active = getActiveVerdicts(db);
    const activeIds = active.map((v) => v.verdictId);
    assert.ok(activeIds.includes(newVerdict.verdictId), '活跃集须含 new verdict');
    assert.ok(!activeIds.includes(oldVerdict.verdictId), '活跃集须排除被取代的 old verdict');

    const oldAudit = getVerdict(db, oldVerdict.verdictId);
    assert.equal(oldAudit?.supersededBy, newVerdict.verdictId, 'getVerdict 仍可按 id 查 old（审计·旧行保留）');
  } finally {
    db.close();
  }
});

test('superseded_by_not_in_current_hash_whitelist: supersede 后 old.currentHash 不变 + 链完整', () => {
  const db = openDb();
  try {
    seedEvidence(db, 'ev-hash-shared');
    const oldVerdict = recordVerdict(
      db,
      makeVerdictArgs('ev-hash-shared', 'INCONCLUSIVE', FIXTURE_VERDICT_TRACE, 'initial'),
    );
    const oldHashBefore = oldVerdict.currentHash;

    const { oldVerdict: oldAfter } = supersedeVerdict(db, {
      oldVerdictId: oldVerdict.verdictId,
      newVerdictArgs: makeVerdictArgs('ev-hash-shared', 'REFUTED', {
        reasonCodes: ['R5_REFUTED'],
        ruleTrace: [{ ruleId: 'R5_REFUTED', triggered: true }],
        decisiveRuleId: 'R5_REFUTED',
        evidenceSufficiency: { status: 'sufficient', powerStatus: 'adequate' },
      }),
    });

    assert.equal(
      oldAfter.currentHash,
      oldHashBefore,
      'superseded_by 不进 current_hash 白名单 → old.currentHash 须不变（链完整性）',
    );

    const verify = verifyVerdictNodes(db);
    assert.equal(verify.ok, true, 'verdict_nodes 链须一致（supersede 不破坏 prev_hash 链式）');
    assert.equal(verify.brokenAtVerdictId, null);
  } finally {
    db.close();
  }
});

test('supersedeVerdict: old verdict 不存在 → fail-closed 抛错', () => {
  const db = openDb();
  try {
    seedEvidence(db, 'ev-missing');
    assert.throws(
      () =>
        supersedeVerdict(db, {
          oldVerdictId: 'nonexistent-verdict-id',
          newVerdictArgs: makeVerdictArgs('ev-missing', 'UNTESTED', FIXTURE_VERDICT_TRACE, 'missing'),
        }),
      /not found/i,
    );
  } finally {
    db.close();
  }
});
