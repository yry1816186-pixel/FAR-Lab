/**
 * lifecycle 路由测试。
 *
 * 覆盖：
 *   1. 有事件：查询返回生命周期事件链（active→contested→corrected·含 reason/actor/hash 链）。
 *   2. 无事件：空数组（非 404——查询语义是「该 target 无生命周期变更」）。
 *   3. 缺参/非法 kind → 400 VALIDATION_FAILED（fail-closed）。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/index.ts';
import { buildServer } from '../../src/api/server.ts';
import { applyLifecycleTransition } from '../../src/evidence_log/lifecycle.ts';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

async function fetchEvents(
  db: Database.Database,
  query: string,
): Promise<{ status: number; body: string }> {
  const app = await buildServer({ db, gitCommitSha: 'b'.repeat(40), jwtSecret: null });
  try {
    const res = await app.inject({ method: 'GET', url: `/api/v1/lifecycle/events${query}` });
    return { status: res.statusCode, body: res.body };
  } finally {
    await app.close();
  }
}

test('BA3-3: lifecycle query returns correction event chain with hash bindings', async () => {
  const db = openDb();
  try {
    // 构造 claim → contested → corrected 事件链（确定性输入·不走 LLM）。
    applyLifecycleTransition(db, {
      targetKind: 'claim',
      targetId: 'claim-ba3-1',
      toState: 'contested',
      actor: 'integrity-officer',
      reason: 'independent re-verification found evidence gap',
    });
    applyLifecycleTransition(db, {
      targetKind: 'claim',
      targetId: 'claim-ba3-1',
      toState: 'corrected',
      actor: 'researcher-001',
      reason: 'claim corrected per re-verification (BA3-3 notice path)',
    });

    const { status, body } = await fetchEvents(db, '?targetKind=claim&targetId=claim-ba3-1');
    assert.equal(status, 200, 'query must succeed');
    const data = (JSON.parse(body).data as {
      events: {
        eventId: string;
        fromState: string;
        toState: string;
        actor: string;
        reason: string;
        prevHash: string;
        currentHash: string;
      }[];
    });
    assert.equal(data.events.length, 2, 'both transitions visible');
    assert.equal(data.events[0]?.fromState, 'active', 'first event active→contested');
    assert.equal(data.events[0]?.toState, 'contested', 'first event to contested');
    assert.equal(data.events[1]?.toState, 'corrected', 'second event to corrected (notice)');
    assert.equal(data.events[1]?.actor, 'researcher-001', 'correction actor visible');
    assert.match(data.events[1]?.reason ?? '', /BA3-3/, 'correction reason visible (notice content)');
    assert.ok(
      data.events[1]?.prevHash !== undefined && data.events[1]?.prevHash.length === 64,
      'hash chain binding present',
    );
  } finally {
    db.close();
  }
});

test('BA3-3: query with no events returns empty array (not 404)', async () => {
  const db = openDb();
  try {
    const { status, body } = await fetchEvents(
      db,
      '?targetKind=claim&targetId=claim-never-touched',
    );
    assert.equal(status, 200, 'empty query is a valid answer');
    const data = JSON.parse(body).data as { events: unknown[] };
    assert.equal(data.events.length, 0, 'no lifecycle changes → empty');
  } finally {
    db.close();
  }
});

test('BA3-3: missing/invalid params → 400 fail-closed', async () => {
  const db = openDb();
  try {
    const missing = await fetchEvents(db, '');
    assert.equal(missing.status, 400, 'missing params must be 400');
    const badKind = await fetchEvents(db, '?targetKind=paper&targetId=x');
    assert.equal(badKind.status, 400, 'invalid targetKind must be 400');
    assert.match(badKind.body, /VALIDATION_FAILED/, '400 carries error_code');
  } finally {
    db.close();
  }
});
