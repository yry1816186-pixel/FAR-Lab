/**
 * GRADE 证据质量层接线测试（阶段 7 P0-11 · CR2-1/2 修复）。
 *
 * 背景（findings CR2-1/2）：verdict kernel 已支持 studyDesign 可选输入并产出
 * evidenceQualityTier / evidenceQualityNote（透明度层·不进 verdict·不进 proofHash），
 * 但上游 orchestrator.fecAppendClaim 不透传 studyDesign（args 无该字段）、
 * buildVerdictKernelInput 不接线——生产路径的 GRADE 质量标注恒缺。本测试锁死：
 *
 *   1. fecAppendClaim 传 studyDesign/robAssessments → kernelOutput.evidenceQualityTier
 *      按 GRADE 层级产出（rct→tier 1）；verdictTrace 携带质量元数据（report 消费源）。
 *   2. 不传 studyDesign → 输出与历史完全一致（零回归·透明层可选）。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/index.ts';
import { fecAppendClaim } from '../../src/fec/index.ts';
import { makeValidFec } from './fixtures.ts';
import type {
  EvidenceRecord,
  FalsificationSpec,
  SourceAnchor,
  ThresholdSpec,
} from '../../src/falsifiability/index.ts';
import type { RobAssessment } from '../../src/evidence_quality/types.ts';

const sourceAnchor: SourceAnchor = {
  gitCommitSha: 'b'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'c'.repeat(64),
};

const falsificationSpec: FalsificationSpec = {
  prediction: 'accuracy should be at least 0.85',
  metric: 'accuracy',
  falsificationThreshold: 0.85,
  thresholdSemantics: 'gt',
};

const thresholdSpec: ThresholdSpec = {
  semantics: 'gt',
  value: 0.85,
};

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

function buildArgs(
  extra: {
    studyDesign?: 'rct' | 'quasi_experimental' | 'observational' | 'case_report' | 'expert_opinion' | 'unspecified';
    robAssessments?: readonly RobAssessment[];
  } = {},
) {
  const fec = makeValidFec();
  const evidence: EvidenceRecord = {
    claim: 'measured accuracy is 0.91',
    metricValue: 0.91,
    supportsClaim: false,
    refutesClaim: true,
    scopeNarrowerThanClaim: false,
    sourceAnchor,
  };
  return {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'a'.repeat(64),
        gitCommitSha: sourceAnchor.gitCommitSha,
        isoTimestamp: sourceAnchor.isoTimestamp,
      },
      payloadKind: 'hypothesis' as const,
      purposeTag: 'hypothesis' as const,
    },
    callAudit: {
      requestPayload: '{"prompt":"claim"}',
      responsePayload: '{"claim":"accuracy should be high"}',
      finishReason: 'stop' as const,
      usageTokensTotal: 12,
    },
    appendOptions: { providerProfile: 'offline_replay' as const },
    evidencePayload: { claim: falsificationSpec.prediction },
    sourceAnchor,
    claim: falsificationSpec.prediction,
    falsificationSpec,
    thresholdSpec,
    evidences: [evidence],
    parentVerdictId: null,
    nodeKind: 'root' as const,
    fecV2: { contract: fec },
    ...extra,
  };
}

test('P0-11: fecAppendClaim with studyDesign=rct produces evidenceQualityTier=1 (GRADE wired)', () => {
  const db = openDb();
  try {
    const result = fecAppendClaim(
      db,
      buildArgs({
        studyDesign: 'rct',
        robAssessments: [
          { domain: 'sequence_generation', risk: 'low' },
          { domain: 'allocation_concealment', risk: 'low' },
          { domain: 'blinding_participants', risk: 'low' },
          { domain: 'blinding_outcome_assessment', risk: 'low' },
          { domain: 'incomplete_outcome_data', risk: 'low' },
          { domain: 'selective_reporting', risk: 'low' },
          { domain: 'other_bias', risk: 'low' },
        ] as readonly RobAssessment[],
      }),
    );
    // RED 契约：kernelOutput 必须携带 GRADE 层级（修复前 buildVerdictKernelInput 不透传 studyDesign）。
    assert.equal(
      result.kernelOutput.evidenceQualityTier,
      1,
      'rct studyDesign must grade to tier 1 (GRADE high)',
    );
    assert.match(
      result.kernelOutput.evidenceQualityNote ?? '',
      /high/,
      'quality note must reflect GRADE overall level',
    );
    // 落库 trace 必须携带质量元数据（report 消费源·审计可追溯）。
    assert.equal(result.verdictNode.verdictTrace.evidenceQualityTier, 1);
  } finally {
    db.close();
  }
});

test('P0-11: without studyDesign the output is unchanged (transparency layer opt-in, zero regression)', () => {
  const db = openDb();
  try {
    const result = fecAppendClaim(db, buildArgs());
    assert.equal(result.kernelOutput.evidenceQualityTier, undefined);
    assert.equal(result.verdictNode.verdictTrace.evidenceQualityTier, undefined);
  } finally {
    db.close();
  }
});
