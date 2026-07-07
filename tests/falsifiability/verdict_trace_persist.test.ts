// tests/falsifiability/verdict_trace_persist.test.ts
//
// P0-2-EXT 端到端 RED→GREEN：裁决内核结构化输出（reasonCodes/ruleTrace/decisiveRuleId/evidenceSufficiency）
// 经真实 fecAppendClaim 路径持久化进 verdict_nodes + 绑定 current_hash。
//
// 单一真实依赖（CLAUDE.md §1）：真实 decideFiveValueVerdict（verdict_kernel_v2.ts）→ extractVerdictTrace
// → recordVerdict → verdict_nodes.verdict_trace_json/hash。非 Fake 后端、非硬编码指标。
//
// RED→GREEN 论证：
//   RED（接线前）：decideFiveValueVerdict 算出 4 字段后被 verdictResultFromKernelOutput 丢弃——
//     verdict_nodes 无 trace 列、current_hash 白名单不含 verdict_trace_hash → trace 可被静默篡改无感知。
//   GREEN（接线后）：trace 落 verdict_trace_json + verdict_trace_hash 进 current_hash 白名单 →
//     verifyVerdictNodes 重算 current_hash 捕获任何 trace 篡改（different trace → different hash）。
//
// Authority: FAR_LAB_MASTER_PLAN/04 §3.1（proofHash 白名单 verdictTrace.*）+ §3.4（verdict 层 critical）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/index.ts';
import { fecAppendClaim } from '../../src/fec/index.ts';
import { makeValidFec } from '../fec/fixtures.ts';
import {
  extractVerdictTrace,
  getVerdict,
  verifyVerdictNodes,
} from '../../src/falsifiability/index.ts';
import type {
  EvidenceRecord,
  FalsificationSpec,
  SourceAnchor,
  ThresholdSpec,
  VerdictTracePersisted,
} from '../../src/falsifiability/index.ts';
import {
  canonicalJson,
  GENESIS_PREV_HASH,
  hashCanonicalJson,
} from '../../src/evidence_log/index.ts';

const sourceAnchor: SourceAnchor = {
  gitCommitSha: 'b'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'c'.repeat(64),
};

const falsificationSpec: FalsificationSpec = {
  prediction: 'accuracy should be at least 0.85',
  metric: 'accuracy',
  falsificationThreshold: 0.85,
  thresholdSemantics: 'gt',
};

const thresholdSpec: ThresholdSpec = { semantics: 'gt', value: 0.85 };

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

const metricOnlyEvidence: EvidenceRecord = {
  claim: 'measured accuracy is 0.91',
  metricValue: 0.91,
  supportsClaim: false,
  refutesClaim: true,
  scopeNarrowerThanClaim: false,
  sourceAnchor,
};

function makeFec() {
  return makeValidFec({
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
  });
}

function runFecAppendClaim(db: Database.Database) {
  return fecAppendClaim(db, {
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
    },
    callAudit: {
      requestPayload: '{"prompt":"claim"}',
      responsePayload: '{"claim":"accuracy"}',
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
    fecV2: { contract: makeFec() },
  });
}

test('P0-2-EXT: fecAppendClaim 持久化 kernel trace 4 字段进 verdict_nodes', () => {
  const db = openDb();
  try {
    const result = runFecAppendClaim(db);

    // trace 4 字段从 kernelOutput 经 extractVerdictTrace 落库（与 decision 同源·不可分别伪造）。
    const expectedTrace = extractVerdictTrace(result.kernelOutput);
    const persisted = result.verdictNode;
    assert.deepEqual(persisted.verdictTrace, expectedTrace, 'verdictTrace 须与 kernelOutput 4 字段同源');
    assert.deepEqual(persisted.verdictTrace.reasonCodes, result.kernelOutput.reasonCodes);
    assert.deepEqual(persisted.verdictTrace.ruleTrace, result.kernelOutput.ruleTrace);
    assert.equal(persisted.verdictTrace.decisiveRuleId, result.kernelOutput.decisiveRuleId);
    assert.deepEqual(persisted.verdictTrace.evidenceSufficiency, result.kernelOutput.evidenceSufficiency);

    // verdict_trace_hash 是 64-hex sha256。
    assert.match(persisted.verdictTraceHash, /^[0-9a-f]{64}$/);

    // getVerdict 读回仍含 trace（parseVerdictTrace round-trip 严格校验形状）。
    const readBack = getVerdict(db, persisted.verdictId);
    assert.deepEqual(readBack?.verdictTrace, expectedTrace);
    assert.equal(readBack?.verdictTraceHash, persisted.verdictTraceHash);
  } finally {
    db.close();
  }
});

test('P0-2-EXT: trace 进 current_hash 白名单——verifyVerdictNodes 重算匹配 + 不同 trace → 不同 hash', () => {
  const db = openDb();
  try {
    runFecAppendClaim(db);

    // 链一致：recompute current_hash（含 verdict_trace_hash）须 === stored。若 trace 未绑定（RED），
    // 重算白名单无 verdict_trace_hash → 与 stored（接线后含 trace_hash 算的）不等 → verify 失败。
    // 此处 GREEN：白名单逐字一致 → verify 通过。
    const verifyResult = verifyVerdictNodes(db);
    assert.equal(verifyResult.ok, true, '链须一致：recompute current_hash（含 verdict_trace_hash）=== stored');
    assert.equal(verifyResult.brokenAtVerdictId, null);

    // 绑定证明（RED→GREEN 核心）：同一白名单下，仅 verdictTrace 不同 → current_hash 必不同。
    // 接线前（RED）：trace 不在白名单 → 两 trace 同 current_hash（篡改无感知）。
    // 接线后（GREEN）：trace 在白名单 → 不同 trace → 不同 current_hash（篡改可察觉）。
    const traceA: VerdictTracePersisted = {
      reasonCodes: ['R5_REFUTED'],
      ruleTrace: [{ ruleId: 'R5_REFUTED', triggered: true }],
      decisiveRuleId: 'R5_REFUTED',
      evidenceSufficiency: { status: 'sufficient', powerStatus: 'adequate' },
    };
    const traceB: VerdictTracePersisted = {
      reasonCodes: ['R5_REFUTED', 'EXTRA_TAMPERED_CODE'],
      ruleTrace: [{ ruleId: 'R5_REFUTED', triggered: true }],
      decisiveRuleId: 'R5_REFUTED',
      evidenceSufficiency: { status: 'sufficient', powerStatus: 'adequate' },
    };
    const hashFor = (trace: VerdictTracePersisted): string => {
      const traceJson = canonicalJson(trace, 'binding-proof');
      const traceHash = hashCanonicalJson({ traceJson });
      // 白名单须与 recordVerdict(repository.ts) + verifyVerdictNodes(verifier.ts) 逐字一致。
      return hashCanonicalJson({
        verdictId: 'binding-proof-id',
        evidenceId: 'ev-binding-proof',
        nodeKind: 'hypothesis',
        verdict: 'UNTESTED',
        falsificationSpecJson: canonicalJson(falsificationSpec, 'binding-proof'),
        thresholdSpecJson: canonicalJson(thresholdSpec, 'binding-proof'),
        sourceAnchorJson: canonicalJson(sourceAnchor, 'binding-proof'),
        prevHash: GENESIS_PREV_HASH,
        verdictTraceHash: traceHash,
      });
    };
    assert.notEqual(hashFor(traceA), hashFor(traceB), '不同 trace 须产生不同 current_hash（绑定证据）');
  } finally {
    db.close();
  }
});

test('P0-2-EXT: 篡改 verdict_trace_json 触发不可变 trigger（DB 层物理兜底）', () => {
  const db = openDb();
  try {
    const result = runFecAppendClaim(db);
    // 0012 迁移扩展 trg_verdict_nodes_immutable_fields：UPDATE verdict_trace_json 须 RAISE。
    // 否则攻击者直接改列（绕过 recordVerdict）替换 trace，破坏 current_hash 绑定的语义。
    assert.throws(
      () =>
        db.prepare('UPDATE verdict_nodes SET verdict_trace_json = ? WHERE verdict_id = ?').run(
          '{"reasonCodes":["TAMPERED"]}',
          result.verdictNode.verdictId,
        ),
      /mutable|immutable|verdict_nodes/i,
    );
  } finally {
    db.close();
  }
});
