/**
 * generator.test.ts —— 报告生成器测试。
 *
 * 验证 generateReport 从 evidence_log + falsifiability repository
 * 聚合生成的 ReportData 的结构正确性。
 */

import { runMigrations } from '../../src/db/index.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ulid } from 'ulid';
import {
  generateReport,
  renderMarkdown,
  renderHtml,
} from '../../src/report/index.ts';
import type { ReportData } from '../../src/report/index.ts';
import { FIXTURE_VERDICT_TRACE } from '../falsifiability/_verdict_trace_fixture.ts';
import {
  appendRecord,
  appendEvidenceLog,
} from '../../src/evidence_log/index.ts';
import type {
  AppendRecordOptions,
  ProviderNeutralCredential,
  CallAuditData,
  SourceAnchor,
} from '../../src/evidence_log/index.ts';
import { recordVerdict } from '../../src/falsifiability/index.ts';
import type {
  FalsificationSpec,
  RecordVerdictArgs,
  VerdictNode,
} from '../../src/falsifiability/index.ts';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const OFFLINE_OPTIONS: AppendRecordOptions = {
  providerProfile: 'offline_replay',
};

const SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'b'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'c'.repeat(64),
};

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

function credential(index: number): ProviderNeutralCredential {
  return {
    modelId: `model-fixture-${index}`,
    dashscopeRequestId: null,
    reproHash: `${index}`.repeat(64).slice(0, 64),
    gitCommitSha: 'b'.repeat(40),
    isoTimestamp: `2026-06-27T00:00:0${index}.000Z`,
  };
}

function auditData(): CallAuditData {
  return {
    requestPayload: canonical({ prompt: 'test' }),
    responsePayload: canonical({ answer: 'response' }),
    finishReason: 'stop',
    usageTokensTotal: 100,
  };
}

/**
 * 构造 measured=false 的 response_payload（与 appendLlmResponseRecord 落库结构一致：
 * { content, credential: { tokenUsage: { measured, ... } }, raw }）。
 */
function pseudoAuditData(tokens: number): CallAuditData {
  return {
    requestPayload: canonical({ prompt: 'test' }),
    responsePayload: canonical({
      content: 'replay',
      credential: {
        providerProfile: 'offline_replay',
        tokenUsage: {
          inputTokens: 0,
          outputTokens: tokens,
          totalTokens: tokens,
          measured: false,
        },
      },
      raw: null,
    }),
    finishReason: 'stop',
    usageTokensTotal: tokens,
  };
}

function canonical(value: unknown): string {
  return JSON.stringify(value);
}

function falsificationSpec(): FalsificationSpec {
  return {
    prediction: 'accuracy >= 0.85',
    metric: 'accuracy',
    falsificationThreshold: 0.85,
    thresholdSemantics: 'gt',
  };
}

// ---------------------------------------------------------------------------
// Helpers: seed data
// ---------------------------------------------------------------------------

function seedCallRecord(
  db: Database.Database,
  stageId: string,
  purposeTag: 'hypothesis' | 'baseline_exempt',
  index: number,
): number {
  const result = appendRecord(
    db,
    {
      stageId,
      cred: credential(index),
      payloadKind: 'hypothesis',
      purposeTag,
    },
    auditData(),
    OFFLINE_OPTIONS,
  );
  return result.seq;
}

/** 写入自定义 model_id + 审计数据的记录（用于验证 measured 标记 vs 命名约定的区分）。 */
function seedRecord(
  db: Database.Database,
  stageId: string,
  modelId: string,
  audit: CallAuditData,
  purposeTag: 'hypothesis' | 'baseline_exempt' = 'hypothesis',
): number {
  const result = appendRecord(
    db,
    {
      stageId,
      cred: { ...credential(1), modelId },
      payloadKind: 'hypothesis',
      purposeTag,
    },
    audit,
    OFFLINE_OPTIONS,
  );
  return result.seq;
}

function seedEvidenceLog(
  db: Database.Database,
  callRecordSeq: number,
  evidenceId?: string,
): string {
  const args: {
    callRecordSeq: number;
    evidencePayload: Record<string, unknown>;
    sourceAnchor: SourceAnchor;
    evidenceId?: string;
  } = {
    callRecordSeq,
    evidencePayload: { test: true },
    sourceAnchor: SOURCE_ANCHOR,
  };
  if (evidenceId !== undefined) {
    args.evidenceId = evidenceId;
  }
  const entry = appendEvidenceLog(db, args);
  return entry.evidenceId;
}

function seedVerdictNode(
  db: Database.Database,
  evidenceId: string,
  overrides: Partial<RecordVerdictArgs> = {},
): VerdictNode {
  const spec = falsificationSpec();
  const args: RecordVerdictArgs = {
    evidenceId,
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    verdict: 'CONFIRMED',
    falsificationSpec: spec,
    thresholdSpec: { semantics: 'gt', value: 0.85 },
    metricValue: 0.92,
    conflictingEvidenceCount: 0,
    scopeSlipText: null,
    untestedReason: null,
    sourceAnchor: SOURCE_ANCHOR,
    replayProver: null,
    verdictTrace: FIXTURE_VERDICT_TRACE,
    ...overrides,
  };
  return recordVerdict(db, args);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('generateReport returns ReportData with correct structure for empty DB', () => {
  const db = openDb();
  const report = generateReport({ db, runId: 'test-run-empty' });

  assert.equal(report.runId, 'test-run-empty');
  assert.ok(report.generatedAt.length > 0);
  assert.equal(report.sourceAnchorCount, 0);
  assert.equal(report.reproHash, '');
  assert.deepStrictEqual(report.verdictSummary, {
    CONFIRMED: 0,
    REFUTED: 0,
    INCONCLUSIVE: 0,
    DEGRADED_SCOPE: 0,
    UNTESTED: 0,
  });
  assert.equal(report.sections.length, 6);

  // Sections should have expected titles
  const titles = report.sections.map((s) => s.title);
  assert.deepStrictEqual(titles, [
    'Executive summary',
    'Six-stage output summary',
    'Verdict nodes',
    'Evidence graph topology',
    'Hash-chain verification',
    'Limitations',
  ]);

  db.close();
});

test('generateReport throws on empty runId', () => {
  const db = openDb();
  assert.throws(
    () => generateReport({ db, runId: '' }),
    /runId must be non-empty/,
  );
  assert.throws(
    () => generateReport({ db, runId: '   ' }),
    /runId must be non-empty/,
  );
  db.close();
});

test('generateReport includes call record and verdict data', () => {
  const db = openDb();
  const runId = `run-${ulid()}`;

  // Seed 2 call records
  const seq1 = seedCallRecord(db, 'stage3_hypothesis', 'hypothesis', 1);
  const seq2 = seedCallRecord(db, 'stage4_evidence', 'hypothesis', 2);

  // Seed evidence entries
  const ev1 = seedEvidenceLog(db, seq1);
  const ev2 = seedEvidenceLog(db, seq2);

  // Seed 2 verdict nodes
  seedVerdictNode(db, ev1, { verdict: 'CONFIRMED' });
  seedVerdictNode(db, ev2, { verdict: 'REFUTED' });

  const report = generateReport({ db, runId });

  assert.equal(report.runId, runId);
  assert.equal(report.sourceAnchorCount, 2);
  assert.deepStrictEqual(report.verdictSummary, {
    CONFIRMED: 1,
    REFUTED: 1,
    INCONCLUSIVE: 0,
    DEGRADED_SCOPE: 0,
    UNTESTED: 0,
  });

  // Stage summary section should mention the stages
  const stageSection = report.sections.find(
    (s) => s.title === 'Six-stage output summary',
  );
  assert.ok(stageSection !== undefined);
  assert.ok(stageSection.body.includes('Hypothesis generation'));
  assert.ok(stageSection.body.includes('Evidence collection'));

  // Verdict section should include both verdicts
  const verdictSection = report.sections.find((s) => s.title === 'Verdict nodes');
  assert.ok(verdictSection !== undefined);
  assert.ok(verdictSection.body.includes('Confirmed'));
  assert.ok(verdictSection.body.includes('Refuted'));

  // Hash chain should be valid
  const hashSection = report.sections.find(
    (s) => s.title === 'Hash-chain verification',
  );
  assert.ok(hashSection !== undefined);
  assert.ok(hashSection.body.includes('passed'));

  // Evidence graph section should note no edges
  const graphSection = report.sections.find((s) => s.title === 'Evidence graph topology');
  assert.ok(graphSection !== undefined);
  assert.ok(graphSection.body.includes('0')); // 0 edges

  db.close();
});

test('pseudo tokens are counted via measured=false flag, not model_id naming', () => {
  const db = openDb();
  const runId = `run-${ulid()}`;

  // 伪 token 记录：model_id 不含 offline-replay 前缀（自定义 replay 模型名），measured=false → 应计入
  seedRecord(db, 'stage3_hypothesis', 'custom-replay-v2', pseudoAuditData(500), 'baseline_exempt');
  // 真实计量记录：同 stage，response_payload 无 credential（measured 缺失 → 视为真实计量）
  seedRecord(db, 'stage3_hypothesis', 'real-model-1', auditData());

  const report = generateReport({ db, runId });
  const stageSection = report.sections.find(
    (s) => s.title === 'Six-stage output summary',
  );
  assert.ok(stageSection !== undefined);

  // total = 500 + 100 = 600；pseudo = 500（按 measured=false 识别，而非 model_id 前缀）
  assert.ok(stageSection.body.includes('Total tokens: 600'));
  assert.ok(
    stageSection.body.includes(
      'Pseudo tokens (offline_replay char-estimate, not real metering): 500',
    ),
  );

  db.close();
});

test('offline-replay-prefixed model without measured=false is not counted as pseudo', () => {
  const db = openDb();
  const runId = `run-${ulid()}`;

  // model_id 以 offline-replay 开头，但 response_payload 无 measured=false 标记 →
  // 不再按命名约定计入伪 token（与 TokenUsage.measured 缺省 true 一致）
  seedRecord(db, 'stage3_hypothesis', 'offline-replay-fixture', auditData());

  const report = generateReport({ db, runId });
  const stageSection = report.sections.find(
    (s) => s.title === 'Six-stage output summary',
  );
  assert.ok(stageSection !== undefined);
  assert.ok(stageSection.body.includes('Total tokens: 100'));
  assert.ok(!stageSection.body.includes('Pseudo tokens'));

  db.close();
});

/** 真实计量 response_payload（tokenUsage 拆分 + measured 缺省 true）。 */
function realMeteredAuditData(inputTokens: number, outputTokens: number): CallAuditData {
  return {
    requestPayload: canonical({ prompt: 'test' }),
    responsePayload: canonical({
      content: 'response',
      credential: {
        providerProfile: 'competition_aliyun_qwen',
        tokenUsage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          // measured 缺省 true（真实计量）
        },
      },
      raw: null,
    }),
    finishReason: 'stop',
    usageTokensTotal: inputTokens + outputTokens,
  };
}

test('1128 效率面: per-stage USD cost line rendered from tokenUsage split', () => {
  const db = openDb();
  const runId = `run-${ulid()}`;

  // 真实计量 + priced 模型（qwen-plus：input 0.4 / output 1.2 每 M token）
  seedRecord(db, 'stage3_hypothesis', 'qwen-plus', realMeteredAuditData(1_000_000, 500_000));
  // 伪 token 记录（measured=false）：不参与成本核算（CU4-02 口径混叠消除）
  seedRecord(db, 'stage3_hypothesis', 'qwen-plus', pseudoAuditData(999_999_999), 'baseline_exempt');

  const report = generateReport({ db, runId });
  const stageSection = report.sections.find(
    (s) => s.title === 'Six-stage output summary',
  );
  assert.ok(stageSection !== undefined);

  // 成本 = 1M input × 0.4 + 0.5M output × 1.2 = 0.4 + 0.6 = $1.0000
  assert.ok(
    stageSection.body.includes('Estimated cost: $1.0000 (qwen-plus · 1000000 in / 500000 out tokens)'),
    `expected priced cost line, got:\n${stageSection.body}`,
  );
  // 伪 token 不混入成本行（成本仅真实计量记录参与——Cost 行不含伪 token 数）
  assert.ok(
    !stageSection.body.includes('Estimated cost: $4.00') && !stageSection.body.includes('Estimated cost: not priced'),
    'pseudo-token record must not join the cost calculation',
  );

  db.close();
});

test('1128 效率面: unpriced model → cost line honest "not priced"', () => {
  const db = openDb();
  const runId = `run-${ulid()}`;

  // 真实计量但价格表缺失的模型 → 诚实标注不可计价（fail-conservative）
  seedRecord(db, 'stage3_hypothesis', 'unknown-model-x', realMeteredAuditData(1000, 500));

  const report = generateReport({ db, runId });
  const stageSection = report.sections.find(
    (s) => s.title === 'Six-stage output summary',
  );
  assert.ok(stageSection !== undefined);
  assert.ok(
    stageSection.body.includes('Estimated cost: not priced (unknown-model-x missing from price table)'),
    `expected honest not-priced line, got:\n${stageSection.body}`,
  );

  db.close();
});

test('generateReport handles DEGRADED_SCOPE verdict', () => {
  const db = openDb();
  const runId = `run-${ulid()}`;

  const seq = seedCallRecord(db, 'stage4_evidence', 'hypothesis', 1);
  const evId = seedEvidenceLog(db, seq);
  seedVerdictNode(db, evId, {
    verdict: 'DEGRADED_SCOPE',
    scopeSlipText: 'scope was narrowed due to insufficient data',
    metricValue: null,
  });

  const report = generateReport({ db, runId });

  assert.deepStrictEqual(report.verdictSummary, {
    CONFIRMED: 0,
    REFUTED: 0,
    INCONCLUSIVE: 0,
    DEGRADED_SCOPE: 1,
    UNTESTED: 0,
  });

  const verdictSection = report.sections.find((s) => s.title === 'Verdict nodes');
  assert.ok(verdictSection !== undefined);
  assert.ok(verdictSection.body.includes('Degraded scope'));
  assert.ok(verdictSection.body.includes('scope was narrowed'));

  db.close();
});

test('generateReport handles UNTESTED verdict', () => {
  const db = openDb();
  const runId = `run-${ulid()}`;

  const seq = seedCallRecord(db, 'stage3_hypothesis', 'hypothesis', 1);
  const evId = seedEvidenceLog(db, seq);
  seedVerdictNode(db, evId, {
    verdict: 'UNTESTED',
    untestedReason: 'no evidence collected',
    metricValue: null,
  });

  const report = generateReport({ db, runId });

  assert.deepStrictEqual(report.verdictSummary, {
    CONFIRMED: 0,
    REFUTED: 0,
    INCONCLUSIVE: 0,
    DEGRADED_SCOPE: 0,
    UNTESTED: 1,
  });

  const verdictSection = report.sections.find((s) => s.title === 'Verdict nodes');
  assert.ok(verdictSection !== undefined);
  assert.ok(verdictSection.body.includes('Untested'));
  assert.ok(verdictSection.body.includes('no evidence collected'));

  db.close();
});

test('hash chain verification on empty database reports empty chain', () => {
  const db = openDb();

  // Empty database should report no call records
  const report = generateReport({ db, runId: 'run-empty-chain' });
  const hashSection = report.sections.find(
    (s) => s.title === 'Hash-chain verification',
  );
  assert.ok(hashSection !== undefined);
  assert.ok(hashSection.body.includes('no call records'));

  db.close();
});

test('generateReport edge count reflected in topology section', () => {
  const db = openDb();
  const runId = `run-${ulid()}`;

  const seq = seedCallRecord(db, 'stage3_hypothesis', 'hypothesis', 1);
  const evId = seedEvidenceLog(db, seq);
  seedVerdictNode(db, evId, { verdict: 'CONFIRMED' });

  // Verify edge count is 0 with no edges
  const reportNoEdges = generateReport({ db, runId });
  const graphSection0 = reportNoEdges.sections.find(
    (s) => s.title === 'Evidence graph topology',
  );
  assert.ok(graphSection0 !== undefined);
  // body text uses the exact characters from the template literal
  assert.ok(graphSection0.body.includes('**Edges**: 0'));

  db.close();
});

// ---------------------------------------------------------------------------
// Markdown renderer tests
// ---------------------------------------------------------------------------

function emptyReportData(overrides: Partial<ReportData> = {}): ReportData {
  return {
    runId: 'test-run',
    generatedAt: '2026-06-27T00:00:00.000Z',
    sections: [
      {
        title: 'Executive summary',
        body: 'test summary body',
        evidenceRefs: [],
        category: 'FACT',
      },
      {
        title: 'Limitations',
        body: 'test limitations body',
        evidenceRefs: [],
        category: 'FACT',
      },
    ],
    reproHash: '',
    verdictSummary: {
      CONFIRMED: 1,
      REFUTED: 0,
      INCONCLUSIVE: 0,
      DEGRADED_SCOPE: 0,
      UNTESTED: 0,
    },
    sourceAnchorCount: 1,
    ...overrides,
  };
}

test('renderMarkdown produces valid markdown string', () => {
  const data = emptyReportData();
  const md = renderMarkdown(data, {
    format: 'markdown',
    includeEvidenceLinks: true,
  });

  assert.ok(md.length > 0);
  assert.ok(md.includes('# FAR-Lab Research Report'));
  assert.ok(md.includes('test-run'));
  assert.ok(md.includes('Executive summary'));
  assert.ok(md.includes('Limitations'));
  assert.ok(md.includes('Verdict statistics'));
  assert.ok(md.includes('Confirmed'));
  assert.ok(md.includes('FAR-Lab Report Generator'));
});

test('renderMarkdown throws on unsupported format', () => {
  const data = emptyReportData();
  assert.throws(
    () =>
      renderMarkdown(data, { format: 'html' as 'markdown', includeEvidenceLinks: false }),
    /unsupported format/,
  );
});

test('renderMarkdown includes evidence links when enabled', () => {
  const data = emptyReportData({
    sections: [
      {
        title: 'Test section',
        body: 'some body',
        evidenceRefs: ['ev-001', 'ev-002'],
        category: 'FACT',
      },
    ],
  });

  const md = renderMarkdown(data, {
    format: 'markdown',
    includeEvidenceLinks: true,
  });
  assert.ok(md.includes('Evidence refs'));
  assert.ok(md.includes('ev-001'));
  assert.ok(md.includes('ev-002'));
});

test('renderMarkdown excludes evidence links when disabled', () => {
  const data = emptyReportData({
    sections: [
      {
        title: 'Test section',
        body: 'some body',
        evidenceRefs: ['ev-001'],
        category: 'FACT',
      },
    ],
  });

  const md = renderMarkdown(data, {
    format: 'markdown',
    includeEvidenceLinks: false,
  });
  assert.ok(!md.includes('Evidence refs'));
});

test('renderMarkdown includes reproHash when present', () => {
  const data = emptyReportData({ reproHash: 'deadbeef'.repeat(8) });
  const md = renderMarkdown(data, {
    format: 'markdown',
    includeEvidenceLinks: false,
  });
  assert.ok(md.includes('deadbeef'));
  assert.ok(md.includes('Repro hash'));
});

test('renderMarkdown excludes reproHash when empty', () => {
  const data = emptyReportData({ reproHash: '' });
  const md = renderMarkdown(data, {
    format: 'markdown',
    includeEvidenceLinks: false,
  });
  assert.ok(!md.includes('Repro hash'));
});

test('renderHtml produces valid HTML document', () => {
  const data = emptyReportData({ reproHash: 'abc'.repeat(20) + '1234' });
  const html = renderHtml(data, {
    format: 'html',
    includeEvidenceLinks: false,
  });

  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.includes('<html lang="en">'));
  assert.ok(html.includes('<title>FAR-Lab Report'));
  assert.ok(html.includes('test-run'));
  assert.ok(html.includes('Confirmed'));
  assert.ok(html.includes('</html>'));
});

test('renderHtml escapes HTML special characters', () => {
  const data = emptyReportData({
    sections: [
      {
        title: 'XSS <script>alert(1)</script>',
        body: 'content & more',
        evidenceRefs: [],
        category: 'FACT',
      },
    ],
  });

  const html = renderHtml(data, {
    format: 'html',
    includeEvidenceLinks: false,
  });
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&amp;'));
});
