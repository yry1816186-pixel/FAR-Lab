// tests/report/tool_event_reconciliation.test.ts
//
// CORE-TOOL-001 验收：「报告中的工具事件与真实日志一致 // 关键事实具有独立复核。」
//   1. reconcileCallRecords：报告数据源 ↔ call_records 直查行对拍（seq/字段/伪 token 分道）
//   2. independentFactReview：报告关键事实（裁决计数/锚点数/伪 token 量）独立 SQL 第二路径重算对拍
//   3. measured=0 伪 token 必须走伪计量分道——冒充真实调用即红

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/index.ts';
import { appendRecord, appendEvidenceLog } from '../../src/evidence_log/index.ts';
import { recordVerdict } from '../../src/falsifiability/index.ts';
import type { RecordVerdictArgs } from '../../src/falsifiability/index.ts';
import { FIXTURE_VERDICT_TRACE } from '../falsifiability/_verdict_trace_fixture.ts';
import { generateReport } from '../../src/report/generator.ts';
import {
  independentFactReview,
  reconcileCallRecords,
  reportCallRecordSource,
  type RawCallRecordRow,
} from '../../src/report/independent_review.ts';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

function seedCall(db: Database.Database, stageId: string, usage: number, pseudo: boolean): number {
  return appendRecord(
    db,
    {
      stageId,
      cred: {
        modelId: pseudo ? 'offline_replay' : 'qwen3.7-max',
        dashscopeRequestId: pseudo ? null : 'req-real-1',
        reproHash: 'a'.repeat(64),
        gitCommitSha: 'f'.repeat(40),
        isoTimestamp: '2026-08-17T00:00:00Z',
      },
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
    },
    {
      requestPayload: '{"p":"1"}',
      // 伪 token 标记走 response_payload.credential.tokenUsage.measured（与生产提取口径一致）
      responsePayload: pseudo
        ? JSON.stringify({ credential: { tokenUsage: { measured: false, totalTokens: usage } } })
        : JSON.stringify({ credential: { tokenUsage: { measured: true, totalTokens: usage } } }),
      finishReason: 'stop',
      usageTokensTotal: usage,
    },
    { providerProfile: pseudo ? 'offline_replay' : 'dashscope' },
  ).seq;
}

function seedVerdict(db: Database.Database, evidenceSeq: number, verdict: RecordVerdictArgs['verdict']): void {
  const evidenceId = appendEvidenceLog(db, {
    callRecordSeq: evidenceSeq,
    evidencePayload: { seed: evidenceSeq },
    sourceAnchor: {
      gitCommitSha: 'f'.repeat(40),
      dashscopeRequestId: null,
      isoTimestamp: '2026-08-17T00:00:00Z',
      rawResponseHash: 'b'.repeat(64),
    },
  }).evidenceId;
  recordVerdict(db, {
    evidenceId,
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    verdict,
    falsificationSpec: {
      prediction: 'accuracy reaches 0.85',
      metric: 'accuracy',
      falsificationThreshold: 0.85,
      thresholdSemantics: 'gt',
    },
    thresholdSpec: { semantics: 'gt', value: 0.85 },
    metricValue: 0.91,
    conflictingEvidenceCount: 0,
    scopeSlipText: null,
    untestedReason: null,
    sourceAnchor: {
      gitCommitSha: 'f'.repeat(40),
      dashscopeRequestId: null,
      isoTimestamp: '2026-08-17T00:00:00Z',
      rawResponseHash: 'b'.repeat(64),
    },
    replayProver: null,
    verdictTrace: FIXTURE_VERDICT_TRACE,
  });
}

/** 库内直查行（独立于报告查询路径的原始形态）。 */
function rawRows(db: Database.Database): RawCallRecordRow[] {
  return db
    .prepare('SELECT seq, stage_id, model_id, created_at, usage_tokens_total, response_payload FROM call_records ORDER BY seq')
    .all()
    .map((r) => {
      const row = r as Record<string, unknown>;
      let measured: number | null = null;
      try {
        const payload = JSON.parse(String(row.response_payload)) as { credential?: { tokenUsage?: { measured?: boolean } } };
        if (payload.credential?.tokenUsage?.measured === false) measured = 0;
        else if (payload.credential?.tokenUsage?.measured === true) measured = 1;
      } catch {
        measured = null;
      }
      return {
        seq: Number(row.seq),
        stage_id: String(row.stage_id),
        model_id: String(row.model_id),
        created_at: String(row.created_at),
        usage_tokens_total: row.usage_tokens_total === null ? null : Number(row.usage_tokens_total),
        measured,
      };
    });
}

test('TOOL-001: 报告工具事件与 call_records 直查全量一致（seq/字段/伪 token 分道）', () => {
  const db = openDb();
  try {
    const seqPseudo = seedCall(db, 'stage3_hypothesis', 1200, true);
    const seqReal = seedCall(db, 'stage4_evidence', 340, false);
    seedVerdict(db, seqReal, 'CONFIRMED');

    const source = reportCallRecordSource(db);
    const report = generateReport({ db, runId: 'run-tool-1' });

    const recon = reconcileCallRecords(source.rows, rawRows(db), source.pseudoTokenTotal);
    assert.deepEqual(recon.seqMismatches, []);
    assert.deepEqual(recon.fieldMismatches, []);
    assert.deepEqual(recon.pseudoAsReal, []);
    assert.equal(recon.ok, true);

    // 伪 token 分道确实分开了（1200 伪 / 340 真）
    assert.equal(source.pseudoTokenTotal, 1200);
    assert.equal(source.rows.find((r) => r.seq === seqReal)!.measured, 1);
    assert.equal(source.rows.find((r) => r.seq === seqPseudo)!.measured, 0);
    // 报告正文把伪计量显式分道披露（不冒充真实调用）
    const md = JSON.stringify(report.sections.map((s) => s.body));
    assert.match(md, /pseudo/i);
  } finally {
    db.close();
  }
});

test('TOOL-001 fail-closed: 报告口径与库行漂移（伪 token 计入真实分道）被对拍检出', () => {
  const db = openDb();
  try {
    seedCall(db, 'stage3_hypothesis', 1200, true);
    seedCall(db, 'stage4_evidence', 340, false);
    const source = reportCallRecordSource(db);
    // 篡改：把伪总量压成 0（=伪 token 被混入真实口径的等价表象）
    const tampered = reconcileCallRecords(source.rows, rawRows(db), 0);
    assert.equal(tampered.ok, false);
    assert.match(tampered.pseudoAsReal[0]!, /pseudo-token accounting drift/);
  } finally {
    db.close();
  }
});

test('TOOL-001 fail-closed: 库侧缺行 / 报告侧多行都被枚举', () => {
  const a: RawCallRecordRow = { seq: 1, stage_id: 's1', model_id: 'm', created_at: 't1', usage_tokens_total: 10, measured: 1 };
  const b: RawCallRecordRow = { seq: 2, stage_id: 's2', model_id: 'm', created_at: 't2', usage_tokens_total: 20, measured: 1 };
  const missing = reconcileCallRecords([a, b], [a], 0);
  assert.equal(missing.ok, false);
  assert.ok(missing.seqMismatches.some((m) => m.includes('absent from report source') || m.includes('missing from call_records')));
  // 字段漂移
  const drifted = reconcileCallRecords(
    [{ ...a, stage_id: 'WRONG' }],
    [a],
    0,
  );
  assert.ok(drifted.fieldMismatches.some((m) => m.includes('stage/model/created_at drift')));
});

test('TOOL-001: 关键事实第二路径独立复核（裁决计数/锚点数/伪 token 量）全对拍通过', () => {
  const db = openDb();
  try {
    seedCall(db, 'stage3_hypothesis', 1200, true);
    const s2 = seedCall(db, 'stage4_evidence', 340, false);
    const s3 = seedCall(db, 'stage4_evidence', 210, false);
    seedVerdict(db, s2, 'CONFIRMED');
    seedVerdict(db, s3, 'INCONCLUSIVE');

    const source = reportCallRecordSource(db);
    const report = generateReport({ db, runId: 'run-tool-2' });
    const review = independentFactReview(db, report, source.pseudoTokenTotal);

    assert.equal(review.ok, true, JSON.stringify(review.checks));
    const byFact = new Map(review.checks.map((c) => [c.fact, c]));
    assert.equal(byFact.get('verdictSummary.CONFIRMED')!.independentValue, 1);
    assert.equal(byFact.get('verdictSummary.INCONCLUSIVE')!.independentValue, 1);
    assert.equal(byFact.get('verdictSummary.REFUTED')!.independentValue, 0);
    assert.equal(byFact.get('sourceAnchorCount')!.independentValue, 2);
    assert.equal(byFact.get('pseudoTokenTotal')!.independentValue, 1200);
  } finally {
    db.close();
  }
});

test('TOOL-001 fail-closed: 报告与库漂移时独立复核红（缺口可定位）', () => {
  const db = openDb();
  try {
    const pseudoSeq = seedCall(db, 'stage3_hypothesis', 500, true);
    seedVerdict(db, pseudoSeq, 'CONFIRMED');
    void pseudoSeq;
    const report = generateReport({ db, runId: 'run-tool-3' });
    // 伪造一份与库漂移的「报告事实」（CONFIRMED 计数多报 1）
    const forgedSummary = { ...report.verdictSummary, CONFIRMED: (report.verdictSummary.CONFIRMED ?? 0) + 1 };
    const forged = { ...report, verdictSummary: forgedSummary };
    const review = independentFactReview(db, forged, 0);
    assert.equal(review.ok, false);
    assert.ok(review.checks.some((c) => c.fact === 'verdictSummary.CONFIRMED' && !c.ok));
    assert.ok(review.checks.some((c) => c.fact === 'pseudoTokenTotal' && !c.ok));
  } finally {
    db.close();
  }
});
