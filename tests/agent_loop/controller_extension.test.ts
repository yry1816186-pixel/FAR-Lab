/**
 * T-018 · P0-3 人工接管 + 并行扩展阶段（2026-08-07 落地）。
 *
 * 验证两个「动态 agent 调度」能力：
 *   1. AgentLoopController（hold → stage_held → resume → stage_resumed）：
 *      人工检查-干预点不改变最终状态，仅异步等待。
 *   2. 并行扩展阶段（runParallelExtensionStages=true）：主链收敛产出裁决后，
 *      stage_registry 中 order>6 且带 executor 的扩展阶段以 Promise.all 并发执行，
 *      产物并入 artifacts（复用证据链语义）；失败显式抛错（fail-closed）。
 *   3. 零回归：缺省不传 → 无 stage_held/stage_resumed 事件、无扩展产物。
 *
 * Authority: src/agent_loop/controller.ts + fsm_runner.ts（controller/扩展段）
 *            src/agent_loop/stage_registry.ts（ExtensionStageError）。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。
 */

import { runMigrations } from '../../src/db/index.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runAgentLoop } from '../../src/agent_loop/fsm_runner.ts';
import { extractFinishReasonForOfflineReplay } from '../../src/agent_loop/run_stage.ts';
import { createAgentLoopController } from '../../src/agent_loop/controller.ts';
import {
  deregisterStage,
  registerStage,
  resetStageRegistry,
} from '../../src/agent_loop/stage_registry.ts';
import type { AgentLoopEvent } from '../../src/agent_loop/events.ts';
import type { StageArtifact, StageId } from '../../src/agent_loop/types.ts';
import type { LlmGateway } from '../../src/llm_gateway/gateway.ts';
import type { LlmResponse } from '../../src/llm_gateway/types.ts';
import { replaySession } from '../../src/trace/session_recorder.ts';


// ---------- helpers（镜像 t016/t017 模式）----------

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

// 单轮 6 fixtures：evidence=supports → CONFIRMED（裁决确定·无 LLM 判断）
function oneRoundFixtures(): string[] {
  return [
    JSON.stringify({
      kind: 'understanding',
      problemStatement: 'classify variable stars',
      scope: 'Astronomy',
      keyTerms: ['light curve'],
      falsifiableAngle: 'macro_f1',
    }),
    JSON.stringify({
      kind: 'integration',
      citations: [{ evidenceId: 'ev-001', source: 'arxiv', doi: null, title: 'Survey' }],
      knowledgeGraphSummary: 'gaps',
      gaps: [],
    }),
    JSON.stringify({
      kind: 'hypothesis',
      claim: 'Model X achieves macro_f1 >= 0.70',
      falsificationMethod: {
        prediction: 'macro_f1 >= 0.70',
        metric: 'macro_f1',
        comparator: 'gt',
        value: 0.70,
      },
      supportingCitations: ['ev-001'],
      scopeSlipText: 'scope limited',
    }),
    JSON.stringify({
      kind: 'evidence',
      evidenceRecords: [
        {
          evidenceId: 'ev-001',
          supportsOrRefutes: 'supports',
          entailmentScore: 0.85,
          source: { evidenceId: 'ev-001', source: 'arxiv', doi: null, title: 'Survey' },
        },
      ],
      conflictingEvidenceCount: 0,
    }),
    JSON.stringify({
      kind: 'plan',
      datasetChoices: ['Gaia DR3'],
      methodChoices: ['RF'],
      scheduleOrFeedback: 'train',
      executableChecks: [],
    }),
    JSON.stringify({
      kind: 'feedback',
      feedbackSignal: { continueIteration: false, iterationNumber: 1, maxIterations: 3, refinements: [] },
      iterationSummary: 'converged',
    }),
  ];
}

function makeAuditArtifact(): StageArtifact {
  return {
    stageId: 'stage7_audit' as StageId,
    payloadKind: 'plan',
    structured: {
      kind: 'plan',
      datasetChoices: [],
      methodChoices: [],
      scheduleOrFeedback: 'independent parallel audit',
      executableChecks: [],
    },
    callResult: fixtureResponse('audit plan'),
    degraded: false,
    degradationReason: null,
  };
}

async function waitUntil(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitUntil timeout (${timeoutMs}ms)`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}


// ---------- 1. controller 单元语义 ----------

test('T-018 controller：hold/resume/isHeld/waitIfHeld 语义（幂等·非暂停零让步）', async () => {
  const controller = createAgentLoopController();
  assert.equal(controller.isHeld(), false, '初始非暂停');

  // 非暂停态 waitIfHeld 立即返回（零异步让步·零行为）
  await controller.waitIfHeld();

  controller.hold();
  assert.equal(controller.isHeld(), true, 'hold 后进入暂停态');
  controller.hold(); // 幂等
  assert.equal(controller.isHeld(), true);

  let resumed = false;
  const waitPromise = controller.waitIfHeld().then(() => {
    resumed = true;
  });
  // 微任务让步：确认 waitIfHeld 尚未返回
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(resumed, false, '暂停态 waitIfHeld 须等待 resume');

  controller.resume();
  await waitPromise;
  assert.equal(resumed, true, 'resume 后 waitIfHeld 返回');
  assert.equal(controller.isHeld(), false, 'resume 后退出暂停态');

  controller.resume(); // 幂等（未 hold 时无副作用）
  assert.equal(controller.isHeld(), false);
});


// ---------- 2. 集成：hold → stage_held → resume → stage_resumed → 完成 ----------

test('T-018 集成：controller.hold 在阶段开始处暂停并发出 stage_held/resumed，最终状态不变', async () => {
  const db = openDb();
  try {
    const events: AgentLoopEvent[] = [];
    const controller = createAgentLoopController();
    controller.hold(); // 启动前即暂停 → 首个 stage_started 后触发 stage_held

    const loopPromise = runAgentLoop({
      runId: 't018-hold',
      researchInput: 'classify variable stars',
      gateway: createSequentialGateway(oneRoundFixtures()),
      profile: 'offline_replay',
      finishReasonExtractor: extractFinishReasonForOfflineReplay,
      reproHashProvider: () => 'a'.repeat(64),
      gitCommitSha: 't018-sha',
      appendOptions: { providerProfile: 'offline_replay' },
      evidenceLogDb: db,
      termination: { maxIterations: 1, maxTokensPerRun: 50000, maxDurationMs: 10 * 60 * 1000 },
      controller,
      onEvent: (evt) => {
        events.push(evt);
      },
    });

    // 等待首个 stage_held（stage1_started 之后·stage1 执行之前）
    await waitUntil(() => events.some((e) => e.type === 'stage_held'));
    assert.equal(controller.isHeld(), true, 'run 运行中 controller 保持暂停态');

    // 人工检查-干预点：此时 stage1 尚未执行（无 stage_completed(stage1)）
    assert.equal(
      events.some((e) => e.type === 'stage_completed' && e.stageId === 'stage1_understanding'),
      false,
      'hold 期间 stage1 不得执行',
    );

    controller.resume();
    const state = await loopPromise;

    // 完成语义不变：单轮 CONFIRMED
    assert.equal(state.iterationsCompleted, 1);
    assert.equal(state.terminationReason, 'feedback_converged');
    assert.equal(state.artifacts.length, 6);
    assert.equal(state.verdictNode?.verdict, 'CONFIRMED');

    // 事件序列：stage_held 出现在第一个 stage_started(stage1) 之后、stage_completed(stage1) 之前
    const held = events.find((e) => e.type === 'stage_held');
    assert.ok(held !== undefined);
    assert.equal(held.stageId, 'stage1_understanding');
    const heldIdx = events.indexOf(held);
    assert.equal(events[heldIdx - 1]?.type, 'stage_started', 'stage_held 前是 stage_started');
    const resumedIdx = events.findIndex((e) => e.type === 'stage_resumed');
    assert.ok(resumedIdx > heldIdx, 'stage_resumed 在 stage_held 之后');
    assert.equal(events[resumedIdx + 1]?.type, 'stage_completed', 'resume 后该阶段执行完成');
  } finally {
    db.close();
  }
});


// ---------- 3. 集成：并行扩展阶段 ----------

test('T-018 并行扩展：主链收敛后并发执行 order>6 扩展 executor，产物并入 artifacts', async () => {
  const db = openDb();
  const dir = mkdtempSync(join(tmpdir(), 't018-extension-session-'));
  try {
    resetStageRegistry();
    let executorCalls = 0;
    registerStage({
      stageId: 'stage7_audit' as StageId,
      order: 7,
      label: 'Parallel Audit',
      payloadKind: 'plan',
      consumesFeedbackSignal: false,
      verdictCritical: false,
      skippable: false,
      description: 'independent parallel audit',
      executor: async () => {
        executorCalls += 1;
        return makeAuditArtifact();
      },
    });

    const state = await runAgentLoop({
      runId: 't018-extension',
      researchInput: 'classify variable stars',
      gateway: createSequentialGateway(oneRoundFixtures()),
      profile: 'offline_replay',
      finishReasonExtractor: extractFinishReasonForOfflineReplay,
      reproHashProvider: () => 'a'.repeat(64),
      gitCommitSha: 't018-sha',
      appendOptions: { providerProfile: 'offline_replay' },
      evidenceLogDb: db,
      termination: { maxIterations: 1, maxTokensPerRun: 50000, maxDurationMs: 10 * 60 * 1000 },
      runParallelExtensionStages: true,
      sessionPath: join(dir, 'session.jsonl'),
    });

    assert.equal(executorCalls, 1, '扩展 executor 须执行一次');
    // 主链 6 + 扩展 1
    assert.equal(state.artifacts.length, 7, 'artifacts 须含扩展阶段产物');
    const audit = state.artifacts.find((a) => a.stageId === ('stage7_audit' as StageId));
    assert.ok(audit !== undefined, 'artifacts 须含 stage7_audit');
    assert.equal(audit.degraded, false);
    // 主链裁决不受扩展影响（扩展在主链收敛后运行）
    assert.equal(state.verdictNode?.verdict, 'CONFIRMED');
    const sessionEvents = replaySession(join(dir, 'session.jsonl')).events;
    const auditStarts = sessionEvents.filter((event) => event.kind === 'stage_started' && event.stageId === 'stage7_audit');
    const auditCompletions = sessionEvents.filter((event) => event.kind === 'stage_completed' && event.stageId === 'stage7_audit');
    assert.equal(auditStarts.length, 1, '扩展阶段只能有一个 start');
    assert.equal(auditCompletions.length, 1, '成功扩展阶段只能有一个 completion');
    assert.equal(auditStarts[0]!.payload?.iteration, auditCompletions[0]!.payload?.iteration);
    assert.equal(auditStarts[0]!.payload?.extension, true);
  } finally {
    resetStageRegistry();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('T-018 并行扩展：扩展失败显式抛错（fail-closed·LoopState.error=EXTENSION_STAGE_FAILED）', async () => {
  const db = openDb();
  try {
    resetStageRegistry();
    registerStage({
      stageId: 'stage7_audit' as StageId,
      order: 7,
      label: 'Parallel Audit',
      payloadKind: 'plan',
      consumesFeedbackSignal: false,
      verdictCritical: false,
      skippable: false,
      description: 'independent parallel audit',
      executor: async () => {
        throw new Error('audit backend unavailable');
      },
    });

    const state = await runAgentLoop({
      runId: 't018-extension-fail',
      researchInput: 'classify variable stars',
      gateway: createSequentialGateway(oneRoundFixtures()),
      profile: 'offline_replay',
      finishReasonExtractor: extractFinishReasonForOfflineReplay,
      reproHashProvider: () => 'a'.repeat(64),
      gitCommitSha: 't018-sha',
      appendOptions: { providerProfile: 'offline_replay' },
      evidenceLogDb: db,
      termination: { maxIterations: 1, maxTokensPerRun: 50000, maxDurationMs: 10 * 60 * 1000 },
      runParallelExtensionStages: true,
    });

    assert.equal(state.terminationReason, 'error');
    assert.equal(state.error?.code, 'EXTENSION_STAGE_FAILED', '扩展失败须有专属错误码（反剧场 F11）');
    assert.equal(state.error?.stageId, 'stage7_audit');
    assert.match(state.error?.message ?? '', /extension stage stage7_audit failed/);
  } finally {
    resetStageRegistry();
    db.close();
  }
});

test('T-018 零回归：不传 controller/runParallelExtensionStages → 无 held/resumed 事件·无扩展产物', async () => {
  const db = openDb();
  try {
    resetStageRegistry();
    registerStage({
      stageId: 'stage7_audit' as StageId,
      order: 7,
      label: 'Parallel Audit',
      payloadKind: 'plan',
      consumesFeedbackSignal: false,
      verdictCritical: false,
      skippable: false,
      description: 'independent parallel audit',
      executor: async () => makeAuditArtifact(),
    });

    const events: AgentLoopEvent[] = [];
    const state = await runAgentLoop({
      runId: 't018-default-off',
      researchInput: 'classify variable stars',
      gateway: createSequentialGateway(oneRoundFixtures()),
      profile: 'offline_replay',
      finishReasonExtractor: extractFinishReasonForOfflineReplay,
      reproHashProvider: () => 'a'.repeat(64),
      gitCommitSha: 't018-sha',
      appendOptions: { providerProfile: 'offline_replay' },
      evidenceLogDb: db,
      termination: { maxIterations: 1, maxTokensPerRun: 50000, maxDurationMs: 10 * 60 * 1000 },
      onEvent: (evt) => {
        events.push(evt);
      },
    });

    // 缺省关闭：扩展阶段不执行（executor 未被调用）·无 held/resumed 事件
    assert.equal(state.artifacts.length, 6, '缺省关闭不并入扩展产物');
    assert.equal(events.some((e) => e.type === 'stage_held'), false);
    assert.equal(events.some((e) => e.type === 'stage_resumed'), false);
  } finally {
    resetStageRegistry();
    db.close();
  }
});


// ---------- 4. deregisterStage 清理（注册表恢复）----------

test('T-018 注册表清理：deregisterStage 移除扩展阶段后列表复原', () => {
  resetStageRegistry();
  try {
    registerStage({
      stageId: 'stage7_audit' as StageId,
      order: 7,
      label: 'Parallel Audit',
      payloadKind: 'plan',
      consumesFeedbackSignal: false,
      verdictCritical: false,
      skippable: false,
      description: 'independent parallel audit',
    });
    const removed = deregisterStage('stage7_audit' as StageId);
    assert.equal(removed, true);
    assert.equal(deregisterStage('stage7_audit' as StageId), false, '重复 deregister 返回 false');
  } finally {
    resetStageRegistry();
  }
});
