// tests/evidence_log/derivable.test.ts
//
// FUSION-OS-10 端到端 RED→GREEN：evidence 行 derivable 标记 + derivable=1 内容寻址 hash 绑定 + verify 重算。
//
// 单一真实依赖（CLAUDE.md §1）：真实 appendEvidenceLog（src/evidence_log/repository.ts）经 hashCanonicalJson
// 落 evidence_payload_hash → 真实 verifyEvidencePayloadHashes（src/evidence_log/verifier.ts）重算 sha256 比对。
// 非 Fake 后端、非硬编码 hash（hash 由 hashCanonicalJson 重算互验）。
//
// RED→GREEN 论证：
//   RED（接线前）：evidence_log 无 derivable / evidence_payload_hash 列；appendEvidenceLog 不算 hash；
//     canonicalHash（hasher.ts:5）只算 4 键（stageId/cred/payloadKind/prevHash）不含 evidence_payload →
//     evidence 字节被 DB 文件级篡改（绕过 append-only trigger）不被任何哈希链捕获。
//   GREEN（接线后）：0016 加列 + appendEvidenceLog(derivable=1) 落 evidence_payload_hash +
//     verifyEvidencePayloadHashes 重算比对，失配 → tamperedEvidenceIds（反剧场：不信任 workload 自填字节）。
//
// 反剧场红线（FUSION-OS-10）：append-only trigger（0001）禁 SQL UPDATE/DELETE，但 DB 文件级编辑 / future
// migration 误删 trigger 可改字节。evidence_payload_hash 是内容寻址绑定，闭合 canonicalHash 4 键不含
// evidence_payload 的缺口。与链式 current_hash 正交（独立列·不进白名单·零回归 12 GV + cross-lang）。
//
// Authority: archived-plan §C FUSION-OS-10 +
//            archived-plan §4 FUSION-OS-10（host_call_log.derivable 范式）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/migrator.ts';
import {
  appendEvidenceLog,
  appendRecord,
  verifyEvidencePayloadHashes,
  hashCanonicalJson,
} from '../../src/evidence_log/index.ts';
import type {
  AppendRecordInput,
  CallAuditData,
  AppendRecordOptions,
  SourceAnchor,
} from '../../src/evidence_log/index.ts';

const SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'a'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-07-06T00:00:00Z',
  rawResponseHash: 'b'.repeat(64),
};

function appendCallRecord(db: Database.Database): number {
  const input: AppendRecordInput = {
    stageId: 'stage3_hypothesis',
    cred: {
      modelId: 'offline-replay-fixture',
      dashscopeRequestId: null,
      reproHash: 'c'.repeat(64),
      gitCommitSha: SOURCE_ANCHOR.gitCommitSha,
      isoTimestamp: SOURCE_ANCHOR.isoTimestamp,
    },
    payloadKind: 'hypothesis',
    purposeTag: 'hypothesis',
  };
  const audit: CallAuditData = {
    requestPayload: '{"prompt":"FUSION-OS-10 derivable"}',
    responsePayload: '{"claim":"derivable-e2e"}',
    finishReason: 'stop',
    usageTokensTotal: 8,
  };
  const options: AppendRecordOptions = { providerProfile: 'offline_replay' };
  return appendRecord(db, input, audit, options).seq;
}

test('derivable_1_evidence_hash_bound_and_verified: appendEvidenceLog(derivable=1) 落 hash + verify ok', () => {
  const db = new Database(':memory:');
  try {
    runMigrations(db);
    const seq = appendCallRecord(db);
    const payload = { claimId: 'claim-derivable-1', metric: 'macro_f1', value: 0.87 };

    const entry = appendEvidenceLog(db, {
      callRecordSeq: seq,
      evidencePayload: payload,
      sourceAnchor: SOURCE_ANCHOR,
      derivable: 1,
    });

    assert.equal(entry.derivable, 1, 'derivable=1 须落库');
    assert.match(entry.evidencePayloadHash ?? '', /^[0-9a-f]{64}$/, 'derivable=1 须有 64-hex hash');
    assert.equal(
      entry.evidencePayloadHash,
      hashCanonicalJson(payload),
      'evidence_payload_hash 须 = sha256(canonical JSON of payload)',
    );

    const result = verifyEvidencePayloadHashes(db);
    assert.equal(result.ok, true, '合法 derivable=1 行 verify 须 ok');
    assert.equal(result.verifiedCount, 1);
    assert.deepEqual(result.tamperedEvidenceIds, []);
  } finally {
    db.close();
  }
});

test('derivable_0_evidence_no_hash_and_skipped: derivable=0 不绑 hash + verify 跳过', () => {
  const db = new Database(':memory:');
  try {
    runMigrations(db);
    const seq = appendCallRecord(db);
    const entry = appendEvidenceLog(db, {
      callRecordSeq: seq,
      evidencePayload: { claimId: 'claim-external', observation: 'raw' },
      sourceAnchor: SOURCE_ANCHOR,
      // derivable 缺省 = 0（不可重算的外部观测·字节原样存档）。
    });

    assert.equal(entry.derivable, 0, '缺省 derivable 须 = 0（零回归）');
    assert.equal(entry.evidencePayloadHash, null, 'derivable=0 须无 hash');

    const result = verifyEvidencePayloadHashes(db);
    assert.equal(result.ok, true, '无 derivable=1 行 → ok');
    assert.equal(result.verifiedCount, 0, 'derivable=0 不进重算（外部观测·不重算）');
  } finally {
    db.close();
  }
});

test('tampered_evidence_payload_detected: evidence 字节被篡改 → hash 失配 → tamperedEvidenceIds', () => {
  const db = new Database(':memory:');
  try {
    runMigrations(db);
    const seq = appendCallRecord(db);

    // 1. 合法 derivable=1 行（hash 正确）。
    appendEvidenceLog(db, {
      callRecordSeq: seq,
      evidencePayload: { claimId: 'clean', value: 1 },
      sourceAnchor: SOURCE_ANCHOR,
      derivable: 1,
    });
    assert.equal(verifyEvidencePayloadHashes(db).ok, true, '篡改前须 ok');

    // 2. 模拟 DB 文件级篡改（绕过 append-only trigger·trigger 只禁 SQL UPDATE/DELETE·不禁 INSERT）：
    //    raw INSERT 一行 derivable=1 但 evidence_payload_hash 与 evidence_payload 字节失配
    //    （= appendEvidenceLog 写入后，evidence_payload 被 DB 文件编辑改字节，但 hash 列未同步）。
    db.prepare(
      `INSERT INTO evidence_log (
        evidence_id, call_record_seq, stage_id, payload_kind, evidence_payload,
        source_anchor, source_anchor_git, source_anchor_req, source_anchor_ts,
        source_anchor_path, source_anchor_lineno, derivable, evidence_payload_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 1, ?)`,
    ).run(
      'TAMPERED-EVIDENCE-001',
      seq,
      'stage3_hypothesis',
      'hypothesis',
      '{"claimId":"tampered","value":99}',
      '{"gitCommitSha":"x","dashscopeRequestId":null,"isoTimestamp":"2026-07-06T00:00:00Z","rawResponseHash":"y"}',
      SOURCE_ANCHOR.gitCommitSha,
      null,
      SOURCE_ANCHOR.isoTimestamp,
      '0'.repeat(64), // 故意失配的 hash（≠ sha256 of 上面 evidence_payload）
    );

    const result = verifyEvidencePayloadHashes(db);
    assert.equal(result.ok, false, 'hash 失配 须检出（反剧场：evidence 字节篡改可察觉）');
    assert.ok(
      result.tamperedEvidenceIds.includes('TAMPERED-EVIDENCE-001'),
      'tamperedEvidenceIds 须含失配行（clean 行不被误判）',
    );
    assert.equal(result.verifiedCount, 1, 'clean 行仍 verified（仅失配行不计数）');
  } finally {
    db.close();
  }
});

test('derivable_1_missing_hash_detected: derivable=1 但 hash NULL → 数据不变量违反 → tampered', () => {
  const db = new Database(':memory:');
  try {
    runMigrations(db);
    const seq = appendCallRecord(db);
    // raw INSERT derivable=1 但 evidence_payload_hash=NULL（绕过 appendEvidenceLog 的 hash 写入路径）。
    db.prepare(
      `INSERT INTO evidence_log (
        evidence_id, call_record_seq, stage_id, payload_kind, evidence_payload,
        source_anchor, source_anchor_git, source_anchor_req, source_anchor_ts,
        source_anchor_path, source_anchor_lineno, derivable, evidence_payload_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 1, NULL)`,
    ).run(
      'NULL-HASH-EVIDENCE-001',
      seq,
      'stage3_hypothesis',
      'hypothesis',
      '{"claimId":"nullhash"}',
      '{"gitCommitSha":"x","dashscopeRequestId":null,"isoTimestamp":"2026-07-06T00:00:00Z","rawResponseHash":"y"}',
      SOURCE_ANCHOR.gitCommitSha,
      null,
      SOURCE_ANCHOR.isoTimestamp,
    );

    const result = verifyEvidencePayloadHashes(db);
    assert.equal(result.ok, false, 'derivable=1 须有 hash·NULL = 不变量违反');
    assert.ok(result.tamperedEvidenceIds.includes('NULL-HASH-EVIDENCE-001'));
  } finally {
    db.close();
  }
});
