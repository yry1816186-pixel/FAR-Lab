// tests/fec/cas_wired.test.ts
//
// FUSION-OS-9 生产 caller 端到端 RED→GREEN：fecAppendClaim 把 FEC Plan + kernel trace 写进 far_blob_store CAS。
//
// 单一真实依赖（CLAUDE.md §1）：真实 fecAppendClaim 事务（src/fec/orchestrator.ts:fecAppendClaim）经
// storeVerdictArtifactsInCas 调真实 storeBlob（src/cas/blob_store.ts）→ 真实 INSERT OR IGNORE 落 far_blob_store
// （0015 migration 建）→ 内容寻址 hash（sha256 canonical JSON）。非 Fake 后端、非硬编码 hash。
//
// RED→GREEN 论证：
//   RED（接线前）：fecAppendClaim 不调 storeBlob → FecAppendClaimResult 无 casReferences 字段 →
//     FEC Plan/kernel trace 散落在 verdict_nodes.verdict_trace 列，无内容寻址去重，artifact 可跨 claim 静默替换。
//   GREEN（接线后）：fecAppendClaim 事务内 storeVerdictArtifactsInCas 把 plan + trace 写进 CAS，
//     返回 casReferences（hash 即地址），同 canonical JSON 跨 claim 去重 + append-only trigger 禁改写。
//
// 反剧场红线（FUSION-OS-9）：artifact hash 即承诺——CAS 按 canonical JSON 内容寻址，篡改 content → hash 失配 →
// 查不到。与 verdict_nodes.verdict_trace DB 列（查询用）正交：CAS 是去重 + 内容寻址 SSOT。
//
// Authority: archived-plan §C FUSION-OS-9 +
//            archived-plan §4 FUSION-OS-9（content-addressable CAS 范式）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/migrator.ts';
import { fecAppendClaim } from '../../src/fec/index.ts';
import { getBlob } from '../../src/cas/index.ts';
import { hashCanonicalJson } from '../../src/evidence_log/hasher.ts';
import { makeLegacyCompatFec } from '../../src/falsifiability/index.ts';
import type { FecContractV2 } from '../../src/fec/fec_contract.ts';
import type { FecAppendClaimArgs } from '../../src/fec/orchestrator.ts';
import type { StatisticalResult } from '../../src/falsifiability/index.ts';
import {
  DEMO_CLAIM_ID,
  DEMO_EXPORTED_AT,
  DEMO_FALSIFICATION_SPEC,
  DEMO_GIT_COMMIT_SHA,
  DEMO_SOURCE_ANCHOR,
  DEMO_THRESHOLD_SPEC,
} from '../../src/far_proof/demo_chain.ts';
import { GENESIS_PREV_HASH } from '../../src/evidence_log/index.ts';

const HEX64 = /^[0-9a-f]{64}$/;

function buildFec(): FecContractV2 {
  return makeLegacyCompatFec({
    claimId: DEMO_CLAIM_ID,
    falsificationSpec: DEMO_FALSIFICATION_SPEC,
    thresholdSpec: DEMO_THRESHOLD_SPEC,
    frozenAt: DEMO_EXPORTED_AT,
  });
}

function buildArgs(
  fecContract: FecContractV2,
  metricValue: number,
  supportsClaim: boolean,
  statistics?: readonly StatisticalResult[],
): FecAppendClaimArgs {
  const claimText = DEMO_FALSIFICATION_SPEC.prediction;
  return {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'a'.repeat(64),
        gitCommitSha: DEMO_GIT_COMMIT_SHA,
        isoTimestamp: DEMO_EXPORTED_AT,
      },
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
      prevHash: GENESIS_PREV_HASH,
    },
    callAudit: {
      requestPayload: '{"prompt":"FUSION-OS-9 CAS wired"}',
      responsePayload: '{"claim":"cas-wired-e2e"}',
      finishReason: 'stop',
      usageTokensTotal: 16,
    },
    appendOptions: { providerProfile: 'offline_replay' },
    evidencePayload: { claimId: DEMO_CLAIM_ID, claim: claimText, metric: 'bls_power' },
    sourceAnchor: DEMO_SOURCE_ANCHOR,
    claim: claimText,
    falsificationSpec: DEMO_FALSIFICATION_SPEC,
    thresholdSpec: DEMO_THRESHOLD_SPEC,
    evidences: [
      {
        claim: `measured bls_power = ${metricValue} on TESS held-out split (n=1000)`,
        metricValue,
        supportsClaim,
        refutesClaim: !supportsClaim,
        scopeNarrowerThanClaim: false,
        sourceAnchor: DEMO_SOURCE_ANCHOR,
      },
    ],
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: { contract: fecContract },
    // P1-5 接线点：注入真实 StatisticalResult（带 pValue/CI）→ kernel R7/R6 真实分化。
    // 不注入时 legacy evidence 无 pValue/CI → kernel 落 NO_DECISION_PATH（supports/refutes 同迹）。
    ...(statistics !== undefined ? { statistics } : {}),
  };
}

//GV-01 (R7 CONFIRMED) / GV-02 (R6 REFUTED) 同源 StatisticalResult（verdict_kernel_v2.test.ts:75-118 范式）。
const SUPPORTING_STATS: readonly StatisticalResult[] = [
  {
    testId: 'macro_f1',
    status: 'ran',
    effectDirection: 'supports',
    pValue: 0.003,
    adjustedPValue: 0.003,
    effectSizeObserved: 0.62,
    confidenceInterval: [0.21, 0.95],
    assumptionDiagnostics: [],
  },
];

const REFUTING_STATS: readonly StatisticalResult[] = [
  {
    testId: 'macro_f1',
    status: 'ran',
    effectDirection: 'refutes',
    pValue: 0.0008,
    adjustedPValue: 0.0008,
    effectSizeObserved: 0.62,
    confidenceInterval: [0.21, 0.95],
    assumptionDiagnostics: [],
  },
];

test('cas_references_populated_and_content_addressed: fecAppendClaim 把 FEC Plan + kernel trace 写进 CAS（hash 即地址）', () => {
  const db = new Database(':memory:');
  try {
    runMigrations(db);
    const result = fecAppendClaim(db, buildArgs(buildFec(), 0.87, true));

    // casReferences 恒非空：fecPlanHash（compileResult.ok=true 时）+ kernelTraceHash。
    assert.ok(result.casReferences.fecPlanHash !== null, 'fecPlanHash 须非 null（合法 FEC 编译成功）');
    assert.match(result.casReferences.fecPlanHash as string, HEX64, 'fecPlanHash 须 64-hex sha256');
    assert.match(result.casReferences.kernelTraceHash, HEX64, 'kernelTraceHash 须 64-hex sha256');

    // CAS 落库物证：getBlob 取回 content，重算 hash 须 === 引用 hash（内容寻址·篡改可检）。
    const planBlob = getBlob(db, result.casReferences.fecPlanHash as string);
    assert.ok(planBlob !== undefined, 'FEC Plan blob 须落 far_blob_store');
    const planRecomputed = hashCanonicalJson(JSON.parse(planBlob.content) as Record<string, unknown>);
    assert.equal(planRecomputed, result.casReferences.fecPlanHash, 'plan hash 须为 content 的 sha256 指纹');

    const traceBlob = getBlob(db, result.casReferences.kernelTraceHash);
    assert.ok(traceBlob !== undefined, 'kernel trace blob 须落 far_blob_store');
    const traceRecomputed = hashCanonicalJson(JSON.parse(traceBlob.content) as Record<string, unknown>);
    assert.equal(traceRecomputed, result.casReferences.kernelTraceHash, 'trace hash 须为 content 的 sha256 指纹');
  } finally {
    db.close();
  }
});

test('identical_artifacts_dedup_to_identical_hashes: 同 FEC + 同 kernel 输入 → 同 hash（跨 claim 内容寻址去重）', () => {
  // 双库（避免单库 evidence_log 链 fork）：各自一次 fecAppendClaim，identical FEC + identical evidence
  // → identical kernelOutput → identical canonical JSON → identical CAS hash（内容寻址稳定性）。
  const dbA = new Database(':memory:');
  const dbB = new Database(':memory:');
  try {
    runMigrations(dbA);
    runMigrations(dbB);
    const a = fecAppendClaim(dbA, buildArgs(buildFec(), 0.87, true));
    const b = fecAppendClaim(dbB, buildArgs(buildFec(), 0.87, true));

    assert.equal(b.casReferences.fecPlanHash, a.casReferences.fecPlanHash, '同 FEC Plan → 同 hash（去重）');
    assert.equal(b.casReferences.kernelTraceHash, a.casReferences.kernelTraceHash, '同 kernel trace → 同 hash（去重）');

    // 各库 CAS 单份 plan + 单份 trace（INSERT OR IGNORE 幂等·内容寻址单行）。
    const countA = dbA.prepare('SELECT COUNT(*) as n FROM far_blob_store').get() as { n: number };
    assert.equal(countA.n, 2, '单次 fecAppendClaim 须落 2 行（1 plan + 1 trace）');
  } finally {
    dbA.close();
    dbB.close();
  }
});

test('distinct_kernel_traces_distinct_hashes: 不同 verdict/trace → 不同 kernelTraceHash（CAS 敏感于内容）', () => {
  const dbConfirm = new Database(':memory:');
  const dbRefute = new Database(':memory:');
  try {
    runMigrations(dbConfirm);
    runMigrations(dbRefute);
    // 注入真实 statistics（P1-5 接线点）：supports → R7 CONFIRMED；refutes → R6 REFUTED。
    // 不同 kernelOutput（不同 verdict/decisiveRuleId/ruleTrace）→ 不同 kernel_trace canonical JSON → 不同 hash。
    const confirm = fecAppendClaim(dbConfirm, buildArgs(buildFec(), 0.87, true, SUPPORTING_STATS));
    const refute = fecAppendClaim(dbRefute, buildArgs(buildFec(), 0.5, false, REFUTING_STATS));

    assert.equal(confirm.decision.verdict, 'CONFIRMED', 'supporting stats 须 → CONFIRMED (R7)');
    assert.equal(refute.decision.verdict, 'REFUTED', 'refuting stats 须 → REFUTED (R6)');
    assert.notEqual(
      confirm.casReferences.kernelTraceHash,
      refute.casReferences.kernelTraceHash,
      '不同 kernel trace 须不同 hash（CAS 内容敏感·防伪造为同 hash）',
    );
    // 同 FEC contract → plan hash 仍相同（plan 不依赖运行时 evidence）。
    assert.equal(
      confirm.casReferences.fecPlanHash,
      refute.casReferences.fecPlanHash,
      '同 FEC → 同 plan hash（plan 与运行时 evidence 正交）',
    );
  } finally {
    dbConfirm.close();
    dbRefute.close();
  }
});
