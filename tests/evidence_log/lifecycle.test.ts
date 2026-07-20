/**
 * lifecycle.test.ts — IC-05 撤回/纠正/supersession 生命周期验收。
 *
 * 验收 Oracle(合同 contract-005):
 *   ① 合法迁移链 active→contested→retracted 可查;
 *   ② 非法迁移(retracted→active 等)拒绝;
 *   ③ 墓碑化后导出包含撤回标记(lifecycle_events.jsonl + claim_graph.lifecycleStates);
 *   ④ 状态机测试绿(本文件);重复撤回→幂等;直接 SQL 改状态→触发器拒绝;事件链可验。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  applyLifecycleTransition,
  getLifecycleState,
  listLifecycleEvents,
  verifyLifecycleChain,
} from '../../src/evidence_log/index.ts';
import { exportFarProof } from '../../src/far_proof/exporter.ts';
import { verifyFarProofBundle } from '../../src/far_proof/bundle_verifier.ts';
import { runMigrations } from '../../src/db/migrator.ts';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

const TARGET = { targetKind: 'claim', targetId: 'C-TEST-0001' } as const;

test('① 合法迁移链 active→contested→retracted 可查', () => {
  const db = openDb();
  assert.equal(getLifecycleState(db, TARGET.targetKind, TARGET.targetId), 'active');
  applyLifecycleTransition(db, { ...TARGET, toState: 'contested', actor: 'reviewer-1', reason: 'CounterEvidence submitted' });
  assert.equal(getLifecycleState(db, TARGET.targetKind, TARGET.targetId), 'contested');
  applyLifecycleTransition(db, { ...TARGET, toState: 'retracted', actor: 'human-signoff', reason: 'author retracts' });
  assert.equal(getLifecycleState(db, TARGET.targetKind, TARGET.targetId), 'retracted');
  const history = listLifecycleEvents(db, TARGET.targetKind, TARGET.targetId);
  assert.equal(history.length, 2);
  assert.deepEqual(history.map((e) => [e.fromState, e.toState]), [['active', 'contested'], ['contested', 'retracted']]);
  db.close();
});

test('①b contested→active(反驳被驳回)合法;corrected/superseded 终态可达', () => {
  const db = openDb();
  applyLifecycleTransition(db, { ...TARGET, toState: 'contested', actor: 'r1', reason: 'counter' });
  applyLifecycleTransition(db, { ...TARGET, toState: 'active', actor: 'r2', reason: 'rebuttal rejected' });
  assert.equal(getLifecycleState(db, TARGET.targetKind, TARGET.targetId), 'active');
  applyLifecycleTransition(db, { ...TARGET, toState: 'contested', actor: 'r1', reason: 'counter again' });
  applyLifecycleTransition(db, { ...TARGET, toState: 'superseded', actor: 'r3', reason: 'new claim version' });
  assert.equal(getLifecycleState(db, TARGET.targetKind, TARGET.targetId), 'superseded');
  db.close();
});

test('② 非法迁移拒绝:retracted→active;active→retracted(跳态);终态出发;actor/reason 空', () => {
  const db = openDb();
  assert.throws(
    () => applyLifecycleTransition(db, { ...TARGET, toState: 'retracted', actor: 'a', reason: 'r' }),
    /illegal transition active → retracted/,
  );
  applyLifecycleTransition(db, { ...TARGET, toState: 'contested', actor: 'a', reason: 'r' });
  applyLifecycleTransition(db, { ...TARGET, toState: 'retracted', actor: 'a', reason: 'r' });
  assert.throws(
    () => applyLifecycleTransition(db, { ...TARGET, toState: 'active', actor: 'a', reason: 'r' }),
    /illegal transition retracted → active/,
  );
  assert.throws(
    () => applyLifecycleTransition(db, { targetKind: 'claim', targetId: 'C-X', toState: 'contested', actor: '  ', reason: 'r' }),
    /actor must be non-empty/,
  );
  assert.throws(
    () => applyLifecycleTransition(db, { targetKind: 'claim', targetId: 'C-X', toState: 'contested', actor: 'a', reason: ' ' }),
    /reason must be non-empty/,
  );
  db.close();
});

test('④ 重复撤回→幂等(alreadyInState,不重复插入)', () => {
  const db = openDb();
  applyLifecycleTransition(db, { ...TARGET, toState: 'contested', actor: 'a', reason: 'r' });
  applyLifecycleTransition(db, { ...TARGET, toState: 'retracted', actor: 'a', reason: 'r' });
  const again = applyLifecycleTransition(db, { ...TARGET, toState: 'retracted', actor: 'a', reason: 'r' });
  assert.equal(again.alreadyInState, true);
  assert.equal(again.event, null);
  assert.equal(listLifecycleEvents(db, TARGET.targetKind, TARGET.targetId).length, 2);
  db.close();
});

test('④b 直接 SQL UPDATE/DELETE lifecycle_events → 触发器拒绝;事件链可验', () => {
  const db = openDb();
  applyLifecycleTransition(db, { ...TARGET, toState: 'contested', actor: 'a', reason: 'r' });
  applyLifecycleTransition(db, { ...TARGET, toState: 'retracted', actor: 'a', reason: 'r' });
  assert.throws(() => db.prepare(`UPDATE lifecycle_events SET to_state='active'`).run(), /append-only/);
  assert.throws(() => db.prepare(`DELETE FROM lifecycle_events`).run(), /append-only/);
  const chain = verifyLifecycleChain(db, TARGET.targetKind, TARGET.targetId);
  assert.equal(chain.ok, true);
  assert.equal(chain.checkedCount, 2);
  db.close();
});

test('③ 墓碑化后导出包含撤回标记(lifecycle_events.jsonl + claim_graph.lifecycleStates);bundle verify 不变', () => {
  const db = openDb();
  applyLifecycleTransition(db, { ...TARGET, toState: 'contested', actor: 'a', reason: 'r' });
  applyLifecycleTransition(db, { ...TARGET, toState: 'retracted', actor: 'a', reason: 'r' });
  const outDir = mkdtempSync(join(tmpdir(), 'ic05-export-'));
  exportFarProof({
    db,
    outputDir: outDir,
    runId: 'ic05',
    modelSnapshot: 'ic05-model',
    gitCommitSha: 'e'.repeat(40),
    envHash: 'f'.repeat(64),
  });
  const lifecycleJsonl = readFileSync(join(outDir, 'lifecycle_events.jsonl'), 'utf8');
  assert.match(lifecycleJsonl, /"to_state":"retracted"/);
  const claimGraph = JSON.parse(readFileSync(join(outDir, 'claim_graph.json'), 'utf8')) as { lifecycleStates?: Record<string, string> };
  assert.equal(claimGraph.lifecycleStates?.['claim:C-TEST-0001'], 'retracted');
  // 老 bundle 兼容:verify 不把 lifecycle_events.jsonl 当必需文件(本库无信封,用 chain 模式验证兼容性)
  const bundle = verifyFarProofBundle(outDir, 'chain');
  assert.equal(bundle.ok, true, `bundle errors: ${bundle.errors.join('; ')}`);
  db.close();
});
