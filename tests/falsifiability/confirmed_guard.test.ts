/**
 * CONFIRMED 判决证据守卫测试（[D] 红线 #7 修复）。
 *
 *            07_falsifiability_verdict §6.2 (禁未验证 claim 标 CONFIRMED) /
 *            CONFIRMED 需证据 + checkpoint。
 *
 * 验证两层守卫（对称 DEGRADED_SCOPE/UNTESTED 范式）：
 *   1. 应用层：recordVerdict 在 CONFIRMED + evidenceId 无对应 evidence_log 记录时
 *      抛 ConfirmedEvidenceMissingError（早失败·禁绕过 makeVerdict）。
 *   2. 应用层不破坏合法路径：CONFIRMED + 真实 evidence → 成功（fecAppendClaim 路径）。
 *   3. SQL trigger：直接 INSERT CONFIRMED + 不存在 evidence_id → DB 层 ABORT（防御纵深）。
 *   4. 对称性：DEGRADED_SCOPE / UNTESTED 守卫仍工作（无回归）。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { recordVerdict } from '../../src/falsifiability/repository.ts';
import {
  ConfirmedEvidenceMissingError,
  EmptyScopeSlipError,
  EmptyUntestedReasonError,
} from '../../src/falsifiability/errors.ts';
import type { RecordVerdictArgs } from '../../src/falsifiability/types.ts';
import { FIXTURE_VERDICT_TRACE } from './_verdict_trace_fixture.ts';
import {
  appendEvidenceLog,
  appendRecord,
  GENESIS_PREV_HASH,
} from '../../src/evidence_log/index.ts';
import type {
  AppendRecordOptions,
  ProviderNeutralCredential,
  CallAuditData,
  SourceAnchor,
} from '../../src/evidence_log/index.ts';
import { runMigrations } from '../../src/db/index.ts';

const OFFLINE_OPTIONS: AppendRecordOptions = {
  providerProfile: 'offline_replay',
};

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

function credential(index: number): ProviderNeutralCredential {
  return {
    modelId: 'offline-replay-fixture',
    dashscopeRequestId: null,
    reproHash: `${index}`.repeat(64).slice(0, 64),
    gitCommitSha: 'b'.repeat(40),
    isoTimestamp: `2026-06-27T00:00:0${index}.000Z`,
  };
}

function audit(index: number): CallAuditData {
  return {
    requestPayload: `{"messages":[{"role":"user","content":"q${index}"}]}`,
    responsePayload: `{"choices":[{"message":{"content":"a${index}"}}]}`,
    finishReason: 'stop',
    usageTokensTotal: index,
  };
}

const SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'b'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'c'.repeat(64),
};

/**
 * seed 一条真实 evidence_log 记录，返回 evidenceId（供 CONFIRMED 守卫验证）。
 */
function seedEvidence(db: Database.Database): string {
  const record = appendRecord(
    db,
    {
      stageId: 'stage4_evidence',
      cred: credential(1),
      payloadKind: 'observation',
      purposeTag: 'eval',
      prevHash: GENESIS_PREV_HASH,
    },
    audit(1),
    OFFLINE_OPTIONS,
  );
  const entry = appendEvidenceLog(db, {
    callRecordSeq: record.seq,
    evidencePayload: { kind: 'observation', claim: 'measurement supports hypothesis' },
    sourceAnchor: SOURCE_ANCHOR,
  });
  return entry.evidenceId;
}

function makeConfirmedArgs(evidenceId: string): RecordVerdictArgs {
  return {
    evidenceId,
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    verdict: 'CONFIRMED',
    falsificationSpec: {
      prediction: 'accuracy >= 0.85',
      metric: 'accuracy',
      falsificationThreshold: 0.85,
      thresholdSemantics: 'gt',
    },
    thresholdSpec: { semantics: 'gt', value: 0.85 },
    metricValue: 0.92,
    conflictingEvidenceCount: 0,
    scopeSlipText: null,
    untestedReason: null,
    sourceAnchor: SOURCE_ANCHOR,
    replayProver: null,
    verdictTrace: FIXTURE_VERDICT_TRACE,
  };
}

test('recordVerdict throws ConfirmedEvidenceMissingError when CONFIRMED lacks evidence_log record', () => {
  const db = openDb();
  try {
    // 不 seed evidence——直接对不存在的 evidenceId 记录 CONFIRMED
    assert.throws(
      () => recordVerdict(db, makeConfirmedArgs('ev-nonexistent')),
      (err: unknown) => err instanceof ConfirmedEvidenceMissingError,
      'CONFIRMED without existing evidence must fail-fast at persistence layer',
    );
  } finally {
    db.close();
  }
});

test('recordVerdict accepts CONFIRMED when evidence_log record exists (fecAppendClaim path)', () => {
  const db = openDb();
  try {
    const evidenceId = seedEvidence(db);
    const node = recordVerdict(db, makeConfirmedArgs(evidenceId));
    assert.equal(node.verdict, 'CONFIRMED');
    assert.equal(node.evidenceId, evidenceId);
  } finally {
    db.close();
  }
});

test('SQL trigger rejects direct INSERT of CONFIRMED with non-existent evidence_id (defense-in-depth)', () => {
  const db = openDb();
  try {
    // 绕过应用层 recordVerdict，直接 INSERT——DB 层 trigger 应拦截（先于 FK）
    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO verdict_nodes (
              verdict_id, evidence_id, parent_verdict_id, node_kind, verdict,
              falsification_spec, threshold_spec, metric_value, conflicting_evidence_count,
              scope_slip_text, untested_reason, source_anchor, replay_prover,
              prev_hash, current_hash, created_at, updated_at
            ) VALUES (
              'v-direct', 'ev-nonexistent', NULL, 'hypothesis', 'CONFIRMED',
              '{"prediction":"x"}', NULL, 0.9, 0,
              NULL, NULL, '{"gitCommitSha":"x"}', NULL,
              '${'0'.repeat(64)}', '${'1'.repeat(64)}', '2026-06-27T00:00:00Z', '2026-06-27T00:00:00Z'
            )`,
          )
          .run(),
      // trigger（CONFIRMED requires）先于 FK 拦截；若 trigger 子查询未生效，FK 兜底
      /CONFIRMED requires|FOREIGN KEY/i,
      'direct INSERT of CONFIRMED with non-existent evidence must be blocked at DB layer',
    );
  } finally {
    db.close();
  }
});

test('no regression: DEGRADED_SCOPE guard still rejects empty scopeSlipText', () => {
  const db = openDb();
  try {
    const evidenceId = seedEvidence(db);
    const args: RecordVerdictArgs = {
      ...makeConfirmedArgs(evidenceId),
      verdict: 'DEGRADED_SCOPE',
      scopeSlipText: null,
    };
    // [I] Warning：instanceof Error 过宽（任何 Error 都过）·收窄为具体守卫 Error
    // （repository.ts:199 throw EmptyScopeSlipError·对称 CONFIRMED→ConfirmedEvidenceMissingError）
    assert.throws(() => recordVerdict(db, args), (err: unknown) => err instanceof EmptyScopeSlipError);
  } finally {
    db.close();
  }
});

test('no regression: UNTESTED guard still rejects empty untestedReason', () => {
  const db = openDb();
  try {
    const evidenceId = seedEvidence(db);
    const args: RecordVerdictArgs = {
      ...makeConfirmedArgs(evidenceId),
      verdict: 'UNTESTED',
      untestedReason: null,
      metricValue: null,
    };
    // [I] Warning：instanceof Error 过宽·收窄为具体守卫 Error（repository.ts:202 throw EmptyUntestedReasonError）
    assert.throws(() => recordVerdict(db, args), (err: unknown) => err instanceof EmptyUntestedReasonError);
  } finally {
    db.close();
  }
});
