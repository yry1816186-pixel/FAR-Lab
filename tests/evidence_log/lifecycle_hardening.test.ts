/**
 * lifecycle_hardening.test.ts — IC-05 对抗回归(2026-07-20 对抗轮)。
 *
 * 覆盖发现:
 *   V05-F1 并发 TOCTOU(状态读取移入 IMMEDIATE 事务);
 *   V05-F2 verifyLifecycleChain 重放 SSOT 状态机(复活伪造/连续性断裂检出);
 *   V05-F3 写入侧孤对 surrogate fail-closed;
 *   V05-F6 零宽字符 reason/空 targetId 拒绝。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import canonicalize from '../../src/vendor/canonicalize.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ulid } from 'ulid';

import {
  applyLifecycleTransition,
  getLifecycleState,
  verifyLifecycleChain,
} from '../../src/evidence_log/index.ts';
import { runMigrations } from '../../src/db/migrator.ts';

const TARGET = { targetKind: 'claim', targetId: 'C-HARD-0001' } as const;

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

function seedRetracted(db: Database.Database): void {
  applyLifecycleTransition(db, { ...TARGET, toState: 'contested', actor: 'a', reason: 'counter' });
  applyLifecycleTransition(db, { ...TARGET, toState: 'retracted', actor: 'a', reason: 'fabrication found' });
}

/** 攻击者按公开 canonical 规则重算事件 hash(V05-F2 手法) */
function forgeEventHash(input: {
  targetKind: string; targetId: string; fromState: string; toState: string;
  actor: string; reason: string; prevHash: string;
}): string {
  const canonical = canonicalize(input);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

test('V05-F3 孤对 surrogate 写入侧 fail-closed(actor/reason/targetId)', () => {
  const db = openDb();
  const LONE = 'bad\uD800actor';
  assert.throws(
    () => applyLifecycleTransition(db, { ...TARGET, toState: 'contested', actor: LONE, reason: 'r' }),
    /lone surrogate/,
  );
  assert.throws(
    () => applyLifecycleTransition(db, { ...TARGET, toState: 'contested', actor: 'a', reason: 'r\uD800' }),
    /lone surrogate/,
  );
  assert.throws(
    () => applyLifecycleTransition(db, { targetKind: 'claim', targetId: 'C-\uD800', toState: 'contested', actor: 'a', reason: 'r' }),
    /lone surrogate/,
  );
  // 合法输入不受影响
  applyLifecycleTransition(db, { ...TARGET, toState: 'contested', actor: 'a', reason: 'r' });
  assert.equal(getLifecycleState(db, TARGET.targetKind, TARGET.targetId), 'contested');
  db.close();
});

test('V05-F6 零宽字符 reason 与空 targetId 拒绝', () => {
  const db = openDb();
  assert.throws(
    () => applyLifecycleTransition(db, { ...TARGET, toState: 'contested', actor: 'a', reason: '​​​​' }),
    /reason must be non-empty/,
  );
  assert.throws(
    () => applyLifecycleTransition(db, { ...TARGET, toState: 'contested', actor: '​', reason: 'r' }),
    /actor must be non-empty/,
  );
  assert.throws(
    () => applyLifecycleTransition(db, { targetKind: 'claim', targetId: '', toState: 'contested', actor: 'a', reason: 'r' }),
    /targetId must be non-empty/,
  );
  // 含零宽但有可见内容的 reason 仍合法
  applyLifecycleTransition(db, { ...TARGET, toState: 'contested', actor: 'a', reason: 'data​fabrication' });
  db.close();
});

test('V05-F2 复活伪造(retracted→active 纯 INSERT+重算 hash)被状态机重放检出', () => {
  const db = openDb();
  seedRetracted(db);
  const head = db
    .prepare(`SELECT current_hash FROM lifecycle_events WHERE target_kind=? AND target_id=? ORDER BY rowid DESC LIMIT 1`)
    .get(TARGET.targetKind, TARGET.targetId) as { current_hash: string };
  const prevHash = head.current_hash;
  const forged = {
    targetKind: TARGET.targetKind, targetId: TARGET.targetId,
    fromState: 'retracted', toState: 'active', actor: 'attacker', reason: 'resurrect', prevHash,
  };
  db.prepare(
    `INSERT INTO lifecycle_events (event_id, target_kind, target_id, from_state, to_state, actor, reason, audit_ref, prev_hash, current_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).run(ulid(), TARGET.targetKind, TARGET.targetId, 'retracted', 'active', 'attacker', 'resurrect', prevHash, forgeEventHash(forged));
  const chain = verifyLifecycleChain(db, TARGET.targetKind, TARGET.targetId);
  assert.equal(chain.ok, false);
  assert.match(chain.violation ?? '', /illegal_transition\(retracted → active/);
  db.close();
});

test('V05-F2 连续性伪造(fromState 与当前状态不符)被检出', () => {
  const db = openDb();
  seedRetracted(db);
  const head = db
    .prepare(`SELECT current_hash FROM lifecycle_events WHERE target_kind=? AND target_id=? ORDER BY rowid DESC LIMIT 1`)
    .get(TARGET.targetKind, TARGET.targetId) as { current_hash: string };
  const forged = {
    targetKind: TARGET.targetKind, targetId: TARGET.targetId,
    fromState: 'contested', toState: 'active', actor: 'attacker', reason: 'pretend rebuttal rejected', prevHash: head.current_hash,
  };
  db.prepare(
    `INSERT INTO lifecycle_events (event_id, target_kind, target_id, from_state, to_state, actor, reason, audit_ref, prev_hash, current_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).run(ulid(), TARGET.targetKind, TARGET.targetId, 'contested', 'active', 'attacker', 'pretend rebuttal rejected', head.current_hash, forgeEventHash(forged));
  const chain = verifyLifecycleChain(db, TARGET.targetKind, TARGET.targetId);
  assert.equal(chain.ok, false);
  assert.match(chain.violation ?? '', /state_continuity_broken/);
  db.close();
});

test('V05-F1 并发 TOCTOU 关闭:IMMEDIATE 写锁序列化,后到者重读状态', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ic05-race-'));
  const path = join(dir, 'race.sqlite');
  const dbA = new Database(path);
  runMigrations(dbA);
  applyLifecycleTransition(dbA, { ...TARGET, toState: 'contested', actor: 'a', reason: 'counter' });

  const dbB = new Database(path);
  dbB.pragma('busy_timeout = 0');
  // A 持 IMMEDIATE 写锁期间,B 的任何迁移尝试立即失败(而不是读旧状态后双插)
  dbA.exec('BEGIN IMMEDIATE');
  assert.throws(
    () => applyLifecycleTransition(dbB, { ...TARGET, toState: 'retracted', actor: 'b', reason: 'r' }),
    /database is locked/,
  );
  dbA.exec('ROLLBACK');
  // 锁释放后 B 重读状态:先合法 retract;此后 C 连接再尝试 corrected → 非法(终态)
  applyLifecycleTransition(dbB, { ...TARGET, toState: 'retracted', actor: 'b', reason: 'r' });
  const dbC = new Database(path);
  assert.throws(
    () => applyLifecycleTransition(dbC, { ...TARGET, toState: 'corrected', actor: 'c', reason: 'r' }),
    /illegal transition retracted → corrected/,
  );
  assert.equal(getLifecycleState(dbC, TARGET.targetKind, TARGET.targetId), 'retracted');
  dbA.close();
  dbB.close();
  dbC.close();
});

test('回归基线:合法链 verify ok 且 violation 为 null', () => {
  const db = openDb();
  seedRetracted(db);
  const chain = verifyLifecycleChain(db, TARGET.targetKind, TARGET.targetId);
  assert.equal(chain.ok, true);
  assert.equal(chain.checkedCount, 2);
  assert.equal(chain.violation, null);
  db.close();
});
