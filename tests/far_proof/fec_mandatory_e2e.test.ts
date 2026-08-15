// tests/far_proof/fec_mandatory_e2e.test.ts
//
// P0-3 端到端物证：真实驱动 src/fec/orchestrator.ts fecAppendClaim 内 !fecGate.allowed 分支（:119-128）。
// 构造「证据本会支持 claim」(metricValue=0.95 > 0.80 阈值) + compileFec HARD_FAIL 契约，
// 断言 fail-closed：decision.verdict=UNTESTED（永不 CONFIRMED），且 untestedReason === fecGate.reason
// （证明决策由 !allowed 分支产出，非 kernel 分支——kernel 分支会用 kernelOutput.untestedReason='FEC_NOT_READY'）。
//
// 真实依赖：fecAppendClaim 真实事务（compileFec + enforceFecMandatoryGate + !allowed fail-closed 分支）。
// demo_chain 经同一 fecAppendClaim 调用形态间接驱动本路径（P0-3 caller = orchestrator:119）。
// 反假绿：断言 untestedReason === fecGate.reason 精确区分接线分支，无 expect(true)。
//
// Authority: archived-plan §C P0-3 + 03 §2.3 + orchestrator.ts:119-128。

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

function buildUncompilableFec(): FecContractV2 {
  const valid = makeLegacyCompatFec({
    claimId: DEMO_CLAIM_ID,
    falsificationSpec: DEMO_FALSIFICATION_SPEC,
    thresholdSpec: DEMO_THRESHOLD_SPEC,
    frozenAt: DEMO_SOURCE_ANCHOR.isoTimestamp,
  });
  return { ...valid, measurableImplication: '' };
}

// 与 demo_chain 同形态的 fecAppendClaim 生产调用，但注入 (a) 坏契约 (b) 本会支持 claim 的证据。
function buildArgs(brokenContract: FecContractV2): FecAppendClaimArgs {
  const claimText = DEMO_FALSIFICATION_SPEC.prediction;
  return {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'b'.repeat(64),
        gitCommitSha: DEMO_GIT_COMMIT_SHA,
        isoTimestamp: DEMO_EXPORTED_AT,
      },
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
      prevHash: GENESIS_PREV_HASH,
    },
    callAudit: {
      requestPayload: '{"prompt":"P0-3 broken FEC on real path"}',
      responsePayload: '{"claim":"broken-fec-real-path"}',
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
        // 0.95 > 0.80 阈值 → 本会「支持」claim（supportsClaim=true）；若无 FEC 强制门，kernel 可能落 CONFIRMED。
        claim: 'measured macro-F1 = 0.95 on TESS-ASTRO held-out split (n=512)',
        metricValue: 0.95,
        supportsClaim: true,
        refutesClaim: false,
        scopeNarrowerThanClaim: false,
        sourceAnchor: DEMO_SOURCE_ANCHOR,
      },
    ],
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: { contract: brokenContract },
  };
}

test('missing_fec_blocks_confirmed_on_real_path: !fecGate.allowed branch forces UNTESTED even with supporting evidence (P0-3)', () => {
  const db = new Database(':memory:');
  try {
    runMigrations(db);
    const result = fecAppendClaim(db, buildArgs(buildUncompilableFec()));

    // 即使证据本会支持 claim，坏 FEC 强制 fail-closed：永不 CONFIRMED。
    assert.equal(result.fecGate.allowed, false);
    assert.notEqual(result.decision.verdict, 'CONFIRMED', 'bad-FEC claim must never be CONFIRMED');
    assert.equal(result.decision.verdict, 'UNTESTED');

    // 精确接线证明：决策由 !fecGate.allowed 分支（orchestrator:119-128）产出，非 kernel 分支。
    // kernel 分支会经 verdictResultFromKernelOutput 取 kernelOutput.untestedReason（坏 FEC 时为 'FEC_NOT_READY'）；
    // !allowed 分支直接用 fecGate.reason（含「fail-closed UNTESTED: FEC_NOT_COMPILABLE」）。
    assert.equal(
      result.decision.untestedReason,
      result.fecGate.reason,
      'decision.untestedReason must equal fecGate.reason (proves !allowed branch produced the decision, not the kernel branch)',
    );
    assert.ok(
      result.decision.untestedReason.includes('FEC_NOT_COMPILABLE'),
      `untestedReason should carry the gate reason, got: ${result.decision.untestedReason}`,
    );
    assert.notEqual(
      result.decision.untestedReason,
      'FEC_NOT_READY',
      'FEC_NOT_READY would indicate the kernel branch (verdictResultFromKernelOutput) produced the decision — wiring regression',
    );
  } finally {
    db.close();
  }
});
