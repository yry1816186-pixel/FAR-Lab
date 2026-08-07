// tests/falsifiability/decision_trace_persist_b3.test.ts
//
// B3: A1 decisionTrace 持久化 + API 暴露（additive 透明度层·无 schema migration）。
//
// 接线（B3 改动）：
//   1. types.ts VerdictTracePersisted 加 decisionTrace?（可选）
//   2. legacy_kernel_adapter.ts extractVerdictTrace 透传 output.decisionTrace
//   3. repository.ts parseVerdictTrace 宽容透传（非 verdict-critical·旧行无则 undefined）
//   4. api/routes/verdict.ts HonestVerdictDto.decisionTrace 透传
//
// 效果：verdict_trace_json 全文含 decisionTrace → verdict_trace_hash 自动绑定（信任链增强·
// 篡改被 verifyVerdictNodes 捕获）；旧 DB 行（A1 前）无此字段 → 读回 undefined（零回归）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/index.ts';
import { fecAppendClaim } from '../../src/fec/index.ts';
import { makeValidFec } from '../fec/fixtures.ts';
import {
  extractVerdictTrace,
  getVerdict,
} from '../../src/falsifiability/index.ts';
import type {
  EvidenceRecord,
  FalsificationSpec,
  SourceAnchor,
  ThresholdSpec,
} from '../../src/falsifiability/index.ts';
import { toHonestVerdictDto } from '../../src/api/routes/verdict.ts';
import {
  canonicalJson,
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

const metricOnlyEvidence: EvidenceRecord = {
  claim: 'measured accuracy is 0.91',
  metricValue: 0.91,
  supportsClaim: false,
  refutesClaim: true,
  scopeNarrowerThanClaim: false,
  sourceAnchor,
};

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

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

test('B3: extractVerdictTrace 透传 decisionTrace + 落库 + getVerdict round-trip', () => {
  const db = openDb();
  try {
    const result = runFecAppendClaim(db);

    // A1：所有 decideFiveValueVerdict 输出都带 decisionTrace（透明度层·firedRuleId/r7Gate/metrics）。
    assert.ok(result.kernelOutput.decisionTrace, 'kernel output 应有 decisionTrace');
    assert.equal(result.kernelOutput.decisionTrace.firedRuleId, result.kernelOutput.decisiveRuleId);

    // extractVerdictTrace 透传（B3 接线）→ verdict_trace_json 全文含 decisionTrace。
    const expectedTrace = extractVerdictTrace(result.kernelOutput);
    assert.deepEqual(expectedTrace.decisionTrace, result.kernelOutput.decisionTrace, 'extractVerdictTrace 须透传 decisionTrace');
    assert.deepEqual(result.verdictNode.verdictTrace, expectedTrace, '落库 trace 须与 extractVerdictTrace 同源（含 decisionTrace）');

    // verdict_trace_hash 绑定含 decisionTrace 的全文（canonical·key 名与 repository.ts:91 逐字一致）。
    const traceHash = hashCanonicalJson({
      verdictTraceJson: canonicalJson(expectedTrace, 'b3'),
    });
    assert.equal(result.verdictNode.verdictTraceHash, traceHash, 'verdict_trace_hash 须绑定含 decisionTrace 的全文');

    // getVerdict round-trip：parseVerdictTrace 宽容透传读回。
    const readBack = getVerdict(db, result.verdictNode.verdictId);
    assert.deepEqual(readBack?.verdictTrace.decisionTrace, result.kernelOutput.decisionTrace, 'getVerdict 读回须含 decisionTrace');
  } finally {
    db.close();
  }
});

test('B3: 旧 trace（无 decisionTrace）→ 读回 undefined（零回归）', () => {
  const db = openDb();
  try {
    // 手动构造 A1 前旧行：verdict_trace_json 仅 4 个 verdict-critical 字段（无 decisionTrace）。
    const oldTraceJson = canonicalJson(
      {
        reasonCodes: ['R1_FEC_NOT_COMPILABLE'],
        ruleTrace: [{ ruleId: 'R1_FEC_NOT_COMPILABLE', triggered: true }],
        decisiveRuleId: 'R1_FEC_NOT_COMPILABLE',
        evidenceSufficiency: { status: 'unknown', powerStatus: 'unknown' },
      },
      'old-trace',
    );
    const oldTraceHash = hashCanonicalJson({ traceJson: oldTraceJson });
    db.pragma('foreign_keys = OFF');
    db.prepare(
      `INSERT INTO verdict_nodes
         (verdict_id, evidence_id, node_kind, verdict, falsification_spec, threshold_spec,
          source_anchor, verdict_trace_json, verdict_trace_hash, prev_hash, current_hash)
       VALUES (?, ?, 'hypothesis', 'INCONCLUSIVE', ?, ?, ?, ?, ?, '0000', '0000')`,
    ).run(
      'V-OLD',
      'E-OLD',
      canonicalJson(falsificationSpec, 'old-falsif'),
      canonicalJson(thresholdSpec, 'old-threshold'),
      canonicalJson(sourceAnchor, 'old-anchor'),
      oldTraceJson,
      oldTraceHash,
    );

    const readBack = getVerdict(db, 'V-OLD');
    assert.ok(readBack, '旧行应可读（parseVerdictTrace 对 4 个 critical 字段严格校验通过）');
    assert.equal(readBack.verdictTrace.decisionTrace, undefined, '旧 trace 无 decisionTrace → undefined（零回归）');
    // 4 个 critical 字段仍完整读回（parseVerdictTrace 不受 B3 影响）。
    assert.deepEqual(readBack.verdictTrace.reasonCodes, ['R1_FEC_NOT_COMPILABLE']);
    assert.equal(readBack.verdictTrace.decisiveRuleId, 'R1_FEC_NOT_COMPILABLE');
  } finally {
    db.close();
  }
});

test('B3: toHonestVerdictDto 透传 decisionTrace（API 暴露）', () => {
  const db = openDb();
  try {
    const result = runFecAppendClaim(db);
    const dto = toHonestVerdictDto(result.verdictNode);
    assert.deepEqual(dto.decisionTrace, result.kernelOutput.decisionTrace, 'API DTO 须透传 decisionTrace');
    // 非 null（新行有 decisionTrace）·旧行场景由 toHonestVerdictDto ?? null 处理。
    assert.notEqual(dto.decisionTrace, null);
  } finally {
    db.close();
  }
});
