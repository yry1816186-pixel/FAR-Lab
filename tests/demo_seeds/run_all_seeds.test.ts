/**
 * 端到端 demo seed 验证测试：验证 3 个 seed（A4 / A16 / E2）全部跑通、产出合法。
 *
 * 历史溯源（已归档）: FAR_CHAIN_DEV_SPEC/41_可证伪证据链_FEC.md §1（Science125 种子→VerdictNode 裁决协议）+
 *            17_FINAL_AUDIT.md §7（每个 demo seed 要求）。
 *
 * 验证点（每个 seed）：
 *   1. loopState.terminated === true + terminationReason === 'feedback_converged'
 *   2. artifacts.length === 6（六阶段全部产出）
 *   3. stageId 顺序 stage1→stage2→stage3→stage4→stage5→stage6
 *   4. verifyChainHead 返回 ok=true（链式 hash 完整）
 *   5. VerdictNode 非 null（FEC 编排层产出）
 *   6. reproHash 非空（64 字符 hex）
 *   7. GraphSubtree 含至少 1 个节点
 *   8. SourceCard 所有必填字段非空
 *   9. rawInput 非空文本
 *  10. assemblePaper 返回 10 字段全部存在
 *  11. evidence_log 记录数为 7（6 call_records + 1 FEC verdict record）
 *
 * 所有 seed 全程 offline_replay adapter（不调用真实 API·fresh-clone 无 key 也能跑）。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runA4Seed, A4_RAW_INPUT, A4_SOURCE_CARD } from '../../src/demo_seeds/a4_planetary_orbit_decay.ts';
import { runA16Seed, A16_RAW_INPUT, A16_SOURCE_CARD } from '../../src/demo_seeds/a16_pulsar_p0.ts';
import { runB7Seed, B7_RAW_INPUT, B7_SOURCE_CARD } from '../../src/demo_seeds/b7_protein_folding.ts';
import { runC3Seed, C3_RAW_INPUT, C3_SOURCE_CARD } from '../../src/demo_seeds/c3_catalyst_activity.ts';
import { runE2Seed, E2_RAW_INPUT, E2_SOURCE_CARD } from '../../src/demo_seeds/e2_carbon_flux.ts';
import { runG5Seed, G5_RAW_INPUT, G5_SOURCE_CARD } from '../../src/demo_seeds/g5_seismic_precursor.ts';
import type { DemoSeedResult } from '../../src/demo_seeds/a4_planetary_orbit_decay.ts';

// ---------- 共享断言 ----------

const EXPECTED_STAGE_ORDER = [
  'stage1_understanding',
  'stage2_integration',
  'stage3_hypothesis',
  'stage4_evidence',
  'stage5_plan',
  'stage6_feedback',
] as const;

function validateDemoSeed(result: DemoSeedResult, seedName: string): void {
  // 1. rawInput 非空
  assert.equal(typeof result.rawInput, 'string', `${seedName}: rawInput should be string`);
  assert.ok(result.rawInput.length > 50, `${seedName}: rawInput should be substantive (>50 chars)`);

  // 2. SourceCard 必填字段非空
  const card = result.sourceCard;
  assert.equal(typeof card.sourceId, 'string', `${seedName}: sourceCard.sourceId should be string`);
  assert.ok(card.sourceId.length > 0, `${seedName}: sourceCard.sourceId should be non-empty`);
  assert.equal(typeof card.url, 'string', `${seedName}: sourceCard.url should be string`);
  assert.ok(card.url.length > 0, `${seedName}: sourceCard.url should be non-empty`);
  assert.equal(typeof card.title, 'string', `${seedName}: sourceCard.title should be string`);
  assert.ok(card.title.length > 0, `${seedName}: sourceCard.title should be non-empty`);
  assert.equal(typeof card.claim, 'string', `${seedName}: sourceCard.claim should be string`);
  assert.ok(card.claim.length > 0, `${seedName}: sourceCard.claim should be non-empty`);
  assert.equal(typeof card.evidenceLevel, 'string', `${seedName}: sourceCard.evidenceLevel should be string`);
  assert.equal(typeof card.stability, 'string', `${seedName}: sourceCard.stability should be string`);
  assert.equal(typeof card.usedFor, 'string', `${seedName}: sourceCard.usedFor should be string`);

  // 3. loopState.terminated === true
  assert.equal(result.loopState.terminated, true, `${seedName}: loopState should be terminated`);

  // 4. terminationReason === 'feedback_converged'
  assert.equal(
    result.loopState.terminationReason,
    'feedback_converged',
    `${seedName}: should converge via feedback`,
  );

  // 5. artifacts.length === 6
  assert.equal(
    result.loopState.artifacts.length,
    6,
    `${seedName}: should produce exactly 6 stage artifacts`,
  );

  // 6. stageId 顺序
  const actualOrder = result.loopState.artifacts.map((a) => a.stageId);
  assert.deepEqual(
    actualOrder,
    [...EXPECTED_STAGE_ORDER],
    `${seedName}: stageId order should be stage1→stage2→stage3→stage4→stage5→stage6`,
  );

  // 7. artifacts payload 全部非 null（每个 kind tag 正确）
  for (const artifact of result.loopState.artifacts) {
    assert.ok(artifact.structured !== null, `${seedName}: artifact ${artifact.stageId} structured should not be null`);
  }

  // 8. VerdictNode 非 null
  const vn = result.verdictNode;
  assert.ok(vn !== null, `${seedName}: verdictNode should not be null`);
  assert.equal(typeof vn.verdictId, 'string', `${seedName}: verdictNode.verdictId should be string`);
  assert.ok(vn.verdictId.length > 0, `${seedName}: verdictNode.verdictId should be non-empty`);
  assert.equal(typeof vn.verdict, 'string', `${seedName}: verdictNode.verdict should be string`);
  assert.equal(typeof vn.evidenceId, 'string', `${seedName}: verdictNode.evidenceId should be string`);
  assert.equal(typeof vn.nodeKind, 'string', `${seedName}: verdictNode.nodeKind should be string`);

  // 9. reproHash 非空且为 64 字符 hex
  assert.equal(typeof result.reproHash, 'string', `${seedName}: reproHash should be string`);
  assert.ok(result.reproHash.length === 64, `${seedName}: reproHash should be 64 chars (got ${result.reproHash.length})`);
  assert.ok(
    /^[0-9a-f]{64}$/.test(result.reproHash),
    `${seedName}: reproHash should be lowercase hex (64 chars)`,
  );

  // 10. GraphSubtree 含至少 1 个节点
  assert.ok(
    result.graphSubtree.nodes.length >= 1,
    `${seedName}: graphSubtree should have ≥1 node (got ${result.graphSubtree.nodes.length})`,
  );
  assert.equal(
    result.graphSubtree.rootId,
    result.verdictNode.verdictId,
    `${seedName}: graphSubtree rootId should match verdictNode.verdictId`,
  );

  // 11. chainVerify 返回 ok=true（链式 hash 完整）
  assert.equal(result.chainVerify.ok, true, `${seedName}: verifyChainHead should return ok=true`);
  assert.equal(result.chainVerify.brokenAtSeq, null, `${seedName}: verifyChainHead brokenAtSeq should be null`);
  assert.ok(
    result.chainVerify.verifiedCount >= 7,
    `${seedName}: verifyChainHead verifiedCount should be ≥7 (6 agent loop + 1 FEC verdict record), got ${result.chainVerify.verifiedCount}`,
  );

  // 12. assemblePaper 返回 10 字段全部存在
  const paper = result.paper;
  assert.equal(typeof paper.paperTitle, 'string', `${seedName}: paperTitle should be string`);
  assert.ok(paper.paperTitle.length > 0, `${seedName}: paperTitle should be non-empty`);

  assert.equal(typeof paper.paperAbstract, 'string', `${seedName}: paperAbstract should be string`);
  assert.ok(paper.paperAbstract.length > 0, `${seedName}: paperAbstract should be non-empty`);

  assert.equal(typeof paper.problemStatement, 'string', `${seedName}: problemStatement should be string`);
  assert.ok(paper.problemStatement.length > 0, `${seedName}: problemStatement should be non-empty`);

  assert.equal(typeof paper.rationale, 'string', `${seedName}: rationale should be string`);
  assert.ok(paper.rationale.length > 0, `${seedName}: rationale should be non-empty`);

  assert.equal(typeof paper.technicalDetails, 'string', `${seedName}: technicalDetails should be string`);
  assert.ok(paper.technicalDetails.length > 0, `${seedName}: technicalDetails should be non-empty`);

  assert.ok(Array.isArray(paper.datasets.source), `${seedName}: datasets.source should be array`);
  assert.ok(Array.isArray(paper.datasets.target), `${seedName}: datasets.target should be array`);

  assert.ok(Array.isArray(paper.methods), `${seedName}: methods should be array`);
  assert.ok(paper.methods.length > 0, `${seedName}: methods should be non-empty`);

  assert.ok(Array.isArray(paper.experiments.baselines), `${seedName}: experiments.baselines should be array`);
  assert.ok(Array.isArray(paper.experiments.metrics), `${seedName}: experiments.metrics should be array`);
  assert.equal(typeof paper.experiments.expectedOutcome, 'string', `${seedName}: experiments.expectedOutcome should be string`);

  assert.equal(typeof paper.results, 'string', `${seedName}: results should be string`);
  assert.ok(paper.results.length > 0, `${seedName}: results should be non-empty`);

  assert.ok(Array.isArray(paper.references), `${seedName}: references should be array`);
  assert.ok(paper.references.length > 0, `${seedName}: references should be non-empty`);

  assert.equal(typeof paper.iterationCount, 'number', `${seedName}: iterationCount should be number`);
  assert.equal(paper.iterationCount, 1, `${seedName}: iterationCount should be 1`);

  assert.equal(typeof paper.finalVerdict, 'string', `${seedName}: finalVerdict should be string`);
}

// ---------- 测试用例 ----------

test('A4 行星轨道衰减：完整 6-stage agent loop + FEC 编排 → 全部验证通过', async () => {
  let result: DemoSeedResult | undefined;
  try {
    result = await runA4Seed();
    validateDemoSeed(result, 'A4');

    // A4-specific: raw input 含 Hot Jupiter 关键词
    assert.ok(
      A4_RAW_INPUT.includes('Hot Jupiter'),
      'A4 raw input should mention Hot Jupiter',
    );
    assert.ok(
      A4_SOURCE_CARD.usedFor === 'scientific_evidence',
      'A4 sourceCard.usedFor should be scientific_evidence',
    );

    // evidence_log 记录数验证（2 条·语义不同·nodeKind 区分）：
    //   - 1 条来自 loop verdict 第 7 阶段（hypothesis 锚行·loop 收敛后产 VerdictNode·nodeKind='root'）
    //   - 1 条来自 FEC fecAppendClaim（formal claim 证据·nodeKind='hypothesis'）
    //   loop verdict 是 stage4 文献投票裁决·FEC 是显式证据+metric 阈值裁决·两者互补非重复。
    //   （call_records 仍为 7：6 loop stages + 1 FEC·verdict 阶段不增 call_record）
    const evCount = result.db
      .prepare('SELECT COUNT(*) AS cnt FROM evidence_log')
      .get() as { cnt: number };
    assert.equal(evCount.cnt, 2, 'A4: evidence_log should have 2 entries (loop verdict + FEC)');
  } finally {
    result?.db.close();
  }
});

test('A16 脉冲星P0：完整 6-stage agent loop + FEC 编排 → 全部验证通过', async () => {
  let result: DemoSeedResult | undefined;
  try {
    result = await runA16Seed();
    validateDemoSeed(result, 'A16');

    // A16-specific: raw input 含 pulsar/braking index 关键词
    assert.ok(
      A16_RAW_INPUT.includes('braking index'),
      'A16 raw input should mention braking index',
    );
    assert.ok(
      A16_SOURCE_CARD.sourceType === 'dataset',
      'A16 sourceCard.sourceType should be dataset (ATNF catalog)',
    );

    // verdict=CONFIRMED：a16Evidences 经 bridgeLegacyEvidencesToStatistics 显式桥接（statistics?）
    // → 2 supports 显著 → R7。与生产反 theater 路径（fec_orchestrator.test.ts:328·不传 statistics?）隔离。
    assert.equal(
      result.verdictNode.verdict,
      'CONFIRMED',
      'A16: verdict should be CONFIRMED (2 supporting evidences via explicit statistics bridge)',
    );
  } finally {
    result?.db.close();
  }
});

test('E2 碳通量：完整 6-stage agent loop + FEC 编排 → 全部验证通过', async () => {
  let result: DemoSeedResult | undefined;
  try {
    result = await runE2Seed();
    validateDemoSeed(result, 'E2');

    // E2-specific: raw input 含 FLUXNET/carbon flux 关键词
    assert.ok(
      E2_RAW_INPUT.includes('FLUXNET'),
      'E2 raw input should mention FLUXNET',
    );
    assert.ok(
      E2_SOURCE_CARD.sourceType === 'dataset',
      'E2 sourceCard.sourceType should be dataset (FLUXNET)',
    );

    // GraphSubtree nodes[0] decision=CONFIRMED：e2Evidences 经 statistics? 显式桥接 → 2 supports → R7。
    const rootNode = result.graphSubtree.nodes[0];
    assert.ok(rootNode !== undefined, 'E2: graphSubtree should have at least root node');
    assert.equal(
      rootNode.decision,
      'CONFIRMED',
      'E2: graphSubtree root node decision should be CONFIRMED (2 supporting evidences)',
    );
  } finally {
    result?.db.close();
  }
});

test('B7 蛋白质折叠：完整 6-stage agent loop + FEC 编排 → REFUTED', async () => {
  let result: DemoSeedResult | undefined;
  try {
    result = await runB7Seed();
    validateDemoSeed(result, 'B7');

    // B7-specific: raw input 含 TM-score 关键词
    assert.ok(
      B7_RAW_INPUT.includes('TM-score'),
      'B7 raw input should mention TM-score',
    );
    assert.ok(
      B7_SOURCE_CARD.sourceType === 'dataset',
      'B7 sourceCard.sourceType should be dataset (CASP15 official assessment)',
    );

    // verdict=REFUTED：b7Evidences 经 statistics? 显式桥接 → 2 refutes 显著 → R6 REFUTED。
    // 与生产反 theater 路径隔离（registry.ts: B7→REFUTED）。
    assert.equal(
      result.verdictNode.verdict,
      'REFUTED',
      'B7: verdict should be REFUTED (2 refuting evidences via explicit statistics bridge)',
    );
  } finally {
    result?.db.close();
  }
});

test('C3 催化剂活性：完整 6-stage agent loop + FEC 编排 → DEGRADED_SCOPE', async () => {
  let result: DemoSeedResult | undefined;
  try {
    result = await runC3Seed();
    validateDemoSeed(result, 'C3');

    // C3-specific: raw input 含 MAPE 关键词
    assert.ok(
      C3_RAW_INPUT.includes('MAPE'),
      'C3 raw input should mention MAPE',
    );
    assert.ok(
      C3_SOURCE_CARD.sourceType === 'dataset',
      'C3 sourceCard.sourceType should be dataset (Open Catalyst 2020)',
    );

    // verdict 应为 DEGRADED_SCOPE（SAC 子集 scope 比「全部过渡金属催化剂」claim 窄）
    assert.equal(
      result.verdictNode.verdict,
      'DEGRADED_SCOPE',
      'C3: verdict should be DEGRADED_SCOPE (SAC-only subset narrower than all-catalyst claim)',
    );
    assert.ok(
      result.verdictNode.scopeSlipText !== null && result.verdictNode.scopeSlipText.length > 0,
      'C3: DEGRADED_SCOPE should carry non-empty scopeSlipText',
    );
  } finally {
    result?.db.close();
  }
});

test('G5 地震前兆：完整 6-stage agent loop + FEC 编排 → UNTESTED', async () => {
  let result: DemoSeedResult | undefined;
  try {
    result = await runG5Seed();
    validateDemoSeed(result, 'G5');

    // G5-specific: raw input 含 ULF 关键词
    assert.ok(
      G5_RAW_INPUT.includes('ULF'),
      'G5 raw input should mention ULF',
    );
    assert.ok(
      G5_SOURCE_CARD.evidenceLevel === 'secondary',
      'G5 sourceCard.evidenceLevel should be secondary (critical review)',
    );

    // verdict 应为 UNTESTED（地震前兆领域无可复现 metric 证据）
    assert.equal(
      result.verdictNode.verdict,
      'UNTESTED',
      'G5: verdict should be UNTESTED (no reproducible prospective evidence)',
    );
    assert.ok(
      result.verdictNode.untestedReason !== null && result.verdictNode.untestedReason.length > 0,
      'G5: UNTESTED should carry non-empty untestedReason',
    );
  } finally {
    result?.db.close();
  }
});

test('六个 seed 全部可独立运行：互不污染、各自产出合法', async () => {
  // 并行运行三个 seed，验证互不污染
  const results: DemoSeedResult[] = [];
  try {
    const [a4, a16, b7, c3, e2, g5] = await Promise.all([runA4Seed(), runA16Seed(), runB7Seed(), runC3Seed(), runE2Seed(), runG5Seed()]);
    results.push(a4, a16, b7, c3, e2, g5);

    // 每个 seed 的数据库实例独立（:memory:），记录数互不泄漏
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      assert.ok(result !== undefined, `seed ${i}: result should not be undefined`);

      // 验证 call_records 数：每个 seed 独立 DB，6 条 record（agent loop stages only，
      // FEC 追加的 record 有自己独立的 seq）
      const callCount = result.db
        .prepare('SELECT COUNT(*) AS cnt FROM call_records')
        .get() as { cnt: number };
      assert.ok(
        callCount.cnt >= 6,
        `seed ${i}: call_records should have ≥6 entries (6 agent loop records), got ${callCount.cnt}`,
      );

      validateDemoSeed(result, `seed${i}`);
    }

    // 交叉验证：三个 seed 的 reproHash 互不相同
    const hashes = results.map((r) => r.reproHash);
    const uniqueHashes = new Set(hashes);
    assert.equal(
      uniqueHashes.size,
      6,
      `All 6 seeds should have unique reproHash values (got ${uniqueHashes.size} unique)`,
    );
  } finally {
    for (const result of results) {
      result.db.close();
    }
  }
});
