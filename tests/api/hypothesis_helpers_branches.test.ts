/**
 * hypothesis_helpers 分支覆盖补强测试。
 *
 * 目标分支：
 *   - hypothesis_helpers.ts:41-42（extractHypothesisEvidenceId 无匹配 evidence_log → return null）
 *   - hypothesis_helpers.ts:56-57（buildSubtreeFromEvidence 无匹配 verdict_node → return 空子树）
 *
 * 零容忍：无 any / @ts-ignore / 空 catch / 桩。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/migrator.ts';
import {
  extractHypothesisEvidenceId,
  buildSubtreeFromEvidence,
} from '../../src/api/internal/hypothesis_helpers.ts';
import type { LoopState } from '../../src/agent_loop/types.ts';
import type { GraphSubtree } from '../../src/api/types.ts';

// ========== 构建器 ==========

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

/**
 * 构造最小合法 LoopState（extractHypothesisEvidenceId 用 void loopState，
 * 故内容不影响行为，只需类型合规）。
 */
function makeLoopState(overrides: Partial<LoopState> = {}): LoopState {
  return {
    runId: 'test-run-hh',
    iterationsCompleted: 0,
    terminated: false,
    terminationReason: 'max_iterations',
    artifacts: [],
    verdictNode: null,
    intermediateVerdicts: [],
    error: null,
    ...overrides,
  };
}

// ============================================================================
// extractHypothesisEvidenceId：覆盖行 41-42（return null）
// ============================================================================

test('extractHypothesisEvidenceId: 无 stage3_hypothesis 记录 → 返回 null（覆盖行 41-42）', () => {
  const db = openDb();
  const loopState = makeLoopState();

  // DB 刚迁移完，无任何 call_records / evidence_log 行 → .get() 返回 undefined
  // → row === undefined 触发 → return null
  const result = extractHypothesisEvidenceId(db, loopState);
  assert.equal(result, null);

  db.close();
});

test('extractHypothesisEvidenceId: 空 DB 多轮调用一致返回 null', () => {
  const db = openDb();
  const loopState = makeLoopState();

  assert.equal(extractHypothesisEvidenceId(db, loopState), null);
  assert.equal(extractHypothesisEvidenceId(db, loopState), null);
  assert.equal(extractHypothesisEvidenceId(db, loopState), null);

  db.close();
});

test('extractHypothesisEvidenceId: 空 DB 调用后关闭再开仍返回 null（幂等性）', () => {
  // 验证空 DB 多次调用一致返回 null（覆盖行 41-42 的 row===undefined 路径）
  const db1 = openDb();
  assert.equal(extractHypothesisEvidenceId(db1, makeLoopState()), null);
  db1.close();

  const db2 = openDb();
  assert.equal(extractHypothesisEvidenceId(db2, makeLoopState()), null);
  db2.close();
});

// ============================================================================
// buildSubtreeFromEvidence：覆盖行 56-57（return 空子树）
// ============================================================================

test('buildSubtreeFromEvidence: 无匹配 verdict_node → 返回空子树（覆盖行 56-57）', () => {
  const db = openDb();

  // 不存在的 evidenceId → SELECT 返回 undefined → 触发 row === undefined → return 空子树
  const result: GraphSubtree = buildSubtreeFromEvidence(db, 'non-existent-evidence');
  assert.equal(result.rootId, 'non-existent-evidence');
  assert.equal(result.nodes.length, 0);
  assert.equal(result.edges.length, 0);

  db.close();
});

test('buildSubtreeFromEvidence: 不同不存在的 evidenceId 均返回空子树', () => {
  const db = openDb();

  const r1 = buildSubtreeFromEvidence(db, 'ghost-1');
  assert.equal(r1.rootId, 'ghost-1');
  assert.equal(r1.nodes.length, 0);
  assert.equal(r1.edges.length, 0);

  const r2 = buildSubtreeFromEvidence(db, 'ghost-2');
  assert.equal(r2.rootId, 'ghost-2');
  assert.equal(r2.nodes.length, 0);
  assert.equal(r2.edges.length, 0);

  db.close();
});

test('buildSubtreeFromEvidence: 空子树结构与 GraphSubtree 接口一致', () => {
  const db = openDb();

  const result = buildSubtreeFromEvidence(db, 'any-id');
  // 验证返回值符合 GraphSubtree 接口约定
  assert.equal(typeof result.rootId, 'string');
  assert.ok(Array.isArray(result.nodes));
  assert.ok(Array.isArray(result.edges));
  // 注意：rootId 保留传入的 evidenceId（调用方可根据 rootId 判断 404）
  assert.equal(result.rootId, 'any-id');

  db.close();
});
