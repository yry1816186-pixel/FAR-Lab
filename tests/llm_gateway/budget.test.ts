/**
 * budget.test.ts — IC-04 G7 成本硬预算断路器验收。
 *
 * 验收 Oracle(合同 contract-004):
 *   ① 模拟超 token 上限 → 中断 + COST_BUDGET_EXCEEDED 错误码 + 已耗展示;
 *   ② status 显示分阶段成本(summarizeCostsByStage 来自 call_records 真实记录);
 *   ③ 无 key 环境(offline_replay)不受影响(预算缺省兜底,不误伤);
 *   反事实:超时长/超循环同样断路;显式 null 关闭(红线明示)。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import {
  checkBudget,
  CostBudgetExceeded,
  DEFAULT_BUDGET_PROFILE,
  summarizeCostsByStage,
  summarizeTotalCost,
} from '../../src/llm_gateway/budget.ts';
import { runAgentLoop, DEFAULT_TERMINATION } from '../../src/agent_loop/fsm_runner.ts';
import { extractFinishReasonForOfflineReplay } from '../../src/agent_loop/run_stage.ts';
import { createLlmGateway } from '../../src/llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import { appendRecord, getChainHead, GENESIS_PREV_HASH, hashCanonicalJson } from '../../src/evidence_log/index.ts';
import { runMigrations } from '../../src/db/migrator.ts';

test('① checkBudget 超 token 上限 → CostBudgetExceeded(code/dimension/已耗)', () => {
  assert.throws(
    () => checkBudget({ maxTokens: 100, maxDurationMs: null, maxLoops: null }, { tokensConsumed: 100, elapsedMs: 1, loopsCompleted: 0 }),
    (err: unknown) => {
      assert.ok(err instanceof CostBudgetExceeded);
      assert.equal(err.code, 'COST_BUDGET_EXCEEDED');
      assert.equal(err.dimension, 'tokens');
      assert.equal(err.consumed, 100);
      assert.equal(err.limit, 100);
      assert.match(err.message, /consumed=100 exceeded limit=100/);
      return true;
    },
  );
  // 未超限不抛
  assert.doesNotThrow(() =>
    checkBudget({ maxTokens: 100, maxDurationMs: null, maxLoops: null }, { tokensConsumed: 99, elapsedMs: 1, loopsCompleted: 0 }),
  );
  // 时长与循环维度
  assert.throws(() => checkBudget({ maxTokens: null, maxDurationMs: 10, maxLoops: null }, { tokensConsumed: 0, elapsedMs: 10, loopsCompleted: 0 }), CostBudgetExceeded);
  assert.throws(() => checkBudget({ maxTokens: null, maxDurationMs: null, maxLoops: 3 }, { tokensConsumed: 0, elapsedMs: 0, loopsCompleted: 3 }), CostBudgetExceeded);
});

test('①b E2E:小预算跑 loop → 断路中断+错误码+已耗展示', async () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const gateway = createLlmGateway([createOfflineReplayAdapter()]);
  const state = await runAgentLoop({
    runId: 'budget-e2e',
    researchInput: 'test',
    gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'b6'.repeat(32),
    gitCommitSha: 'b'.repeat(40),
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db,
    termination: DEFAULT_TERMINATION,
    budget: { maxTokens: 0, maxDurationMs: null, maxLoops: null }, // 立即断路
  });
  assert.equal(state.terminated, true);
  assert.equal(state.error?.code, 'COST_BUDGET_EXCEEDED');
  assert.match(state.error?.message ?? '', /tokens consumed=0 exceeded limit=0/);
  db.close();
});

test('③ 无 key 环境(offline_replay):缺省预算兜底不误伤,loop 正常完成', async () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const gateway = createLlmGateway([createOfflineReplayAdapter()]);
  const state = await runAgentLoop({
    runId: 'budget-default',
    researchInput: 'test',
    gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'b6'.repeat(32),
    gitCommitSha: 'b'.repeat(40),
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db,
    termination: DEFAULT_TERMINATION,
    // budget 缺省 → DEFAULT_BUDGET_PROFILE
  });
  assert.equal(state.error, null);
  assert.ok(DEFAULT_BUDGET_PROFILE.maxTokens !== null);
  db.close();
});

test('③b 显式 null 关闭预算(红线明示)也能跑通', async () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const gateway = createLlmGateway([createOfflineReplayAdapter()]);
  const state = await runAgentLoop({
    runId: 'budget-off',
    researchInput: 'test',
    gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'b6'.repeat(32),
    gitCommitSha: 'b'.repeat(40),
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db,
    termination: DEFAULT_TERMINATION,
    budget: null,
  });
  assert.equal(state.error, null);
  db.close();
});

test('② 分阶段成本计量来自 call_records 真实记录', () => {
  const db = new Database(':memory:');
  runMigrations(db);
  for (const [i, stage] of ['stageA', 'stageA', 'stageB'].entries()) {
    const req = { q: i };
    const res = { a: i };
    appendRecord(
      db,
      {
        stageId: stage,
        cred: {
          modelId: 'fixture',
          dashscopeRequestId: null,
          reproHash: `${i}`.repeat(64).slice(0, 64),
          gitCommitSha: 'b'.repeat(40),
          isoTimestamp: '2026-07-20T00:00:00.000Z',
        },
        payloadKind: 'hypothesis',
        purposeTag: 'hypothesis',
        prevHash: getChainHead(db)?.currentHash ?? GENESIS_PREV_HASH,
      },
      {
        requestPayload: JSON.stringify(req),
        responsePayload: JSON.stringify(res),
        requestPayloadHash: hashCanonicalJson(req),
        responsePayloadHash: hashCanonicalJson(res),
        finishReason: 'stop',
        usageTokensTotal: (i + 1) * 10,
      },
      { providerProfile: 'offline_replay' },
    );
  }
  const byStage = summarizeCostsByStage(db);
  assert.deepEqual(byStage, [
    { stageId: 'stageA', calls: 2, tokens: 30 },
    { stageId: 'stageB', calls: 1, tokens: 30 },
  ]);
  assert.deepEqual(summarizeTotalCost(db), { calls: 3, tokens: 60 });
  db.close();
});
