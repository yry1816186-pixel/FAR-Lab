/**
 * CORE-TRUST-001 权威边界测试（G1 补缺·2026-08-17 专项核验产出）。
 *
 * 判据：「任何模型输出或人工字段都不能直接覆盖 kernel verdict。」
 * 本文件锁定的三个可测面：
 *   1. API 无 verdict 写入面——PUT/PATCH/DELETE /verdict* 一律 404（方法不存在 = 纵深防御第一层；
 *      未来若有人加写入口，本测试红）。
 *   2. 客户端自报 verdict 的收据（POST /receipts 的 body.verdict）只能进 v2_receipts 登记
 *      （提交者声明语义），**不能在 kernel 裁决库 verdict_nodes 铸造任何行**——这是权威边界本身。
 *   3. /receipts/verify 无状态——不写任何库行（校验不落副作用）。
 *
 * 边界诚实声明：本测试证明「公共 API 面上没有 verdict 改写通道」；kernel 内部确定性
 * （F3 无 LLM）由 verdict_kernel_v2 契约 + verifier_structural_gate CI 扫描另行守护。
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

async function offlineServer(): Promise<{ app: FastifyInstance; db: Database.Database }> {
  const db = openDb();
  const app = await buildServer({ db, gitCommitSha: GIT_SHA, jwtSecret: null });
  return { app, db };
}

function verdictNodeCount(db: Database.Database): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM verdict_nodes').get() as { c: number }).c;
}

function v2ReceiptCount(db: Database.Database): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM v2_receipts').get() as { c: number }).c;
}

test('CORE-TRUST-001: no verdict write surface exists on the API (PUT/PATCH/DELETE → 404)', async () => {
  const { app } = await offlineServer();
  const writeTargets = [
    '/verdict/v-1',
    '/verdict',
    '/verdict/by_hypothesis/h-1',
  ];
  for (const path of writeTargets) {
    for (const method of ['put', 'patch', 'delete'] as const) {
      const res = await app.inject({ method, url: `/api/v1${path}`, payload: { verdict: 'CONFIRMED' } });
      assert.equal(res.statusCode, 404, `${method.toUpperCase()} ${path} must not exist (a verdict write surface would be an authority-boundary breach)`);
    }
  }
});

test('CORE-TRUST-001: client-supplied receipt verdict cannot mint a kernel verdict node', async () => {
  const { app, db } = await offlineServer();
  const before = verdictNodeCount(db);
  assert.equal(before, 0);

  // 恶意/天真客户端：自报 verdict=CONFIRMED 的收据（提交者声明语义——API 设计允许登记）
  const res = await app.inject({
    method: 'POST',
    url: '/api/v2/receipts',
    payload: {
      proofHash: 'a'.repeat(64),
      schemaVersion: '2.0',
      claimId: 'claim-forged',
      claimText: 'claim attempting to mint a kernel verdict',
      verdict: 'CONFIRMED',
      manifestMembers: [],
      contractBindings: [],
    },
  });
  assert.equal(res.statusCode, 201, res.body);

  // 权威边界：收据进登记簿（1 行·提交者声明），kernel 裁决库零行——伪造收据 ≠ 内核裁决
  assert.equal(v2ReceiptCount(db), 1, 'receipt registered (submitter-claimed label, by design)');
  assert.equal(verdictNodeCount(db), 0, 'kernel verdict_nodes must stay untouched by client receipts');

  // 登记簿里的 verdict 是提交者自报的原样（未洗白、未升格）——公开可见的语义隔离事实
  const row = db.prepare('SELECT verdict FROM v2_receipts').get() as { verdict: string };
  assert.equal(row.verdict, 'CONFIRMED', 'registry stores the submitter-claimed label verbatim (quarantine, not promotion)');
});

test('CORE-TRUST-001: /receipts/verify is stateless (no DB side effects)', async () => {
  const { app, db } = await offlineServer();
  const receiptsBefore = v2ReceiptCount(db);
  const verdictsBefore = verdictNodeCount(db);

  const res = await app.inject({
    method: 'POST',
    url: '/api/v2/receipts/verify',
    payload: {
      schemaVersion: '2.0',
      proofHash: 'c'.repeat(64),
      claim: { id: 'claim-x', naturalLanguage: 'stateless verify probe' },
      verdictTrace: { verdict: 'CONFIRMED' },
    },
  });
  assert.equal(res.statusCode, 200, res.body);

  assert.equal(v2ReceiptCount(db), receiptsBefore, 'verify must not persist receipts');
  assert.equal(verdictNodeCount(db), verdictsBefore, 'verify must not mint verdict nodes');
});
