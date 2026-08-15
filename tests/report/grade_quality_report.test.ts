/**
 * GRADE 质量层 report 消费测试。
 *
 * 背景：上游 fecAppendClaim 传 studyDesign 后 verdict_trace 携带 evidenceQualityTier/Note，
 * report 的 Verdict nodes 段必须展示质量标注（用户可感知 GRADE 层级）。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/index.ts';
import { fecAppendClaim } from '../../src/fec/index.ts';
import { generateReport } from '../../src/report/generator.ts';
import { makeValidFec } from '../fec/fixtures.ts';
import type {
  EvidenceRecord,
  FalsificationSpec,
  SourceAnchor,
  ThresholdSpec,
} from '../../src/falsifiability/index.ts';

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

const thresholdSpec: ThresholdSpec = { semantics: 'gt', value: 0.85 };

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

test('P0-11: report Verdict nodes section renders GRADE evidence quality when studyDesign provided', () => {
  const db = openDb();
  try {
    const evidence: EvidenceRecord = {
      claim: 'measured accuracy is 0.91',
      metricValue: 0.91,
      supportsClaim: false,
      refutesClaim: true,
      scopeNarrowerThanClaim: false,
      sourceAnchor,
    };
    const runId = 'grade-report-run';
    fecAppendClaim(db, {
      callRecord: {
        stageId: 'stage3_hypothesis',
        cred: {
          modelId: 'offline-replay-fixture',
          dashscopeRequestId: null,
          reproHash: 'a'.repeat(64),
          gitCommitSha: sourceAnchor.gitCommitSha,
          isoTimestamp: sourceAnchor.isoTimestamp,
        },
        payloadKind: 'hypothesis',
        purposeTag: 'hypothesis',
      },
      callAudit: {
        requestPayload: '{"prompt":"claim"}',
        responsePayload: '{"claim":"accuracy should be high"}',
        finishReason: 'stop',
        usageTokensTotal: 12,
      },
      appendOptions: { providerProfile: 'offline_replay' },
      evidencePayload: { claim: falsificationSpec.prediction },
      sourceAnchor,
      claim: falsificationSpec.prediction,
      falsificationSpec,
      thresholdSpec,
      evidences: [evidence],
      parentVerdictId: null,
      nodeKind: 'root',
      fecV2: { contract: makeValidFec() },
      studyDesign: 'rct',
    });

    const report = generateReport({ db, runId });
    const verdictSection = report.sections.find((s) => s.title === 'Verdict nodes');
    assert.ok(verdictSection !== undefined, 'Verdict nodes section must exist');
    // RED 契约：report 必须展示 GRADE 质量标注（修复前 buildVerdictNodesSection 无质量行）。
    assert.match(
      verdictSection.body,
      /Evidence quality/,
      'report must render Evidence quality row',
    );
    assert.match(
      verdictSection.body,
      /tier 1|high/,
      'report must render GRADE tier/level for rct study design',
    );
  } finally {
    db.close();
  }
});

test('P0-11: report omits quality row when studyDesign not provided (zero regression)', () => {
  const db = openDb();
  try {
    const evidence: EvidenceRecord = {
      claim: 'measured accuracy is 0.91',
      metricValue: 0.91,
      supportsClaim: false,
      refutesClaim: true,
      scopeNarrowerThanClaim: false,
      sourceAnchor,
    };
    const runId = 'grade-report-run-nostudy';
    fecAppendClaim(db, {
      callRecord: {
        stageId: 'stage3_hypothesis',
        cred: {
          modelId: 'offline-replay-fixture',
          dashscopeRequestId: null,
          reproHash: 'a'.repeat(64),
          gitCommitSha: sourceAnchor.gitCommitSha,
          isoTimestamp: sourceAnchor.isoTimestamp,
        },
        payloadKind: 'hypothesis',
        purposeTag: 'hypothesis',
      },
      callAudit: {
        requestPayload: '{"prompt":"claim"}',
        responsePayload: '{"claim":"accuracy should be high"}',
        finishReason: 'stop',
        usageTokensTotal: 12,
      },
      appendOptions: { providerProfile: 'offline_replay' },
      evidencePayload: { claim: falsificationSpec.prediction },
      sourceAnchor,
      claim: falsificationSpec.prediction,
      falsificationSpec,
      thresholdSpec,
      evidences: [evidence],
      parentVerdictId: null,
      nodeKind: 'root',
      fecV2: { contract: makeValidFec() },
    });

    const report = generateReport({ db, runId });
    const verdictSection = report.sections.find((s) => s.title === 'Verdict nodes');
    assert.ok(verdictSection !== undefined);
    assert.doesNotMatch(
      verdictSection.body,
      /Evidence quality/,
      'no studyDesign → no quality row (transparency layer opt-in)',
    );
  } finally {
    db.close();
  }
});
