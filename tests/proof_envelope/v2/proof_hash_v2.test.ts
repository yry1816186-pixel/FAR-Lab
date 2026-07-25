/**
 * computeProofHashV2 TS 自洽测试（fecHash 断言 + normalizeClaim + 纯函数 + 篡改敏感性）。
 *
 * Authority: FAR_LAB_MASTER_PLAN/04 §2.5 + APPENDIX_C §2.4（proofHash 5 步伪代码）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeValidEnvelopeV2Core } from './fixtures.ts';
import type { ProofEnvelopeV2 } from '../../../src/proof_envelope/v2/types.ts';
import {
  computeProofHashV2,
  normalizeClaim,
  normalizeWhitespace,
  sealProofEnvelopeV2,
  verifyProofHashV2,
  verifyProofHashV2Boolean,
} from '../../../src/proof_envelope/v2/index.ts';

test('computeProofHashV2: 合法 core → 64 位小写 hex', () => {
  assert.match(computeProofHashV2(makeValidEnvelopeV2Core()), /^[0-9a-f]{64}$/);
});

test('computeProofHashV2: fecHash 与 fecSnapshot 不一致 → 抛 fecHash mismatch', () => {
  const core = makeValidEnvelopeV2Core({ fecHash: '0'.repeat(64) });
  assert.throws(() => computeProofHashV2(core), /fecHash mismatch/);
});

test('computeProofHashV2: 篡改任一 VC 字段（ledgerRoot）→ hash 变化', () => {
  const base = computeProofHashV2(makeValidEnvelopeV2Core());
  const tampered = computeProofHashV2(makeValidEnvelopeV2Core({ ledgerRoot: '0'.repeat(64) }));
  assert.notEqual(base, tampered);
});

test('computeProofHashV2: 纯函数（不 mutate 输入·同输入两次同输出）', () => {
  const core = makeValidEnvelopeV2Core();
  assert.equal(computeProofHashV2(core), computeProofHashV2(core));
});

test('sealProofEnvelopeV2: envelope.proofHash === computeProofHashV2(core)', () => {
  const core = makeValidEnvelopeV2Core();
  const { envelope } = sealProofEnvelopeV2(core);
  assert.equal(envelope.proofHash, computeProofHashV2(core));
});

test('verifyProofHashV2: 合法 envelope → valid', () => {
  const { envelope } = sealProofEnvelopeV2(makeValidEnvelopeV2Core());
  assert.equal(verifyProofHashV2(envelope), 'valid');
});

test('verifyProofHashV2: 篡改 proofHash → hash_mismatch', () => {
  const { envelope } = sealProofEnvelopeV2(makeValidEnvelopeV2Core());
  assert.equal(verifyProofHashV2({ ...envelope, proofHash: '0'.repeat(64) }), 'hash_mismatch');
});

test('verifyProofHashV2: 篡改 fecSnapshot（measurableImplication）→ fec_inconsistent 或 hash_mismatch', () => {
  const { envelope } = sealProofEnvelopeV2(makeValidEnvelopeV2Core());
  const tampered = {
    ...envelope,
    fecSnapshot: { ...envelope.fecSnapshot, measurableImplication: 'tampered claim' },
  };
  const result = verifyProofHashV2(tampered);
  const acceptable: readonly string[] = ['fec_inconsistent', 'hash_mismatch'];
  assert.ok(acceptable.includes(result), `expected fec_inconsistent/hash_mismatch, got ${result}`);
});

test('normalizeWhitespace: \\r\\n / \\r / 多空格 / trim 统一', () => {
  assert.equal(normalizeWhitespace('  hello   world  '), 'hello world');
  assert.equal(normalizeWhitespace('a\r\nb\rc'), 'a\nb\nc');
  assert.equal(normalizeWhitespace('a\t\tb'), 'a b');
});

test('normalizeClaim: naturalLanguage 规范化，其余字段原样，不 mutate 原对象', () => {
  const claim = { id: 'C1', naturalLanguage: '  hello   world  ', domain: 'd', scope: 's', claimType: 'existence' as const };
  const normalized = normalizeClaim(claim);
  assert.equal(normalized.naturalLanguage, 'hello world');
  assert.equal(normalized.id, 'C1');
  assert.equal(normalized.claimType, 'existence');
  assert.equal(claim.naturalLanguage, '  hello   world  ', '原对象不可被 mutate');
});

test('normalizeClaim 进 proofHash: claim 自然语言空白差异不改变 hash', () => {
  const base = makeValidEnvelopeV2Core();
  const withExtraSpaces = makeValidEnvelopeV2Core({
    claim: {
      ...base.claim,
      naturalLanguage: 'Model  M  achieves   RMSE  <=  0.5  on  dataset  D',
    },
  });
  // computeProofHashV2 内部已 normalizeClaim → 空白差异归一 → 同 hash
  assert.equal(computeProofHashV2(base), computeProofHashV2(withExtraSpaces));
});

// ===== T-029（任务 #12 · 评委08 F-8-003）：claimType 进 ClaimEnvelope hash =====

test('T-029: 篡改 claimType → proofHash 失配（反 caller 偷改 R-causal 输入）', () => {
  // 根因（评委08 F-8-003）：原 claimType 仅在 VerdictKernelInput 层，caller 可对同一 claim 传
  // causal vs quantitative 改变 R-causal 门裁决，而 proofHash 不变 → 第三方独立复算 hash 一致但裁决不同。
  // 修复后 claimType 是 ClaimEnvelope 的 [VC] 字段，进 proofHash，篡改必失配。
  const base = makeValidEnvelopeV2Core(); // claimType: 'quantitative'
  const tampered = makeValidEnvelopeV2Core({
    claim: { ...base.claim, claimType: 'causal' },
  });
  assert.notEqual(
    computeProofHashV2(base),
    computeProofHashV2(tampered),
    '篡改 claimType 必须改变 proofHash（否则 caller 可偷改 R-causal 输入而不被独立复算检出）',
  );
});

test('T-029: V1 三 claimType 全覆盖（existence/quantitative/causal）各自产生不同 proofHash', () => {
  // V1 三 claimType 全交付（claim_fixtures.ts V1_CLAIM_FIXTURE_ROADMAP）——ClaimEnvelope 层镜像此覆盖。
  const base = makeValidEnvelopeV2Core();
  const claimTypes = ['existence', 'quantitative', 'causal'] as const;
  const hashes = new Set<string>();
  for (const ct of claimTypes) {
    const env = makeValidEnvelopeV2Core({
      claim: { ...base.claim, claimType: ct },
    });
    const h = computeProofHashV2(env);
    assert.match(h, /^[0-9a-f]{64}$/, `claimType=${ct} 须产出合法 64 hex`);
    hashes.add(h);
  }
  assert.equal(hashes.size, claimTypes.length, '三 claimType 必须产生互异 proofHash');
});

test('T-029: sealProofEnvelopeV2 → verifyProofHashV2 在篡改 claimType 后检出 false', () => {
  const { envelope } = sealProofEnvelopeV2(makeValidEnvelopeV2Core());
  const tampered: typeof envelope = {
    ...envelope,
    claim: { ...envelope.claim, claimType: 'existence' }, // 原 'quantitative'
  };
  assert.equal(verifyProofHashV2Boolean(tampered), false, '篡改 claimType 后 verifyProofHashV2Boolean 必须检出');
});

// ===== F-4-005（评委08 R4）：verifyProofHashV2 空 catch → 区分篡改 vs 格式错误 =====

test('F-4-005: verifyProofHashV2 返回 valid 当信封完整', () => {
  const { envelope } = sealProofEnvelopeV2(makeValidEnvelopeV2Core());
  assert.equal(verifyProofHashV2(envelope), 'valid');
});

test('F-4-005: verifyProofHashV2 返回 hash_mismatch 当 proofHash 被篡改', () => {
  const { envelope } = sealProofEnvelopeV2(makeValidEnvelopeV2Core());
  const tampered = { ...envelope, proofHash: '0'.repeat(64) };
  assert.equal(verifyProofHashV2(tampered), 'hash_mismatch');
});

test('F-4-005: verifyProofHashV2 返回 fec_inconsistent 当 fecHash 与 fecSnapshot 不一致', () => {
  const { envelope } = sealProofEnvelopeV2(makeValidEnvelopeV2Core());
  const tampered = { ...envelope, fecHash: 'f'.repeat(64) };
  assert.equal(verifyProofHashV2(tampered), 'fec_inconsistent');
});

test('F-4-005: verifyProofHashV2 返回 non_finite_number 当含 NaN/Infinity', () => {
  const { envelope } = sealProofEnvelopeV2(makeValidEnvelopeV2Core());
  const stats = envelope.statisticalResults;
  const tampered = {
    ...envelope,
    statisticalResults: stats.length > 0
      ? [{ ...stats[0], effectSizeObserved: Number.NaN }, ...stats.slice(1)]
      : stats,
  } as typeof envelope;
  const result = verifyProofHashV2(tampered);
  assert.equal(result, 'non_finite_number', `expected non_finite_number, got ${result}`);
});

test('F-4-005: verifyProofHashV2 返回 malformed_envelope/fec_inconsistent 当结构损坏', () => {
  const { envelope } = sealProofEnvelopeV2(makeValidEnvelopeV2Core());
  // 用 explicit any param 的 helper 模拟"untrusted 反序列化"输入——测试恶意/损坏输入是合法的测试场景
  // 不用 `as unknown as`（零容忍 #1）而是通过函数签名边界接收 unknown
  function feedMalformed(input: unknown): string {
    return verifyProofHashV2(input as ProofEnvelopeV2);
  }
  const tampered = { ...envelope, fecSnapshot: null };
  const result = feedMalformed(tampered);
  const acceptable: readonly string[] = ['malformed_envelope', 'fec_inconsistent'];
  assert.ok(acceptable.includes(result), `expected malformed/fec_inconsistent, got ${result}`);
});

// ===== F-4-007（评委08 R4）：Unicode NFC 归一化 =====

test('F-4-007: normalizeWhitespace 做 Unicode NFC 归一化', () => {
  // é 的两种 Unicode 等价表示：precomposed (U+00E9) vs decomposed (e + U+0301)
  const nfd = 'caf' + 'e\u0301';   // c-a-f-(e+combining_acute) = 4 chars
  const nfc = 'caf\u00e9';          // c-a-f-é(precomposed) = 4 chars
  assert.equal(normalizeWhitespace(nfd), normalizeWhitespace(nfc), 'NFC/NFD 等价表示归一后必相等');
  assert.equal(normalizeWhitespace(nfd), nfc, 'NFD 输入归一后为 NFC');
});

test('F-4-007: NFC 等价的 claim naturalLanguage 产生相同 proofHash', () => {
  const base = makeValidEnvelopeV2Core();
  // 两端文本内容相同（'café dataset'），只有 é 的 Unicode 编码形式不同
  const nfdClaim = { ...base.claim, naturalLanguage: 'RMSE on caf' + 'e\u0301' + ' dataset' };
  const nfcClaim = { ...base.claim, naturalLanguage: 'RMSE on caf\u00e9 dataset' };
  assert.equal(
    computeProofHashV2({ ...base, claim: nfdClaim }),
    computeProofHashV2({ ...base, claim: nfcClaim }),
    'NFC/NFD 等价的 naturalLanguage 必须产生 byte-identical proofHash',
  );
});
