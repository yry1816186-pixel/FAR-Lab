// tests/ci/verify_chain_smoke.test.ts
// 职责：CI STEP 12——verify_chain_smoke main() 可执行性 + 链式自验语义独立复现
// 历史溯源：STEP 12 + 04_evidence_log.md·运行时 SSOT 以本测试 + ci/verify_chain_smoke.ts 源码实测为准（appendRecord / verifyChainHead / rowToCallRecord）
// 零容忍合规：禁用 any 类型注解、ts-ignore 指令、双重断言、空 catch 块、桩代码返回

import Database from 'better-sqlite3';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../../ci/verify_chain_smoke.ts';
import { runMigrations } from '../../src/db/index.ts';
import {
  appendRecord,
  canonicalHash,
  GENESIS_PREV_HASH,
  getChainHead,
  REPRO_CONTEXT_FIXTURE,
  rowToCallRecord,
  verifyChainHead,
} from '../../src/evidence_log/index.ts';
import type {
  AppendRecordOptions,
  ProviderNeutralCredential,
  CallAuditData,
  CallRecordHashRow,
} from '../../src/evidence_log/index.ts';

const OFFLINE_OPTIONS: AppendRecordOptions = {
  providerProfile: 'offline_replay',
};

function openDatabase(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

function makeCredential(index: number): ProviderNeutralCredential {
  return {
    modelId: REPRO_CONTEXT_FIXTURE.cred.modelId,
    dashscopeRequestId: null,
    reproHash: `${index}`.repeat(64).slice(0, 64),
    gitCommitSha: REPRO_CONTEXT_FIXTURE.cred.gitCommitSha,
    isoTimestamp: `2026-06-27T00:00:0${index}.000Z`,
  };
}

function makeAudit(index: number): CallAuditData {
  return {
    requestPayload: `{"messages":[{"role":"user","content":"indep-q${index}"}]}`,
    responsePayload: `{"choices":[{"message":{"content":"indep-a${index}"}}]}`,
    finishReason: 'stop',
    usageTokensTotal: index * 10,
  };
}

function appendIndependentRow(db: Database.Database, index: number): void {
  appendRecord(
    db,
    {
      stageId: `${REPRO_CONTEXT_FIXTURE.stageId}#indep#${index}`,
      cred: makeCredential(index),
      payloadKind: REPRO_CONTEXT_FIXTURE.payloadKind,
      purposeTag: REPRO_CONTEXT_FIXTURE.purposeTag,
      prevHash: getChainHead(db)?.currentHash ?? GENESIS_PREV_HASH,
    },
    makeAudit(index),
    OFFLINE_OPTIONS,
  );
}

test('verify_chain_smoke main() completes without throwing', () => {
  assert.doesNotThrow(() => main());
});

test('main() logs VERIFY_CHAIN_SMOKE: OK to console', () => {
  const messages: string[] = [];
  const originalLog = console.log;
  console.log = ((...args: readonly unknown[]) => {
    messages.push(args.map(String).join(' '));
  }) as typeof console.log;
  try {
    main();
  } finally {
    console.log = originalLog;
  }
  assert.ok(
    messages.some((line) => line.includes('VERIFY_CHAIN_SMOKE: OK')),
    `expected 'VERIFY_CHAIN_SMOKE: OK' in logs, got: ${messages.join(' | ')}`,
  );
});

test('independent chain: appendRecord 3x + verifyChainHead returns ok=true', () => {
  const db = openDatabase();
  try {
    appendIndependentRow(db, 1);
    appendIndependentRow(db, 2);
    appendIndependentRow(db, 3);

    const result = verifyChainHead(db);
    assert.equal(result.ok, true, `chain verification failed at seq=${result.brokenAtSeq}`);
    assert.equal(result.verifiedCount, 3, `expected 3 verified records, got ${result.verifiedCount}`);

    const rows = db
      .prepare(
        `SELECT seq, stage_id, payload_kind, purpose_tag, model_id,
                dashscope_request_id, repro_hash, git_commit_sha, iso_timestamp,
                prev_hash, current_hash, created_at
         FROM call_records
         ORDER BY seq ASC`,
      )
      .all() as CallRecordHashRow[];
    assert.equal(rows.length, 3, `expected 3 rows, got ${rows.length}`);
    for (const row of rows) {
      const canonicalInput = rowToCallRecord(row);
      assert.equal(
        canonicalHash(canonicalInput),
        row.current_hash,
        `row seq=${row.seq} current_hash recompute mismatch`,
      );
    }
  } finally {
    db.close();
  }
});
