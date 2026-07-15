import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ulid } from 'ulid';

// ===== Imports from multimodal adapter =====
import {
  QWEN_VL_DEFAULT_MODEL,
  QWEN_VL_MODELS,
  CROSS_MODAL_THRESHOLD,
  isQwenVlModel,
} from '../../src/llm_gateway/adapters/aliyun_qwen_vl/types.ts';
import type {
  MultimodalContentInput,
} from '../../src/llm_gateway/adapters/aliyun_qwen_vl/types.ts';

import {
  createMultimodalGate,
  inputHasImage,
  promptLooksLikeItNeedsVision,
} from '../../src/llm_gateway/adapters/aliyun_qwen_vl/multimodal_gate.ts';

import {
  createCrossModalVerifier,
  createDeterministicSimilarityCalculator,
  deterministicCosineSimilarity,
  deterministicRecheck,
  compareStructuredClaims,
} from '../../src/llm_gateway/adapters/aliyun_qwen_vl/cross_modal_verification.ts';

import {
  createMultimodalEvidenceCard,
  computeContentHash,
  computeByteSize,
  createFixtureVlmResult,
  recordVlmCall,
  buildVlmSourceAnchor,
} from '../../src/llm_gateway/adapters/aliyun_qwen_vl/evidence_integration.ts';

// ===== Imports from core =====
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import type {
  ProviderAdapter,
} from '../../src/llm_gateway/types.ts';
import { verifyChainHead } from '../../src/evidence_log/index.ts';
import { runMigrations } from '../../src/db/index.ts';

// ===== DB setup =====

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

// ===== Test fixture =====
const SAMPLE_BASE64_1x1_RED_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

function createTextAdapter(): ProviderAdapter {
  return createOfflineReplayAdapter({
    fixtureResponse: '这是一段关于图像中趋势的文本描述。',
    now: () => '2026-06-27T00:00:00.000Z',
  });
}

// =============================================================================
// §1 Types & Constants
// =============================================================================

test('QWEN_VL_MODELS contains expected models', () => {
  assert.ok(QWEN_VL_MODELS.includes('qwen-vl-max'));
  assert.ok(QWEN_VL_MODELS.includes('qwen-vl-plus'));
});

test('QWEN_VL_DEFAULT_MODEL is qwen-vl-max', () => {
  assert.equal(QWEN_VL_DEFAULT_MODEL, 'qwen-vl-max');
});

test('isQwenVlModel correctly identifies VL models', () => {
  assert.equal(isQwenVlModel('qwen-vl-max'), true);
  assert.equal(isQwenVlModel('qwen-vl-plus'), true);
  assert.equal(isQwenVlModel('qwen-max'), false);
  assert.equal(isQwenVlModel('gpt-4o'), false);
});

test('CROSS_MODAL_THRESHOLD is 0.6 per spec', () => {
  assert.equal(CROSS_MODAL_THRESHOLD, 0.6);
});

// =============================================================================
// §2 MultimodalGate — routing decisions
// =============================================================================

test('inputHasImage detects imageRef', () => {
  const input: MultimodalContentInput = {
    imageRef: '/evidence/plot.png',
    mimeType: 'image/png',
    prompt: '这张图显示了什么？',
  };
  assert.equal(inputHasImage(input), true);
});

test('inputHasImage detects imageBase64', () => {
  const input: MultimodalContentInput = {
    imageBase64: SAMPLE_BASE64_1x1_RED_PNG,
    mimeType: 'image/png',
    prompt: '描述这张图片',
  };
  assert.equal(inputHasImage(input), true);
});

test('inputHasImage returns false for text-only input', () => {
  const input: MultimodalContentInput = {
    mimeType: 'image/png',
    prompt: '没有图片，只有文字',
  };
  assert.equal(inputHasImage(input), false);
});

test('promptLooksLikeItNeedsVision detects Chinese vision keywords', () => {
  assert.equal(promptLooksLikeItNeedsVision('请分析图中的数据趋势'), true);
  assert.equal(promptLooksLikeItNeedsVision('图中曲线显示了什么'), true);
  assert.equal(promptLooksLikeItNeedsVision('这段图表说明了什么'), true);
});

test('promptLooksLikeItNeedsVision returns false for pure text prompts', () => {
  assert.equal(promptLooksLikeItNeedsVision('请写一个排序算法'), false);
  assert.equal(promptLooksLikeItNeedsVision('什么是FAR-Chain'), false);
});

test('MultimodalGate.decide routes image input to vision', () => {
  const textAdapter = createTextAdapter();
  // Create a fake vision provider since we cannot actually call Qwen-VL in tests
  const visionProvider = {
    profile: 'competition_aliyun_qwen' as const,
    declaresVisionCapability: () => false, // no DASHSCOPE_API_KEY in test
    interpret: async () => {
      throw new Error('not implemented in test');
    },
  };

  const gate = createMultimodalGate({ textAdapter, visionProvider });

  const decision = gate.decide({
    imageRef: '/evidence/chart.png',
    mimeType: 'image/png',
    prompt: '图表中的 Y 轴最大值是多少？',
  });

  assert.equal(decision.kind, 'vision');
  assert.match(decision.reason, /image content detected but VLM is not available/);
});

test('MultimodalGate.decide routes pure text to text_only', () => {
  const textAdapter = createTextAdapter();
  const visionProvider = {
    profile: 'competition_aliyun_qwen' as const,
    declaresVisionCapability: () => false,
    interpret: async () => {
      throw new Error('not implemented');
    },
  };

  const gate = createMultimodalGate({ textAdapter, visionProvider });

  const decision = gate.decide({
    prompt: '什么是科学方法？',
  });

  assert.equal(decision.kind, 'text_only');
});

test('MultimodalGate.isVisionAvailable returns false without API key', () => {
  const textAdapter = createTextAdapter();
  const visionProvider = {
    profile: 'competition_aliyun_qwen' as const,
    declaresVisionCapability: () => false,
    interpret: async () => {
      throw new Error('not implemented');
    },
  };

  const gate = createMultimodalGate({ textAdapter, visionProvider });
  assert.equal(gate.isVisionAvailable(), false);
});

test('MultimodalGate exposes correct profiles', () => {
  const textAdapter = createTextAdapter();
  const visionProvider = {
    profile: 'competition_aliyun_qwen' as const,
    declaresVisionCapability: () => false,
    interpret: async () => {
      throw new Error('not implemented');
    },
  };

  const gate = createMultimodalGate({ textAdapter, visionProvider });
  assert.equal(gate.textProfile, 'offline_replay');
  assert.equal(gate.visionProfile, 'competition_aliyun_qwen');
});

// =============================================================================
// §3 CrossModalVerification
// =============================================================================

test('deterministicCosineSimilarity identical texts = 1.0', () => {
  const text = '图中显示温度随时间上升，从20度升至80度。';
  const similarity = deterministicCosineSimilarity(text, text);
  assert.ok(similarity > 0.999);
});

test('deterministicCosineSimilarity unrelated texts < 0.3', () => {
  const textA = '图中显示温度随时间上升，从20度升至80度。';
  const textB = '爱因斯坦的相对论改变了物理学的基础范式。';
  const similarity = deterministicCosineSimilarity(textA, textB);
  assert.ok(similarity < 0.3, `expected < 0.3 but got ${similarity}`);
});

test('deterministicCosineSimilarity semantically similar texts > 0.5', () => {
  const textA = '图中显示温度从20度上升到80度，呈线性增长。';
  const textB = '图表表明温度由20度增加至80度，趋势为线性上升。';
  const similarity = deterministicCosineSimilarity(textA, textB);
  assert.ok(similarity > 0.5, `expected > 0.5 but got ${similarity}`);
});

test('deterministicCosineSimilarity empty text returns 0', () => {
  assert.equal(deterministicCosineSimilarity('', 'anything'), 0);
  assert.equal(deterministicCosineSimilarity('anything', ''), 0);
});

test('CrossModalVerifier.verify produces passed when similarity >= threshold', () => {
  const verifier = createCrossModalVerifier({ threshold: 0.1 });

  const result = verifier.verify({
    cardId: ulid(),
    textClaim: '图中温度上升',
    vlmInterpretation: '图中温度呈上升趋势',
    imageEmbeddingCallRecordSeq: 1,
  });

  assert.equal(result.passed, true);
  assert.equal(result.failureCode, null);
  assert.ok(result.cosineSimilarity > 0.1);
  assert.ok(result.crossCheckId.length > 0);
});

test('CrossModalVerifier.verify produces failed when similarity < threshold', () => {
  const verifier = createCrossModalVerifier({ threshold: 0.95 });

  const result = verifier.verify({
    cardId: ulid(),
    textClaim: '温度上升',
    vlmInterpretation: '爱因斯坦的相对论改变了物理学',
    imageEmbeddingCallRecordSeq: 2,
  });

  assert.equal(result.passed, false);
  assert.equal(result.failureCode, 'multimodal_cross_check_failed');
});

test('CrossModalVerifier uses default threshold 0.6', () => {
  const verifier = createCrossModalVerifier();
  assert.equal(verifier.threshold, 0.6);
});

// =============================================================================
// §4 VLM Recheck（二次校验）
// =============================================================================

test('deterministicRecheck consistent when similarity is high', () => {
  // Use near-identical texts so similarity is well above the 0.7 threshold
  const result = deterministicRecheck(
    '图中显示一条上升的曲线 Y轴最大值约为100 温度从20度升至85度',
    '图中显示一条上升的曲线 Y轴最大值约为100 温度从20度升至85度',
  );

  assert.equal(result.consistent, true);
  assert.ok(result.similarity >= 0.7, `expected >= 0.7 but got ${result.similarity}`);
  assert.equal(result.discrepancyReason, null);
});

test('deterministicRecheck inconsistent when interpretations differ', () => {
  // Use completely different texts so similarity falls well below the 0.7 threshold
  const result = deterministicRecheck(
    '温度上升趋势 从20度升至80度 曲线递增 最大值在右侧 实验成功',
    '爱因斯坦相对论 引力波探测 黑洞照片 量子纠缠 暗物质分布',
  );

  assert.equal(result.consistent, false);
  assert.notEqual(result.discrepancyReason, null);
  assert.match(result.discrepancyReason ?? '', /recheck similarity/);
});

// =============================================================================
// §5 compareStructuredClaims
// =============================================================================

test('compareStructuredClaims reports full match', () => {
  const claimA = { trend: '上升', maxValue: 100, minValue: 10 };
  const claimB = { trend: '上升', maxValue: 100, minValue: 10 };

  const result = compareStructuredClaims(claimA, claimB);
  assert.equal(result.matchRatio, 1);
  assert.equal(result.mismatchedKeys.length, 0);
});

test('compareStructuredClaims reports partial match', () => {
  const claimA = { trend: '上升', maxValue: 100, minValue: 10 };
  const claimB = { trend: '上升', maxValue: 200, minValue: 10 };

  const result = compareStructuredClaims(claimA, claimB);
  assert.ok(result.matchRatio < 1);
  assert.ok(result.mismatchedKeys.includes('maxValue'));
});

test('compareStructuredClaims handles empty claims', () => {
  const result = compareStructuredClaims({}, {});
  assert.equal(result.matchRatio, 1);
});

// =============================================================================
// §6 MultimodalEvidenceCard creation
// =============================================================================

test('createMultimodalEvidenceCard produces valid card', () => {
  const card = createMultimodalEvidenceCard({
    mediaKind: 'image',
    imageBase64: SAMPLE_BASE64_1x1_RED_PNG,
    mimeType: 'image/png',
    sourceAnchor: 'evidence_01J00000000000000000000000',
    caption: '红色1x1像素测试图像',
    producedByCallRecordSeq: 1,
  });

  assert.ok(card.cardId.length > 0);
  assert.equal(card.mediaKind, 'image');
  assert.equal(card.mimeType, 'image/png');
  assert.ok(card.byteSize > 0, 'byteSize must be > 0');
  assert.equal(card.byteSize, computeByteSize(SAMPLE_BASE64_1x1_RED_PNG));
  assert.equal(card.status, 'untested'); // no recheck → untested
});

test('createMultimodalEvidenceCard with recheck + high similarity → verified', () => {
  const card = createMultimodalEvidenceCard({
    mediaKind: 'chart',
    imageBase64: SAMPLE_BASE64_1x1_RED_PNG,
    mimeType: 'image/png',
    sourceAnchor: 'evidence_01J00000000000000000000001',
    caption: '温度变化趋势图',
    producedByCallRecordSeq: 2,
    vlmRecheckArtifactId: ulid(),
    crossCheckSimilarity: 0.85,
  });

  assert.equal(card.status, 'verified');
  assert.notEqual(card.vlmRecheckArtifactId, null);
  assert.equal(card.crossCheckSimilarity, 0.85);
});

test('createMultimodalEvidenceCard with recheck + low similarity → degraded', () => {
  const card = createMultimodalEvidenceCard({
    mediaKind: 'chart',
    imageBase64: SAMPLE_BASE64_1x1_RED_PNG,
    mimeType: 'image/png',
    sourceAnchor: 'evidence_01J00000000000000000000002',
    caption: '温度变化趋势图',
    producedByCallRecordSeq: 3,
    vlmRecheckArtifactId: ulid(),
    crossCheckSimilarity: 0.3,
  });

  assert.equal(card.status, 'degraded');
});

test('createMultimodalEvidenceCard rejects empty caption', () => {
  assert.throws(
    () =>
      createMultimodalEvidenceCard({
        mediaKind: 'image',
        imageBase64: SAMPLE_BASE64_1x1_RED_PNG,
        mimeType: 'image/png',
        sourceAnchor: 'evidence_01',
        caption: '',
        producedByCallRecordSeq: 1,
      }),
    /caption must be non-empty/,
  );
});

test('createMultimodalEvidenceCard rejects zero-byte image', () => {
  assert.throws(
    () =>
      createMultimodalEvidenceCard({
        mediaKind: 'image',
        imageBase64: '',
        mimeType: 'image/png',
        sourceAnchor: 'evidence_01',
        caption: '空图片',
        producedByCallRecordSeq: 1,
      }),
    /byteSize must be > 0/,
  );
});

// =============================================================================
// §7 Content hash independence
// =============================================================================

test('computeContentHash produces sha256 hex', () => {
  const hash = computeContentHash(SAMPLE_BASE64_1x1_RED_PNG);
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test('computeContentHash is deterministic', () => {
  const hash1 = computeContentHash(SAMPLE_BASE64_1x1_RED_PNG);
  const hash2 = computeContentHash(SAMPLE_BASE64_1x1_RED_PNG);
  assert.equal(hash1, hash2);
});

test('computeContentHash changes with content (avalanche)', () => {
  const hash1 = computeContentHash(SAMPLE_BASE64_1x1_RED_PNG);
  // Different base64 (different image)
  const differentBase64 = SAMPLE_BASE64_1x1_RED_PNG.replace('A', 'B');
  const hash2 = computeContentHash(differentBase64);
  assert.notEqual(hash1, hash2);
});

test('computeByteSize returns correct byte count', () => {
  const size = computeByteSize(SAMPLE_BASE64_1x1_RED_PNG);
  assert.ok(size > 0);
  assert.equal(typeof size, 'number');
});

// =============================================================================
// §8 Evidence log integration (hash chain)
// =============================================================================

test('recordVlmCall writes VLM result into call_records hash chain', () => {
  const db = openDb();
  try {
    const fixture = createFixtureVlmResult({
      interpretation: '图中显示一条上升曲线，表明温度随时间增加。',
    });

    const record = recordVlmCall(db, {
      result: fixture,
      input: {
        imageBase64: SAMPLE_BASE64_1x1_RED_PNG,
        mimeType: 'image/png',
        prompt: '描述图中的温度趋势',
      },
      stageId: 'stage_multimodal_test',
      payloadKind: 'observation',
      purposeTag: 'hypothesis',
      reproHash: 'r'.repeat(64),
      gitCommitSha: 'c'.repeat(40),
      appendOptions: {
        providerProfile: 'offline_replay',
      },
    });

    assert.equal(record.seq, 1);
    assert.match(record.currentHash, /^[0-9a-f]{64}$/);

    // Verify chain is intact
    const chainResult = verifyChainHead(db);
    assert.equal(chainResult.ok, true);

    // Check call_records row
    const row = db
      .prepare('SELECT * FROM call_records WHERE seq = 1')
      .get() as Record<string, unknown>;
    assert.equal(row['payload_kind'], 'observation');
    assert.equal(row['purpose_tag'], 'hypothesis');
    assert.equal(row['model_id'], 'qwen-vl-max');
    assert.match(row['request_payload'] as string, /vision/);
    assert.match(row['request_payload'] as string, /image\/png/);
    // Image base64 should NOT be in the payload (only metadata)
    assert.equal(
      (row['request_payload'] as string).includes(SAMPLE_BASE64_1x1_RED_PNG),
      false,
      'base64 image data must not leak into canonical hash payload',
    );
  } finally {
    db.close();
  }
});

test('recordVlmCall multiple calls extend hash chain correctly', () => {
  const db = openDb();
  try {
    const fixture1 = createFixtureVlmResult({ interpretation: '第一次VLM判读' });
    const fixture2 = createFixtureVlmResult({
      interpretation: '第二次VLM判读',
      callRecordSeq: 2,
    });

    const record1 = recordVlmCall(db, {
      result: fixture1,
      input: { imageBase64: SAMPLE_BASE64_1x1_RED_PNG, mimeType: 'image/png', prompt: '测试1' },
      stageId: 'stage_1',
      payloadKind: 'observation',
      purposeTag: 'hypothesis',
      reproHash: 'r'.repeat(64),
      gitCommitSha: 'c'.repeat(40),
      appendOptions: { providerProfile: 'offline_replay' },
    });

    const record2 = recordVlmCall(db, {
      result: fixture2,
      input: { imageBase64: SAMPLE_BASE64_1x1_RED_PNG, mimeType: 'image/png', prompt: '测试2' },
      stageId: 'stage_2',
      payloadKind: 'observation',
      purposeTag: 'narrative',
      reproHash: 'r'.repeat(64),
      gitCommitSha: 'c'.repeat(40),
      appendOptions: { providerProfile: 'offline_replay' },
    });

    assert.equal(record1.seq, 1);
    assert.equal(record2.seq, 2);
    // Chain linkage: record2's prevHash should equal record1's currentHash
    assert.equal(record2.prevHash, record1.currentHash);

    const chainResult = verifyChainHead(db);
    assert.equal(chainResult.ok, true);
    assert.equal(chainResult.verifiedCount, 2);
  } finally {
    db.close();
  }
});

// =============================================================================
// §9 SourceAnchor from VLM results
// =============================================================================

test('buildVlmSourceAnchor creates valid source anchor', () => {
  const fixture = createFixtureVlmResult();
  const anchor = buildVlmSourceAnchor(fixture, 'abc123'.repeat(7).substring(0, 40));

  assert.equal(anchor.gitCommitSha.length, 40);
  assert.equal(anchor.dashscopeRequestId, 'fixture-req-001');
  assert.match(anchor.rawResponseHash, /^[0-9a-f]{64}$/);
});

test('buildVlmSourceAnchor includes code location when provided', () => {
  const fixture = createFixtureVlmResult();
  const anchor = buildVlmSourceAnchor(
    fixture,
    'abc123'.repeat(7).substring(0, 40),
    'src/llm_gateway/adapters/aliyun_qwen_vl/qwen_vl_adapter.ts',
    42,
  );

  assert.notEqual(anchor.codeLocation, undefined);
  assert.equal(anchor.codeLocation?.filePath, 'src/llm_gateway/adapters/aliyun_qwen_vl/qwen_vl_adapter.ts');
  assert.equal(anchor.codeLocation?.lineNumber, 42);
});

// =============================================================================
// §10 C10 model naming discipline（Qwen 型号仅在 adapter 目录）
// =============================================================================

test('Qwen VL model strings only exist in adapter directory', async () => {
  // C10 discipline: core llm_gateway/types.ts must not contain Qwen-VL model IDs.
  // Read the core types file and verify no VL model strings leak.
  const { readFileSync } = await import('node:fs');
  const coreTypesContent = readFileSync(
    new URL('../../src/llm_gateway/types.ts', import.meta.url),
    'utf8',
  );
  // Core types must not reference any Qwen VL model
  assert.equal(coreTypesContent.includes('qwen-vl-max'), false);
  assert.equal(coreTypesContent.includes('qwen-vl-plus'), false);
  assert.equal(coreTypesContent.includes('QWEN_VL'), false);
});

test('capability anchor for vision routing is "vision" not model-specific', () => {
  const fixture = createFixtureVlmResult();
  assert.equal(fixture.credential.capability, 'vision');
});

// =============================================================================
// §11 TextSimilarityCalculator interface
// =============================================================================

test('createDeterministicSimilarityCalculator works via interface', () => {
  const calculator = createDeterministicSimilarityCalculator();
  const score = calculator.compute('温度上升', '温度呈上升趋势');
  assert.ok(score > 0);
  assert.ok(score <= 1);
});

// =============================================================================
// §12 Fixture factory
// =============================================================================

test('createFixtureVlmResult produces valid MultimodalVlmResult', () => {
  const result = createFixtureVlmResult();
  assert.equal(result.callRecordSeq, 1);
  assert.equal(result.finishReason, 'stop');
  assert.equal(result.credential.capability, 'vision');
  assert.ok(result.interpretation.length > 0);
  assert.notEqual(result.structuredClaim, null);
});

test('createFixtureVlmResult accepts overrides', () => {
  const result = createFixtureVlmResult({
    callRecordSeq: 42,
    interpretation: '自定义判读',
    structuredClaim: { key: 'value' },
    modelId: 'qwen-vl-plus',
  });

  assert.equal(result.callRecordSeq, 42);
  assert.equal(result.interpretation, '自定义判读');
  assert.deepEqual(result.structuredClaim, { key: 'value' });
  assert.equal(result.credential.modelId, 'qwen-vl-plus');
});

// =============================================================================
// §13 Anti-theatre: caption must be falsifiable
// =============================================================================

test('MultimodalEvidenceCard caption is stored as-is (falsifiability is caller responsibility)', () => {
  // The card stores the caption; falsifiability check is at a higher layer.
  const card = createMultimodalEvidenceCard({
    mediaKind: 'image',
    imageBase64: SAMPLE_BASE64_1x1_RED_PNG,
    mimeType: 'image/png',
    sourceAnchor: 'evidence_falsifiable_test',
    caption: '图中Y轴最大值为100 ± 5',
    producedByCallRecordSeq: 1,
  });

  assert.equal(card.caption, '图中Y轴最大值为100 ± 5');
  // Falsifiable statements contain measurable/verifiable claims
  assert.match(card.caption, /Y轴/);
  assert.match(card.caption, /100/);
});
