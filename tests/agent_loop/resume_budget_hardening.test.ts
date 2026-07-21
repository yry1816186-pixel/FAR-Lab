/**
 * resume_budget_hardening.test.ts — IC-06/IC-04 对抗回归(2026-07-20 对抗轮)。
 *
 * 覆盖发现:
 *   F-V07-01 孤儿快照注入拒绝;F-V07-03 血缘绑定(换空 DB 拒绝空心续跑);
 *   F-V07-06 伪造专属错误码;F-V07-05 墙钟/血缘入收据;
 *   V06-F1 末轮超限竞态关闭;V06-F5 预算配置 fail-closed。
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
import { validateBudgetProfile } from '../../src/llm_gateway/budget.ts';
import type { LlmGateway } from '../../src/llm_gateway/gateway.ts';
import type { LlmRequest, LlmResponse, ProviderProfile } from '../../src/llm_gateway/types.ts';
import { runMigrations } from '../../src/db/migrator.ts';
import { StageReceiptStore } from '../../src/agent_loop/stage_receipt_store.ts';

const INPUT = 'hardening probe';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

function plainGateway(): LlmGateway {
  const inner = createLlmGateway([createOfflineReplayAdapter()]);
  return {
    register: () => {},
    registeredProfiles: () => inner.registeredProfiles(),
    callLlm: (profile: ProviderProfile, request: LlmRequest): Promise<LlmResponse> => inner.callLlm(profile, request),
  };
}

async function runLoop(
  db: Database.Database,
  storePath: string,
  extra: { budget?: { maxTokens: number | null; maxDurationMs: number | null; maxLoops: number | null } } = {},
) {
  return runAgentLoop({
    runId: `hard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    researchInput: INPUT,
    gateway: plainGateway(),
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'b6'.repeat(32),
    gitCommitSha: 'b'.repeat(40),
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db,
    termination: DEFAULT_TERMINATION,
    resumeStorePath: storePath,
    ...(extra.budget !== undefined ? { budget: extra.budget } : {}),
  });
}

test('F-V07-01 孤儿快照注入 → open 拒绝', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'h-orphan-'));
  try {
    const storePath = join(dir, 'receipts.json');
    const db = openDb();
    await runLoop(db, storePath);
    const file = JSON.parse(readFileSync(storePath, 'utf8')) as { snapshots: Record<string, unknown> };
    const anySnapshot = Object.values(file.snapshots)[0];
    file.snapshots['1:stage4_evidence_fake'] = anySnapshot; // 无对应收据的注入快照
    writeFileSync(storePath, JSON.stringify(file), 'utf8');
    assert.throws(() => StageReceiptStore.open(storePath, INPUT), /孤儿快照/);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('F-V07-03+F-V07-06 同存储+全新空 DB → STAGE_RECEIPT_FORGED(拒绝空心裁决)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'h-hollow-'));
  try {
    const storePath = join(dir, 'receipts.json');
    const db1 = openDb();
    const first = await runLoop(db1, storePath);
    assert.equal(first.error, null);
    db1.close();
    // 攻击:同一收据存储 + 全新空 DB(无任何 stage1-6 证据行)
    const db2 = openDb();
    const second = await runLoop(db2, storePath);
    assert.equal(second.error?.code, 'STAGE_RECEIPT_FORGED');
    assert.equal(second.verdictNode, null);
    const verdicts = db2.prepare(`SELECT COUNT(*) AS n FROM verdict_nodes`).get() as { n: number };
    assert.equal(verdicts.n, 0, '空心裁决不得落库');
    db2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('F-V07-05 收据携带血缘与墙钟(lineageCount/lineageHead/elapsedMs)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'h-lineage-'));
  try {
    const storePath = join(dir, 'receipts.json');
    const db = openDb();
    await runLoop(db, storePath);
    const file = JSON.parse(readFileSync(storePath, 'utf8')) as {
      receipts: Array<{ lineageCount?: number; lineageHead?: string; elapsedMs?: number }>;
    };
    assert.equal(file.receipts.length, 6);
    for (const [index, receipt] of file.receipts.entries()) {
      assert.equal(receipt.lineageCount, index + 1, `receipt ${index + 1} 血缘行数`);
      assert.match(receipt.lineageHead ?? '', /^[0-9a-f]{64}$/);
      assert.equal(typeof receipt.elapsedMs, 'number');
    }
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('V06-F1 末轮超限竞态关闭:1 tok 预算收敛轮 → COST_BUDGET_EXCEEDED(不产裁决)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'h-finalround-'));
  try {
    const storePath = join(dir, 'receipts.json');
    const db = openDb();
    const state = await runLoop(db, storePath, { budget: { maxTokens: 1, maxDurationMs: null, maxLoops: null } });
    assert.equal(state.error?.code, 'COST_BUDGET_EXCEEDED');
    assert.equal(state.verdictNode, null, '超限不得产出裁决(修复前此处产出 CONFIRMED)');
    db.close();
    // 对照:宽松预算收敛正常
    const db2 = openDb();
    const storePath2 = join(dir, 'receipts2.json');
    const ok = await runLoop(db2, storePath2, { budget: { maxTokens: 1_000_000, maxDurationMs: null, maxLoops: null } });
    assert.equal(ok.error, null);
    db2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('V06-F5 预算配置 fail-closed:NaN/undefined/负值拒绝;显式 null 保留', () => {
  assert.throws(() => validateBudgetProfile({ maxTokens: Number.NaN, maxDurationMs: null, maxLoops: null }), /budget profile invalid/);
  assert.throws(() => validateBudgetProfile({ maxTokens: -5, maxDurationMs: null, maxLoops: null }), /budget profile invalid/);
  // JSON 缺键自然产物(undefined 维度)也必须拒绝(不经 as 强转构造)
  assert.throws(
    () => validateBudgetProfile(JSON.parse('{"maxDurationMs":null,"maxLoops":null}')),
    /budget profile invalid/,
  );
  assert.doesNotThrow(() => validateBudgetProfile({ maxTokens: null, maxDurationMs: null, maxLoops: null }));
  assert.doesNotThrow(() => validateBudgetProfile({ maxTokens: 0, maxDurationMs: 100, maxLoops: 1 }));
});
