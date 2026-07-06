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
    '执行摘要',
    '六阶段输出摘要',
    '裁决节点',
    '证据图拓扑',
    '哈希链校验结果',
    '限制声明',
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
    (s) => s.title === '六阶段输出摘要',
  );
  assert.ok(stageSection !== undefined);
  assert.ok(stageSection.body.includes('假设生成'));
  assert.ok(stageSection.body.includes('证据收集'));

  // Verdict section should include both verdicts
  const verdictSection = report.sections.find((s) => s.title === '裁决节点');
  assert.ok(verdictSection !== undefined);
  assert.ok(verdictSection.body.includes('已确认'));
  assert.ok(verdictSection.body.includes('已证伪'));

  // Hash chain should be valid
  const hashSection = report.sections.find(
    (s) => s.title === '哈希链校验结果',
  );
  assert.ok(hashSection !== undefined);
  assert.ok(hashSection.body.includes('通过'));

  // Evidence graph section should note no edges
  const graphSection = report.sections.find((s) => s.title === '证据图拓扑');
  assert.ok(graphSection !== undefined);
  assert.ok(graphSection.body.includes('0')); // 0 edges

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

  const verdictSection = report.sections.find((s) => s.title === '裁决节点');
  assert.ok(verdictSection !== undefined);
  assert.ok(verdictSection.body.includes('降级范围'));
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

  const verdictSection = report.sections.find((s) => s.title === '裁决节点');
  assert.ok(verdictSection !== undefined);
  assert.ok(verdictSection.body.includes('未测试'));
  assert.ok(verdictSection.body.includes('no evidence collected'));

  db.close();
});

test('hash chain verification on empty database reports empty chain', () => {
  const db = openDb();

  // Empty database should report no call records
  const report = generateReport({ db, runId: 'run-empty-chain' });
  const hashSection = report.sections.find(
    (s) => s.title === '哈希链校验结果',
  );
  assert.ok(hashSection !== undefined);
  assert.ok(hashSection.body.includes('无调用记录'));

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
    (s) => s.title === '证据图拓扑',
  );
  assert.ok(graphSection0 !== undefined);
  // body text uses the exact characters from the template literal
  assert.ok(graphSection0.body.includes('**边数**: 0'));

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
        title: '执行摘要',
        body: '测试摘要内容',
        evidenceRefs: [],
      },
      {
        title: '限制声明',
        body: '测试限制声明',
        evidenceRefs: [],
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
  assert.ok(md.includes('# FAR-Chain 研究报告'));
  assert.ok(md.includes('test-run'));
  assert.ok(md.includes('执行摘要'));
  assert.ok(md.includes('限制声明'));
  assert.ok(md.includes('裁决统计'));
  assert.ok(md.includes('已确认'));
  assert.ok(md.includes('FAR-Chain Report Generator'));
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
        title: '测试段落',
        body: 'some body',
        evidenceRefs: ['ev-001', 'ev-002'],
      },
    ],
  });

  const md = renderMarkdown(data, {
    format: 'markdown',
    includeEvidenceLinks: true,
  });
  assert.ok(md.includes('证据引用'));
  assert.ok(md.includes('ev-001'));
  assert.ok(md.includes('ev-002'));
});

test('renderMarkdown excludes evidence links when disabled', () => {
  const data = emptyReportData({
    sections: [
      {
        title: '测试段落',
        body: 'some body',
        evidenceRefs: ['ev-001'],
      },
    ],
  });

  const md = renderMarkdown(data, {
    format: 'markdown',
    includeEvidenceLinks: false,
  });
  assert.ok(!md.includes('证据引用'));
});

test('renderMarkdown includes reproHash when present', () => {
  const data = emptyReportData({ reproHash: 'deadbeef'.repeat(8) });
  const md = renderMarkdown(data, {
    format: 'markdown',
    includeEvidenceLinks: false,
  });
  assert.ok(md.includes('deadbeef'));
  assert.ok(md.includes('复现哈希'));
});

test('renderMarkdown excludes reproHash when empty', () => {
  const data = emptyReportData({ reproHash: '' });
  const md = renderMarkdown(data, {
    format: 'markdown',
    includeEvidenceLinks: false,
  });
  assert.ok(!md.includes('复现哈希'));
});

test('renderHtml produces valid HTML document', () => {
  const data = emptyReportData({ reproHash: 'abc'.repeat(20) + '1234' });
  const html = renderHtml(data, {
    format: 'html',
    includeEvidenceLinks: false,
  });

  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.includes('<html lang="zh-CN">'));
  assert.ok(html.includes('<title>FAR-Chain Report'));
  assert.ok(html.includes('test-run'));
  assert.ok(html.includes('已确认'));
  assert.ok(html.includes('</html>'));
});

test('renderHtml escapes HTML special characters', () => {
  const data = emptyReportData({
    sections: [
      {
        title: 'XSS <script>alert(1)</script>',
        body: 'content & more',
        evidenceRefs: [],
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
