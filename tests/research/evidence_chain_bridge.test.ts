// tests/research/evidence_chain_bridge.test.ts
// 双账本桥（R3·evidence_chain_bridge）的判别性测试：
//   - 路由级真跑：offline_replay 任务 COMPLETED → call_records 恰增 1 摘要叶（字段钉死）
//     → /integrity/root 叶数随动 → 该叶可做 Merkle 包含证明（跨账本闭环）
//   - 幂等：同运行重复锚定不双写（resume/重放/重启安全）
//   - 决定性：同冻结运行在两鲜库产生字节相同的 currentHash（genesis 对齐）
//   - 篡改：改一张收据的 outputHash → verifyRunSummaryRecord = digest_drift（fail-closed 检出）
//   - 守卫：checkpoint 非 COMPLETED（FAILED）→ 不锚叶（诚实：失败运行不进信任根）
//
// 诚实边界（与模块 cannot-prove 一致）：本测试证明「摘要叶锚定 + 漂移可检出」，
// 不证明文件收据的科学正确性。

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import Fastify, { type FastifyInstance } from 'fastify';

import { buildServer } from '../../src/api/server.ts';
import { errorHandler } from '../../src/api/errors/error_handler.ts';
import { runMigrations } from '../../src/db/index.ts';
import { registerResearchRoutes } from '../../src/api/routes/research.ts';
import {
  appendRunSummaryToChain,
  computeRunSummaryDigest,
  projectRunSummary,
  verifyRunSummaryRecord,
  RUN_SUMMARY_ACTOR,
  RUN_SUMMARY_STAGE_ID,
} from '../../src/research/evidence_chain_bridge.ts';
import { RunStore, executeResearchRun } from '../../src/research/run_lifecycle.ts';
import type { ResearchRun } from '../../src/research/types.ts';

const storeRoot = mkdtempSync(join(tmpdir(), 'far-bridge-test-'));
process.env.FAR_RESEARCH_RUNS_DIR = storeRoot;

after(() => {
  delete process.env.FAR_RESEARCH_RUNS_DIR;
  rmSync(storeRoot, { recursive: true, force: true });
});

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

interface StatusRow {
  readonly state: string;
}

async function waitCompleted(app: { inject: FastifyInstance['inject'] }, runId: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const res = await app.inject({ method: 'GET', url: `/api/v1/research/${runId}/status` });
    const row = (res.json() as { data: StatusRow }).data;
    if (row.state === 'COMPLETED') return;
    if (row.state === 'FAILED' || row.state === 'CANCELLED') {
      assert.fail(`run reached ${row.state} — bridge tests need a COMPLETED run`);
    }
    if (Date.now() > deadline) assert.fail('run did not COMPLETE within 30s');
    await new Promise((r) => setTimeout(r, 50));
  }
}

function countSummaryLeaves(db: Database.Database): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM call_records WHERE stage_id = ?`)
    .get(RUN_SUMMARY_STAGE_ID) as { n: number };
  return row.n;
}

let sharedRun: ResearchRun;
let sharedDb: Database.Database;
let sharedSeq: number;

before(async () => {
  sharedDb = makeDb();
  const app = await buildServer({ db: sharedDb, gitCommitSha: 'b'.repeat(40), jwtSecret: null, logger: false });
  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/research',
      payload: { question: 'Bridge test: does a completed mission anchor into the evidence chain?', profile: 'offline_replay' },
    });
    assert.equal(res.statusCode, 202, res.body);
    const { runId } = (res.json() as { data: { runId: string } }).data;
    await waitCompleted(app, runId);
    const store = new RunStore(storeRoot);
    const run = store.loadRun(runId);
    assert.ok(run !== null, 'frozen run must exist after COMPLETED');
    sharedRun = run;
  } finally {
    await app.close();
  }
});

test('route-level: COMPLETED run anchors exactly one summary leaf with pinned fields', () => {
  assert.equal(countSummaryLeaves(sharedDb), 1);
  const row = sharedDb
    .prepare(
      `SELECT seq, payload_kind AS payloadKind, purpose_tag AS purposeTag, model_id AS modelId,
              repro_hash AS reproHash, iso_timestamp AS isoTimestamp, prev_hash AS prevHash, current_hash AS currentHash
       FROM call_records WHERE stage_id = ?`,
    )
    .get(RUN_SUMMARY_STAGE_ID) as {
    seq: number; payloadKind: string; purposeTag: string; modelId: string;
    reproHash: string; isoTimestamp: string; prevHash: string; currentHash: string;
  };
  sharedSeq = row.seq;
  assert.equal(row.payloadKind, 'meta');
  assert.equal(row.purposeTag, 'baseline_exempt');
  assert.equal(row.modelId, RUN_SUMMARY_ACTOR);
  assert.equal(row.reproHash, computeRunSummaryDigest(sharedRun));
  assert.match(row.currentHash, /^[0-9a-f]{64}$/);
  // genesis 对齐：鲜库首叶 prevHash = 64 个 0
  assert.equal(row.prevHash, '0'.repeat(64));
});

test('route-level: the bridged leaf is covered by the integrity root (cross-ledger closure)', async () => {
  // 独立只读面：integrity/root 的 leafCount 必须计入摘要叶。
  const app = await buildServer({ db: sharedDb, gitCommitSha: 'b'.repeat(40), jwtSecret: null, logger: false });
  try {
    const rootRes = await app.inject({ method: 'GET', url: '/api/v1/integrity/root' });
    assert.equal(rootRes.statusCode, 200);
    const root = (rootRes.json() as { data: { leafCount: number; merkleRoot: string } }).data;
    assert.equal(root.leafCount, 1);
    // 包含证明：桥叶(seq=sharedSeq)的证明可被后端独立重算验证
    const proofRes = await app.inject({ method: 'GET', url: `/api/v1/integrity/proof/${sharedSeq}` });
    assert.equal(proofRes.statusCode, 200);
    const proof = (proofRes.json() as { data: { expectedRoot: string; leaf: string } }).data;
    assert.equal(proof.expectedRoot, root.merkleRoot);
  } finally {
    await app.close();
  }
});

test('idempotent: re-anchoring the same run does not double-write', () => {
  const again = appendRunSummaryToChain(sharedDb, sharedRun, {
    completedAt: sharedRun.startedAt,
    providerProfile: 'offline_replay',
  });
  assert.equal(again.appended, false);
  assert.equal(again.seq, sharedSeq);
  assert.equal(countSummaryLeaves(sharedDb), 1);
});

test('deterministic: the same frozen run seals byte-identical records in two fresh chains', () => {
  const db2 = makeDb();
  try {
    const r1 = appendRunSummaryToChain(makeDb(), sharedRun, {
      completedAt: sharedRun.startedAt,
      providerProfile: 'offline_replay',
    });
    const r2 = appendRunSummaryToChain(db2, sharedRun, {
      completedAt: sharedRun.startedAt,
      providerProfile: 'offline_replay',
    });
    assert.equal(r1.currentHash, r2.currentHash);
    assert.equal(r1.runDigest, r2.runDigest);
  } finally {
    db2.close();
  }
});

test('tamper: flipping one receipt outputHash is detected as digest drift', () => {
  const idx = sharedRun.stageReceipts.findIndex((r) => r.outputHash !== null);
  assert.ok(idx >= 0, 'replay run must carry at least one deterministic outputHash');
  const receipt = sharedRun.stageReceipts[idx]!;
  const tamperedReceipt = {
    ...receipt,
    outputHash: receipt.outputHash!.slice(0, 63) + (receipt.outputHash!.endsWith('a') ? 'b' : 'a'),
  };
  const tamperedRun: ResearchRun = {
    ...sharedRun,
    stageReceipts: sharedRun.stageReceipts.map((r, i) => (i === idx ? tamperedReceipt : r)),
  };
  const verdict = verifyRunSummaryRecord(sharedDb, tamperedRun);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'digest_drift');
  // 未篡改的运行仍判定 match（对照组·防空真）
  const honest = verifyRunSummaryRecord(sharedDb, sharedRun);
  assert.equal(honest.ok, true);
  assert.equal(honest.reason, 'match');
});

test('projection stability: same run projects byte-identical digest across calls', () => {
  assert.equal(computeRunSummaryDigest(sharedRun), computeRunSummaryDigest(sharedRun));
  const p = projectRunSummary(sharedRun);
  assert.equal(p.stageReceipts.length, sharedRun.stageReceipts.length);
  assert.ok(p.stageReceipts.every((r) => typeof r.sequence === 'number' && r.stageId.length > 0));
});

test('guard: a run whose checkpoint is not COMPLETED anchors no leaf', async () => {
  const isolatedRoot = mkdtempSync(join(tmpdir(), 'far-bridge-failed-'));
  const db = makeDb();
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  try {
    const store = new RunStore(isolatedRoot);
    // 执行器：写入 FAILED 终态 checkpoint 后仍以 run 对象 resolve（极端恢复面）。
    const failingExecutor: typeof executeResearchRun = async (args) => {
      const at = new Date().toISOString();
      args.store.saveCheckpoint({
        runId: 'FAILED-RUN-0001',
        question: args.question ?? 'controlled failed run',
        profile: 'offline_replay',
        sources: ['openalex'],
        maxPerQuery: 5,
        target: 3,
        state: 'FAILED',
        completedStages: [],
        ctx: {},
        startedAt: at,
        updatedAt: at,
        error: 'controlled failure',
        errorKind: 'pipeline',
        completedAt: at,
      });
      args.onRunPrepared?.('FAILED-RUN-0001');
      return sharedRun;
    };
    await registerResearchRoutes(app, { store, db, executeRun: failingExecutor });
    const res = await app.inject({
      method: 'POST',
      url: '/research',
      payload: { question: 'controlled failed run must not anchor', profile: 'offline_replay' },
    });
    assert.equal(res.statusCode, 202, res.body);
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(countSummaryLeaves(db), 0);
  } finally {
    await app.close();
    db.close();
    rmSync(isolatedRoot, { recursive: true, force: true });
  }
});
