/**
 * T-017 · V2 裁决驱动反馈边（T-016 V2 roadmap 项落地·2026-08-06）。
 *
 * 背景：F-4-004 深层诉求「裁决驱动反馈边」——原先反馈源是 stage6 LLM 自评
 * （continueIteration），不是 verdict kernel 的 REFUTED/INCONCLUSIVE。本测试验证
 * RunAgentLoopArgs.verdictDrivenFeedback=true 时：
 *
 *   1. verdict=CONFIRMED → 立即终止（terminationReason='verdict_confirmed'·确定性胜过 LLM 自评）；
 *   2. 连续两轮裁决输入指纹相同且非 CONFIRMED → 终止（'verdict_converged'·防 p-hacking 空转）；
 *   3. REFUTED → regen → CONFIRMED 成功路径（两轮迭代·中间裁决序列可审计）；
 *   4. 中间裁决 kind 软建议注入下一轮 stage3 prompt（verdictHint·只传 kind 不传细节）；
 *   5. 中间裁决无副作用（不落 evidence_log/verdict_nodes·链长不变·终局才落库）；
 *   6. 缺省关闭 → 行为字节等同基线（LLM 自评反馈边不变·零回归）。
 *
 * 裁决确定性锚点（实测 kernel 行为·禁 LLM 判断）：
 *   - supports 投票 → CONFIRMED（R7_PRIMARY_TEST_CONFIRMS）
 *   - refutes 投票 → REFUTED（R6_PRIMARY_TEST_REFUTES）
 *   - neutral/空 → UNTESTED（R2_NO_VALID_DATASET_BINDING）
 *
 * Authority: src/agent_loop/fsm_runner.ts（verdictDrivenFeedback 段）
 *            src/agent_loop/verdict_stage.ts（evaluateIntermediateVerdict）
 *            src/agent_loop/stages/stage3_hypothesis.ts（verdictHint 消费）。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。
 */

import { runMigrations } from '../../src/db/index.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runAgentLoop } from '../../src/agent_loop/fsm_runner.ts';
import { extractFinishReasonForOfflineReplay } from '../../src/agent_loop/run_stage.ts';
import type { LlmGateway } from '../../src/llm_gateway/gateway.ts';
import type {
  LlmRequest,
  LlmResponse,
} from '../../src/llm_gateway/types.ts';


// ---------- helpers（镜像 t016 模式）----------

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

/**
 * 捕获型网关：记录每次调用的 stageId + 完整 prompt 文本（验证 verdictHint 注入）。
 */
function createCapturingGateway(contents: readonly string[]): {
  gateway: LlmGateway;
  calls: readonly { readonly stageId: string | undefined; readonly userText: string }[];
} {
  let callIndex = 0;
  const calls: { stageId: string | undefined; userText: string }[] = [];
  const gateway: LlmGateway = {
    register: () => {},
    callLlm: async (_profile: string, request: LlmRequest): Promise<LlmResponse> => {
      const content = contents[callIndex];
      if (content === undefined) {
        throw new Error(
          `createCapturingGateway: callLlm invoked ${callIndex + 1} times but only ${contents.length} fixtures provided`,
        );
      }
      callIndex += 1;
      calls.push({
        stageId: request.stageId,
        userText: request.messages
          .map((m) => `${m.role}: ${m.content}`)
          .join('\n---\n'),
      });
      return fixtureResponse(content);
    },
    registeredProfiles: () => [],
  };
  return { gateway, calls };
}

function countRows(db: Database.Database, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
  return row.c;
}


// ---------- fixture payloads ----------

const understandingPayload = {
  kind: 'understanding',
  problemStatement: 'How to classify variable stars with limited labeled data',
  scope: 'Astronomy variable star classification',
  keyTerms: ['variable star', 'light curve', 'macro_f1'],
  falsifiableAngle: 'Testable via macro_f1 metric',
};

const integrationPayload = {
  kind: 'integration',
  citations: [
    { evidenceId: 'ev-001', source: 'arxiv', doi: null, title: 'Survey' },
  ],
  knowledgeGraphSummary: 'Taxonomy gaps in RR Lyrae.',
  gaps: ['Limited labeled data'],
};

// claim A（0.70）+ refutes → REFUTED（R6）
const hypothesisClaimA = {
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
};

// claim B（0.85·不同方向）+ supports → CONFIRMED（R7）
const hypothesisClaimB = {
  kind: 'hypothesis',
  claim: 'Model X achieves macro_f1 >= 0.85 with 5-fold cross-validation',
  falsificationMethod: {
    prediction: 'macro_f1 >= 0.85 with 5-fold CV',
    metric: 'macro_f1',
    comparator: 'gt',
    value: 0.85,
  },
  supportingCitations: ['ev-001'],
  scopeSlipText: 'scope limited to RR Lyrae with CV',
};

function evidencePayload(vote: 'supports' | 'refutes'): {
  readonly kind: 'evidence';
  readonly evidenceRecords: readonly {
    readonly evidenceId: string;
    readonly supportsOrRefutes: 'supports' | 'refutes';
    readonly entailmentScore: number;
    readonly source: { readonly evidenceId: string; readonly source: string; readonly doi: null; readonly title: string };
  }[];
  readonly conflictingEvidenceCount: number;
} {
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

// LLM 自评 continueIteration=true（用于验证裁决驱动覆盖 LLM 自评）
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


// ---------- 测试 ----------

test('T-017 裁决驱动：verdict=CONFIRMED 立即终止（确定性胜过 LLM 自评 continue=true）', async () => {
  const db = openDb();
  try {
    // 单轮 6 fixtures：evidence=supports → CONFIRMED；stage6 LLM 说 continueIteration=true
    const gateway = createSequentialGateway([
      JSON.stringify(understandingPayload),
      JSON.stringify(integrationPayload),
      JSON.stringify(hypothesisClaimA),
      JSON.stringify(evidencePayload('supports')),
      JSON.stringify(planPayload),
      JSON.stringify(feedbackContinue),
    ]);

    const state = await runAgentLoop({
      runId: 't017-confirmed',
      researchInput: 'classify variable stars',
      gateway,
      profile: 'offline_replay',
      finishReasonExtractor: extractFinishReasonForOfflineReplay,
      reproHashProvider: () => 'a'.repeat(64),
      gitCommitSha: 't017-sha',
      appendOptions: { providerProfile: 'offline_replay' },
      evidenceLogDb: db,
      termination: { maxIterations: 3, maxTokensPerRun: 50000, maxDurationMs: 10 * 60 * 1000 },
      verdictDrivenFeedback: true,
    });

    // 1. 单轮即终止（LLM 说 continue=true 但裁决 CONFIRMED → 确定性立即终止）
    assert.equal(state.iterationsCompleted, 1, 'CONFIRMED 须首轮终止');
    assert.equal(state.artifacts.length, 6, '须只跑 6 个 artifacts（1 轮）');
    assert.equal(state.terminationReason, 'verdict_confirmed');

    // 2. 中间裁决序列：1 条 CONFIRMED
    assert.equal(state.intermediateVerdicts.length, 1);
    assert.equal(state.intermediateVerdicts[0]?.iteration, 1);
    assert.equal(state.intermediateVerdicts[0]?.verdict, 'CONFIRMED');
    assert.equal(state.intermediateVerdicts[0]?.decisiveRuleId, 'R7_PRIMARY_TEST_CONFIRMS');

    // 3. 终局 VerdictNode 也是 CONFIRMED（同一计算路径·确定性一致）
    assert.equal(state.verdictNode?.verdict, 'CONFIRMED');

    // 4. 无副作用证明：中间裁决不落任何表——call_records 只含 6 条 stage 记录；
    //    evidence_log 只含 1 条终局 hypothesis_verdict_input；verdict_nodes 只有终局 1 条
    //    （中间裁决若落库会加行）
    assert.equal(countRows(db, 'call_records'), 6, '中间裁决不得落 call_records（链长不变）');
    assert.equal(countRows(db, 'evidence_log'), 1, '中间裁决不得落 evidence_log（终局才落）');
    assert.equal(countRows(db, 'verdict_nodes'), 1, '中间裁决不得落 verdict_nodes（终局才落库）');
  } finally {
    db.close();
  }
});

test('T-017 裁决驱动：连续两轮同裁决输入指纹 → verdict_converged（防 p-hacking 空转）', async () => {
  const db = openDb();
  try {
    // 2 轮 × 6：iter1 与 iter2 的 hypothesis（claim A）+ evidence（refutes）完全相同
    // → iter1 verdict=REFUTED（继续）→ iter2 verdict=REFUTED + 输入指纹相同 → 终止
    const fixtures: string[] = [];
    for (let i = 0; i < 2; i++) {
      fixtures.push(
        JSON.stringify(understandingPayload),
        JSON.stringify(integrationPayload),
        JSON.stringify(hypothesisClaimA),
        JSON.stringify(evidencePayload('refutes')),
        JSON.stringify(planPayload),
        JSON.stringify(feedbackContinue),
      );
    }
    const gateway = createSequentialGateway(fixtures);

    const state = await runAgentLoop({
      runId: 't017-converged',
      researchInput: 'classify variable stars',
      gateway,
      profile: 'offline_replay',
      finishReasonExtractor: extractFinishReasonForOfflineReplay,
      reproHashProvider: () => 'a'.repeat(64),
      gitCommitSha: 't017-sha',
      appendOptions: { providerProfile: 'offline_replay' },
      evidenceLogDb: db,
      termination: { maxIterations: 3, maxTokensPerRun: 50000, maxDurationMs: 10 * 60 * 1000 },
      verdictDrivenFeedback: true,
    });

    // 1. 两轮后因重复输入指纹终止（非 maxIterations·非 LLM 收敛）
    assert.equal(state.iterationsCompleted, 2, '须跑 2 轮（首轮 REFUTED 继续·次轮重复输入终止）');
    assert.equal(state.artifacts.length, 12);
    assert.equal(state.terminationReason, 'verdict_converged');

    // 2. 中间裁决序列：两轮都是 REFUTED（确定性·非 LLM 判断）
    assert.equal(state.intermediateVerdicts.length, 2);
    assert.equal(state.intermediateVerdicts[0]?.verdict, 'REFUTED');
    assert.equal(state.intermediateVerdicts[1]?.verdict, 'REFUTED');
    assert.equal(state.intermediateVerdicts[0]?.decisiveRuleId, 'R6_PRIMARY_TEST_REFUTES');

    // 3. 终局裁决诚实保留 REFUTED（不因空转而美化）
    assert.equal(state.verdictNode?.verdict, 'REFUTED');
  } finally {
    db.close();
  }
});

test('T-017 裁决驱动：regen 成功路径 REFUTED → CONFIRMED（两轮·中间裁决可审计）', async () => {
  const db = openDb();
  try {
    const gateway = createSequentialGateway([
      // iteration 1：claim A + refutes → REFUTED → 继续
      JSON.stringify(understandingPayload),
      JSON.stringify(integrationPayload),
      JSON.stringify(hypothesisClaimA),
      JSON.stringify(evidencePayload('refutes')),
      JSON.stringify(planPayload),
      JSON.stringify(feedbackContinue),
      // iteration 2：claim B（改方向）+ supports → CONFIRMED → 立即终止
      JSON.stringify(understandingPayload),
      JSON.stringify(integrationPayload),
      JSON.stringify(hypothesisClaimB),
      JSON.stringify(evidencePayload('supports')),
      JSON.stringify(planPayload),
      JSON.stringify(feedbackContinue),
    ]);

    const state = await runAgentLoop({
      runId: 't017-regen',
      researchInput: 'classify variable stars',
      gateway,
      profile: 'offline_replay',
      finishReasonExtractor: extractFinishReasonForOfflineReplay,
      reproHashProvider: () => 'a'.repeat(64),
      gitCommitSha: 't017-sha',
      appendOptions: { providerProfile: 'offline_replay' },
      evidenceLogDb: db,
      termination: { maxIterations: 3, maxTokensPerRun: 50000, maxDurationMs: 10 * 60 * 1000 },
      verdictDrivenFeedback: true,
    });

    assert.equal(state.iterationsCompleted, 2);
    assert.equal(state.terminationReason, 'verdict_confirmed');
    assert.equal(state.intermediateVerdicts.length, 2);
    assert.equal(state.intermediateVerdicts[0]?.verdict, 'REFUTED');
    assert.equal(state.intermediateVerdicts[1]?.verdict, 'CONFIRMED');
    assert.equal(state.verdictNode?.verdict, 'CONFIRMED');
  } finally {
    db.close();
  }
});

test('T-017 裁决驱动：上一轮中间裁决 kind 软建议注入下一轮 stage3 prompt（只传 kind）', async () => {
  const db = openDb();
  try {
    const fixtures: string[] = [];
    for (let i = 0; i < 2; i++) {
      fixtures.push(
        JSON.stringify(understandingPayload),
        JSON.stringify(integrationPayload),
        JSON.stringify(hypothesisClaimA),
        JSON.stringify(evidencePayload('refutes')),
        JSON.stringify(planPayload),
        JSON.stringify(feedbackContinue),
      );
    }
    const { gateway, calls } = createCapturingGateway(fixtures);

    const state = await runAgentLoop({
      runId: 't017-hint',
      researchInput: 'classify variable stars',
      gateway,
      profile: 'offline_replay',
      finishReasonExtractor: extractFinishReasonForOfflineReplay,
      reproHashProvider: () => 'a'.repeat(64),
      gitCommitSha: 't017-sha',
      appendOptions: { providerProfile: 'offline_replay' },
      evidenceLogDb: db,
      termination: { maxIterations: 3, maxTokensPerRun: 50000, maxDurationMs: 10 * 60 * 1000 },
      verdictDrivenFeedback: true,
    });
    assert.equal(state.terminationReason, 'verdict_converged');

    // calls 布局：iter1 stage1-6（idx 0-5）→ iter2 stage1-6（idx 6-11）
    // iter2 stage3 = idx 8
    const iter2Stage3 = calls[8];
    assert.ok(iter2Stage3 !== undefined, 'iter2 stage3 调用必须存在');
    assert.equal(iter2Stage3.stageId, 'stage3_hypothesis');
    // 注入只含 5 值枚举 kind + 抽象方向提示（无 reasonCode/metricValue/threshold 细节）
    assert.match(
      iter2Stage3.userText,
      /Previous iteration verdict \(deterministic kernel\): REFUTED/,
      'iter2 stage3 prompt 须含上一轮裁决 kind=REFUTED',
    );
    assert.match(iter2Stage3.userText, /For reference only/, '须标注软建议语义（LLM 仍独立判断）');
    assert.doesNotMatch(
      iter2Stage3.userText,
      /R6_PRIMARY_TEST_REFUTES|metricValue|falsificationThreshold/,
      '禁注入裁决细节（防 LLM 反推构造"刚好过"假设·security-auditor C2 缓解）',
    );
    // 首轮 stage3 不注入（无先验裁决·字节等同基线）
    const iter1Stage3 = calls[2];
    assert.ok(iter1Stage3 !== undefined);
    assert.doesNotMatch(
      iter1Stage3.userText,
      /Previous iteration verdict/,
      '首轮 stage3 不得注入裁决提示（无先验裁决）',
    );
  } finally {
    db.close();
  }
});

test('T-017 零回归：缺省关闭 verdictDrivenFeedback → LLM 自评反馈边不变 + intermediateVerdicts=[]', async () => {
  const db = openDb();
  try {
    // maxIterations=1 + LLM continue=true → 单轮终止（stage6 覆写）·行为与 t016 一致
    const gateway = createSequentialGateway([
      JSON.stringify(understandingPayload),
      JSON.stringify(integrationPayload),
      JSON.stringify(hypothesisClaimA),
      JSON.stringify(evidencePayload('supports')),
      JSON.stringify(planPayload),
      JSON.stringify(feedbackContinue),
    ]);

    const state = await runAgentLoop({
      runId: 't017-default-off',
      researchInput: 'test',
      gateway,
      profile: 'offline_replay',
      finishReasonExtractor: extractFinishReasonForOfflineReplay,
      reproHashProvider: () => 'a'.repeat(64),
      gitCommitSha: 't017-sha',
      appendOptions: { providerProfile: 'offline_replay' },
      evidenceLogDb: db,
      termination: { maxIterations: 1, maxTokensPerRun: 50000, maxDurationMs: 10 * 60 * 1000 },
      // verdictDrivenFeedback 不传（缺省关闭·零回归）
    });

    assert.equal(state.iterationsCompleted, 1);
    assert.equal(state.terminationReason, 'feedback_converged', '缺省关闭须保持 LLM 自评收敛语义');
    assert.deepEqual(state.intermediateVerdicts, [], '缺省关闭 intermediateVerdicts 恒为空');
  } finally {
    db.close();
  }
});

