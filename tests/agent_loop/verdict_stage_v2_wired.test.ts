import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/index.ts';
import { appendRecord } from '../../src/evidence_log/index.ts';
import { GENESIS_PREV_HASH } from '../../src/evidence_log/types.ts';
import { runVerdictStage } from '../../src/agent_loop/verdict_stage.ts';
import type { StageArtifact } from '../../src/agent_loop/types.ts';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  appendRecord(
    db,
    {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'a'.repeat(64),
        gitCommitSha: 'b'.repeat(40),
        isoTimestamp: '2026-06-30T00:00:00.000Z',
      },
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
    },
    {
      requestPayload: '{"q":1}',
      responsePayload: '{"a":1}',
      finishReason: 'stop',
      usageTokensTotal: 0,
    },
    { providerProfile: 'offline_replay' },
  );
  return db;
}

function artifacts(): readonly StageArtifact[] {
  return [
    {
      stageId: 'stage3_hypothesis',
      payloadKind: 'hypothesis',
      structured: {
        kind: 'hypothesis',
        claim: 'vote-only literature evidence supports this claim',
        falsificationMethod: {
          prediction: 'effect size exceeds threshold',
          metric: 'effect_size',
          comparator: 'gt',
          value: 0.8,
        },
        supportingCitations: [],
        scopeSlipText: 'test scope',
      },
      callResult: {
        credential: {
          providerProfile: 'offline_replay',
          providerRequestId: null,
          modelId: 'offline-replay-fixture',
          modelVersion: null,
          capability: 'structured',
          isoTimestamp: '2026-06-30T00:00:00.000Z',
          tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
        content: '',
        raw: null,
      },
      degraded: false,
      degradationReason: null,
    },
    {
      stageId: 'stage4_evidence',
      payloadKind: 'experiment',
      structured: {
        kind: 'evidence',
        evidenceRecords: [
          {
            evidenceId: 'ev-1',
            supportsOrRefutes: 'supports',
            entailmentScore: 0.99,
            source: { evidenceId: 'ev-1', source: 'other', doi: null, title: 'supporting paper' },
          },
        ],
        conflictingEvidenceCount: 0,
      },
      callResult: {
        credential: {
          providerProfile: 'offline_replay',
          providerRequestId: null,
          modelId: 'offline-replay-fixture',
          modelVersion: null,
          capability: 'structured',
          isoTimestamp: '2026-06-30T00:00:00.000Z',
          tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
        content: '',
        raw: null,
      },
      degraded: false,
      degradationReason: null,
    },
  ];
}

// 诚实命名（闭合 P0-2b 审计缺口：原名 stage_emits_reasonCodes_ruleTrace 暗示断言 reasonCodes/ruleTrace，
// 实则只断言 verdict==='CONFIRMED'）。本测试断言的是 stage 真实持久化的内容：
//   - decideFiveValueVerdict (V2 kernel) 真被生产路径调用（非 V1 makeVerdict）
//   - 内核输出经 verdictResultFromKernelOutput 落入 VerdictNode 并写入 verdict_nodes（含真实哈希链）
//
// reasonCodes/ruleTrace/decisiveRuleId 由内核产出且已由 verify_golden.ts 的 golden-vector 路径覆盖
// （decideFiveValueVerdict 直测·GV-01..GV-12）。stage 不持久化这三字段（verdict_nodes 表无对应列·
// verdictResultFromKernelOutput:299 仅展平为 untestedReason）—— 把它们接入持久化是独立的 schema 扩展
// （P0-2-EXT·见 FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md §F），不在本测试范围内假装。
//
// 单一真实依赖：src/agent_loop/verdict_stage.ts:245 decideFiveValueVerdict 真实调用 +
// src/falsifiability/repository.ts:58 recordVerdict 真实写入哈希链。

test('stage_wires_v2_kernel_and_persists_confirmed_verdict_via_vote_bridge', () => {
  const db = openDb();
  try {
    const verdictNode = runVerdictStage({
      db,
      artifacts: artifacts(),
      gitCommitSha: 'b'.repeat(40),
      runId: 'run-v2-wired',
    });

    assert.ok(verdictNode !== null, 'runVerdictStage must return a persisted VerdictNode');

    // 1 vote-supports → legacy 桥接（effectSize=1/adjustedP=0/integrityFlags 空）→ R7 CONFIRMED
    // （恢复 V1 契约·与 executeLoop hero demo 同源；vote-only 经 evidenceToStatisticalResult 桥接）。
    assert.equal(verdictNode.verdict, 'CONFIRMED');

    // V2 kernel 经 verdictResultFromKernelOutput 落入 VerdictNode 的派生字段（非预制）：
    //   - metricValue = statisticalReport.primaryEffectSize（1 票 supports → 1.0）
    //   - conflictingEvidenceCount = statisticalReport.conflicting ? 1 : 0（fixture 0 冲突 → 0）
    //   - untestedReason 仅在 UNTESTED 时非空（CONFIRMED → null）
    assert.equal(verdictNode.metricValue, 1, 'vote-bridge primaryEffectSize for 1 supporting vote');
    assert.equal(verdictNode.conflictingEvidenceCount, 0);
    assert.equal(verdictNode.untestedReason, null);

    // 哈希链真实写入（防篡改核心价值）：首条 verdict → prevHash = GENESIS_PREV_HASH；
    // currentHash = sha256(canonical(verdictId/evidenceId/.../prevHash))；rawResponseHash = 裁决输入指纹。
    assert.equal(verdictNode.prevHash, GENESIS_PREV_HASH, 'first verdict in chain must anchor to genesis');
    assert.match(verdictNode.currentHash, /^[0-9a-f]{64}$/, 'currentHash must be real sha256 (chain integrity)');
    assert.match(
      verdictNode.sourceAnchor.rawResponseHash,
      /^[0-9a-f]{64}$/,
      'rawResponseHash must be the real sha256 fingerprint of the verdict input (verdictInputHash)',
    );
    assert.ok(verdictNode.verdictId.length > 0, 'verdictId must be persisted (ULID)');
  } finally {
    db.close();
  }
});
