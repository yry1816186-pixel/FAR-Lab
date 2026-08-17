// tests/report/claim_category.test.ts
//
// CORE-REPORT-001 验收：报告 schema（每段必带 FACT/INFERENCE/UNCOMPLETED 分类）+
// 分类在成品渲染可见 + 运行期 fail-closed。claim-lint 面已在 CI（claim_lint.mjs）。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateReport, assertEverySectionCategorized } from '../../src/report/generator.ts';
import { renderMarkdown } from '../../src/report/markdown_renderer.ts';
import { REPORT_CLAIM_CATEGORIES } from '../../src/schema/enums.ts';
import type { ReportSection } from '../../src/report/types.ts';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/index.ts';

function openReportDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

/** 空库种子：generateReport 对空表也必须产出全分类段落（含 hash 链空态）。 */
function seedReportDb(_db: Database.Database): void {
  // 空库即可：builders 对 0 行有显式空态路径（"(no ...)" 段落仍是分类段落）
}

test('CORE-REPORT-001: generateReport 每段都带合法分类（schema 完备）', () => {
  const db = openReportDb();
  try {
    seedReportDb(db);
    const report = generateReport({ db, runId: 'run-cat-1' });
    assert.ok(report.sections.length >= 6);
    for (const section of report.sections) {
      assert.ok(
        (REPORT_CLAIM_CATEGORIES as readonly string[]).includes(section.category),
        `section '${section.title}' category '${(section as Partial<ReportSection>).category ?? 'MISSING'}' invalid`,
      );
    }
  } finally {
    db.close();
  }
});

test('CORE-REPORT-001: markdown 渲染把分类标注在段落标题行（成品可见可数）', () => {
  const db = openReportDb();
  try {
    seedReportDb(db);
    const report = generateReport({ db, runId: 'run-cat-2' });
    const md = renderMarkdown(report, { format: 'markdown', includeEvidenceLinks: false });
    // 按段落名逐一验证（正文内嵌 ## 标题不受此约束）
    for (const section of report.sections) {
      const expected = `## ${section.title} [${section.category}]`;
      assert.ok(md.includes(expected), `section heading missing category tag: ${expected}`);
    }
    // 语义抽验：Limitations=UNCOMPLETED；摘要段=INFERENCE
    assert.match(md, /## Limitations \[UNCOMPLETED\]/);
    assert.ok(
      report.sections.some((sec) => sec.title.toLowerCase().includes('summary') && sec.category === 'INFERENCE'),
      'summary section must be INFERENCE',
    );
  } finally {
    db.close();
  }
});

test('CORE-REPORT-001 fail-closed: 缺分类/非法分类的段落数组被运行期校验拒绝', () => {
  const good = { title: 't', body: 'b', evidenceRefs: [], category: 'FACT' } as ReportSection;
  assert.equal(assertEverySectionCategorized([good]), undefined); // 合法输入不抛
  // 缺 category：经 JSON 边界单次 cast 构造（运行期绕过类型是真实攻击面）
  const missing = JSON.parse('{"title":"t","body":"b","evidenceRefs":[]}') as ReportSection;
  assert.throws(() => assertEverySectionCategorized([missing]), /claim category/);
  const forged = JSON.parse('{"title":"t","body":"b","evidenceRefs":[],"category":"SPECULATIVE"}') as ReportSection;
  assert.throws(() => assertEverySectionCategorized([forged]), /claim category/);
});
