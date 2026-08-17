// tests/evidence_quality/evidence_contract.test.ts
//
// EVID-RECORD-001 验收（宪法原文）：「schema、claim mismatch、duplicate source、
// contradictory evidence tests 通过。Evidence：golden evidence corpus。」
// 全部确定性纯函数测试；golden corpus 覆盖四值关系各一 + 对抗样本（撤稿支持/自填来源/hash 篡改）。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { EvidenceContractV1 as EvidenceContractV1Type } from '../../src/evidence_quality/evidence_contract.ts';
import {
  EvidenceContractV1Schema,
  computeContractContentHash,
  detectClaimMismatch,
  detectDuplicateSources,
  structureContradictions,
  validateEvidenceContract,
  } from '../../src/evidence_quality/evidence_contract.ts';

// ============================================================
// golden evidence corpus —— 判据指定的 Evidence 工件
// ============================================================

function goldenContract(overrides: Partial<EvidenceContractV1Type> = {}): EvidenceContractV1Type {
  const base: EvidenceContractV1Type = {
    sourceSnapshotRef: { kind: 'literature_api', id: 'openalex:W2741809807', snapshotHash: 'a'.repeat(64) },
    exactLocator: 'doi:10.1126/science.aac4716·table-s2',
    extractedProposition: 'OSC 2015 pooled effect: 9.9% symbolic racial bias reduction, 95% CI [4.1, 15.8]',
    relationToClaim: 'SUPPORTS',
    directness: 'direct',
    independence: 'independent',
    studyDesign: 'rct',
    populationContext: 'policemen in Rajasthan, India (n=7615)',
    effect: { estimate: 9.9, uncertainty: { kind: 'ci_95', lower: 4.1, upper: 15.8 } },
    riskOfBias: {
      overall: 'low',
      domains: [
        { domain: 'sequence_generation', risk: 'low' },
        { domain: 'selective_reporting', risk: 'low' },
      ],
    },
    retraction: { status: 'none', checkedAt: '2026-08-17' },
    extractionMethod: 'structured_llm_extraction',
    extractorIdentity: {
      provenanceClass: 'llm_generated',
      identity: 'qwen3.7-max',
      systemClaimHash: 'f'.repeat(64),
    },
    confidence: 0.82,
    licenseBoundary: { license: 'cc_by', usageBoundary: 'attribution required, no modification of findings' },
    contentHash: '',
  };
  const merged = { ...base, ...overrides };
  return { ...merged, contentHash: computeContractContentHash(merged.extractedProposition, merged.exactLocator) };
}

/** 四值关系各一的 golden 集 + 对抗样本。 */
export const GOLDEN_CORPUS: readonly { readonly name: string; readonly contract: EvidenceContractV1Type }[] = [
  { name: 'supports/rct/low-rob', contract: goldenContract() },
  {
    name: 'contradicts/observational/high-rob',
    contract: goldenContract({
      sourceSnapshotRef: { kind: 'corpus_snapshot', id: 'snap:replication-banaji-2017', snapshotHash: 'b'.repeat(64) },
      exactLocator: 'doi:10.1126/science.aan6374·fig-1',
      extractedProposition: 'registered replication failed to reproduce the symbolic racial bias reduction effect',
      relationToClaim: 'CONTRADICTS',
      studyDesign: 'quasi_experimental',
      directness: 'direct',
      confidence: 0.74,
    }),
  },
  {
    name: 'qualifies/scope-limit',
    contract: goldenContract({
      exactLocator: 'doi:10.1126/science.aac4716·discussion-p4',
      extractedProposition: 'the effect holds only for implicit-symbolic measures, not explicit behavioral outcomes',
      relationToClaim: 'QUALIFIES',
      directness: 'indirect',
      confidence: 0.55,
    }),
  },
  {
    name: 'neutral/background',
    contract: goldenContract({
      sourceSnapshotRef: { kind: 'literature_api', id: 'openalex:W2795431', snapshotHash: 'd'.repeat(64) },
      exactLocator: 'doi:10.1037/0033-2909.126.1.3·intro',
      extractedProposition: 'implicit attitude measures were developed in the 1990s as reaction-time paradigms',
      relationToClaim: 'NEUTRAL',
      directness: 'background',
      confidence: 0.4,
    }),
  },
];

// ============================================================
// 1. schema tests
// ============================================================

test('schema: golden corpus 四条全部通过 zod 校验（16 字段完备）', () => {
  for (const g of GOLDEN_CORPUS) {
    const parsed = EvidenceContractV1Schema.safeParse(g.contract);
    assert.equal(parsed.success, true, `${g.name}: ${parsed.success ? '' : JSON.stringify(parsed.error.issues)}`);
  }
});

test('schema fail-closed: 缺字段/越界值/坏 hash 格式全部拒绝', () => {
  const requiredFields = [
    'sourceSnapshotRef',
    'exactLocator',
    'extractedProposition',
    'relationToClaim',
    'directness',
    'independence',
    'studyDesign',
    'populationContext',
    'effect',
    'riskOfBias',
    'retraction',
    'extractionMethod',
    'extractorIdentity',
    'confidence',
    'licenseBoundary',
    'contentHash',
  ] as const;
  assert.equal(requiredFields.length, 16);
  for (const field of requiredFields) {
    const partial = { ...goldenContract() } as Record<string, unknown>;
    delete partial[field];
    assert.equal(
      EvidenceContractV1Schema.safeParse(partial).success,
      false,
      `missing ${field} must be rejected`,
    );
  }
  // 越界/非法枚举
  assert.equal(EvidenceContractV1Schema.safeParse(goldenContract({ relationToClaim: 'PROVES' as EvidenceContractV1Type['relationToClaim'] })).success, false);
  assert.equal(EvidenceContractV1Schema.safeParse(goldenContract({ confidence: 1.5 })).success, false);
  // contentHash 必须 64-hex（goldenContract 会覆写后重算——bad-hash 需在成品上展开注入）
  assert.equal(
    EvidenceContractV1Schema.safeParse({ ...goldenContract(), contentHash: 'not-hex' }).success,
    false,
  );
});

// ============================================================
// 2. validateEvidenceContract —— 内容完整性（含失败路径）
// ============================================================

test('validate: golden 四条零违规（含 strict 模式）', () => {
  for (const g of GOLDEN_CORPUS) {
    assert.deepEqual(validateEvidenceContract(g.contract), [], g.name);
    assert.deepEqual(validateEvidenceContract(g.contract, { strict: true }), [], `${g.name} strict`);
  }
});

test('validate fail-closed: contentHash 篡改检出（proposition 被事后改写）', () => {
  const signed = goldenContract();
  const tampered: EvidenceContractV1Type = {
    ...signed,
    extractedProposition: 'OSC 2015 pooled effect: 99% reduction (exaggerated post-hoc)',
  };
  const violations = validateEvidenceContract(tampered);
  assert.equal(violations.some((v) => v.rule === 'CONTENT_HASH_MISMATCH'), true);
});

test('validate fail-closed: llm_generated 无 systemClaimHash = 来源自填', () => {
  const forged = goldenContract({
    extractorIdentity: { provenanceClass: 'llm_generated', identity: 'qwen3.7-max', systemClaimHash: null },
  });
  assert.equal(
    validateEvidenceContract(forged).some((v) => v.rule === 'EXTRACTOR_SELF_FILLED'),
    true,
  );
});

test('validate fail-closed: 撤稿源仍 SUPPORTS 拒绝；降级后接受', () => {
  const retractedSupporting = goldenContract({
    retraction: { status: 'retracted', checkedAt: '2026-08-17' },
  });
  assert.equal(
    validateEvidenceContract(retractedSupporting).some((v) => v.rule === 'RETRACTED_BUT_SUPPORTS'),
    true,
  );
  const retractedContradicting = goldenContract({
    retraction: { status: 'retracted', checkedAt: '2026-08-17' },
    relationToClaim: 'CONTRADICTS',
    extractedProposition: 'this source was retracted; its original supporting finding no longer stands',
  });
  assert.deepEqual(validateEvidenceContract(retractedContradicting), []);
});

test('validate strict: unspecified/unclear 占位不算完整合同；非 strict 放行', () => {
  const placeholder = goldenContract({ studyDesign: 'unspecified', retraction: { status: 'unclear', checkedAt: null } });
  const strictViolations = validateEvidenceContract(placeholder, { strict: true });
  assert.equal(strictViolations.filter((v) => v.rule === 'UNSPECIFIED_CRITICAL_FIELD').length, 2);
  assert.deepEqual(validateEvidenceContract(placeholder), []);
});

// ============================================================
// 3. claim mismatch —— 确定性词法基线
// ============================================================

test('mismatch: 高重叠命题不误报；张冠李戴命题命中（且是标记而非丢弃）', () => {
  const claim = 'the OSC 2015 police intervention reduced symbolic racial bias';
  const aligned = goldenContract(); // 命题与声明共享 osc/2015/police/symbolic/racial/bias
  const ok = detectClaimMismatch(aligned, claim);
  assert.equal(ok.mismatch, false, `overlap=${ok.overlap}`);

  const alien = goldenContract({
    extractedProposition: 'coral reef bleaching increased across the Great Barrier in 2016',
  });
  const alienResult = detectClaimMismatch(alien, claim);
  assert.equal(alienResult.mismatch, true, `overlap=${alienResult.overlap}`);
  assert.ok(alienResult.overlap < alienResult.threshold);
});

test('mismatch: 空文本 fail-closed（overlap=0 视为 mismatch）', () => {
  assert.equal(detectClaimMismatch(goldenContract(), '').mismatch, true);
});

// ============================================================
// 4. duplicate source
// ============================================================

test('duplicates: 同源同定位符成组；不同定位符不成组', () => {
  const a = goldenContract();
  const aCopy = goldenContract({ confidence: 0.9 }); // 同源同 locator，不同字段
  const sameSourceOtherLocator = goldenContract({ exactLocator: 'doi:10.1126/science.aac4716·fig-3' });
  const other = GOLDEN_CORPUS[1]!.contract;

  const groups = detectDuplicateSources([a, aCopy, sameSourceOtherLocator, other]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0]!.indices, [0, 1]);
  assert.match(groups[0]!.sourceKey, /aac4716/);
});

test('duplicates: 无重复时空结果（失败路径的反面）', () => {
  assert.deepEqual(detectDuplicateSources(GOLDEN_CORPUS.map((g) => g.contract)), []);
});

// ============================================================
// 5. contradictory evidence —— 保留并结构化
// ============================================================

test('contradictions: 同源 SUPPORTS+CONTRADICTS 成簇保留（双证都不丢）', () => {
  const supports = goldenContract();
  const contradictsSameSource = goldenContract({
    extractedProposition: 're-analysis of the same trial data finds the effect indistinguishable from zero',
    relationToClaim: 'CONTRADICTS',
  });
  const clusters = structureContradictions([supports, contradictsSameSource]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0]!.indexA, 0);
  assert.equal(clusters[0]!.indexB, 1);
  // 两条证据都还在输入里（函数纯·不丢弃）
  assert.equal(supports.relationToClaim, 'SUPPORTS');
  assert.equal(contradictsSameSource.relationToClaim, 'CONTRADICTS');
});

test('contradictions: 跨源矛盾不成本函数的簇（kernel R5/R6 职责·不越权）；QUALIFIES/NEUTRAL 不入簇', () => {
  const supports = goldenContract();
  const crossSourceContradicts = goldenContract({
    sourceSnapshotRef: { kind: 'corpus_snapshot', id: 'snap:other-study', snapshotHash: 'c'.repeat(64) },
    relationToClaim: 'CONTRADICTS',
    extractedProposition: 'an independent lab found no effect',
  });
  assert.deepEqual(structureContradictions([supports, crossSourceContradicts]), []);

  const qualifiesSameSource = goldenContract({
    relationToClaim: 'QUALIFIES',
    extractedProposition: 'same-trial scope qualifier',
  });
  assert.deepEqual(structureContradictions([supports, qualifiesSameSource]), []);
});

// ============================================================
// 6. 确定性
// ============================================================

test('determinism: 同输入同输出（hash/校验/检测全部字节等同）', () => {
  const corpus = GOLDEN_CORPUS.map((g) => g.contract);
  const run = (): string =>
    JSON.stringify({
      validations: corpus.map((c) => validateEvidenceContract(c, { strict: true })),
      dup: detectDuplicateSources([...corpus, corpus[0]!]),
      contra: structureContradictions(corpus),
    });
  assert.equal(run(), run());
});
