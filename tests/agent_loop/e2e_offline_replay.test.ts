/**
 * 端到端 runAgentLoop smoke 测试（offline_replay adapter）。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/06_agent_loop.md §8（runAgentLoop）+ Task 10.7。
 *
 * 测试覆盖（端到端·六阶段全链路）：
 *   - 用 better-sqlite3 :memory: + runMigrations（完整迁移链 0001..0007）建表
 *   - 用 fake LlmGateway（callLlm 按调用顺序返回每个 stage 的固定 fixture）
 *   - 调 runAgentLoop（offline_replay profile + DEFAULT_TERMINATION）
 *   - 断言 LoopState.terminated === true + terminationReason === 'feedback_converged'
 *   - 断言 artifacts.length === 6 + stageId 顺序 stage1→stage2→stage3→stage4→stage5→stage6
 *   - 调 verifyChainHead(db) 返回 ok=true（artifacts 全部落 evidence_log·链式 hash 完整）
 *   - 调 assemblePaper(state) 返回 ResearchPaperOutput 10 字段全部存在
 *
 * fake gateway 说明：用结构化类型直接构造 LlmGateway 接口实现（禁双重断言·
 * 零容忍 #1）。callLlm 按调用顺序（stage1→stage6）返回对应 fixture LlmResponse。
 * reproHashProvider 返回占位 hash（测试用·生产路径禁伪造 hash·须接 03 calc_bridge）。
 */

import { runMigrations } from '../../src/db/index.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runAgentLoop, DEFAULT_TERMINATION } from '../../src/agent_loop/fsm_runner.ts';
import { assemblePaper } from '../../src/agent_loop/paper_assembler.ts';
import { extractFinishReasonForOfflineReplay } from '../../src/agent_loop/run_stage.ts';
import { verifyChainHead } from '../../src/evidence_log/verifier.ts';
import type { LlmGateway } from '../../src/llm_gateway/gateway.ts';
import type {
  LlmResponse,
  ProviderProfile,
} from '../../src/llm_gateway/types.ts';


// ---------- 共享 helpers ----------

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

/**
 * 创建按调用顺序返回不同 fixture 的 fake gateway。
 *
 * runAgentLoop 顺序调用 stage1→stage2→stage3→stage4→stage5→stage6，
 * 每次 callLlm 按计数器索引返回对应阶段的 fixture LlmResponse。
 */
function createSequentialGateway(contents: readonly string[]): LlmGateway {
  let callIndex = 0;
  return {
    register: () => {},
    callLlm: async (_profile: ProviderProfile): Promise<LlmResponse> => {
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


// ---------- 六阶段 fixture payloads ----------

const understandingPayload = {
  kind: 'understanding',
  problemStatement: 'How to classify variable stars with limited labeled data',
  scope: 'Astronomy variable star classification via light curve features',
  keyTerms: ['variable star', 'light curve', 'macro_f1'],
  falsifiableAngle: 'Testable via macro_f1 metric on held-out labeled set',
};

const integrationPayload = {
  kind: 'integration',
  citations: [
    { evidenceId: 'ev-001', source: 'arxiv', doi: '10.1234/astro.2026.001', title: 'Survey of variable star taxonomy' },
    { evidenceId: 'ev-002', source: 'ads', doi: null, title: 'Light curve feature extraction atlas' },
  ],
  knowledgeGraphSummary: 'The problem maps onto existing taxonomy gaps in RR Lyrae sub-classification.',
  gaps: ['Limited labeled data for rare sub-classes', 'Feature extraction robustness under noise'],
};

const hypothesisPayload = {
  kind: 'hypothesis',
  claim: 'Model X achieves macro_f1 >= 0.85 on the RR Lyrae test set',
  falsificationMethod: {
    prediction: 'macro_f1 >= 0.85 on held-out test set',
    metric: 'macro_f1',
    comparator: 'gt',
    value: 0.85,
  },
  supportingCitations: ['ev-001'],
  scopeSlipText: 'scope limited to RR Lyrae subset',
};

const evidencePayload = {
  kind: 'evidence',
  evidenceRecords: [
    {
      evidenceId: 'ev-001',
      supportsOrRefutes: 'supports',
      entailmentScore: 0.92,
      source: { evidenceId: 'ev-001', source: 'arxiv', doi: '10.1234/x', title: 'Survey of variable star taxonomy' },
    },
    {
      evidenceId: 'ev-002',
      supportsOrRefutes: 'refutes',
      entailmentScore: 0.71,
      source: { evidenceId: 'ev-002', source: 'ads', doi: null, title: 'Counter-evidence atlas' },
    },
  ],
  conflictingEvidenceCount: 1,
};

const planPayload = {
  kind: 'plan',
  datasetChoices: ['ASAS-SN catalog', 'Gaia DR3'],
  methodChoices: ['Random Forest classifier', 'LightGBM'],
  scheduleOrFeedback: 'Train on 80% split, validate on 20% held-out',
  executableChecks: [
    { ref: 'https://asas-sn.osu.edu', exists: true, checkedAt: '2026-06-27T00:00:00.000Z' },
    { ref: 'https://gaia.esac.esa.int', exists: true, checkedAt: '2026-06-27T00:00:00.000Z' },
  ],
};

const feedbackPayloadConverge = {
  kind: 'feedback',
  feedbackSignal: {
    continueIteration: false,
    iterationNumber: 1,
    maxIterations: 3,
    refinements: [],
  },
  iterationSummary: 'Converged: hypothesis is sufficiently refined',
};


// ---------- 端到端 runAgentLoop smoke 测试 ----------

test('e2e_offline_replay：runAgentLoop 六阶段全链路 → terminated + feedback_converged + 6 artifacts + 链式 hash 完整 + paper 10 字段', async () => {
  const db = openDb();
  try {
    const fixtureContents: readonly string[] = [
      JSON.stringify(understandingPayload),
      JSON.stringify(integrationPayload),
      JSON.stringify(hypothesisPayload),
      JSON.stringify(evidencePayload),
      JSON.stringify(planPayload),
      JSON.stringify(feedbackPayloadConverge),
    ];
    const gateway = createSequentialGateway(fixtureContents);

    const state = await runAgentLoop({
      runId: 'e2e-run-001',
      researchInput: 'How to classify variable stars with limited labeled data',
      gateway,
      profile: 'offline_replay',
      finishReasonExtractor: extractFinishReasonForOfflineReplay,
      reproHashProvider: () => 'a'.repeat(64),
      gitCommitSha: 'e2e-test-sha',
      appendOptions: { providerProfile: 'offline_replay' },
      evidenceLogDb: db,
      termination: DEFAULT_TERMINATION,
    });

    // 1. terminated === true
    assert.equal(state.terminated, true, 'LoopState.terminated should be true');

    // 2. terminationReason === 'feedback_converged'（stage6 feedbackSignal.continueIteration=false）
    assert.equal(
      state.terminationReason,
      'feedback_converged',
      'terminationReason should be feedback_converged (stage6 continueIteration=false)',
    );

    // 3. artifacts.length === 6（六阶段全部产出）
    assert.equal(state.artifacts.length, 6, 'artifacts should contain exactly 6 stage outputs');

    // 4. stageId 顺序：stage1→stage2→stage3→stage4→stage5→stage6
    const expectedOrder = [
      'stage1_understanding',
      'stage2_integration',
      'stage3_hypothesis',
      'stage4_evidence',
      'stage5_plan',
      'stage6_feedback',
    ] as const;
    const actualOrder = state.artifacts.map((a) => a.stageId);
    assert.deepEqual(
      actualOrder,
      [...expectedOrder],
      'artifacts stageId order should be stage1→stage2→stage3→stage4→stage5→stage6',
    );

    // 5. verifyChainHead(db) 返回 ok=true（artifacts 全部落 evidence_log·链式 hash 完整）
    const verifyResult = verifyChainHead(db);
    assert.equal(verifyResult.ok, true, 'verifyChainHead should return ok=true (chain integrity)');
    assert.equal(
      verifyResult.verifiedCount,
      6,
      'verifyChainHead should verify all 6 call_records',
    );
    assert.equal(verifyResult.brokenAtSeq, null, 'verifyChainHead brokenAtSeq should be null');

    // 6. assemblePaper(state) 返回 ResearchPaperOutput 10 字段全部存在
    const paper = assemblePaper(state);

    // 10 字段全部存在（类型 + 非空语义检查）
    assert.equal(typeof paper.paperTitle, 'string', 'paperTitle should be string');
    assert.ok(paper.paperTitle.length > 0, 'paperTitle should be non-empty');

    assert.equal(typeof paper.paperAbstract, 'string', 'paperAbstract should be string');
    assert.ok(paper.paperAbstract.length > 0, 'paperAbstract should be non-empty');

    assert.equal(typeof paper.problemStatement, 'string', 'problemStatement should be string');
    assert.ok(paper.problemStatement.length > 0, 'problemStatement should be non-empty');

    assert.equal(typeof paper.rationale, 'string', 'rationale should be string');
    assert.ok(paper.rationale.length > 0, 'rationale should be non-empty');

    assert.equal(typeof paper.technicalDetails, 'string', 'technicalDetails should be string');
    assert.ok(paper.technicalDetails.length > 0, 'technicalDetails should be non-empty');

    assert.ok(Array.isArray(paper.datasets.source), 'datasets.source should be array');
    assert.ok(paper.datasets.source.length > 0, 'datasets.source should be non-empty');
    assert.ok(Array.isArray(paper.datasets.target), 'datasets.target should be array');
    assert.ok(paper.datasets.target.length > 0, 'datasets.target should be non-empty');

    assert.ok(Array.isArray(paper.methods), 'methods should be array');
    assert.ok(paper.methods.length > 0, 'methods should be non-empty');

    assert.ok(Array.isArray(paper.experiments.baselines), 'experiments.baselines should be array');
    assert.ok(Array.isArray(paper.experiments.metrics), 'experiments.metrics should be array');
    assert.equal(typeof paper.experiments.expectedOutcome, 'string', 'experiments.expectedOutcome should be string');

    assert.equal(typeof paper.results, 'string', 'results should be string');
    assert.ok(paper.results.length > 0, 'results should be non-empty');

    assert.ok(Array.isArray(paper.references), 'references should be array');
    assert.ok(paper.references.length > 0, 'references should be non-empty');

    assert.equal(typeof paper.iterationCount, 'number', 'iterationCount should be number');
    assert.equal(paper.iterationCount, 1, 'iterationCount should equal feedback iterationNumber');

    // 裁决接通（第 7 阶段）：fixture evidence = ev-001 supports + ev-002 refutes（混合证据）→ INCONCLUSIVE。
    // 旧值 'UNTESTED' 是 verdictNode=null stub 的兜底（paper_assembler.deriveFinalVerdict 在 verdictNode
    // 为 null 时回落 UNTESTED）。接通后 LoopState.verdictNode 为真实 VerdictNode，finalVerdict 反映
    // 真实 falsifiability 裁决（混合 supports+refutes → INCONCLUSIVE·conflictingEvidenceCount=1）。
    assert.ok(state.verdictNode !== null, 'converged loop must produce a non-null verdict (第 7 阶段接通)');
    assert.equal(
      state.verdictNode.conflictingEvidenceCount,
      1,
      'mixed evidence (1 supports + 1 refutes) must report conflictingEvidenceCount=1',
    );
    assert.equal(
      paper.finalVerdict,
      'INCONCLUSIVE',
      'finalVerdict must reflect the real verdict (INCONCLUSIVE) for mixed evidence',
    );
  } finally {
    db.close();
  }
});
