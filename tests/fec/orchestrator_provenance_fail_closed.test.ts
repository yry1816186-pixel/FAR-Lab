// tests/fec/orchestrator_provenance_fail_closed.test.ts
//
// T-003 · orchestrator 集成回归测试（2026-07-24 评委逼问第 1 轮 F-2-005 修复）。
//
// 验证 fecAppendClaim 集成 assertPrimaryEvidenceProvenanceBound 的 fail-closed 行为：
//   - V1 默认（requireExecutionProvenance 缺省）→ 恒通过（向后兼容 demo seed fixture）；
//   - requireExecutionProvenance=true + primary 证据缺 hash → kernel 拒绝 CONFIRMED + untestedReason
//     含 EVIDENCE_PROVENANCE_UNBOUND + integrityFlags 含 EVIDENCE_PROVENANCE_UNBOUND；
//   - requireExecutionProvenance=true + primary 证据合法 hash → 不受影响（kernel 正常裁决）。
//
// 核心断言：fixture 冒充真实计算结果时，系统 fail-closed 拒绝裁决（不再可能落 CONFIRMED）。
//
// Authority: 评审记录/总榜_v1.md T-003 + 1轮/评委02_发现.md F-2-005 +
//            src/fec/orchestrator.ts:168-221（provenance 校验集成点）+
//            src/falsifiability/evidence_provenance.ts 行为契约注释。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { fecAppendClaim } from '../../src/fec/index.ts';
import { makeValidFec } from './fixtures.ts';
import type { FecContractV2 } from '../../src/fec/fec_contract.ts';
import { runMigrations } from '../../src/db/index.ts';
import type {
  EvidenceRecord,
  FalsificationSpec,
  SourceAnchor,
  ThresholdSpec,
} from '../../src/falsifiability/index.ts';

const HEX64 = 'a'.repeat(64);

const sourceAnchor: SourceAnchor = {
  gitCommitSha: 'b'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-07-24T00:00:00.000Z',
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

interface BuildClaimArgs {
  readonly requireExecutionProvenance?: boolean;
  readonly primaryHash?: string | undefined;
}

/**
 * 构造一次 fecAppendClaim 调用：primary 证据 metricValue=0.91（满足阈值 0.85）。
 * 在 V1 默认下应落 CONFIRMED（若 kernel R7 通过）；opt-in + 缺 hash → fail-closed 拒绝 CONFIRMED。
 */
function buildFecAppendClaimArgs(db: Database.Database, options: BuildClaimArgs) {
  const evidences: EvidenceRecord[] = [
    {
      claim: 'measured accuracy is 0.91',
      metricValue: 0.91,
      supportsClaim: true,
      refutesClaim: false,
      scopeNarrowerThanClaim: false,
      sourceAnchor,
      ...(options.primaryHash !== undefined
        ? { executionProvenanceHash: options.primaryHash }
        : {}),
    },
  ];

  const fec: FecContractV2 = {
    ...makeValidFec(),
    ...(options.requireExecutionProvenance !== undefined
      ? { requireExecutionProvenance: options.requireExecutionProvenance }
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

test('T-003 orchestrator: V1 默认（requireExecutionProvenance 缺省）→ 不触发 fail-closed（向后兼容 demo seed）', () => {
  const db = openDb();
  try {
    const { args } = buildFecAppendClaimArgs(db, {}); // 不 opt-in
    const result = fecAppendClaim(db, args);

    // V1 默认不强制 provenance → 不追加 EVIDENCE_PROVENANCE_UNBOUND flag
    assert.ok(
      !result.kernelOutput.integrityFlags.includes('EVIDENCE_PROVENANCE_UNBOUND'),
      'V1 默认下不应追加 EVIDENCE_PROVENANCE_UNBOUND flag',
    );
    // untestedReason 不应含 EVIDENCE_PROVENANCE_UNBOUND（要么 null 要么其他原因）
    if (result.decision.untestedReason !== null) {
      assert.ok(
        !result.decision.untestedReason.includes('EVIDENCE_PROVENANCE_UNBOUND'),
        'V1 默认下 untestedReason 不应含 EVIDENCE_PROVENANCE_UNBOUND',
      );
    }
  } finally {
    db.close();
  }
});

// ===== opt-in + primary 缺 hash → fail-closed =====

test('T-003 orchestrator: opt-in + primary 证据缺 executionProvenanceHash → fail-closed 拒绝 CONFIRMED（EVIDENCE_PROVENANCE_UNBOUND）', () => {
  const db = openDb();
  try {
    const { args } = buildFecAppendClaimArgs(db, {
      requireExecutionProvenance: true,
      primaryHash: undefined, // primary 缺 hash
    });
    const result = fecAppendClaim(db, args);

    // 核心断言 1：verdict 绝不是 CONFIRMED（fail-closed 阻断）
    assert.notEqual(
      result.decision.verdict,
      'CONFIRMED',
      'T-003 fail-closed: opt-in + primary 缺 hash 时禁止落 CONFIRMED（fixture 冒充真实计算结果）',
    );

    // 核心断言 2：integrityFlags 含 EVIDENCE_PROVENANCE_UNBOUND（kernel R7 阻断 CONFIRMED）
    assert.ok(
      result.kernelOutput.integrityFlags.includes('EVIDENCE_PROVENANCE_UNBOUND'),
      `integrityFlags 须含 EVIDENCE_PROVENANCE_UNBOUND·实际: ${result.kernelOutput.integrityFlags.join(', ')}`,
    );

    // 核心断言 3：untestedReason 含 EVIDENCE_PROVENANCE_UNBOUND（评委审计可读）
    assert.ok(
      result.decision.untestedReason !== null,
      'fail-closed 时 untestedReason 须非空',
    );
    assert.ok(
      result.decision.untestedReason!.includes('EVIDENCE_PROVENANCE_UNBOUND'),
      `untestedReason 须含 EVIDENCE_PROVENANCE_UNBOUND·实际: ${result.decision.untestedReason}`,
    );
    assert.ok(
      result.decision.untestedReason!.includes('[CLAIM-0001]'),
      'untestedReason 须含 claimId 前缀 [CLAIM-0001]',
    );
    assert.ok(
      result.decision.untestedReason!.includes('requireExecutionProvenance=true'),
      'untestedReason 须含 requireExecutionProvenance=true 标识',
    );

    // 核心断言 4：verdict_nodes 落库 verdict ≠ CONFIRMED
    assert.notEqual(result.verdictNode.verdict, 'CONFIRMED');
  } finally {
    db.close();
  }
});

test('T-003 orchestrator: opt-in + primary 证据格式错 hash → fail-closed（与缺 hash 同行为）', () => {
  const db = openDb();
  try {
    const { args } = buildFecAppendClaimArgs(db, {
      requireExecutionProvenance: true,
      primaryHash: 'not-a-hash', // 格式错
    });
    const result = fecAppendClaim(db, args);

    assert.notEqual(result.decision.verdict, 'CONFIRMED');
    assert.ok(
      result.kernelOutput.integrityFlags.includes('EVIDENCE_PROVENANCE_UNBOUND'),
    );
    assert.ok(
      result.decision.untestedReason!.includes('EVIDENCE_PROVENANCE_UNBOUND'),
    );
  } finally {
    db.close();
  }
});

// ===== opt-in + primary 合法 hash → 不受影响（kernel 正常裁决）=====

test('T-003 orchestrator: opt-in + primary 证据合法 64-hex hash → 不触发 fail-closed（合法路径不误伤）', () => {
  const db = openDb();
  try {
    const { args } = buildFecAppendClaimArgs(db, {
      requireExecutionProvenance: true,
      primaryHash: HEX64, // 合法 64-hex sha256
    });
    const result = fecAppendClaim(db, args);

    // 合法 hash → 不追加 EVIDENCE_PROVENANCE_UNBOUND flag
    assert.ok(
      !result.kernelOutput.integrityFlags.includes('EVIDENCE_PROVENANCE_UNBOUND'),
      `合法 hash 不应触发 fail-closed·integrityFlags: ${result.kernelOutput.integrityFlags.join(', ')}`,
    );
    // untestedReason 不应含 EVIDENCE_PROVENANCE_UNBOUND
    if (result.decision.untestedReason !== null) {
      assert.ok(
        !result.decision.untestedReason.includes('EVIDENCE_PROVENANCE_UNBOUND'),
        '合法 hash 时 untestedReason 不应含 EVIDENCE_PROVENANCE_UNBOUND',
      );
    }
  } finally {
    db.close();
  }
});

// ===== opt-in + 仅 secondary/refutes 缺 hash → 不强制（不误伤）=====

test('T-003 orchestrator: opt-in + 仅 refutes 证据缺 hash → 不触发 fail-closed（refutes 不强制 provenance）', () => {
  const db = openDb();
  try {
    const evidences: EvidenceRecord[] = [
      // primary 有合法 hash
      {
        claim: 'measured accuracy is 0.91',
        metricValue: 0.91,
        supportsClaim: true,
        refutesClaim: false,
        scopeNarrowerThanClaim: false,
        sourceAnchor,
        executionProvenanceHash: HEX64,
      },
      // refutes 证据无 hash（不强制·R6_REFUTED 处理）
      {
        claim: 'control group shows 0.5',
        metricValue: -0.5,
        supportsClaim: false,
        refutesClaim: true,
        scopeNarrowerThanClaim: false,
        sourceAnchor,
        // executionProvenanceHash 缺
      },
    ];

    const fec: FecContractV2 = {
      ...makeValidFec(),
      requireExecutionProvenance: true,
    };

    const result = fecAppendClaim(db, {
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
      evidences,
      parentVerdictId: null,
      nodeKind: 'hypothesis',
      fecV2: { contract: fec },
    });

    // 仅 refutes 缺 hash → 不追加 EVIDENCE_PROVENANCE_UNBOUND flag
    assert.ok(
      !result.kernelOutput.integrityFlags.includes('EVIDENCE_PROVENANCE_UNBOUND'),
      'refutes 证据缺 hash 不应触发 fail-closed（仅 primary 强制）',
    );
  } finally {
    db.close();
  }
});
