/**
 * loop_runner reproHashProvider 注入策略测试（[C] 红线修复）。
 *
 * 历史溯源（已归档）: FAR_CHAIN_DEV_SPEC/03_确定性规范_DETERMINISM.md §10 (repro 七分量) /
 *            17 Epic / agent_loop/types.ts ReproHashProvider 注释第 3 条。
 *
 * 验证 executeLoop 的 fail-fast guard（红线：禁伪造 hash 进生产 evidence_log）：
 *   1. 生产 profile（competition_aliyun_qwen）未注入 reproHashProvider
 *      → 抛 REPRO_BRIDGE_NOT_CONFIGURED（生产路径须接 03 calc_bridge compute_repro_hash）。
 *   2. 显式注入 reproHashProvider → 注入输出真实落 call_records.repro_hash（注入接缝工作）。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。错误码用 type guard 收窄。
 */

import { runMigrations } from '../../src/db/index.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { executeLoop } from '../../src/api/internal/loop_runner.ts';
import type { LoopRunnerArgs } from '../../src/api/internal/loop_runner.ts';
import { STAGE_ORDER } from '../../src/agent_loop/types.ts';
import type { ReproHashProvider } from '../../src/agent_loop/types.ts';
import { DEMO_RESEARCH_INPUT } from '../../src/agent_loop/demo_fixtures.ts';
import { verifyChainHead } from '../../src/evidence_log/verifier.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import type { LlmGateway } from '../../src/llm_gateway/gateway.ts';
import type { LlmRequest, LlmResponse } from '../../src/llm_gateway/types.ts';
import { computeLlmEnvironmentAnchor } from '../../src/llm_gateway/repro_anchor.ts';

/**
 * stageId → 期望的 StructuredPayload.kind（discriminatedUnion 标签）。
 * 用于断言默认 hero demo 的 6 个 fixture 各自解析为正确的判别联合分支。
 */
const KIND_BY_STAGE: Readonly<Record<string, string>> = {
  stage1_understanding: 'understanding',
  stage2_integration: 'integration',
  stage3_hypothesis: 'hypothesis',
  stage4_evidence: 'evidence',
  stage5_plan: 'plan',
  stage6_feedback: 'feedback',
};

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * type guard：从 unknown 错误对象安全提取 code 字段（禁 as any）。
 */
function errorCodeOf(value: unknown): unknown {
  if (typeof value === 'object' && value !== null && 'code' in value) {
    return (value as { code: unknown }).code;
  }
  return undefined;
}

const INJECTED_REPRO_HASH = 'f'.repeat(64);

/**
 * 显式注入的 reproHashProvider（返回固定 64-hex·模拟 calc_bridge 输出）。
 * 签名忽略 input（与 ReproHashProvider 协变兼容·无未用参数）。
 */
const injectedProvider: ReproHashProvider = () => INJECTED_REPRO_HASH;

test('executeLoop throws REPRO_BRIDGE_NOT_CONFIGURED when production profile lacks reproHashProvider', async () => {
  const db = openDb();
  const args: LoopRunnerArgs = {
    researchInput: 'test research question',
    profile: 'competition_aliyun_qwen',
    evidenceLogDb: db,
    gitCommitSha: 'a'.repeat(40),
    // 故意不注入 reproHashProvider——生产路径必须 fail-fast
  };
  try {
    await assert.rejects(
      () => executeLoop(args),
      (err: unknown) => errorCodeOf(err) === 'REPRO_BRIDGE_NOT_CONFIGURED',
      'production profile without reproHashProvider must fail-fast (forbid forged hash into evidence_log)',
    );
  } finally {
    db.close();
  }
});

test('executeLoop respects explicit reproHashProvider — injected hash lands in call_records.repro_hash', async () => {
  const db = openDb();
  const args: LoopRunnerArgs = {
    researchInput: 'test research question',
    mode: 'quick',
    profile: 'offline_replay',
    reproHashProvider: injectedProvider,
    evidenceLogDb: db,
    gitCommitSha: 'a'.repeat(40),
  };
  try {
    const result = await executeLoop(args);
    // quick mode offline 应成功（fixture 匹配·hypothesize.test.ts 已证）
    assert.ok(result.loopState.terminated, 'quick mode loop must terminate');

    // 注入的 provider 输出应真实落入 call_records.repro_hash（注入接缝端到端验证）
    const row = db
      .prepare('SELECT repro_hash FROM call_records ORDER BY seq ASC LIMIT 1')
      .get() as { repro_hash?: string } | undefined;
    assert.ok(row !== undefined, 'at least one call_record must exist after loop');
    assert.equal(
      row?.repro_hash,
      INJECTED_REPRO_HASH,
      'injected reproHashProvider output must land in call_records.repro_hash (not the offline placeholder)',
    );
  } finally {
    db.close();
  }
});

/**
 * [Task #4 解锁证明] 默认离线路径端到端跑通内置 hero demo。
 *
 * 历史溯源（已归档）: FAR_CHAIN_DEV_SPEC/06_agent_loop.md §8（runAgentLoop）+
 *            28_FINAL_COMPETITION_ABSTRACT.md §1（Hot Jupiter hero demo）。
 *
 * 证明「无 API key、无 gateway 注入、无任何配置」的默认 executeLoop 调用：
 *   - createOfflineReplayAdapter() 无参 → 内置 DEFAULT_DEMO_FIXTURES registry 兜底
 *   - runStage 注入 request.stageId → registry 按 stageId 命中对应阶段 fixture
 *   - 全部 6 阶段 fixture 通过 zod schema.parse（真实结构化科研产物·非 echo）
 *   - stage3 hypothesis 带 falsificationMethod → 过 falsifiability_gate 硬阻断
 *   - stage6 feedback continueIteration=false → terminationReason='feedback_converged'
 *
 * 对照（git diff client.ts 可证）：旧 renderDefaultResponse 回显 user 消息，
 *   stage1 JSON.parse(echoText) → STAGE_SCHEMA_INVALID → reason='error'·artifacts<6。
 *   本测试断言更强的收敛语义（terminated AND converged AND 6 artifacts AND error===null），
 *   以防「默认路径断裂」回归（旧 loop_runner.test 仅断言 terminated，未抓到此回归）。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。错误对象用 type guard 收窄。
 */
test('executeLoop default offline path runs built-in hero demo to feedback_converged (no API key, no gateway injection)', async () => {
  const db = openDb();
  // 纯默认入参：无 gateway / 无 profile / 无 reproHashProvider / 无 mode（→ 'full'）
  // executeLoop 内部默认 createLlmGateway([createOfflineReplayAdapter()]) → 内置 hero demo registry
  const args: LoopRunnerArgs = {
    researchInput: DEMO_RESEARCH_INPUT,
    evidenceLogDb: db,
    gitCommitSha: 'a'.repeat(40),
  };
  try {
    const result = await executeLoop(args);
    const { loopState } = result;

    // 1. 收敛终止（非错误终止·非 max_iterations·非算力耗尽）
    assert.ok(loopState.terminated, 'default loop must terminate');
    assert.equal(
      loopState.terminationReason,
      'feedback_converged',
      `default offline hero demo must converge, got terminationReason="${loopState.terminationReason}"` +
        ` (error=${loopState.error === null ? 'null' : loopState.error.code})`,
    );
    assert.equal(loopState.error, null, 'converged loop must carry no error');

    // 2. 六阶段全部产出（顺序对齐 STAGE_ORDER）
    assert.equal(
      loopState.artifacts.length,
      STAGE_ORDER.length,
      'full hero demo must produce all 6 stage artifacts',
    );
    assert.deepEqual(
      loopState.artifacts.map((a) => a.stageId),
      [...STAGE_ORDER],
      'artifact stageIds must follow STAGE_ORDER',
    );

    // 3. 每个 fixture 解析为正确的判别联合分支 + 无降级（证明 fixture 是 schema-valid 真实结构化产物）
    for (const artifact of loopState.artifacts) {
      const expectedKind = KIND_BY_STAGE[artifact.stageId];
      assert.ok(expectedKind !== undefined, `no expected kind for stageId=${artifact.stageId}`);
      assert.equal(
        artifact.structured.kind,
        expectedKind,
        `stage ${artifact.stageId} fixture must parse to kind="${expectedKind}"`,
      );
      assert.equal(artifact.degraded, false, `stage ${artifact.stageId} must not degrade`);
      assert.equal(
        artifact.degradationReason,
        null,
        `stage ${artifact.stageId} must carry no degradation reason`,
      );
    }

    // 4. reproHash（证据链头 current_hash）为 64-hex
    assert.match(
      result.reproHash,
      /^[0-9a-f]{64}$/,
      'reproHash (chain head current_hash) must be 64-hex',
    );

    // 5. 证据链完整性：6 条 call_records 链式 hash 逐条重算一致（信任根未被伪造）
    //    （verifiedCount===6 同时证明 verdict 第 7 阶段未新建 call_record·裁决是衍生计算）
    const verification = verifyChainHead(db);
    assert.equal(verification.ok, true, 'evidence chain must verify (no broken link)');
    assert.equal(
      verification.verifiedCount,
      STAGE_ORDER.length,
      'all 6 call_records must be chain-verified (verdict stage must not extend the chain)',
    );

    // 6. 裁决接通（第 7 阶段）：收敛后产真实 VerdictNode（落 verdict_nodes·非 null stub）。
    //    hero demo stage4 = 2 supports + 1 neutral → 过滤 neutral 后全 supports → CONFIRMED。
    const verdictNode = loopState.verdictNode;
    assert.ok(verdictNode !== null, 'converged loop must produce a real non-null verdict (verdict stage wired)');
    assert.equal(verdictNode.verdict, 'CONFIRMED', 'hero demo (2 supports) must verdict CONFIRMED');
    assert.equal(verdictNode.nodeKind, 'root');

    // 持久化：verdict_nodes 落一行·CONFIRMED 的 evidenceId 在 evidence_log 有非空 payload（Red Line #7）
    const verdictCount = db
      .prepare('SELECT COUNT(*) AS n FROM verdict_nodes')
      .get() as { n: number };
    assert.equal(verdictCount.n, 1, 'exactly one verdict_node must be persisted');
    const evRow = db
      .prepare('SELECT evidence_payload FROM evidence_log WHERE evidence_id = ?')
      .get(verdictNode.evidenceId) as { evidence_payload?: string } | undefined;
    assert.ok(evRow !== undefined, 'CONFIRMED verdict must anchor to an evidence_log row');
    assert.ok((evRow.evidence_payload ?? '').length > 0, 'CONFIRMED evidence_payload must be non-empty');
  } finally {
    db.close();
  }
});

/**
 * G3 闭合（2026-08-06）：production profile + modelSnapshot → LLM 调用环境锚 provider。
 *
 * 背景：此前 production profile 无 reproHashProvider → REPRO_BRIDGE_NOT_CONFIGURED（CLI 真实
 * 路径死锁）。闭合后：显式注入 modelSnapshot → resolveReproHashProvider 用环境锚
 * （computeLlmEnvironmentAnchor·模型快照+活跃模型+node 版本+git sha·真实环境指纹·非占位）。
 *
 * 测试用 mock gateway（真实 offline_replay adapter 的 fixture 内容·registeredProfiles 声明
 * competition_aliyun_qwen）→ 无网络无计费；断言环境锚真实落 call_records.repro_hash。
 */
test('G3 闭合：production profile + modelSnapshot → 环境锚落库（非 REPRO_BRIDGE_NOT_CONFIGURED·非占位）', async () => {
  const db = openDb();
  // 真实 offline_replay adapter 提供 fixture 内容（按 stageId 路由·hero demo registry）；
  // registeredProfiles 声明 competition_aliyun_qwen → 环境锚 activeModelIds 含生产 profile 名。
  // credential.providerProfile 改写为 competition（真实 competition adapter 语义·反 theater
  // 校验：appendLlmResponseRecord 要求 appendOptions.profile 与 response 凭证 profile 一致）。
  const adapter = createOfflineReplayAdapter();
  const gateway: LlmGateway = {
    register: () => {},
    callLlm: async (_profile: string, request: LlmRequest): Promise<LlmResponse> => {
      const response = await adapter.call(request);
      return {
        ...response,
        credential: {
          ...response.credential,
          providerProfile: 'competition_aliyun_qwen',
          providerRequestId: 'mock-request-id-001',
          // modelId 对齐快照（真实 competition adapter 语义·appendRecord 校验 modelId===snapshot）
          modelId: modelSnapshot,
        },
      };
    },
    registeredProfiles: () => ['competition_aliyun_qwen'],
  };
  const modelSnapshot = 'qwen3.7-max-2026-05-20';
  const gitCommitSha = 'a'.repeat(40);
  const args: LoopRunnerArgs = {
    researchInput: DEMO_RESEARCH_INPUT,
    mode: 'quick',
    profile: 'competition_aliyun_qwen',
    gateway,
    modelSnapshot,
    evidenceLogDb: db,
    gitCommitSha,
  };
  try {
    // 1. 不再抛 REPRO_BRIDGE_NOT_CONFIGURED（G3 闭合核心断言）
    const result = await executeLoop(args);
    assert.ok(result.loopState.terminated, 'competition profile + environment anchor must terminate');

    // 2. 环境锚 = 确定性重算值（同输入同输出·跨层一致）
    const expectedAnchor = computeLlmEnvironmentAnchor({
      modelSnapshot,
      activeModelIds: ['competition_aliyun_qwen'],
      nodeVersion: process.version,
      gitCommitSha,
    });
    assert.match(expectedAnchor, /^[0-9a-f]{64}$/);
    assert.notEqual(expectedAnchor, '0'.repeat(64), '环境锚禁占位 hash（G3 红线）');

    // 3. 环境锚真实落 call_records.repro_hash（注入接缝端到端·非 offline 占位）
    const rows = db
      .prepare('SELECT repro_hash FROM call_records ORDER BY seq ASC')
      .all() as { repro_hash: string }[];
    assert.ok(rows.length > 0, 'loop must produce call_records');
    for (const row of rows) {
      assert.equal(row.repro_hash, expectedAnchor, '每个 call_record 的 repro_hash 须 = 环境锚');
    }
  } finally {
    db.close();
  }
});
