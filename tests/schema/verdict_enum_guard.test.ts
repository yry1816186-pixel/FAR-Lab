// tests/schema/verdict_enum_guard.test.ts
//
// FUSION-OS-11 端到端物证:verdict / conclusion enum 纵深防御 trigger(0013_verdict_enum_guard.sql)。
// 0001_initial.sql:105-108 已有 verdict 列级 CHECK——本 trigger 是独立物理兜底第二层,与 CHECK 正交,
// 即使 CHECK 被 future migration 误删仍拦截第六值(落点约束 #9)。
//
// ⚠️ erratum(FUSION_OPEN_SCIENCE_DESIGN.md:287):design doc 称 verdict_nodes verdict 列无 CHECK 与现实不符。
//   OS-11 实际落地 = 纵深防御 trigger,非「首次加 CHECK」。本测试断言 trigger 层 RAISE(非 CHECK 层),
//   正则匹配 'enum guard'(trigger 错误信息),不匹配 'CHECK constraint failed'(0001 列级约束)——
//   证明拦截来自第二层 trigger,BEFORE INSERT/UPDATE 先于列级 CHECK。
//
// 真实依赖:runMigrations 真实落地 0013 trigger → INSERT/UPDATE 第六值经 BEFORE trigger RAISE。
//
// Authority: PROJECT_PLAN/DEPTH_LEDGER.md §C FUSION-OS-11 + FUSION_OPEN_SCIENCE_DESIGN.md §4 FUSION-OS-11。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/index.ts';

const HEX64 = 'ab'.repeat(32);
const FIVE_VALUES = ['CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'DEGRADED_SCOPE', 'UNTESTED'] as const;
const SIXTH = 'SUPER_CONFIRMED';

// verdict_nodes INSERT 需 evidence_id FK(0001:99 REFERENCES evidence_log)。建 call_records → evidence_log 链,
// payload 非空以满足 trg_verdict_nodes_confirmed_requires_evidence(0001:176-185)。
function seedEvidenceChain(db: Database.Database, evidenceId: string): void {
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
  db.prepare(
    `INSERT INTO evidence_log (
       evidence_id, call_record_seq, stage_id, payload_kind, evidence_payload,
       source_anchor, source_anchor_git, source_anchor_req, source_anchor_ts
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(evidenceId, 1, 'stage1_understanding', 'understanding', '{"v":"1"}', '{}', 'b'.repeat(40), null, '2026-01-01T00:00:00Z');
}

function insertVerdictNode(db: Database.Database, verdictId: string, verdict: string, evidenceId = 'ev-guard'): void {
  db.prepare(
    `INSERT INTO verdict_nodes (
       verdict_id, evidence_id, node_kind, verdict, falsification_spec, source_anchor, prev_hash, current_hash
     ) VALUES (?, ?, 'root', ?, '{}', '{}', ?, ?)`,
  ).run(verdictId, evidenceId, verdict, '0'.repeat(64), HEX64);
}

function insertV2Envelope(db: Database.Database, envelopeId: string, conclusion: string): void {
  // envelope_json='{}' 不含 hasFail/canSealConfirmed → 不触发 0011 anti_theater trigger,隔离 enum guard 测试。
  db.prepare(
    `INSERT INTO proof_envelopes_v2 (
       envelope_id, claim_id, schema_version, conclusion, fec_hash, proof_hash, ledger_root,
       envelope_json, sealed_by, sealed_at
     ) VALUES (?, ?, 'far.proof_envelope.v2', ?, ?, ?, ?, '{}', 'deterministic_sealer', '2026-01-01T00:00:00Z')`,
  ).run(envelopeId, `claim-${envelopeId}`, conclusion, HEX64, HEX64, HEX64);
}

test('verdict_nodes_insert_sixth_value_rejected_by_trigger: INSERT verdict=SUPER_CONFIRMED → enum guard RAISE 先于列级 CHECK (FUSION-OS-11)', () => {
  const db = new Database(':memory:');
  try {
    runMigrations(db);
    // BEFORE INSERT trigger 先于列级 CHECK + FK,第六值在 trigger 层即被拒(trigger RAISE,非 CHECK)。
    assert.throws(
      () => insertVerdictNode(db, 'v-sixth', SIXTH),
      /verdict enum guard/i,
    );
  } finally {
    db.close();
  }
});

test('verdict_nodes_update_sixth_value_rejected_by_trigger: 合法 INCONCLUSIVE 行 UPDATE verdict=SUPER_CONFIRMED → enum guard RAISE', () => {
  const db = new Database(':memory:');
  try {
    runMigrations(db);
    seedEvidenceChain(db, 'ev-guard');
    insertVerdictNode(db, 'v-legal', 'INCONCLUSIVE');
    assert.throws(
      () => db.prepare('UPDATE verdict_nodes SET verdict = ? WHERE verdict_id = ?').run(SIXTH, 'v-legal'),
      /verdict enum guard/i,
    );
  } finally {
    db.close();
  }
});

test('proof_envelopes_v2_insert_sixth_conclusion_rejected_by_trigger: INSERT conclusion=SUPER_CONFIRMED → enum guard RAISE', () => {
  const db = new Database(':memory:');
  try {
    runMigrations(db);
    assert.throws(
      () => insertV2Envelope(db, 'env-sixth', SIXTH),
      /conclusion enum guard/i,
    );
  } finally {
    db.close();
  }
});

test('valid_five_values_pass_enum_guard: 五值 INSERT 通过 trigger(不误伤合法裁决·proof_envelopes_v2 全五值 + verdict_nodes CONFIRMED)', () => {
  const db = new Database(':memory:');
  try {
    runMigrations(db);
    seedEvidenceChain(db, 'ev-guard');
    insertVerdictNode(db, 'v-confirmed', 'CONFIRMED');
    for (const v of FIVE_VALUES) {
      insertV2Envelope(db, `env-${v}`, v);
    }
    const verdictRow = db.prepare("SELECT verdict FROM verdict_nodes WHERE verdict_id = 'v-confirmed'").get() as { verdict: string };
    assert.equal(verdictRow.verdict, 'CONFIRMED');
    const envelopeCount = db.prepare('SELECT COUNT(*) AS c FROM proof_envelopes_v2').get() as { c: number };
    assert.equal(envelopeCount.c, FIVE_VALUES.length, 'all five values must pass enum guard (no false positives)');
  } finally {
    db.close();
  }
});
