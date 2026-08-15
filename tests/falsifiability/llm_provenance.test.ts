// tests/falsifiability/llm_provenance.test.ts
//
// FUSION-OS-6 端到端 RED→GREEN：LLM 产出 provenance 字段强制 null + 系统 hash 重算绑定 + ProvenanceClass tag。
//
// 单一真实依赖：真实 appendEvidenceLog（src/evidence_log/repository.ts）fail-closed 门 +
// 真实 bindProvenance（src/falsifiability/external_facts.ts）调 hashCanonicalJson 系统侧重导出 systemClaimHash。
// 非 Fake 后端、非硬编码 hash（systemClaimHash 由 hashCanonicalJson 重算）。
//
// RED→GREEN 论证：
//   RED（接线前）：extractExternalFact（external_facts.ts:26-30）直通 response.credential.dashscopeRequestId /
//     isoTimestamp（LLM 自填）→ SourceAnchor 携带 LLM 自填字段 → 无 provenanceClass tag → LLM 产出可伪造成可信来源。
//   GREEN（接线后）：0017 加 provenance_class + system_claim_hash 列；appendEvidenceLog fail-closed：
//     llm_generated 须 systemClaimHash 非空 + sourceAnchor.dashscopeRequestId=null（forged marker 检测）；
//     bindProvenance 系统侧重导出 systemClaimHash + 强制 anchor.dashscopeRequestId=null（闭合来源不可自填窗口）。
//
// 反剧场红线（FUSION-OS-6）：来源不可自填 / LLM 不作最终裁决者。LLM 产出的 provenance 字段
// （providerRequestId / isoTimestamp）禁止直通可信 SourceAnchor；系统持有 claimText + canonicalSystemInput 重导出 hash。
//
// Authority: FUSION-OS-6（data_vid=None + forged marker 范式）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/migrator.ts';
import { bindProvenance } from '../../src/falsifiability/index.ts';
import {
  appendEvidenceLog,
  appendRecord,
  hashCanonicalJson,
} from '../../src/evidence_log/index.ts';
import type {
  AppendEvidenceLogArgs,
  AppendRecordInput,
  AppendRecordOptions,
  CallAuditData,
  SourceAnchor,
} from '../../src/evidence_log/index.ts';
import type { LlmResponse } from '../../src/llm_gateway/types.ts';

const GIT_COMMIT_SHA = 'a'.repeat(40);
const SYSTEM_ISO_TIMESTAMP = '2026-07-06T00:00:00Z';

const LLM_RESPONSE: LlmResponse = {
  credential: {
    providerProfile: 'competition_aliyun_qwen',
    // LLM 自填的 request id（攻击面·extractExternalFact 旧路径直通此处）。
    providerRequestId: 'req-from-llm-forgable-xyz',
    modelId: 'qwen-test',
    modelVersion: '1.0',
    capability: 'reasoning',
    // LLM 自填的时间戳（攻击面·extractExternalFact 旧路径直通此处）。
    isoTimestamp: '2026-07-06T00:00:00Z',
    tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  },
  content: 'adapter A achieves macro-F1 >= 0.80 on the held-out test set',
  raw: { finish: 'stop' },
};

function appendCallRecord(db: Database.Database): number {
  const input: AppendRecordInput = {
    stageId: 'stage3_hypothesis',
    cred: {
      modelId: 'offline-replay-fixture',
      dashscopeRequestId: null,
      reproHash: 'c'.repeat(64),
      gitCommitSha: GIT_COMMIT_SHA,
      isoTimestamp: SYSTEM_ISO_TIMESTAMP,
    },
    payloadKind: 'hypothesis',
    purposeTag: 'hypothesis',
  };
  const audit: CallAuditData = {
    requestPayload: '{"prompt":"FUSION-OS-6 provenance"}',
    responsePayload: '{"claim":"llm-provenance-e2e"}',
    finishReason: 'stop',
    usageTokensTotal: 15,
  };
  const options: AppendRecordOptions = { providerProfile: 'offline_replay' };
  return appendRecord(db, input, audit, options).seq;
}

// 伪造 anchor：模拟旧 extractExternalFact 路径——LLM 自填的 dashscopeRequestId 直通 SourceAnchor。
const FORGED_ANCHOR: SourceAnchor = {
  gitCommitSha: GIT_COMMIT_SHA,
  dashscopeRequestId: LLM_RESPONSE.credential.providerRequestId, // LLM 自填·未强制 null → forged
  isoTimestamp: LLM_RESPONSE.credential.isoTimestamp,
  rawResponseHash: 'd'.repeat(64),
};

const CLEAN_ANCHOR: SourceAnchor = {
  gitCommitSha: GIT_COMMIT_SHA,
  dashscopeRequestId: null,
  isoTimestamp: SYSTEM_ISO_TIMESTAMP,
  rawResponseHash: 'd'.repeat(64),
};

test('llm_asserted_anchor_flagged_forged: llm_generated 带 LLM 自填 anchor / 缺 systemClaimHash → fail-closed 拒绝', () => {
  const db = new Database(':memory:');
  try {
    runMigrations(db);
    const seq = appendCallRecord(db);

    // 1. forged marker：provenanceClass=llm_generated 但 anchor.dashscopeRequestId !== null
    //    （LLM 自填字段未强制 null·模拟 extractExternalFact 旧路径直通）→ appendEvidenceLog fail-closed 抛错。
    const forgedArgs: AppendEvidenceLogArgs = {
      callRecordSeq: seq,
      evidencePayload: { claimId: 'forged', value: 0.9 },
      sourceAnchor: FORGED_ANCHOR,
      provenanceClass: 'llm_generated',
      systemClaimHash: hashCanonicalJson({ claimText: 'x', canonicalSystemInput: {}, rawResponseHash: 'd'.repeat(64) }),
    };
    assert.throws(
      () => appendEvidenceLog(db, forgedArgs),
      /dashscopeRequestId=null.*forged marker detected/,
      'llm_generated evidence with LLM-asserted dashscopeRequestId must be rejected (来源不可自填)',
    );

    // 2. 缺 systemClaimHash：provenanceClass=llm_generated + 干净 anchor 但 systemClaimHash=null
    //    → fail-closed 抛错（LLM 产出必须绑系统侧重算 hash）。
    const unboundArgs: AppendEvidenceLogArgs = {
      callRecordSeq: seq,
      evidencePayload: { claimId: 'unbound', value: 0.9 },
      sourceAnchor: CLEAN_ANCHOR,
      provenanceClass: 'llm_generated',
      systemClaimHash: null,
    };
    assert.throws(
      () => appendEvidenceLog(db, unboundArgs),
      /systemClaimHash.*来源不可自填/,
      'llm_generated evidence without systemClaimHash must be rejected',
    );
  } finally {
    db.close();
  }
});

test('bindProvenance_produces_clean_llm_anchor_accepted: bindProvenance 强制 null + 系统 hash → appendEvidenceLog 放行', () => {
  const db = new Database(':memory:');
  try {
    runMigrations(db);
    const seq = appendCallRecord(db);

    const claimText = 'adapter A achieves macro-F1 >= 0.80 on the held-out test set';
    const bound = bindProvenance(LLM_RESPONSE, {
      gitCommitSha: GIT_COMMIT_SHA,
      isoTimestamp: SYSTEM_ISO_TIMESTAMP,
      claimText,
      canonicalSystemInput: { dataset: 'held-out', metric: 'macro_f1', seed: 42 },
    });

    // bindProvenance 闭合来源不可自填窗口：
    assert.equal(bound.provenanceClass, 'llm_generated');
    assert.equal(bound.anchor.dashscopeRequestId, null, 'bindProvenance 须强制 dashscopeRequestId=null（LLM 自填字段剥离）');
    assert.equal(bound.anchor.isoTimestamp, SYSTEM_ISO_TIMESTAMP, 'isoTimestamp 取系统侧·非 response.credential');
    assert.match(bound.systemClaimHash, /^[0-9a-f]{64}$/, 'systemClaimHash 须为 64-hex');
    assert.equal(
      bound.systemClaimHash,
      hashCanonicalJson({
        claimText,
        canonicalSystemInput: { dataset: 'held-out', metric: 'macro_f1', seed: 42 },
        rawResponseHash: bound.anchor.rawResponseHash,
      }),
      'systemClaimHash 须 = sha256(canonical {claimText, canonicalSystemInput, rawResponseHash})',
    );

    // appendEvidenceLog 放行清洁绑定 + 落 provenance_class + system_claim_hash 列。
    const entry = appendEvidenceLog(db, {
      callRecordSeq: seq,
      evidencePayload: { claimId: 'llm-bound', claimText, metric: 'macro_f1' },
      sourceAnchor: bound.anchor,
      provenanceClass: bound.provenanceClass,
      systemClaimHash: bound.systemClaimHash,
    });

    assert.equal(entry.provenanceClass, 'llm_generated', 'provenance_class 须落库');
    assert.equal(entry.systemClaimHash, bound.systemClaimHash, 'system_claim_hash 须落库');
    assert.equal(entry.sourceAnchor.dashscopeRequestId, null, '落库 anchor 仍 dashscopeRequestId=null');
  } finally {
    db.close();
  }
});

test('system_derived_evidence_zero_regression: 缺省 evidence 落 system_derived + 无 enforcement（零回归）', () => {
  const db = new Database(':memory:');
  try {
    runMigrations(db);
    const seq = appendCallRecord(db);

    // 不传 provenanceClass / systemClaimHash —— 既有 evidence 路径零回归。
    const entry = appendEvidenceLog(db, {
      callRecordSeq: seq,
      evidencePayload: { claimId: 'legacy', observation: 'raw-external' },
      sourceAnchor: CLEAN_ANCHOR,
    });

    assert.equal(entry.provenanceClass, 'system_derived', '缺省 provenance 须 = system_derived');
    assert.equal(entry.systemClaimHash, null, 'system_derived 不强制 systemClaimHash');
  } finally {
    db.close();
  }
});
