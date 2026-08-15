/**
 * fsm_runner.assertTerminated 单元测试（纯逻辑·不涉及 gateway/DB 实际调用）。
 *
 * 历史溯源（已归档）: .1.
 *
 * 测试覆盖 5 个终止条件分支：
 *   1. feedback_converged — feedbackSignal=null
 *   2. feedback_converged — feedbackSignal.continueIteration=false
 *   3. max_iterations — iteration > maxIterations
 *   4. max_tokens — tokensConsumed >= maxTokensPerRun
 *   5. max_duration — wallClock >= maxDurationMs
 *   6. 不终止 — 全部条件未满足 → terminated=false
 *
 * 注：StageContext 的 gateway/evidenceLogDb 等字段在 assertTerminated 中不被读取，
 *     构造 fake 占位实现仅满足类型完整性（禁双重断言）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { assertTerminated } from '../../src/agent_loop/fsm_runner.ts';
import type {
  FeedbackSignal,
  StageContext,
  TerminationCriteria,
} from '../../src/agent_loop/types.ts';
import type { LlmGateway } from '../../src/llm_gateway/gateway.ts';


/**
 * 构造 fake LlmGateway（assertTerminated 不调 callLlm·仅满足类型）。
 */
function fakeGateway(): LlmGateway {
  return {
    register: () => {
      throw new Error('fakeGateway.register: not used in assertTerminated test');
    },
    callLlm: async () => {
      throw new Error('fakeGateway.callLlm: not used in assertTerminated test');
    },
    registeredProfiles: () => [],
  };
}


/**
 * 构造完整 StageContext（type-safe·禁双重断言）。
 *
 * gateway/evidenceLogDb 等字段在 assertTerminated 中不被读取，
 * 但 StageContext 类型要求完整，故用 fake 占位实现填充。
 */
function makeCtx(overrides: Partial<StageContext>): StageContext {
  const termination: TerminationCriteria = {
    maxIterations: 3,
    maxTokensPerRun: 50000,
    maxDurationMs: 10 * 60 * 1000,
  };
  const base: StageContext = {
    runId: 'test-run',
    iteration: 1,
    researchInput: 'test question',
    gateway: fakeGateway(),
    profile: 'offline_replay',
    finishReasonExtractor: () => 'stop',
    reproHashProvider: () => '0'.repeat(64),
    gitCommitSha: 'test-sha',
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: new Database(':memory:'),
    prevArtifacts: [],
    feedbackSignal: null,
    tokensConsumed: 0,
    termination,
  };
  return { ...base, ...overrides };
}


function makeFeedback(continueIteration: boolean): FeedbackSignal {
  return {
    continueIteration,
    iterationNumber: 1,
    maxIterations: 3,
    refinements: [],
  };
}


test('feedback_converged：feedbackSignal=null → terminated=true', () => {
  const ctx = makeCtx({});
  const result = assertTerminated(ctx, null, Date.now());
  assert.equal(result.terminated, true);
  assert.equal(result.reason, 'feedback_converged');
});


test('feedback_converged：continueIteration=false → terminated=true', () => {
  const ctx = makeCtx({});
  const result = assertTerminated(ctx, makeFeedback(false), Date.now());
  assert.equal(result.terminated, true);
  assert.equal(result.reason, 'feedback_converged');
});


test('max_iterations：iteration > maxIterations → terminated=true', () => {
  const ctx = makeCtx({ iteration: 5 });
  const result = assertTerminated(ctx, makeFeedback(true), Date.now());
  assert.equal(result.terminated, true);
  assert.equal(result.reason, 'max_iterations');
});


test('max_tokens：tokensConsumed >= maxTokensPerRun → terminated=true', () => {
  const ctx = makeCtx({ tokensConsumed: 60000 });
  const result = assertTerminated(ctx, makeFeedback(true), Date.now());
  assert.equal(result.terminated, true);
  assert.equal(result.reason, 'max_tokens');
});


test('max_duration：wallClock >= maxDurationMs → terminated=true', () => {
  const ctx = makeCtx({});
  // startTime 设为很久以前（超过 maxDurationMs=10 分钟）
  const startTime = Date.now() - 20 * 60 * 1000;
  const result = assertTerminated(ctx, makeFeedback(true), startTime);
  assert.equal(result.terminated, true);
  assert.equal(result.reason, 'max_duration');
});


test('不终止：全部条件未满足 → terminated=false', () => {
  const ctx = makeCtx({ iteration: 2, tokensConsumed: 1000 });
  const result = assertTerminated(ctx, makeFeedback(true), Date.now());
  assert.equal(result.terminated, false);
  // reason 字段在 terminated=false 时无意义·但函数返回 'feedback_converged' 占位
  assert.equal(result.reason, 'feedback_converged');
});


test('边界：iteration === maxIterations 不触发 max_iterations（>才触发）', () => {
  // spec §7.1：iteration > maxIterations 触发（严格大于）
  // iteration === maxIterations 不触发（仍在预算内）
  const ctx = makeCtx({ iteration: 3 });
  const result = assertTerminated(ctx, makeFeedback(true), Date.now());
  assert.equal(result.terminated, false);
});


test('边界：tokensConsumed === maxTokensPerRun 触发 max_tokens（>=触发）', () => {
  // spec §7.1：tokensConsumed >= maxTokensPerRun 触发（含等于）
  // 算力预算闸是「到达上限即停」语义（防超预算）
  const ctx = makeCtx({ tokensConsumed: 50000 });
  const result = assertTerminated(ctx, makeFeedback(true), Date.now());
  assert.equal(result.terminated, true);
  assert.equal(result.reason, 'max_tokens');
});
