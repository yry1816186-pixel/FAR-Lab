// tests/schema/evidence_provenance_trigger.test.ts
//
// FUSION-OS-6 DB 层物证：evidence_log provenance 跨列不变式 trigger（0018_evidence_provenance_trigger.sql）。
//
// 0017 仅落 provenance_class 列级 enum CHECK（IN 三值）。两条跨列红线不变式此前**仅**由应用层
// appendEvidenceLog（repository.ts:200-211）enforce——任何绕过 appendEvidenceLog 的直接 INSERT（DB 客户端 /
// 未来代码路径）即可违反。0018 在 DB 层加 BEFORE INSERT trigger 物理兜底，与应用层正交。
//
// 本测试直接 db.prepare INSERT（不经 appendEvidenceLog），故拦截**仅可能来自 DB trigger 第二层**——
// 正则匹配 trigger RAISE 文本（'requires non-null system_claim_hash' / 'requires null source_anchor_req'），
// 不匹配应用层 throw 文本（'appendEvidenceLog: ...'）。
//
// 真实依赖：runMigrations 真实落地 0018 trigger → 恶意 INSERT 经 BEFORE trigger RAISE。
//
// 诚实边界（doer=grader · §C:49）：DB trigger 物理落地 + 本测试 GREEN 仅证明「trigger 存在且拦截正确」。
// FUSION-OS-6 §C 升 GREEN 需 CI depth_evidence bot 独立双跑写回，非本会话可跨越。
//
// Authority: archived-plan §C FUSION-OS-6 +
//            FUSION_OPEN_SCIENCE_DESIGN.md §4 FUSION-OS-6 + CLAUDE.md §5「来源不可自填」红线。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/index.ts';

const HEX64 = 'cd'.repeat(32);

function seedCallRecord(db: Database.Database, seq: number): void {
  db.prepare(
    `INSERT INTO call_records (
       stage_id, payload_kind, purpose_tag, model_id, dashscope_request_id,
       repro_hash, git_commit_sha, iso_timestamp, request_payload, response_payload,
       response_payload_hash, finish_reason, usage_tokens_total, prev_hash, current_hash
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'stage1_understanding', 'understanding', 'hypothesis', 'fixture', null,
    HEX64, 'b'.repeat(40), '2026-01-01T00:00:00Z', '{}', '{"v":"1"}',
    HEX64, 'stop', 0, '0'.repeat(64), HEX64,
  );
  void seq;
}

// 直接 INSERT evidence_log（绕过 appendEvidenceLog 应用层）→ 拦截仅来自 DB trigger。
function insertEvidenceRow(
  db: Database.Database,
  evidenceId: string,
  provenanceClass: string,
  systemClaimHash: string | null,
  sourceAnchorReq: string | null,
): void {
  db.prepare(
    `INSERT INTO evidence_log (
       evidence_id, call_record_seq, stage_id, payload_kind, evidence_payload,
       source_anchor, source_anchor_git, source_anchor_req, source_anchor_ts,
       provenance_class, system_claim_hash
     ) VALUES (?, 1, 'stage1_understanding', 'understanding', '{"v":"1"}', '{}', ?, ?, '2026-01-01T00:00:00Z', ?, ?)`,
  ).run(evidenceId, 'b'.repeat(40), sourceAnchorReq, provenanceClass, systemClaimHash);
}

test('evidence_log_insert_llm_generated_null_hash_rejected_by_trigger: 直接 INSERT llm_generated + system_claim_hash=NULL → trigger RAISE（来源不可自填·DB 层兜底）', () => {
  const db = new Database(':memory:');
  try {
    runMigrations(db);
    seedCallRecord(db, 1);
    assert.throws(
      () => insertEvidenceRow(db, 'ev-llm-nohash', 'llm_generated', null, null),
      /requires non-null system_claim_hash/i,
    );
  } finally {
    db.close();
  }
});

test('evidence_log_insert_llm_generated_nonnull_req_rejected_by_trigger: 直接 INSERT llm_generated + source_anchor_req=<非空> → trigger RAISE（forged marker·DB 层兜底）', () => {
  const db = new Database(':memory:');
  try {
    runMigrations(db);
    seedCallRecord(db, 1);
    assert.throws(
      () => insertEvidenceRow(db, 'ev-llm-req', 'llm_generated', HEX64, 'req-forged-marker'),
      /requires null source_anchor_req/i,
    );
  } finally {
    db.close();
  }
});

test('evidence_log_insert_llm_generated_valid_passes: llm_generated + system_claim_hash=<hex> + req=NULL → 通过（合法 LLM provenance·不误伤）', () => {
  const db = new Database(':memory:');
  try {
    runMigrations(db);
    seedCallRecord(db, 1);
    assert.doesNotThrow(() => insertEvidenceRow(db, 'ev-llm-valid', 'llm_generated', HEX64, null));
    const row = db
      .prepare("SELECT provenance_class, system_claim_hash FROM evidence_log WHERE evidence_id = 'ev-llm-valid'")
      .get() as { provenance_class: string; system_claim_hash: string };
    assert.equal(row.provenance_class, 'llm_generated');
    assert.equal(row.system_claim_hash, HEX64);
  } finally {
    db.close();
  }
});

test('evidence_log_insert_system_derived_passes_unrestricted: system_derived（默认）+ hash=NULL + req=<非空> → 通过（system_derived 不受 LLM 红线约束·零误伤旧行）', () => {
  const db = new Database(':memory:');
  try {
    runMigrations(db);
    seedCallRecord(db, 1);
    // system_derived 是系统侧重算产物，允许 source_anchor_req 非空（真实调用回链）+ system_claim_hash=NULL（非 LLM 无需绑定）。
    assert.doesNotThrow(() => insertEvidenceRow(db, 'ev-sys', 'system_derived', null, 'req-real-call'));
    const row = db
      .prepare("SELECT provenance_class FROM evidence_log WHERE evidence_id = 'ev-sys'")
      .get() as { provenance_class: string };
    assert.equal(row.provenance_class, 'system_derived');
  } finally {
    db.close();
  }
});
