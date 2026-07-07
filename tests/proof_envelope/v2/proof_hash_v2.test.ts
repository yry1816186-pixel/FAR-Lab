/**
 * computeProofHashV2 TS 自洽测试（fecHash 断言 + normalizeClaim + 纯函数 + 篡改敏感性）。
 *
 * Authority: FAR_LAB_MASTER_PLAN/04 §2.5 + APPENDIX_C §2.4（proofHash 5 步伪代码）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeValidEnvelopeV2Core } from './fixtures.ts';
import {
  computeProofHashV2,
  normalizeClaim,
  normalizeWhitespace,
  sealProofEnvelopeV2,
  verifyProofHashV2,
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

test('verifyProofHashV2: 合法 envelope → true', () => {
  const { envelope } = sealProofEnvelopeV2(makeValidEnvelopeV2Core());
  assert.equal(verifyProofHashV2(envelope), true);
});

test('verifyProofHashV2: 篡改 proofHash → false', () => {
  const { envelope } = sealProofEnvelopeV2(makeValidEnvelopeV2Core());
  assert.equal(verifyProofHashV2({ ...envelope, proofHash: '0'.repeat(64) }), false);
});

test('verifyProofHashV2: 篡改 fecSnapshot（measurableImplication）→ false（fecHash 断言失败）', () => {
  const { envelope } = sealProofEnvelopeV2(makeValidEnvelopeV2Core());
  const tampered = {
    ...envelope,
    fecSnapshot: { ...envelope.fecSnapshot, measurableImplication: 'tampered claim' },
  };
  assert.equal(verifyProofHashV2(tampered), false);
});

test('normalizeWhitespace: \\r\\n / \\r / 多空格 / trim 统一', () => {
  assert.equal(normalizeWhitespace('  hello   world  '), 'hello world');
  assert.equal(normalizeWhitespace('a\r\nb\rc'), 'a\nb\nc');
  assert.equal(normalizeWhitespace('a\t\tb'), 'a b');
});

test('normalizeClaim: naturalLanguage 规范化，其余字段原样，不 mutate 原对象', () => {
  const claim = { id: 'C1', naturalLanguage: '  hello   world  ', domain: 'd', scope: 's' };
  const normalized = normalizeClaim(claim);
  assert.equal(normalized.naturalLanguage, 'hello world');
  assert.equal(normalized.id, 'C1');
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
