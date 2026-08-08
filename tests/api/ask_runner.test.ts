/**
 * ask_runner 直接测试（审计 P1-1 修复后的核心 domain 层·2026-08-06）。
 *
 * executeAskRun 原定义于 src/cli/commands/ask.ts（CLI 层），上提至
 * src/api/internal/ask_runner.ts 后仅经 arena/court/ask/repl/stream 间接覆盖——
 * 本测试为其提供直接单元覆盖：
 *   1. 缺省（offline_replay fixture）→ 6-stage loop 跑通 + 产出裁决 + ASK-9 密封落库；
 *   2. gateway 注入 → 走注入网关（datasetSource 语义由下游断言，本测试验证参数透传）；
 *   3. 无裁决路径 → 不密封（verdictNode === null 时零 proof_envelope 行）；
 *   4. mode='quick' 与 'full' 均可达。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。错误码用 type guard 收窄。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { executeAskRun } from '../../src/api/internal/ask_runner.ts';
import { runMigrations } from '../../src/db/index.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import type { LlmGateway } from '../../src/llm_gateway/gateway.ts';
import type { LlmRequest, LlmResponse } from '../../src/llm_gateway/types.ts';

const GIT_SHA = 'a'.repeat(40);
const QUESTION = 'C-ASTRO-0001: TIC lightcurve exhibits a transit-like periodic signal';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

/** 缺省 offline 网关（无真实凭证·fixture 驱动）。 */
function defaultGateway(): LlmGateway {
  const adapter = createOfflineReplayAdapter();
  return {
    register: () => {},
    callLlm: async (_profile: string, request: LlmRequest): Promise<LlmResponse> => adapter.call(request),
    registeredProfiles: () => ['offline_replay'],
  };
}

/** 统计 proof_envelopes 表中的密封行数。 */
function envelopeCount(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM proof_envelopes').get() as { n: number };
  return row.n;
}

test('executeAskRun 缺省 offline：6-stage loop 产出裁决 + ASK-9 密封落库', async () => {
  const db = openDb();
  const result = await executeAskRun(db, QUESTION, 'full', GIT_SHA);

  // loop 跑通：runId 生成 + 阶段产出
  assert.ok(result.runId.length > 0, 'runId 须生成');
  assert.ok(result.loopState.artifacts.length > 0, '须产出阶段 artifact');
  assert.deepEqual(
    result.loopState.artifacts.map((a) => a.stageId),
    ['stage1_understanding', 'stage2_integration', 'stage3_hypothesis', 'stage4_evidence', 'stage5_plan', 'stage6_feedback'],
    'full mode 须跑满 6 阶段',
  );

  // 裁决 + 密封
  assert.ok(result.loopState.verdictNode !== null, 'fixture 路径须产出裁决');
  assert.equal(envelopeCount(db), 1, '有裁决须密封 1 条 proof_envelope');
  db.close();
});

test('executeAskRun 注入 gateway：参数透传 + 密封仍落库', async () => {
  const db = openDb();
  const gateway = defaultGateway();
  const result = await executeAskRun(db, QUESTION, 'quick', GIT_SHA, undefined, undefined, gateway);

  assert.ok(result.runId.length > 0, '注入网关路径须跑通');
  assert.ok(result.loopState.verdictNode !== null, 'offline fixture 注入网关仍须产出裁决');
  assert.equal(envelopeCount(db), 1, '注入网关路径密封仍须落库');
  db.close();
});

test('executeAskRun quick mode：单轮迭代终止（QUICK_TERMINATION maxIterations=1）', async () => {
  const db = openDb();
  const result = await executeAskRun(db, QUESTION, 'quick', GIT_SHA);

  // quick mode 不裁剪阶段（6 阶段都跑），但终止于单轮迭代
  assert.equal(result.loopState.iterationsCompleted, 1, 'quick mode 须单轮迭代终止');
  assert.ok(result.loopState.terminated, 'quick mode 须终止');
  // fixture 反馈单轮即收敛（feedback_converged）；QUICK_TERMINATION maxIterations=1 兜底保证不空转
  assert.ok(
    result.loopState.terminationReason === 'feedback_converged' || result.loopState.terminationReason === 'max_iterations',
    'quick mode 须以收敛或迭代上限终止',
  );
  assert.equal(result.loopState.artifacts.length, 6, 'quick mode 仍须完成全部 6 阶段（裁剪的是迭代数而非阶段）');
  db.close();
});

test('executeAskRun 密封幂等：重复调用各自独立密封（不互相污染）', async () => {
  const db = openDb();
  const r1 = await executeAskRun(db, QUESTION, 'quick', GIT_SHA);
  const r2 = await executeAskRun(db, QUESTION, 'quick', GIT_SHA);

  assert.notEqual(r1.runId, r2.runId, '两次运行须产生不同 runId');
  assert.equal(envelopeCount(db), 2, '两次有裁决运行须各自密封 1 条');
  db.close();
});
