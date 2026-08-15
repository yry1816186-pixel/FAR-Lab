/**
 * search.test.ts —— evidence_log FTS5 全文检索（FTS5 会话召回）。
 *
 * 覆盖：
 *   1. ensureFtsIndex 幂等 + reindexEvidenceFts 全量重建计数。
 *   2. searchEvidence 命中文本内容（evidence_payload 全文检索）。
 *   3. stage_id / payload_kind / provenance_class 过滤（与 MATCH AND）。
 *   4. escapeFtsQuery 字面量转义（含 FTS5 特殊字符无语法错误）。
 *   5. 空查询抛错 / limit 边界校验 / 索引为空时搜索返回空。
 *   6. 检索辅助层不破坏哈希链验证（append 后 verifyChainHead 仍绿）。
 */

import { runMigrations } from '../../src/db/index.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  appendRecord,
  appendEvidenceLog,
  ensureFtsIndex,
  reindexEvidenceFts,
  searchEvidence,
  escapeFtsQuery,
  verifyChainHead,
} from '../../src/evidence_log/index.ts';
import type {
  AppendRecordOptions,
  ProviderNeutralCredential,
  CallAuditData,
  SourceAnchor,
} from '../../src/evidence_log/index.ts';

const OFFLINE_OPTIONS: AppendRecordOptions = { providerProfile: 'offline_replay' };

function credential(index: number): ProviderNeutralCredential {
  return {
    modelId: `model-${index}`,
    dashscopeRequestId: null,
    reproHash: `${index}`.repeat(64).slice(0, 64),
    gitCommitSha: 'c'.repeat(40),
    isoTimestamp: `2026-07-0${index}T00:00:00.000Z`,
  };
}

function audit(payload: string): CallAuditData {
  return {
    requestPayload: payload,
    responsePayload: payload,
    finishReason: 'stop',
    usageTokensTotal: 10,
  };
}

function anchor(index: number): SourceAnchor {
  return {
    gitCommitSha: 'a'.repeat(40),
    dashscopeRequestId: null,
    isoTimestamp: `2026-07-0${index}T00:00:00.000Z`,
    rawResponseHash: 'b'.repeat(64),
  };
}

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

function appendTwo(db: Database.Database): void {
  const r1 = appendRecord(
    db,
    { stageId: 'stage1', cred: credential(1), payloadKind: 'observation', purposeTag: 'hypothesis' },
    audit('primer enzyme activation study'),
    OFFLINE_OPTIONS,
  );
  appendEvidenceLog(db, {
    callRecordSeq: r1.seq,
    evidencePayload: { claim: 'primer enzyme activation confirmed', pValue: 0.01 },
    sourceAnchor: anchor(1),
    derivable: 1,
  });

  const r2 = appendRecord(
    db,
    { stageId: 'stage2', cred: credential(2), payloadKind: 'experiment', purposeTag: 'dialogue' },
    audit('molecular dynamics simulation'),
    OFFLINE_OPTIONS,
  );
  appendEvidenceLog(db, {
    callRecordSeq: r2.seq,
    evidencePayload: { claim: 'molecular dynamics trajectory stable', pValue: 0.2 },
    sourceAnchor: anchor(2),
    derivable: 1,
    provenanceClass: 'llm_generated',
    systemClaimHash: 'd'.repeat(64),
  });
}

test('ensureFtsIndex is idempotent and reindex counts rows', () => {
  const db = openDb();
  appendTwo(db);
  ensureFtsIndex(db);
  ensureFtsIndex(db); // idempotent
  const n1 = reindexEvidenceFts(db);
  assert.equal(n1, 2);
  const n2 = reindexEvidenceFts(db); // re-reindex safe
  assert.equal(n2, 2);
});

test('searchEvidence 自动同步新写入（FTS 陈旧修复·P0-1）', () => {
  const db = openDb();
  appendTwo(db);
  // 关键：不手动 reindex——写入后直接搜索必须能搜到（懒同步：COUNT 不等 → 自动重建）。
  const hits = searchEvidence(db, 'primer enzyme');
  assert.ok(hits.length >= 1, '新写入证据必须可搜索（写入后未手动 reindex）');
  const first = hits[0];
  assert.ok(first !== undefined, 'hits[0] must exist');
  const payload = first.entry.evidencePayload;
  assert.equal(typeof payload, 'string');
  assert.match(payload as string, /primer/);
  // 二次搜索仍一致（同步是幂等的）。
  const hits2 = searchEvidence(db, 'molecular dynamics');
  assert.ok(hits2.length >= 1, '第二条证据同样可搜索');
});

test('searchEvidence full-text matches evidence payload', () => {
  const db = openDb();
  appendTwo(db);
  reindexEvidenceFts(db);
  const hits = searchEvidence(db, 'primer enzyme activation');
  assert.ok(hits.length >= 1, 'should hit the primer enzyme evidence');
  const first = hits[0];
  assert.ok(first, 'first hit must exist');
  assert.match(first.entry.evidencePayload, /primer enzyme activation/);
  const miss = searchEvidence(db, 'quantum entanglement teleportation');
  assert.equal(miss.length, 0);
});

test('searchEvidence filters by stageId and provenanceClass', () => {
  const db = openDb();
  appendTwo(db);
  reindexEvidenceFts(db);
  const staged = searchEvidence(db, 'activation', { stageId: 'stage1' });
  assert.ok(staged.length === 1);
  const stagedFirst = staged[0];
  assert.ok(stagedFirst);
  assert.equal(stagedFirst.entry.stageId, 'stage1');
  const llm = searchEvidence(db, 'molecular', { provenanceClass: 'llm_generated' });
  assert.equal(llm.length, 1);
  const llmFirst = llm[0];
  assert.ok(llmFirst);
  assert.equal(llmFirst.entry.provenanceClass, 'llm_generated');
  const none = searchEvidence(db, 'molecular', { stageId: 'stage1' });
  assert.equal(none.length, 0);
});

test('escapeFtsQuery treats special chars as literal (no syntax error)', () => {
  const db = openDb();
  appendTwo(db);
  reindexEvidenceFts(db);
  const weird = searchEvidence(db, 'activation (confirmed) "study"');
  assert.ok(Array.isArray(weird), 'should not throw on special chars');
  assert.equal(escapeFtsQuery('a"b'), '"a""b"');
});

test('searchEvidence validates empty query and limit bounds', () => {
  const db = openDb();
  appendTwo(db);
  reindexEvidenceFts(db);
  assert.throws(() => searchEvidence(db, '   '), /non-empty/);
  assert.throws(() => searchEvidence(db, 'x', { limit: 0 }), /\[1, 200\]/);
  assert.throws(() => searchEvidence(db, 'x', { limit: 201 }), /\[1, 200\]/);
});

test('search on empty index returns empty without throwing', () => {
  const db = openDb();
  reindexEvidenceFts(db); // empty evidence_log
  const hits = searchEvidence(db, 'anything');
  assert.equal(hits.length, 0);
});

test('FTS auxiliary index does not disturb hash-chain verification', () => {
  const db = openDb();
  appendTwo(db);
  reindexEvidenceFts(db);
  searchEvidence(db, 'primer');
  const v = verifyChainHead(db);
  assert.equal(v.ok, true, 'chain head must stay valid after FTS reindex/search');
});
