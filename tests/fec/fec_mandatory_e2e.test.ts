// tests/fec/fec_mandatory_e2e.test.ts
//
// P0-1 端到端物证：真实驱动 src/fec/orchestrator.ts fecAppendClaim 的 compileFec(:99) +
// enforceFecMandatoryGate(:103) 接线。构造 compileFec HARD_FAIL（FEC_NOT_COMPILABLE）契约，
// 断言 fail-closed：fecGate.allowed=false + decision.verdict=UNTESTED。
//
// 真实依赖：compileFec（src/fec/compiler.ts）+ enforceFecMandatoryGate（src/fec/fec_mandate.ts）
// 经 fecAppendClaim 真实事务路径，非 FakeBackend、非硬编码 metric 当结论。
// 反假绿：断言基于真实 compileFec 错误码 + 真实 gate reason，无 expect(true)。
//
// Authority: FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md §C P0-1 + 03 §2.3（编译失败诚实降级）+ 10 W2-A。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/migrator.ts';
import { fecAppendClaim } from '../../src/fec/index.ts';
import { makeLegacyCompatFec } from '../../src/falsifiability/index.ts';
import type { FecContractV2 } from '../../src/fec/fec_contract.ts';
import type { FecAppendClaimArgs } from '../../src/fec/orchestrator.ts';
import {
  DEMO_CLAIM_ID,
  DEMO_EXPORTED_AT,
  DEMO_FALSIFICATION_SPEC,
  DEMO_GIT_COMMIT_SHA,
  DEMO_SOURCE_ANCHOR,
  DEMO_THRESHOLD_SPEC,
} from '../../src/far_proof/demo_chain.ts';
import { GENESIS_PREV_HASH } from '../../src/evidence_log/index.ts';

// compileFec #1 检查（compiler.ts:241）：measurableImplication 空串 → FEC_NOT_COMPILABLE（HARD_FAIL_UNTESTED）。
// 顶层 decoy-free：直接 spread 真实 legacy-compat 契约并清空单字段，保证其余字段仍类型合法。
function buildUncompilableFec(): FecContractV2 {
  const valid = makeLegacyCompatFec({
    claimId: DEMO_CLAIM_ID,
    falsificationSpec: DEMO_FALSIFICATION_SPEC,
    thresholdSpec: DEMO_THRESHOLD_SPEC,
    frozenAt: DEMO_SOURCE_ANCHOR.isoTimestamp,
  });
  return { ...valid, measurableImplication: '' };
}

// 复用 demo_chain 的真实 fecAppendClaim args 形状，仅替换 fecV2.contract 为坏契约 + 反向证据。
// 这是 orchestrator 生产路径的真实调用形态（非测试桩），驱动 compileFec→gate 真实接线。
function buildArgs(brokenContract: FecContractV2): FecAppendClaimArgs {
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
      requestPayload: '{"prompt":"P0-1 broken FEC"}',
      responsePayload: '{"claim":"broken-fec-e2e"}',
      finishReason: 'stop',
      usageTokensTotal: 16,
    },
    appendOptions: { providerProfile: 'offline_replay' },
    evidencePayload: { claimId: DEMO_CLAIM_ID, claim: claimText, metric: 'macro_f1' },
    sourceAnchor: DEMO_SOURCE_ANCHOR,
    claim: claimText,
    falsificationSpec: DEMO_FALSIFICATION_SPEC,
    thresholdSpec: DEMO_THRESHOLD_SPEC,
    evidences: [
      {
        claim: 'measured macro-F1 = 0.62 on TESS-ASTRO held-out split (n=512)',
        metricValue: 0.62,
        supportsClaim: false,
        refutesClaim: true,
        scopeNarrowerThanClaim: false,
        sourceAnchor: DEMO_SOURCE_ANCHOR,
      },
    ],
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: { contract: brokenContract },
  };
}

test('missing_or_bad_fec_blocks_confirmed: compileFec HARD_FAIL → fecGate.allowed=false → verdict UNTESTED (P0-1)', () => {
  const db = new Database(':memory:');
  try {
    runMigrations(db);
    const result = fecAppendClaim(db, buildArgs(buildUncompilableFec()));

    // compileFec（orchestrator:99）真实接线：编译失败被 enforceFecMandatoryGate（:103）捕获。
    assert.equal(result.fecGate.allowed, false, 'uncompilable FEC must yield fecGate.allowed=false');
    assert.equal(
      result.fecGate.ciBlocked,
      false,
      'FEC_NOT_COMPILABLE is HARD_FAIL_UNTESTED, not HARD_FAIL_CI_BLOCK (LLM_FROZEN)',
    );
    assert.ok(
      result.fecGate.reason.includes('FEC_NOT_COMPILABLE'),
      `fecGate.reason should cite FEC_NOT_COMPILABLE, got: ${result.fecGate.reason}`,
    );

    // !fecGate.allowed 分支（orchestrator:119-128）fail-closed：verdict 永不 CONFIRMED。
    assert.equal(result.decision.verdict, 'UNTESTED', 'broken FEC must fail-closed to UNTESTED');
    assert.ok(
      result.decision.untestedReason !== null && result.decision.untestedReason.length > 0,
      'UNTESTED decision must carry a non-empty untestedReason',
    );
  } finally {
    db.close();
  }
});
