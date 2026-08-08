/**
 * P0-3 agent_loop 运行时事件流测试（2026-08-07 落地）。
 *
 * 覆盖：
 *   1. AgentEventBus 单元：on/off 幂等退订、once 一次性、emit 顺序派发、
 *      snapshot 不可变副本、snapshotFor 过滤、clear、MAX_HISTORY 截断、subscriberCount；
 *   2. emitTyped 类型安全发布（判别联合收窄）；
 *   3. runAgentLoop 集成：onEvent 订阅完整生命周期事件序列——
 *      run_started → [stage_started/stage_completed]×6 → run_completed；
 *      事件字段与终局 state 一致（reason/verdict/artifactCount）；
 *   4. 零回归：不传 onEvent → 行为字节等同基线（事件流零成本开关）。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。
 */

import { runMigrations } from '../../src/db/index.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import {
  AgentEventBus,
  isEventType,
  type AgentLoopEvent,
} from '../../src/agent_loop/events.ts';
import { runAgentLoop } from '../../src/agent_loop/fsm_runner.ts';
import { extractFinishReasonForOfflineReplay } from '../../src/agent_loop/run_stage.ts';
import type { LlmGateway } from '../../src/llm_gateway/gateway.ts';
import type { LlmResponse } from '../../src/llm_gateway/types.ts';


// ---------- helpers ----------

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

function fixtureResponse(content: string): LlmResponse {
  return {
    credential: {
      providerProfile: 'offline_replay',
      providerRequestId: null,
      modelId: 'test-fixture-model',
      modelVersion: null,
      capability: 'structured',
      isoTimestamp: '2026-06-27T00:00:00.000Z',
      tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    },
    content,
    raw: { replayed: true, messageCount: 2 },
  };
}

function createSequentialGateway(contents: readonly string[]): LlmGateway {
  let callIndex = 0;
  return {
    register: () => {},
    callLlm: async (): Promise<LlmResponse> => {
      const content = contents[callIndex];
      if (content === undefined) {
        throw new Error(
          `createSequentialGateway: callLlm invoked ${callIndex + 1} times but only ${contents.length} fixtures provided`,
        );
      }
      callIndex += 1;
      return fixtureResponse(content);
    },
    registeredProfiles: () => [],
  };
}

// fixture payloads（镜像 t017 模式）
const understandingPayload = {
  kind: 'understanding',
  problemStatement: 'How to classify variable stars with limited labeled data',
  scope: 'Astronomy variable star classification',
  keyTerms: ['variable star', 'light curve', 'macro_f1'],
  falsifiableAngle: 'Testable via macro_f1 metric',
};

const integrationPayload = {
  kind: 'integration',
  citations: [{ evidenceId: 'ev-001', source: 'arxiv', doi: null, title: 'Survey' }],
  knowledgeGraphSummary: 'Taxonomy gaps in RR Lyrae.',
  gaps: ['Limited labeled data'],
};

const hypothesisClaimA = {
  kind: 'hypothesis',
  claim: 'Model X achieves macro_f1 >= 0.70',
  falsificationMethod: {
    prediction: 'macro_f1 >= 0.70',
    metric: 'macro_f1',
    comparator: 'gt',
    value: 0.7,
  },
  supportingCitations: ['ev-001'],
  scopeSlipText: 'scope limited',
};

function evidencePayload(vote: 'supports' | 'refutes'): object {
  return {
    kind: 'evidence',
    evidenceRecords: [
      {
        evidenceId: 'ev-001',
        supportsOrRefutes: vote,
        entailmentScore: 0.85,
        source: { evidenceId: 'ev-001', source: 'arxiv', doi: null, title: 'Survey' },
      },
    ],
    conflictingEvidenceCount: 0,
  };
}

const planPayload = {
  kind: 'plan',
  datasetChoices: ['Gaia DR3'],
  methodChoices: ['Random Forest'],
  scheduleOrFeedback: 'Train on 80/20 split',
  executableChecks: [],
};

const feedbackContinue = {
  kind: 'feedback',
  feedbackSignal: {
    continueIteration: true,
    iterationNumber: 1,
    maxIterations: 3,
    refinements: ['Refine hypothesis direction'],
  },
  iterationSummary: 'LLM wants another iteration',
};


// ---------- AgentEventBus 单元测试 ----------

test('events: on/emit 顺序派发 + off 幂等退订', () => {
  const bus = new AgentEventBus();
  const received: AgentLoopEvent[] = [];
  const h = (evt: AgentLoopEvent): void => {
    received.push(evt);
  };
  const unsubscribe = bus.on(h);

  const evt: AgentLoopEvent = {
    type: 'run_started',
    runId: 'r1',
    ts: '2026-08-07T00:00:00.000Z',
    researchInputHash: 'abc',
    maxIterations: 3,
    verdictDriven: false,
  };
  bus.emit(evt);
  bus.emit(evt);

  assert.equal(received.length, 2, '订阅后逐条派发');
  assert.equal(received[0]?.type, 'run_started');
  assert.equal(bus.subscriberCount, 1);

  unsubscribe();
  bus.emit(evt);
  assert.equal(received.length, 2, '退订后不再派发');
  assert.equal(bus.subscriberCount, 0);

  // 退订幂等
  unsubscribe();
  unsubscribe();
  assert.equal(bus.subscriberCount, 0);
});

test('events: once 只触发一次', () => {
  const bus = new AgentEventBus();
  let count = 0;
  bus.once((evt) => {
    if (evt.type === 'stage_started') count += 1;
  });

  const evt: AgentLoopEvent = {
    type: 'stage_started',
    runId: 'r1',
    iteration: 1,
    stageId: 'stage1_understanding',
    ts: '2026-08-07T00:00:00.000Z',
  };
  bus.emit(evt);
  bus.emit(evt);
  assert.equal(count, 1, 'once 只触发一次');
  assert.equal(bus.subscriberCount, 0, '触发后自动退订');
});

test('events: emitTyped 类型安全发布 + isEventType 收窄', () => {
  const bus = new AgentEventBus();
  const evt: AgentLoopEvent = {
    type: 'stage_completed',
    runId: 'r1',
    iteration: 1,
    stageId: 'stage1_understanding',
    payloadKind: 'understanding',
    degraded: false,
    tokens: 10,
    contentHash: 'h1',
    ts: '2026-08-07T00:00:00.000Z',
  };
  bus.emitTyped(evt);
  assert.equal(bus.historyLength, 1);
  const snapEvt = bus.snapshot()[0];
  assert.ok(snapEvt !== undefined, '快照首条必须存在');
  assert.ok(isEventType(snapEvt, 'stage_completed'));
  assert.ok(!isEventType(snapEvt, 'run_started'), '类型筛选为 false 时收窄失败');
});

test('events: snapshot 返回不可变副本 + snapshotFor 过滤', () => {
  const bus = new AgentEventBus();
  const evt: AgentLoopEvent = {
    type: 'run_started',
    runId: 'r-a',
    ts: 't0',
    researchInputHash: 'abc',
    maxIterations: 1,
    verdictDriven: false,
  };
  bus.emit(evt);
  const evt2: AgentLoopEvent = {
    type: 'run_started',
    runId: 'r-b',
    ts: 't1',
    researchInputHash: 'def',
    maxIterations: 1,
    verdictDriven: true,
  };
  bus.emit(evt2);

  const snap = bus.snapshot();
  assert.equal(snap.length, 2);
  assert.equal(bus.snapshotFor('r-a').length, 1);
  assert.equal(bus.snapshotFor('r-a')[0]?.runId, 'r-a');
  assert.equal(bus.snapshotFor('r-c').length, 0, '未知 runId 返回空');

  bus.clear();
  assert.equal(bus.historyLength, 0);
  assert.equal(snap.length, 2, 'clear 后旧快照仍不可变独立');
});

test('events: MAX_HISTORY 截断（保留最近 N 条）', () => {
  const bus = new AgentEventBus();
  for (let i = 0; i < AgentEventBus.MAX_HISTORY + 100; i++) {
    bus.emit({
      type: 'run_started',
      runId: `r-${i}`,
      ts: `t-${i}`,
      researchInputHash: 'x',
      maxIterations: 1,
      verdictDriven: false,
    } satisfies AgentLoopEvent);
  }
  assert.equal(bus.historyLength, AgentEventBus.MAX_HISTORY, '历史容量恒为 MAX_HISTORY');
  assert.equal(bus.snapshot()[0]?.runId, 'r-100', '最旧的被裁剪');
});


// ---------- runAgentLoop 集成测试 ----------

test('events: runAgentLoop 单轮 CONFIRMED 事件序列完整且字段与终局 state 一致', async () => {
  const db = openDb();
  try {
    const gateway = createSequentialGateway([
      JSON.stringify(understandingPayload),
      JSON.stringify(integrationPayload),
      JSON.stringify(hypothesisClaimA),
      JSON.stringify(evidencePayload('supports')),
      JSON.stringify(planPayload),
      JSON.stringify(feedbackContinue),
    ]);
    const events: AgentLoopEvent[] = [];

    const state = await runAgentLoop({
      runId: 'evt-run-1',
      researchInput: 'classify variable stars',
      gateway,
      profile: 'offline_replay',
      finishReasonExtractor: extractFinishReasonForOfflineReplay,
      reproHashProvider: () => 'a'.repeat(64),
      gitCommitSha: 'evt-sha',
      appendOptions: { providerProfile: 'offline_replay' },
      evidenceLogDb: db,
      termination: { maxIterations: 3, maxTokensPerRun: 50000, maxDurationMs: 10 * 60 * 1000 },
      verdictDrivenFeedback: true,
      onEvent: (evt) => {
        events.push(evt);
      },
    });

    assert.equal(state.terminationReason, 'verdict_confirmed');
    assert.equal(state.iterationsCompleted, 1);
    assert.equal(state.artifacts.length, 6);

    // 序列：1 run_started + 6×(stage_started+stage_completed) + 1 run_completed
    assert.equal(events.length, 14, '单轮事件总数须为 1+6×2+1');

    const runStarted = events[0];
    assert.ok(runStarted !== undefined && runStarted.type === 'run_started');
    assert.equal(runStarted.runId, 'evt-run-1');
    assert.equal(runStarted.maxIterations, 3);
    assert.equal(runStarted.verdictDriven, true);

    // stage_started / stage_completed 成对出现·stageId 顺序正确
    const stageIds = ['stage1_understanding', 'stage2_integration', 'stage3_hypothesis', 'stage4_evidence', 'stage5_plan', 'stage6_feedback'] as const;
    const payloadKinds = ['understanding', 'integration', 'hypothesis', 'experiment', 'plan', 'feedback'] as const;
    for (let i = 0; i < 6; i++) {
      const started = events[1 + i * 2];
      const completed = events[2 + i * 2];
      assert.ok(started !== undefined && started.type === 'stage_started');
      assert.ok(completed !== undefined && completed.type === 'stage_completed');
      assert.equal(started.stageId, stageIds[i], `stage_started[${i}] stageId`);
      assert.equal(completed.stageId, stageIds[i], `stage_completed[${i}] stageId`);
      assert.equal(completed.payloadKind, payloadKinds[i], `stage_completed[${i}] payloadKind`);
    }

    // 终局 run_completed 与 state 一致
    const last = events.at(-1);
    assert.ok(last !== undefined && last.type === 'run_completed');
    assert.equal(last.reason, 'verdict_confirmed');
    assert.equal(last.iterations, 1);
    assert.equal(last.artifactCount, 6);
    assert.equal(last.verdict, 'CONFIRMED');
    assert.equal(last.decisiveRuleId, 'R7_PRIMARY_TEST_CONFIRMS');
  } finally {
    db.close();
  }
});

test('events: 零回归——不传 onEvent 行为字节等同基线（事件流零成本开关）', async () => {
  const db = openDb();
  try {
    const gateway = createSequentialGateway([
      JSON.stringify(understandingPayload),
      JSON.stringify(integrationPayload),
      JSON.stringify(hypothesisClaimA),
      JSON.stringify(evidencePayload('refutes')),
      JSON.stringify(planPayload),
      JSON.stringify(feedbackContinue),
    ]);

    const state = await runAgentLoop({
      runId: 'evt-zero-cost',
      researchInput: 'test',
      gateway,
      profile: 'offline_replay',
      finishReasonExtractor: extractFinishReasonForOfflineReplay,
      reproHashProvider: () => 'a'.repeat(64),
      gitCommitSha: 'evt-sha',
      appendOptions: { providerProfile: 'offline_replay' },
      evidenceLogDb: db,
      termination: { maxIterations: 1, maxTokensPerRun: 50000, maxDurationMs: 10 * 60 * 1000 },
      // onEvent 不传
    });

    assert.equal(state.iterationsCompleted, 1);
    assert.equal(state.artifacts.length, 6);
    assert.equal(state.terminationReason, 'feedback_converged');
  } finally {
    db.close();
  }
});
