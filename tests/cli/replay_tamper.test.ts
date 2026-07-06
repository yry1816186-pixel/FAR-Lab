// tests/cli/replay_tamper.test.ts
// replay 防篡改两层端到端验证。
//
// 证据链是 append-only immutable（0001_initial.sql trg_call_records_no_update +
// trg_verdict_nodes_immutable_fields）。防篡改两层：
//   第一层：SQL UPDATE/DELETE 被 trigger 拦截（SQLITE_CONSTRAINT·append-only 红线）
//   第二层：replay verifyChainHead 重算 hash 链（绕过 trigger 后检出 broken / MISMATCH）
// 本测试证明两层都生效。

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { test } from 'node:test';
import assert from 'node:assert';
import { runMigrations } from '../../src/db/migrator.ts';
import { buildDemoChain } from '../../src/far_proof/demo_chain.ts';

function setupDemoDb(path: string): void {
  const db = new Database(path);
  runMigrations(db);
  buildDemoChain(db);
  db.close();
}

function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows 文件锁（WAL -shm/-wal 残留句柄）·不影响断言·忽略清理错误
  }
}

function runReplay(dbPath: string): { status: number | null; stdout: string } {
  const r = spawnSync(process.execPath, ['src/cli/far.ts', 'replay', '--db', dbPath], {
    encoding: 'utf8',
    timeout: 60000,
  });
  return { status: r.status, stdout: r.stdout };
}

test('replay --db: 干净 DB → verify verified + traceHash match', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-clean-'));
  try {
    const dbPath = join(dir, 'clean.db');
    setupDemoDb(dbPath);
    const r = runReplay(dbPath);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /verified（hash 链自洽）/);
    assert.match(r.stdout, /traceHash.*recomputed match/);
  } finally {
    cleanup(dir);
  }
});

test('第一层防线：call_records append-only trigger 拦截 UPDATE（防篡改红线）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-append-'));
  try {
    const dbPath = join(dir, 'app.db');
    setupDemoDb(dbPath);
    const db = new Database(dbPath);
    // UPDATE current_hash 应被 trg_call_records_no_update 拦截
    assert.throws(
      () => db.prepare("UPDATE call_records SET current_hash = 'x' WHERE seq = 1").run(),
      /append-only|forbidden|CONSTRAINT/,
    );
    // DELETE 同理
    assert.throws(
      () => db.prepare('DELETE FROM call_records WHERE seq = 1').run(),
      /append-only|forbidden|CONSTRAINT/,
    );
    db.close();
  } finally {
    cleanup(dir);
  }
});

test('第二层防线：绕过 trigger 篡改 current_hash → replay verifyChainHead 检出 broken', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-broken-'));
  try {
    const dbPath = join(dir, 'tampered.db');
    setupDemoDb(dbPath);

    const db = new Database(dbPath);
    const target = db.prepare('SELECT seq FROM call_records ORDER BY seq ASC LIMIT 1').get() as
      | { seq: number }
      | undefined;
    assert.ok(target, 'demo chain 须有 call_records');
    db.exec('DROP TRIGGER trg_call_records_no_update');
    db.prepare('UPDATE call_records SET current_hash = ? WHERE seq = ?').run(
      'tampered_deadbeef',
      target.seq,
    );
    db.close();

    const r = runReplay(dbPath);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /broken @ seq/);
    assert.doesNotMatch(r.stdout, /verified（hash 链自洽）/);
  } finally {
    cleanup(dir);
  }
});

test('第二层防线：绕过 trigger 篡改 verdict_trace_hash → replay audit 标 MISMATCH', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-trace-'));
  try {
    const dbPath = join(dir, 'trace.db');
    setupDemoDb(dbPath);

    const db = new Database(dbPath);
    db.exec('DROP TRIGGER trg_verdict_nodes_immutable_fields');
    db.prepare(`UPDATE verdict_nodes SET verdict_trace_hash = '0000000000000000000000000000000000000000000000000000000000000000'`).run();
    db.close();

    const r = runReplay(dbPath);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /traceHash.*MISMATCH/);
  } finally {
    cleanup(dir);
  }
});
