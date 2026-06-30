// ci/verify_chain_smoke.ts
// 职责：启动期 evidence_log 链式自验 smoke（CI STEP 12）
// 权威 SSOT：10_CI_pipeline.md §9 / 04_evidence_log.md（verifyChainHead / rowToCallRecord / appendRecord）
// 实现：
//   1. 打开 better-sqlite3 :memory: DB
//   2. runMigrations 执行完整迁移链 0001..0007 建表
//   3. appendRecord 写入 3 条记录（构造 CanonicalInput 嵌套结构，offline_replay profile）
//   4. verifyChainHead 逐行校验 current_hash 链式完整性
//   5. 额外逐行 rowToCallRecord + canonicalHash 比对（防 fixture 假绿）
//   6. 断言 GOLDEN_VECTORS[0] 期望 hex 一致（锚定 SSOT fixture）
// 零容忍合规：禁用 any 类型注解、ts-ignore 指令、双重断言、空 catch 块、桩代码返回

import Database from 'better-sqlite3';
import { pathToFileURL } from 'node:url';
import { runMigrations } from '../src/db/index.ts';
import {
  appendRecord,
  canonicalHash,
  GENESIS_PREV_HASH,
  getChainHead,
  GOLDEN_VECTORS,
  REPRO_CONTEXT_FIXTURE,
  rowToCallRecord,
  verifyChainHead,
} from '../src/evidence_log/index.ts';
import type {
  AppendRecordOptions,
  ProviderNeutralCredential,
  CallAuditData,
  CallRecordHashRow,
} from '../src/evidence_log/index.ts';

const OFFLINE_OPTIONS: AppendRecordOptions = {
  providerProfile: 'offline_replay',
};

function openDatabase(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

function credential(index: number): ProviderNeutralCredential {
  return {
    modelId: REPRO_CONTEXT_FIXTURE.cred.modelId,
    dashscopeRequestId: null,
    reproHash: `${index}`.repeat(64).slice(0, 64),
    gitCommitSha: REPRO_CONTEXT_FIXTURE.cred.gitCommitSha,
    isoTimestamp: `2026-06-27T00:00:0${index}.000Z`,
  };
}

function audit(index: number): CallAuditData {
  return {
    requestPayload: `{"messages":[{"role":"user","content":"smoke-q${index}"}]}`,
    responsePayload: `{"choices":[{"message":{"content":"smoke-a${index}"}}]}`,
    finishReason: 'stop',
    usageTokensTotal: index * 10,
  };
}

function appendSmokeRow(db: Database.Database, index: number): void {
  appendRecord(
    db,
    {
      stageId: `${REPRO_CONTEXT_FIXTURE.stageId}#${index}`,
      cred: credential(index),
      payloadKind: REPRO_CONTEXT_FIXTURE.payloadKind,
      purposeTag: REPRO_CONTEXT_FIXTURE.purposeTag,
      prevHash: getChainHead(db)?.currentHash ?? GENESIS_PREV_HASH,
    },
    audit(index),
    OFFLINE_OPTIONS,
  );
}

export function main(): void {
  const db = openDatabase();
  try {
    appendSmokeRow(db, 1);
    appendSmokeRow(db, 2);
    appendSmokeRow(db, 3);

    const result = verifyChainHead(db);
    if (!result.ok) {
      throw new Error(
        `verify_chain_smoke: chain broken at seq=${result.brokenAtSeq} expected=${result.expectedHash} actual=${result.actualHash}`,
      );
    }
    if (result.verifiedCount !== 3) {
      throw new Error(
        `verify_chain_smoke: expected 3 verified records, got ${result.verifiedCount}`,
      );
    }

    // 锚定 SSOT golden vector：TS canonicalHash 必须等于硬编码 expectedHex
    const goldenVector = GOLDEN_VECTORS[0];
    if (goldenVector === undefined) {
      throw new Error('verify_chain_smoke: GOLDEN_VECTORS is empty');
    }
    const goldenRecomputed = canonicalHash(goldenVector.input);
    if (goldenRecomputed !== goldenVector.expectedHex) {
      throw new Error(
        `verify_chain_smoke: golden vector hash mismatch ${goldenRecomputed} !== ${goldenVector.expectedHex}`,
      );
    }

    // 防御深度：逐行 rowToCallRecord + canonicalHash 比对（防 fixture 假绿）
    const rows = db
      .prepare(
        `SELECT seq, stage_id, payload_kind, purpose_tag, model_id,
                dashscope_request_id, repro_hash, git_commit_sha, iso_timestamp,
                prev_hash, current_hash, created_at
         FROM call_records
         ORDER BY seq ASC`,
      )
      .all() as CallRecordHashRow[];
    if (rows.length !== 3) {
      throw new Error(`verify_chain_smoke: expected 3 rows, got ${rows.length}`);
    }
    for (const row of rows) {
      const canonicalInput = rowToCallRecord(row);
      if (canonicalHash(canonicalInput) !== row.current_hash) {
        throw new Error(
          `verify_chain_smoke: row seq=${row.seq} current_hash mismatch (recompute !== stored)`,
        );
      }
    }

    console.log('VERIFY_CHAIN_SMOKE: OK');
  } finally {
    db.close();
  }
}

const argv1 = process.argv[1];
const invokedDirectly = argv1 !== undefined && pathToFileURL(argv1).href === import.meta.url;
if (invokedDirectly) {
  main();
}
