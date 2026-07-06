/**
 * run_grade_wired.test.ts —— 证明 src/trace/grade_scorers.ts（M-10 deterministicGrade）
 * 经 src/api/internal/run_grade.ts 接进生产 executeLoop 路径（BUILT_UNWIRED → WIRED）。
 *
 * 真实依赖（非 Fake）：
 *   - executeLoop（offline_replay）真跑 runAgentLoop 六阶段 → 真 LoopState.artifacts
 *   - 真 evidence_log DB → call_records.current_hash 哈希链
 *   - deterministicGrade 据真实派生的 GradeInput 算 7 维 run-integrity 分数
 *
 * RED 基线：接线前 LoopRunnerResult 无 traceGrade 字段（deterministicGrade 零生产 caller）。
 * GREEN：接线后 result.traceGrade 由真实 run 统计驱动，gradedBy='deterministic_script'，
 *        allEventsHashed 与直接查 DB 一致（证非预制常量）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/index.ts';
import { executeLoop } from '../../src/api/internal/loop_runner.ts';
import type { LoopRunnerArgs } from '../../src/api/internal/loop_runner.ts';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

const HEX64 = /^[0-9a-f]{64}$/;

test('executeLoop produces traceGrade driven by real run state (deterministicGrade wired into production path)', async () => {
  const db = openDb();
  const args: LoopRunnerArgs = {
    researchInput: 'test research question for run-integrity grading',
    mode: 'quick',
    profile: 'offline_replay',
    evidenceLogDb: db,
    gitCommitSha: 'a'.repeat(40),
  };
  try {
    const result = await executeLoop(args);

    // 结构性接线：traceGrade 存在且由确定性评分器产出（禁 LLM-as-judge）
    assert.ok(result.traceGrade, 'traceGrade must be produced by executeLoop (deterministicGrade wired)');
    assert.equal(result.traceGrade.gradedBy, 'deterministic_script');
    assert.equal(result.traceGrade.runId, result.runId);
    assert.ok(result.traceGrade.score >= 0 && result.traceGrade.score <= 1);
    assert.ok(Array.isArray(result.traceGrade.failureCodes));

    // 真实派生证明 1：allEventsHashed 必须与直接查 DB 的哈希链状态一致（非预制常量）
    const rows = db
      .prepare('SELECT current_hash FROM call_records ORDER BY seq ASC')
      .all() as ReadonlyArray<{ current_hash?: string }>;
    const directAllHashed =
      rows.length > 0 && rows.every((r) => typeof r.current_hash === 'string' && HEX64.test(r.current_hash));
    assert.equal(
      result.traceGrade.failureCodes.includes('nonreproducible_metric'),
      !directAllHashed,
      'nonreproducible_metric failure must reflect real call_records hash chain (not a constant)',
    );

    // 真实派生证明 2：offline_replay 哈希链完整（appendRecord 真算 sha256 链）→ 可复现
    assert.ok(directAllHashed, 'offline_replay must produce a valid real hash chain in call_records');
    assert.ok(
      !result.traceGrade.failureCodes.includes('nonreproducible_metric'),
      'intact real hash chain → reproducible → no nonreproducible_metric failure',
    );

    // 真实派生证明 3：score 诚实反映 guardrail 未落地（当前主循环不 emit guardrail 事件）
    // deterministicGrade 对 guardrailBlockedCount===0 扣 guardrail_effectiveness 维度
    assert.ok(
      result.traceGrade.score < 1.0,
      'honest grade: guardrail instrumentation absent → score < 1.0 (anti-theater: grade does not lie)',
    );
  } finally {
    db.close();
  }
});
