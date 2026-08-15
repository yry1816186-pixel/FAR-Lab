// tests/evidence_log/degraded_from.test.ts
// 职责：验证 FallbackChain 降级来源（degraded_from）落库 + 不破坏 canonical_hash 确定性。
//
// 历史溯源（已归档）: .2/§9 + 0007_add_degraded_from.sql。
//
// 验证点：
//   1. appendRecord with audit.degradedFrom → call_records.degraded_from 列正确落库
//   2. appendRecord without degradedFrom → degraded_from = NULL
//   3. degradedFrom 不进 canonical_hash 白名单（同 input 不同 degradedFrom → currentHash 相同）
//
// 零容忍合规：无 :any / @ts-ignore / as unknown as / 空 catch / 修改期望掩盖实现。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { appendRecord, getCallRecordBySeq } from '../../src/evidence_log/repository.ts';
import { runMigrations } from '../../src/db/migrator.ts';
import type {
  AppendRecordInput,
  CallAuditData,
  ProviderNeutralCredential,
} from '../../src/evidence_log/types.ts';

const CRED: ProviderNeutralCredential = {
  modelId: 'test-model-id',
  dashscopeRequestId: null,
  reproHash: 'r'.repeat(64),
  gitCommitSha: 'g'.repeat(40),
  isoTimestamp: '2026-06-28T00:00:00.000Z',
};

const INPUT: AppendRecordInput = {
  stageId: 'stage-degraded-from-test',
  cred: CRED,
  payloadKind: 'hypothesis',
  purposeTag: 'hypothesis',
};

const OFFLINE_OPTIONS = { providerProfile: 'offline_replay' as const };

function makeAudit(degradedFrom?: string | null): CallAuditData {
  const base: CallAuditData = {
    requestPayload: '{"q":"reply"}',
    responsePayload: '{"a":"ok"}',
    finishReason: 'stop',
    usageTokensTotal: 10,
  };
  if (degradedFrom === undefined) {
    return base;
  }
  return { ...base, degradedFrom };
}

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

test('appendRecord with degradedFrom string → persisted to degraded_from column', () => {
  const db = openDb();
  try {
    const result = appendRecord(db, INPUT, makeAudit('qwen3-235b-a22b'), OFFLINE_OPTIONS);
    const row = getCallRecordBySeq(db, result.seq);
    assert.equal(row.degraded_from, 'qwen3-235b-a22b');
  } finally {
    db.close();
  }
});

test('appendRecord without degradedFrom → degraded_from is null', () => {
  const db = openDb();
  try {
    const result = appendRecord(db, INPUT, makeAudit(undefined), OFFLINE_OPTIONS);
    const row = getCallRecordBySeq(db, result.seq);
    assert.equal(row.degraded_from, null);
  } finally {
    db.close();
  }
});

test('appendRecord with degradedFrom=null → degraded_from is null', () => {
  const db = openDb();
  try {
    const result = appendRecord(db, INPUT, makeAudit(null), OFFLINE_OPTIONS);
    const row = getCallRecordBySeq(db, result.seq);
    assert.equal(row.degraded_from, null);
  } finally {
    db.close();
  }
});

test('degradedFrom does NOT affect canonical_hash (determinism preserved)', () => {
  // 相同 input：一次携带 degradedFrom，一次不携带 → currentHash 必须相同。
  // 证明 degraded_from 是纯审计列，不破坏 cross_lang hash 白名单确定性。
  const db1 = openDb();
  const r1 = appendRecord(db1, INPUT, makeAudit('some-fallback-model'), OFFLINE_OPTIONS);
  db1.close();

  const db2 = openDb();
  const r2 = appendRecord(db2, INPUT, makeAudit(undefined), OFFLINE_OPTIONS);
  db2.close();

  assert.equal(r1.currentHash, r2.currentHash);
});

test('degraded_from column exists after migration 0007', () => {
  // 防回归：确认 0007 的 ALTER TABLE 真实生效（列存在于 schema）。
  const db = openDb();
  try {
    const cols = db
      .prepare('PRAGMA table_info(call_records)')
      .all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    assert.ok(names.includes('degraded_from'), 'call_records must have degraded_from column after 0007');
  } finally {
    db.close();
  }
});
