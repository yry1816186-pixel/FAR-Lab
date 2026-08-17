// tests/fec/orchestrator_contract_fail_closed.test.ts
//
// EVID-RECORD-001 · orchestrator 集成测试（T-003 orchestrator_provenance_fail_closed 模式镜像）。
//
// 验证 fecAppendClaim 集成 assertPrimaryEvidenceContractBound 的 fail-closed 行为：
//   - V1 默认（requireFullEvidenceContract 缺省）→ 恒通过（向后兼容 demo seed fixture）；
//   - requireFullEvidenceContract=true + primary 证据缺 16 字段合同 → kernel 拒绝 CONFIRMED +
//     integrityFlags 含 EVIDENCE_CONTRACT_INCOMPLETE；
//   - requireFullEvidenceContract=true + primary 证据合同齐备 → kernel 正常裁决（失败路径反面）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { fecAppendClaim } from '../../src/fec/index.ts';
import { makeValidFec } from './fixtures.ts';
import type { FecContractV2 } from '../../src/fec/fec_contract.ts';
import { runMigrations } from '../../src/db/index.ts';
import { computeContractContentHash } from '../../src/evidence_quality/evidence_contract.ts';
import type { EvidenceContractV1 } from '../../src/evidence_quality/evidence_contract.ts';
import type {
  EvidenceRecord,
  FalsificationSpec,
  SourceAnchor,
  ThresholdSpec,
} from '../../src/falsifiability/index.ts';

const sourceAnchor: SourceAnchor = {
  gitCommitSha: 'b'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-08-17T00:00:00.000Z',
  rawResponseHash: 'c'.repeat(64),
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

function makeCompleteContract(): EvidenceContractV1 {
  const extractedProposition = 'sandbox recompute of split B yields accuracy 0.91 above the 0.85 threshold';
  const exactLocator = 'artifacts/metrics.json#accuracy';
  const base: Omit<EvidenceContractV1, 'contentHash'> = {
    sourceSnapshotRef: { kind: 'sandbox_run', id: 'run-ev001', snapshotHash: 'd'.repeat(64) },
    exactLocator,
    extractedProposition,
    relationToClaim: 'SUPPORTS',
    directness: 'direct',
    independence: 'independent',
    studyDesign: 'quasi_experimental',
    populationContext: 'benchmark split B (n=500)',
    effect: { estimate: 0.91, uncertainty: { kind: 'ci_95', lower: 0.88, upper: 0.93 } },
    riskOfBias: { overall: 'low', domains: [] },
    retraction: { status: 'none', checkedAt: '2026-08-17' },
    extractionMethod: 'sandbox_execution',
    extractorIdentity: { provenanceClass: 'system_derived', identity: 'sandbox_runner', systemClaimHash: null },
    confidence: 0.9,
    licenseBoundary: { license: 'cc_by', usageBoundary: 'benchmark data, attribution required' },
  };
  return { ...base, contentHash: computeContractContentHash(extractedProposition, exactLocator) };
}

interface BuildClaimArgs {
  readonly requireFullEvidenceContract?: boolean;
  readonly withContract?: boolean;
}

/** primary 证据 metricValue=0.91（满足阈值 0.85）：V1 默认应落 CONFIRMED；opt-in+缺合同 → fail-closed。 */
function buildFecAppendClaimArgs(db: Database.Database, options: BuildClaimArgs) {
  const evidences: EvidenceRecord[] = [
    {
      claim: 'measured accuracy is 0.91',
      metricValue: 0.91,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: false,
      sourceAnchor,
      ...(options.withContract === true ? { evidenceContract: makeCompleteContract() } : {}),
    },
  ];

  const fec: FecContractV2 = {
    ...makeValidFec(),
    ...(options.requireFullEvidenceContract !== undefined
      ? { requireFullEvidenceContract: options.requireFullEvidenceContract }
      : {}),
  };

  return {
    db,
    args: {
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
      evidences,
      parentVerdictId: null,
      nodeKind: 'hypothesis',
      fecV2: { contract: fec },
    } as const,
  };
}

// ===== V1 默认（向后兼容）=====

test('EVID-RECORD-001 orchestrator: V1 默认（缺省）→ 不追加 EVIDENCE_CONTRACT_INCOMPLETE（demo seed 零回归）', () => {
  const db = openDb();
  try {
    const { args } = buildFecAppendClaimArgs(db, {});
    const result = fecAppendClaim(db, args);
    assert.ok(
      !result.kernelOutput.integrityFlags.includes('EVIDENCE_CONTRACT_INCOMPLETE'),
      'V1 默认下不应追加合同 flag',
    );
    if (result.decision.untestedReason !== null) {
      assert.ok(
        !result.decision.untestedReason.includes('EVIDENCE_CONTRACT_INCOMPLETE'),
        'V1 默认下 untestedReason 不应含合同原因',
      );
    }
  } finally {
    db.close();
  }
});

// ===== opt-in + 缺合同 → fail-closed =====

test('EVID-RECORD-001 orchestrator: opt-in + primary 缺合同 → 拒绝 CONFIRMED + flag 落 trace', () => {
  const db = openDb();
  try {
    const { args } = buildFecAppendClaimArgs(db, { requireFullEvidenceContract: true });
    const result = fecAppendClaim(db, args);
    assert.ok(
      result.kernelOutput.integrityFlags.includes('EVIDENCE_CONTRACT_INCOMPLETE'),
      'integrityFlags 必须含 EVIDENCE_CONTRACT_INCOMPLETE',
    );
    assert.notEqual(result.decision.verdict, 'CONFIRMED', '无完整合同的证据不得裁决 CONFIRMED');
  } finally {
    db.close();
  }
});

// ===== opt-in + 合同齐备 → 正常裁决（失败路径反面）=====

test('EVID-RECORD-001 orchestrator: opt-in + 16 字段合同齐备 → kernel 正常裁决不受合同闸影响', () => {
  const db = openDb();
  try {
    const { args } = buildFecAppendClaimArgs(db, {
      requireFullEvidenceContract: true,
      withContract: true,
    });
    const result = fecAppendClaim(db, args);
    assert.ok(
      !result.kernelOutput.integrityFlags.includes('EVIDENCE_CONTRACT_INCOMPLETE'),
      `合同齐备时不应有合同 flag·integrityFlags: ${result.kernelOutput.integrityFlags.join(', ')}`,
    );
    // 与 T-003 先例同语义：合法路径只断言「不被合同闸拦截」（fixture 的最终 verdict 由
    // 其他 kernel 路径决定——本断言证明合同闸零误伤，不冒充 fixture 全链路断言）。
    if (result.decision.untestedReason !== null) {
      assert.ok(
        !result.decision.untestedReason.includes('EVIDENCE_CONTRACT_INCOMPLETE'),
        '合同齐备时 untestedReason 不应含合同原因',
      );
    }
  } finally {
    db.close();
  }
});
