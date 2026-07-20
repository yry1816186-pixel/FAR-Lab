/**
 * resume.test.ts — IC-06 stage_receipt 恢复验收。
 *
 * 验收 Oracle(合同 contract-006):
 *   ① 6-stage FSM 在 stage4 后 kill(gateway 第 5 调用抛错)→ 重启从 stage5 续跑,
 *     stage1-4 不重复(gateway 计数/call_records 无重复副作用);
 *   ② 输入变更 → 检测重跑(收据失效,全量重跑);
 *   ③ 收据链可验;伪造收据/快照篡改 → fail-closed 拒绝。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runAgentLoop, DEFAULT_TERMINATION } from '../../src/agent_loop/fsm_runner.ts';
import { extractFinishReasonForOfflineReplay } from '../../src/agent_loop/run_stage.ts';
import { createLlmGateway } from '../../src/llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import type { LlmGateway } from '../../src/llm_gateway/gateway.ts';
import type { LlmRequest, LlmResponse, ProviderProfile } from '../../src/llm_gateway/types.ts';
import { runMigrations } from '../../src/db/migrator.ts';
import { StageReceiptStore, StageReceiptForgedError, verifyReceiptChain } from '../../src/agent_loop/stage_receipt_store.ts';

const INPUT = 'resume oracle probe';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

function countingGateway(counter: { calls: number }, failAtCall?: number): LlmGateway {
  const inner = createLlmGateway([createOfflineReplayAdapter()]);
  return {
    register: () => {},
    registeredProfiles: () => inner.registeredProfiles(),
    callLlm: async (profile: ProviderProfile, request: LlmRequest): Promise<LlmResponse> => {
      counter.calls += 1;
      if (failAtCall !== undefined && counter.calls >= failAtCall) {
        throw new Error(`simulated kill at call ${counter.calls}`);
      }
      return inner.callLlm(profile, request);
    },
  };
}

async function runLoop(db: Database.Database, storePath: string, gateway: LlmGateway, researchInput: string = INPUT) {
  return runAgentLoop({
    runId: `resume-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    researchInput,
    gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'b6'.repeat(32),
    gitCommitSha: 'b'.repeat(40),
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db,
    termination: DEFAULT_TERMINATION,
    resumeStorePath: storePath,
  });
}

test('① stage4 后 kill → 重启从 stage5 续跑,stage1-4 不重复', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ic06-resume-'));
  try {
    const storePath = join(dir, 'receipts.json');
    const db = openDb();
    const killCounter = { calls: 0 };
    const first = await runLoop(db, storePath, countingGateway(killCounter, 5));
    assert.equal(first.terminationReason, 'error', 'kill 应致 error 终止');
    assert.equal(killCounter.calls, 5, 'stage5 调用时被 kill');

    const store = StageReceiptStore.open(storePath, INPUT);
    assert.equal(store.receiptCount(), 4, 'stage1-4 收据已签收');

    const resumeCounter = { calls: 0 };
    const second = await runLoop(db, storePath, countingGateway(resumeCounter));
    assert.equal(second.error, null);
    assert.ok(second.verdictNode !== null, '续跑应产出裁决');
    assert.equal(resumeCounter.calls, 2, `stage1-4 不得重复 LLM 调用(应只跑 stage5+stage6,实际 ${resumeCounter.calls})`);

    // 幂等:同一 DB 上 call_records 无 stage1-4 重复副作用(4 kill 前 + 2 续跑 = 6)
    const rows = db.prepare(`SELECT COUNT(*) AS n FROM call_records`).get() as { n: number };
    assert.equal(rows.n, 6, `call_records 应为 6(无重复),实际 ${rows.n}`);
    // 快照产物与前序一致(artifacts 完整 6 阶段)
    assert.equal(second.artifacts.length, 6);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('② 输入变更 → 收据失效全量重跑', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ic06-input-'));
  try {
    const storePath = join(dir, 'receipts.json');
    const db = openDb();
    const c1 = { calls: 0 };
    await runLoop(db, storePath, countingGateway(c1, 5)); // kill at stage5,4 收据
    const c2 = { calls: 0 };
    const state = await runLoop(db, storePath, countingGateway(c2), 'DIFFERENT INPUT');
    assert.equal(state.error, null);
    assert.equal(c2.calls, 6, `输入变化应全量重跑 6 阶段,实际 ${c2.calls}`);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('③ 收据链可验;伪造收据/快照篡改 → fail-closed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ic06-forge-'));
  try {
    const storePath = join(dir, 'receipts.json');
    const db = openDb();
    const c = { calls: 0 };
    await runLoop(db, storePath, countingGateway(c));
    // 合法存储可开+链可验
    const ok = StageReceiptStore.open(storePath, INPUT);
    assert.equal(ok.receiptCount(), 6);
    const file = JSON.parse(readFileSync(storePath, 'utf8')) as { receipts: Array<Record<string, unknown>> };
    verifyReceiptChain(file.receipts as never);

    // 伪造 receiptHash → 拒绝
    const forged = JSON.parse(readFileSync(storePath, 'utf8')) as { receipts: Array<Record<string, unknown>>; snapshots: Record<string, unknown> };
    forged.receipts[1] = { ...forged.receipts[1], outputHash: 'f'.repeat(64) };
    writeFileSync(storePath, JSON.stringify(forged), 'utf8');
    assert.throws(() => StageReceiptStore.open(storePath, INPUT), StageReceiptForgedError);

    // 快照篡改 → 拒绝(outputHash 失配)
    const db2 = openDb();
    const c2 = { calls: 0 };
    await runLoop(db2, storePath, countingGateway(c2), 'SNAPSHOT-PROBE');
    const tampered = JSON.parse(readFileSync(storePath, 'utf8')) as { snapshots: Record<string, { structured: Record<string, unknown> }> };
    const firstKey = Object.keys(tampered.snapshots)[0];
    if (firstKey === undefined) throw new Error('expected snapshots');
    tampered.snapshots[firstKey] = { ...tampered.snapshots[firstKey], structured: { kind: 'tampered' } };
    writeFileSync(storePath, JSON.stringify(tampered), 'utf8');
    assert.throws(() => StageReceiptStore.open(storePath, 'SNAPSHOT-PROBE'), StageReceiptForgedError);
    db.close();
    db2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
