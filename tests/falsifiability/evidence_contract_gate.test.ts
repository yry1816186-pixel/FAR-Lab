// tests/falsifiability/evidence_contract_gate.test.ts
//
// EVID-RECORD-001 接线层：assertPrimaryEvidenceContractBound fail-closed 闸
// （T-003 evidence_provenance 模式镜像——V1 默认关·requireFullEvidenceContract 开时严查）。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertPrimaryEvidenceContractBound,
  EVIDENCE_CONTRACT_INCOMPLETE_REASON_CODE,
} from '../../src/falsifiability/evidence_contract_gate.ts';
import { computeContractContentHash } from '../../src/evidence_quality/evidence_contract.ts';
import type { EvidenceContractV1 } from '../../src/evidence_quality/evidence_contract.ts';
import type { EvidenceRecord } from '../../src/falsifiability/types.ts';

function makeContract(overrides: Partial<EvidenceContractV1> = {}): EvidenceContractV1 {
  const base: EvidenceContractV1 = {
    sourceSnapshotRef: { kind: 'sandbox_run', id: 'run-2026-08-17-001', snapshotHash: 'a'.repeat(64) },
    exactLocator: 'artifacts/metrics.json#accuracy',
    extractedProposition: 'sandbox recompute yields accuracy 0.92 above the 0.8 threshold',
    relationToClaim: 'SUPPORTS',
    directness: 'direct',
    independence: 'independent',
    studyDesign: 'quasi_experimental',
    populationContext: 'benchmark split B (n=500)',
    effect: { estimate: 0.92, uncertainty: { kind: 'ci_95', lower: 0.89, upper: 0.94 } },
    riskOfBias: { overall: 'low', domains: [] },
    retraction: { status: 'none', checkedAt: '2026-08-17' },
    extractionMethod: 'sandbox_execution',
    extractorIdentity: { provenanceClass: 'system_derived', identity: 'sandbox_runner', systemClaimHash: null },
    confidence: 0.9,
    licenseBoundary: { license: 'cc_by', usageBoundary: 'benchmark data, attribution required' },
    contentHash: '',
  };
  const merged = { ...base, ...overrides };
  return { ...merged, contentHash: computeContractContentHash(merged.extractedProposition, merged.exactLocator) };
}

function makeRecord(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    claim: 'the model reaches accuracy 0.8 on split B',
    metricValue: 0.92,
    supportsClaim: true,
    refutesClaim: false,
    scopeNarrowerThanClaim: false,
    sourceAnchor: {
      gitCommitSha: 'a'.repeat(40),
      dashscopeRequestId: null,
      isoTimestamp: '2026-08-17T00:00:00Z',
      rawResponseHash: 'b'.repeat(64),
    },
    ...overrides,
  };
}

test('gate: requireFullEvidenceContract=false → 全放行（V1 默认·零回归语义）', () => {
  const records = [makeRecord()]; // 无合同
  const result = assertPrimaryEvidenceContractBound(records, { requireFullEvidenceContract: false });
  assert.equal(result.ok, true);
  assert.equal(result.reasonCode, null);
});

test('gate: requireFullEvidenceContract=true 时 primary 缺合同 → fail-closed', () => {
  const withContract = makeRecord({ evidenceContract: makeContract() });
  const without = makeRecord({ metricValue: 0.95 }); // 第二条 primary 无合同
  const result = assertPrimaryEvidenceContractBound([withContract, without], {
    requireFullEvidenceContract: true,
    claimId: 'claim-gate-1',
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failingEvidenceIndices, [1]);
  assert.equal(result.reasonCode, EVIDENCE_CONTRACT_INCOMPLETE_REASON_CODE);
  assert.match(result.error ?? '', /claim-gate-1/);
  assert.match(result.error ?? '', /fail-closed, no verdict/);
});

test('gate: 反证证据（refutesClaim=true）不属 primary，缺合同不拦（与 T-003 同语义）', () => {
  const refuting = makeRecord({ supportsClaim: false, refutesClaim: true });
  const result = assertPrimaryEvidenceContractBound([refuting], { requireFullEvidenceContract: true });
  assert.equal(result.ok, true);
});

test('gate: 合同存在但内容违规（hash 篡改/自填来源）→ fail-closed 且违规明细可见', () => {
  const signed = makeContract();
  const tampered: EvidenceRecord = {
    ...makeRecord(),
    evidenceContract: { ...signed, extractedProposition: 'sandbox recompute yields accuracy 0.999 (post-hoc edit)' },
  };
  const tamperedResult = assertPrimaryEvidenceContractBound([tampered], { requireFullEvidenceContract: true });
  assert.equal(tamperedResult.ok, false);
  assert.equal(tamperedResult.violations.some((v) => v.rule === 'CONTENT_HASH_MISMATCH'), true);

  const forged: EvidenceRecord = {
    ...makeRecord(),
    evidenceContract: makeContract({
      extractorIdentity: { provenanceClass: 'llm_generated', identity: 'qwen', systemClaimHash: null },
    }),
  };
  const forgedResult = assertPrimaryEvidenceContractBound([forged], { requireFullEvidenceContract: true });
  assert.equal(forgedResult.ok, false);
  assert.equal(forgedResult.violations.some((v) => v.rule === 'EXTRACTOR_SELF_FILLED'), true);
});

test('gate: 合同形状损坏（多余字段裁掉后过不了 zod）→ fail-closed', () => {
  // JSON 边界单次 cast 注入损坏形状（unknown 双重 cast 为零容忍禁用模式）
  const broken = { ...makeContract() } as Record<string, unknown>;
  delete broken.retraction;
  const recordWithBroken = JSON.parse(
    JSON.stringify({ ...makeRecord(), evidenceContract: broken }),
  ) as EvidenceRecord;
  const result = assertPrimaryEvidenceContractBound(
    [recordWithBroken],
    { requireFullEvidenceContract: true },
  );
  assert.equal(result.ok, false);
  assert.equal(result.violations.some((v) => v.detail.includes('retraction')), true);
});

test('gate: strict 模式把 unspecified 占位当不完整；非 strict 放行', () => {
  const placeholder = makeContract({ studyDesign: 'unspecified' });
  const strict = assertPrimaryEvidenceContractBound(
    [makeRecord({ evidenceContract: placeholder })],
    { requireFullEvidenceContract: true, strict: true },
  );
  assert.equal(strict.ok, false);
  const lenient = assertPrimaryEvidenceContractBound(
    [makeRecord({ evidenceContract: placeholder })],
    { requireFullEvidenceContract: true },
  );
  assert.equal(lenient.ok, true);
});

test('gate: 全齐备 primary（含合同）→ 通过（失败路径的反面）', () => {
  const result = assertPrimaryEvidenceContractBound(
    [makeRecord({ evidenceContract: makeContract() })],
    { requireFullEvidenceContract: true, strict: true, claimId: 'c1' },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
});
