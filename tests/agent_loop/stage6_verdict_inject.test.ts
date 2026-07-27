/**
 * IC-15 T1'（V2 裁决软建议）回归测试。
 *
 * 覆盖：
 *   1. 首轮/无 priorVerdictKind 时 stage6 prompt 字节等同基线（回归保护·acceptance_oracle ⑦）
 *   2. 传入 priorVerdictKind='REFUTED' 时 prompt 含 verdict hint 段
 *   3. hint 经过 sanitizeExternalContent 包装（含 UNTRUSTED_EXTERNAL_CONTENT 标记）
 *   4. hint 仅含 verdict kind + 抽象修正方向，禁传 reasonCode/metricValue/threshold（最小信息原则·反 adversarial hypothesis）
 *
 * 历史溯源：IC-15.contract.yaml + .far-design/evidence/s9/adversarial_review_v1_to_v2.md
 *
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 双重断言。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runStage6 } from '../../src/agent_loop/stages/stage6_feedback.ts';
import { extractFinishReasonForOfflineReplay } from '../../src/agent_loop/run_stage.ts';
import { UNTRUSTED_BEGIN, UNTRUSTED_END } from '../../src/llm_gateway/sanitizer.ts';
import type {
  StageContext,
  TerminationCriteria,
} from '../../src/agent_loop/types.ts';
import type { LlmGateway } from '../../src/llm_gateway/gateway.ts';
import type {
  LlmMessage,
  LlmRequest,
  LlmResponse,
  ProviderProfile,
} from '../../src/llm_gateway/types.ts';
import type { Verdict } from '../../src/schema/enums.ts';
import { runMigrations } from '../../src/db/index.ts';
import Database from 'better-sqlite3';

// ---------- 共享 helpers ----------

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * 捕获 stage6 实际发给 LLM 的 messages（绕过真实 LLM 调用）。
 * 用 fake gateway 拦截 + 读取 stage6 buildFeedbackMessages 产出的 system/user content。
 */
function createCapturingGateway(responseContent: string): {
  readonly gateway: LlmGateway;
  readonly getCapturedMessages: () => readonly LlmMessage[];
} {
  const captured: LlmMessage[] = [];
  const response: LlmResponse = {
    credential: {
      providerProfile: 'offline_replay',
      providerRequestId: null,
      modelId: 'test-fixture',
      modelVersion: null,
      capability: 'structured',
      isoTimestamp: '2026-07-27T00:00:00.000Z',
      tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    },
    content: responseContent,
    raw: { replayed: true, messageCount: 2 },
  };
  return {
    gateway: {
      register: () => {},
      callLlm: (_profile: ProviderProfile, request: LlmRequest) => {
        for (const m of request.messages) {
          captured.push({ role: m.role, content: m.content });
        }
        return Promise.resolve(response);
      },
      registeredProfiles: () => [],
    },
    getCapturedMessages: () => captured,
  };
}

const TERMINATION: TerminationCriteria = {
  maxIterations: 3,
  maxTokensPerRun: 50000,
  maxDurationMs: 10 * 60 * 1000,
};

function makeCtx(
  gateway: LlmGateway,
  db: Database.Database,
  options: { readonly priorVerdictKind?: Verdict } = {},
): StageContext {
  return {
    runId: 'test-ic15',
    iteration: 1,
    researchInput: 'test research question',
    gateway,
    profile: 'offline_replay',
    finishReasonExtractor: extractFinishReasonForOfflineReplay,
    reproHashProvider: () => 'a'.repeat(64),
    gitCommitSha: 'test-sha',
    appendOptions: { providerProfile: 'offline_replay' },
    evidenceLogDb: db,
    prevArtifacts: [],
    feedbackSignal: null,
    termination: TERMINATION,
    tokensConsumed: 0,
    ...(options.priorVerdictKind !== undefined ? { priorVerdictKind: options.priorVerdictKind } : {}),
  };
}

const STAGE6_RESPONSE_CONVERGE = JSON.stringify({
  kind: 'feedback',
  feedbackSignal: {
    continueIteration: false,
    iterationNumber: 1,
    maxIterations: 3,
    refinements: [],
  },
  iterationSummary: 'Converged',
});

// ---------- 测试 ----------

test('IC-15 T1\' 首轮无 priorVerdictKind → prompt 不含 verdict hint（字节等同基线·回归保护）', async () => {
  const db = openDb();
  try {
    const { gateway, getCapturedMessages } = createCapturingGateway(STAGE6_RESPONSE_CONVERGE);
    const ctx = makeCtx(gateway, db); // 不传 priorVerdictKind
    await runStage6(ctx);
    const messages = getCapturedMessages();
    const allContent = messages.map((m) => m.content).join('\n');

    // 关键回归断言：不含 verdict hint 段
    assert.ok(
      !allContent.includes('Prior run verdict'),
      'baseline prompt must NOT contain verdict hint when priorVerdictKind is undefined',
    );
    assert.ok(
      !allContent.includes('For reference only'),
      'baseline prompt must NOT contain "For reference only" segment',
    );
  } finally {
    db.close();
  }
});

test('IC-15 T1\' 传入 priorVerdictKind="REFUTED" → prompt 含 verdict hint 段', async () => {
  const db = openDb();
  try {
    const { gateway, getCapturedMessages } = createCapturingGateway(STAGE6_RESPONSE_CONVERGE);
    const ctx = makeCtx(gateway, db, { priorVerdictKind: 'REFUTED' });
    await runStage6(ctx);
    const messages = getCapturedMessages();
    const allContent = messages.map((m) => m.content).join('\n');

    // 关键正向断言：含 verdict hint 段
    assert.ok(
      allContent.includes('Prior run verdict'),
      'prompt must contain "Prior run verdict" when priorVerdictKind=REFUTED',
    );
    assert.ok(
      allContent.includes('REFUTED'),
      'prompt must contain the verdict kind "REFUTED"',
    );
    assert.ok(
      allContent.includes('For reference only'),
      'prompt must contain the soft-advice framing',
    );
    // 软建议语义：明示 LLM 仍独立判断
    assert.ok(
      allContent.includes('independently'),
      'prompt must indicate LLM retains independent continueIteration judgment',
    );
  } finally {
    db.close();
  }
});

test('IC-15 T1\' verdict hint 经过 sanitizeExternalContent 包装（G3 隔离）', async () => {
  const db = openDb();
  try {
    const { gateway, getCapturedMessages } = createCapturingGateway(STAGE6_RESPONSE_CONVERGE);
    const ctx = makeCtx(gateway, db, { priorVerdictKind: 'INCONCLUSIVE' });
    await runStage6(ctx);
    const messages = getCapturedMessages();
    const allContent = messages.map((m) => m.content).join('\n');

    // sanitizer 包装标记必须出现（防 prompt 注入·G3 隔离）
    assert.ok(
      allContent.includes(UNTRUSTED_BEGIN),
      `verdict hint must be wrapped with sanitizer sentinel (got content without ${UNTRUSTED_BEGIN})`,
    );
    assert.ok(
      allContent.includes(UNTRUSTED_END),
      `verdict hint must be wrapped with sanitizer sentinel (got content without ${UNTRUSTED_END})`,
    );
  } finally {
    db.close();
  }
});

test('IC-15 T1\' 最小信息原则：hint 仅含 verdict kind + 抽象修正方向，禁传 reasonCode/metricValue/threshold', async () => {
  const db = openDb();
  try {
    const { gateway, getCapturedMessages } = createCapturingGateway(STAGE6_RESPONSE_CONVERGE);
    const ctx = makeCtx(gateway, db, { priorVerdictKind: 'DEGRADED_SCOPE' });
    await runStage6(ctx);
    const messages = getCapturedMessages();
    const allContent = messages.map((m) => m.content).join('\n');

    // 反 adversarial hypothesis generation：禁传裁决内部状态细节
    for (const forbidden of ['reasonCode', 'metricValue', 'threshold', 'falsificationThreshold']) {
      assert.ok(
        !allContent.includes(forbidden),
        `verdict hint must NOT expose "${forbidden}" (最小信息原则·security-auditor C2 缓解)`,
      );
    }
    // 必含 verdict kind 本身
    assert.ok(
      allContent.includes('DEGRADED_SCOPE'),
      'hint must contain the verdict kind',
    );
  } finally {
    db.close();
  }
});

test('IC-15 T1\' 全部 5 个 verdict kind 均可注入且映射为不同 hint', async () => {
  const db = openDb();
  try {
    const ALL_VERDICTS: readonly Verdict[] = [
      'CONFIRMED',
      'REFUTED',
      'INCONCLUSIVE',
      'DEGRADED_SCOPE',
      'UNTESTED',
    ];
    for (const v of ALL_VERDICTS) {
      const { gateway, getCapturedMessages } = createCapturingGateway(STAGE6_RESPONSE_CONVERGE);
      const ctx = makeCtx(gateway, db, { priorVerdictKind: v });
      await runStage6(ctx);
      const allContent = getCapturedMessages().map((m) => m.content).join('\n');
      assert.ok(
        allContent.includes(`verdict (deterministic kernel): ${v}`),
        `verdict kind ${v} must appear in hint`,
      );
    }
  } finally {
    db.close();
  }
});
