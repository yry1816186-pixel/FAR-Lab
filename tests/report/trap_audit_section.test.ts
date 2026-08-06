/**
 * trap_audit_section.test.ts —— 报告层统计陷阱审计段（批次 1-B·借鉴 scientific-agent-skills）。
 *
 * 验证：
 *   1. 注入 trapSummary → ReportData.trapSummary 透传 + sections 含 'Statistical Trap Audit' 段。
 *   2. 不注入 → 无 trapSummary 字段 + sections 不含审计段（零回归）。
 *   3. 审计段正文包含触发的陷阱 attackId 与类别计数。
 *   4. 渲染（markdown/html）不抛错且含陷阱名称。
 */

import { runMigrations } from '../../src/db/index.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { generateReport, renderMarkdown, renderHtml } from '../../src/report/index.ts';
import { summarizeTraps, type TrapSummary } from '../../src/anti_theater/trap_taxonomy.ts';
import type { AntiTheaterFinding, AntiTheaterAttackKind } from '../../src/anti_theater/types.ts';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

function finding(kind: AntiTheaterAttackKind, hasFail: boolean): AntiTheaterFinding {
  return {
    findingId: `T-${kind}`,
    attackKind: kind,
    outcome: hasFail ? 'FAIL' : 'WARN',
    hasFail,
    evidenceRef: 'test-ref',
    message: `finding for ${kind}`,
  };
}

const SAMPLE_SUMMARY: TrapSummary = summarizeTraps([
  finding('p-hacking-alpha-inflation', true),
  finding('seed-cherry-picking', false),
]);

test('trapSummary injected → audit section present + data passthrough', () => {
  const db = openDb();
  const report = generateReport({ db, runId: 'run-trap', trapSummary: SAMPLE_SUMMARY });
  assert.ok(report.trapSummary, 'trapSummary should be present');
  assert.equal(report.trapSummary.totalFindings, 2);
  const audit = report.sections.find((s) => s.title === 'Statistical Trap Audit');
  assert.ok(audit, 'audit section missing');
  assert.match(audit.body, /AT-PHACK-ALPHA/);
  assert.match(audit.body, /AT-SEED-CHERRY/);
  assert.match(audit.body, /significance-abuse/);
});

test('no trapSummary → no audit section, no trapSummary field (zero regression)', () => {
  const db = openDb();
  const report = generateReport({ db, runId: 'run-plain' });
  assert.equal(report.trapSummary, undefined);
  assert.ok(!report.sections.some((s) => s.title === 'Statistical Trap Audit'));
});

test('audit section renders in markdown and html without throwing', () => {
  const db = openDb();
  const report = generateReport({ db, runId: 'run-render', trapSummary: SAMPLE_SUMMARY });
  const md = renderMarkdown(report, { format: 'markdown', includeEvidenceLinks: true });
  assert.match(md, /Statistical Trap Audit/);
  assert.match(md, /alpha inflation/);
  const html = renderHtml(report, { format: 'html', includeEvidenceLinks: true });
  assert.match(html, /Statistical Trap Audit/);
});

test('audit section with zero findings shows "No statistical traps triggered"', () => {
  const db = openDb();
  const empty = summarizeTraps([]);
  const report = generateReport({ db, runId: 'run-clean', trapSummary: empty });
  const audit = report.sections.find((s) => s.title === 'Statistical Trap Audit');
  assert.ok(audit);
  assert.match(audit.body, /No statistical traps triggered/);
});
