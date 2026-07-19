// tests/fec/orchestrator_identifier_reverify.test.ts
//
// FUSION-OS-14 反 theater 信任根强化物证：caller 经生产路径 fecAppendClaim 传 identifierClaims 时，
// harness 用 HARNESS_VERIFIED_IDENTIFIERS 经 resolveIdentifierClaim 重算 resolutionStatus，
// 覆盖 caller 自填值（防 caller 自填 'resolved' 绕过 R-identifier REFUTED）。
//
// 闭合的盲区：修复前 caller 可直接构造 IdentifierClaim{resolutionStatus:'resolved'} → kernel 信任 →
// R-identifier 不触发 → 伪造引用 verdict 通过。identifierClaims 不持久化、verifier 不重算，事后不可查。
// 修复（orchestrator.ts buildVerdictKernelInput）：caller 只控制 kind+value，harness 重算 resolutionStatus。
//
// 单一真实依赖（CLAUDE.md §1）：真实 fecAppendClaim 生产路径 → orchestrator.buildVerdictKernelInput
// → resolveIdentifierClaim（HARNESS_VERIFIED_IDENTIFIERS）→ decideFiveValueVerdict R-identifier 规则。
// 非 Fake 后端、非硬编码指标、非直接调 kernel（经 fecAppendClaim 端到端）。
//
// RED→GREEN 论证：
//   RED（修复前·orchestrator.ts:284 透传 args.identifierClaims）：自填 resolved 被信任 → 不触发 R-identifier
//     → 落正常 cascade（NO_DECISION_PATH/CONFIRMED）→ 期望 REFUTED FAIL。
//   GREEN（修复后·重算覆盖）：自填 resolved（value 不在 registry）→ 重算 not_found → R-identifier REFUTED。
//
// Authority: CLAUDE.md §5（反 theater 红线：来源不可自填）+
//            FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md §C FUSION-OS-14 dep 注记（caller opt-in → 强化 harness 重算）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/migrator.ts';
import { fecAppendClaim } from '../../src/fec/index.ts';
import type { FecAppendClaimArgs } from '../../src/fec/index.ts';
import { makeValidFec } from '../fec/fixtures.ts';
import type { IdentifierClaim } from '../../src/falsifiability/verdict_kernel_v2.ts';
import type {
  EvidenceRecord,
  FalsificationSpec,
  SourceAnchor,
  ThresholdSpec,
} from '../../src/falsifiability/index.ts';
import { GENESIS_PREV_HASH } from '../../src/evidence_log/index.ts';

const sourceAnchor: SourceAnchor = {
  gitCommitSha: 'a'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-07-12T00:00:00Z',
  rawResponseHash: 'b'.repeat(64),
};

const falsificationSpec: FalsificationSpec = {
  prediction: 'accuracy should be at least 0.85',
  metric: 'accuracy',
  falsificationThreshold: 0.85,
  thresholdSemantics: 'gt',
};

const thresholdSpec: ThresholdSpec = {
  semantics: 'gt',
  value: 0.85,
};

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

// baseArgs 构造落 NO_DECISION_PATH（metric-only evidence·无显著统计·过 R0-R4 不触发·R5 不 conflicting·
// R6 不 refutes·R7 不 supports·R8 不触发·R9 statistics 非全 skipped → NO_DECISION_PATH）。
// 加 identifierClaims 后，R-identifier（R5 后 R6 前）先于 NO_DECISION_PATH 检查。
function buildBaseArgs(): FecAppendClaimArgs {
  const metricOnlyEvidence: EvidenceRecord = {
    claim: 'measured accuracy is 0.91',
    metricValue: 0.91,
    supportsClaim: false,
    refutesClaim: true,
    scopeNarrowerThanClaim: false,
    sourceAnchor,
  };
  return {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'a'.repeat(64),
        gitCommitSha: sourceAnchor.gitCommitSha,
        isoTimestamp: sourceAnchor.isoTimestamp,
      },
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
      prevHash: GENESIS_PREV_HASH,
    },
    callAudit: {
      requestPayload: '{"prompt":"claim"}',
      responsePayload: '{"claim":"accuracy should be high"}',
      finishReason: 'stop',
      usageTokensTotal: 12,
    },
    appendOptions: { providerProfile: 'offline_replay' },
    evidencePayload: { claim: 'accuracy should be at least 0.85' },
    sourceAnchor,
    claim: 'accuracy should be at least 0.85',
    falsificationSpec,
    thresholdSpec,
    evidences: [metricOnlyEvidence],
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: {
      contract: makeValidFec({
        metric: {
          metricKey: 'accuracy',
          description: 'classification accuracy',
          unit: 'unitless',
          computationRef: 'metrics/accuracy.py',
          isDeterministic: false,
        },
        statisticalPlan: {
          primaryMetric: 'accuracy',
          nullHypothesis: 'accuracy < 0.85',
          alternativeHypothesis: 'accuracy >= 0.85',
          alpha: 0.05,
          effectDirection: 'greater',
          confidenceIntervalMethod: 'wilson',
          multipleTestingCorrection: 'none',
          missingDataPolicy: 'none',
          outlierPolicy: 'none',
          stoppingRule: 'fixed-n',
        },
        threshold: { value: 0.85, unit: 'unitless', thresholdSemantics: 'gt', preregistered: true },
        direction: 'greater',
      }),
    },
  };
}

test('self_filled_resolved_bypass_blocked: caller 自填 resolved（非 resolveIdentifierClaim 派生）→ harness 重算 not_found → REFUTED', () => {
  const db = openDb();
  try {
    const fabricatedSelfFilled: IdentifierClaim = {
      kind: 'doi',
      value: '10.1/totally-fabricated-not-in-registry',
      resolutionStatus: 'resolved',
      harnessVerifiedSource: true,
    };
    const result = fecAppendClaim(db, { ...buildBaseArgs(), identifierClaims: [fabricatedSelfFilled] });
    assert.equal(
      result.kernelOutput.verdict,
      'REFUTED',
      '自填 resolved 被 harness 用 HARNESS_VERIFIED_IDENTIFIERS 重算为 not_found → R-identifier REFUTED（反 theater：信任根 resolutionStatus 不可自填）',
    );
    assert.equal(result.kernelOutput.decisiveRuleId, 'R_IDENTIFIER_FABRICATION');
    assert.ok(
      result.kernelOutput.reasonCodes.includes('UNVERIFIED_IDENTIFIER'),
      `reasonCodes must include UNVERIFIED_IDENTIFIER, got ${JSON.stringify(result.kernelOutput.reasonCodes)}`,
    );
    assert.equal(result.decision.verdict, 'REFUTED');
  } finally {
    db.close();
  }
});

test('legitimate_resolved_zero_regression: caller 传真实 resolved（value 在 registry）→ 重算 resolved → 不触发 R-identifier', () => {
  const db = openDb();
  try {
    const legitimate: IdentifierClaim = {
      kind: 'doi',
      value: '10.1/far-verified-001',
      resolutionStatus: 'resolved',
      harnessVerifiedSource: true,
    };
    const result = fecAppendClaim(db, { ...buildBaseArgs(), identifierClaims: [legitimate] });
    assert.notEqual(
      result.kernelOutput.decisiveRuleId,
      'R_IDENTIFIER_FABRICATION',
      'value 在 HARNESS_VERIFIED_IDENTIFIERS → 重算 resolved → 不触发 R-identifier（零回归）',
    );
    assert.notEqual(result.kernelOutput.verdict, 'REFUTED');
  } finally {
    db.close();
  }
});

test('honest_not_found_still_refuted: caller 诚实声明 not_found → 重算一致 not_found → REFUTED', () => {
  const db = openDb();
  try {
    const honestNotFound: IdentifierClaim = {
      kind: 'arxiv',
      value: '9999.9999',
      resolutionStatus: 'not_found',
      harnessVerifiedSource: false,
    };
    const result = fecAppendClaim(db, { ...buildBaseArgs(), identifierClaims: [honestNotFound] });
    assert.equal(result.kernelOutput.verdict, 'REFUTED', '诚实 not_found 与重算一致 → REFUTED（行为不变）');
    assert.equal(result.kernelOutput.decisiveRuleId, 'R_IDENTIFIER_FABRICATION');
  } finally {
    db.close();
  }
});
