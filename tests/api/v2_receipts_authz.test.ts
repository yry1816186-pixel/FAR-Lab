/**
 * v2 receipts 授权层测试（阶段 7 P2 · LP-5 API1 BOLA / API5 功能级授权回归载体）。
 *
 * 覆盖：
 *   1. 受保护模式：POST 落 owner（JWT subject）；他人 GET 详情 → 403；列表仅见自己+公开。
 *   2. viewer 只读：POST → 403 FORBIDDEN（requireRole 接线）。
 *   3. offline 匿名：全量可读可写（24§3.1 双轨鉴权行为不变·零破坏）。
 *   4. 公开 receipt（owner NULL·匿名创建/旧行）受保护模式下仍可读（共享链接场景）。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/index.ts';
import { buildServer } from '../../src/api/server.ts';
import type { FastifyInstance } from 'fastify';

const GIT_SHA = 'b'.repeat(40);

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

interface TestServer {
  readonly app: FastifyInstance;
  readonly db: Database.Database;
}

/** 受保护模式 server（jwtSecret 配置·fail-closed 认证）。 */
async function protectedServer(jwtSecret: string): Promise<TestServer> {
  const db = openDb();
  const app = await buildServer({ db, gitCommitSha: GIT_SHA, jwtSecret });
  return { app, db };
}

/** offline 匿名 server。 */
async function offlineServer(): Promise<TestServer> {
  const db = openDb();
  const app = await buildServer({ db, gitCommitSha: GIT_SHA, jwtSecret: null });
  return { app, db };
}

function receiptBody(proofHash: string) {
  return {
    proofHash,
    schemaVersion: '2.0',
    claimId: `claim-${proofHash.slice(0, 8)}`,
    claimText: 'authorization test claim',
    verdict: 'CONFIRMED',
    manifestMembers: [],
    contractBindings: [],
  };
}

async function createReceipt(
  app: FastifyInstance,
  body: Record<string, unknown>,
  token?: string,
) {
  return app.inject({
    method: 'POST',
    url: '/api/v2/receipts',
    payload: body,
    ...(token === undefined ? {} : { headers: { authorization: `Bearer ${token}` } }),
  });
}

test('LP-5 API1: protected mode POST persists owner; other principal gets 403 on detail', async () => {
  const jwtSecret = 'test-secret-lp5';
  const { app, db } = await protectedServer(jwtSecret);
  try {
    const ownerToken = app.jwt.sign({ sub: 'alice', role: 'researcher' });
    const otherToken = app.jwt.sign({ sub: 'mallory', role: 'researcher' });

    const created = await createReceipt(app, receiptBody('aaa'.repeat(16)), ownerToken);
    assert.equal(created.statusCode, 201, 'researcher can create');
    const receiptId = (created.json().data as { receiptId: string }).receiptId;

    // owner 列落库 = alice。
    const row = db
      .prepare('SELECT owner FROM v2_receipts WHERE id = ?')
      .get(receiptId) as { owner: string | null };
    assert.equal(row.owner, 'alice', 'owner must be JWT subject in protected mode');

    // 本人读 → 200。
    const own = await app.inject({
      method: 'GET',
      url: `/api/v2/receipts/${receiptId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(own.statusCode, 200, 'owner can read own receipt');

    // 他人读 → 403（BOLA 修复核心断言）。
    const other = await app.inject({
      method: 'GET',
      url: `/api/v2/receipts/${receiptId}`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    assert.equal(other.statusCode, 403, 'non-owner must be denied (BOLA)');
    assert.match(other.body, /FORBIDDEN/, '403 must carry FORBIDDEN error_code');

    // 他人 re-verify → 403（同规则）。
    const otherVerify = await app.inject({
      method: 'GET',
      url: `/api/v2/receipts/${receiptId}/verify`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    assert.equal(otherVerify.statusCode, 403, 'non-owner re-verify must be denied');
  } finally {
    await app.close();
    db.close();
  }
});

test('LP-5 API1: protected list filters to own + public receipts only', async () => {
  const jwtSecret = 'test-secret-lp5-list';
  const { app, db } = await protectedServer(jwtSecret);
  try {
    const aliceToken = app.jwt.sign({ sub: 'alice', role: 'researcher' });
    const bobToken = app.jwt.sign({ sub: 'bob', role: 'researcher' });

    // alice 创建 2 条（owner=alice）·bob 创建 1 条（owner=bob）·匿名 1 条（owner=NULL 公开）。
    await createReceipt(app, receiptBody('111'.repeat(16)), aliceToken);
    await createReceipt(app, receiptBody('222'.repeat(16)), aliceToken);
    await createReceipt(app, receiptBody('333'.repeat(16)), bobToken);
    await createReceipt(app, receiptBody('444'.repeat(16))); // 无 token → 401（受保护模式 fail-closed）
    // 上一条 401 未落库——用 offline server 创建公开 receipt 再换 protected 读：简化——直接 SQL 插入公开行。
    db.prepare(
      `INSERT INTO v2_receipts (id, claim_id, claim_text, verdict, proof_hash, schema_version, created_at, receipt_standing, preservation_status, owner)
       VALUES ('pub-1', 'claim-pub', 'public', 'CONFIRMED', '${'555'.repeat(16)}', '2.0', '2026-07-01T00:00:00.000Z', 'ACTIVE', 'AVAILABLE', NULL)`,
    ).run();

    const list = await app.inject({
      method: 'GET',
      url: '/api/v2/receipts',
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    assert.equal(list.statusCode, 200);
    const data = list.json().data as { receipts: { id: string }[]; total: number };
    const ids = data.receipts.map((r) => r.id);
    assert.equal(data.total, 3, 'alice sees her 2 + 1 public (not bob\'s)');
    assert.ok(ids.includes('pub-1'), 'public receipt visible to alice');
    assert.ok(ids.length === 3, 'exactly own + public rows');

    // bob 拥有的 receipt 不得泄露（BOLA 列表核心断言）。
    const bobRows = db
      .prepare("SELECT id FROM v2_receipts WHERE owner = 'bob'")
      .all() as { id: string }[];
    assert.ok(bobRows.length === 1, 'bob has exactly 1 receipt');
    assert.ok(!ids.includes(bobRows[0]!.id), 'bob-owned receipt must not leak into alice list');
  } finally {
    await app.close();
    db.close();
  }
});

test('LP-5 API5: viewer is read-only in protected mode (POST → 403)', async () => {
  const jwtSecret = 'test-secret-lp5-role';
  const { app, db } = await protectedServer(jwtSecret);
  try {
    const viewerToken = app.jwt.sign({ sub: 'viewer-1', role: 'viewer' });
    const created = await createReceipt(app, receiptBody('abc'.repeat(16)), viewerToken);
    assert.equal(created.statusCode, 403, 'viewer POST must be forbidden (requireRole)');
    assert.match(created.body, /FORBIDDEN/, '403 must carry FORBIDDEN error_code');

    // viewer 读公开 receipt 仍允许（只读语义）。
    db.prepare(
      `INSERT INTO v2_receipts (id, claim_id, claim_text, verdict, proof_hash, schema_version, created_at, receipt_standing, preservation_status, owner)
       VALUES ('pub-2', 'claim-pub2', 'public', 'CONFIRMED', '${'ddd'.repeat(16)}', '2.0', '2026-07-01T00:00:00.000Z', 'ACTIVE', 'AVAILABLE', NULL)`,
    ).run();
    const read = await app.inject({
      method: 'GET',
      url: '/api/v2/receipts/pub-2',
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    assert.equal(read.statusCode, 200, 'viewer can read public receipts');
  } finally {
    await app.close();
    db.close();
  }
});

test('LP-5: offline anonymous mode keeps full access (24§3.1 zero-break)', async () => {
  const { app, db } = await offlineServer();
  try {
    const created = await createReceipt(app, receiptBody('eee'.repeat(16)));
    assert.equal(created.statusCode, 201, 'anonymous can create in offline mode');
    const receiptId = (created.json().data as { receiptId: string }).receiptId;
    const row = db
      .prepare('SELECT owner FROM v2_receipts WHERE id = ?')
      .get(receiptId) as { owner: string | null };
    assert.equal(row.owner, null, 'offline anonymous creates owner=NULL (public)');

    const list = await app.inject({ method: 'GET', url: '/api/v2/receipts' });
    assert.equal(list.statusCode, 200);
    const data = list.json().data as { total: number };
    assert.equal(data.total, 1, 'offline list is unfiltered');
  } finally {
    await app.close();
    db.close();
  }
});
