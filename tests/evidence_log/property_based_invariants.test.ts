/**
 * property_based_invariants.test.ts — C7 属性基不变量（确定性遍历·零依赖）。
 *
 * 覆盖 23_TEST_EVALUATION 标注「缺」的 Property-based 层。不用 fast-check（新增依赖/随机性
 * 违反确定性）——采用**确定性穷举**不变量：小规模全集遍历 + 结构性质断言，等价于 property
 * testing 对小型输入空间的完整覆盖。
 *
 * 不变量集：
 *   M1. Merkle 包含证明完备性：∀ n∈[1..16], ∀ i∈[0..n): verify(proof(n,i)) === true
 *       （任意叶数任意位置的证明必须验证通过）
 *   M2. Merkle 篡改敏感性：proof 中任一 sibling 单字符翻转 → verify === false
 *       （篡改证据：leaf 或 sibling 任一字节变即根不匹配）
 *   M3. Merkle 根确定性：同叶集 → 同根（跨调用幂等）
 *   M4. canonical 键序无关：同对象不同键插入序 → canonicalJson 字节相等（fast-json-stable-stringify 性质）
 *   M5. canonical round-trip：canonicalJson(JSON.parse(canonicalJson(x))) === canonicalJson(x)（幂等）
 *   M6. canonical 拒 NaN/Infinity：含非有限数 → 抛错（fail-closed）
 *
 * 零容忍合规：无 any / @ts-ignore / 空 catch。纯函数测试。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { canonicalHash, canonicalJson, hashCanonicalJson } from '../../src/evidence_log/hasher.ts';
import {
  ZERO_MERKLE_ROOT,
  computeMerkleInclusionProof,
  computeMerkleRoot,
  verifyMerkleInclusionProof,
} from '../../src/evidence_log/merkle_root.ts';

/** 确定性伪叶生成：64-hex（非随机·确定性输入空间）。 */
function deterministicLeaf(seed: number): string {
  return seed.toString(16).padStart(64, '0').slice(0, 64);
}

test('M1: Merkle 包含证明完备性 — ∀n∈[1..16], ∀i∈[0..n) verify 通过', () => {
  for (let n = 1; n <= 16; n += 1) {
    const leaves = Array.from({ length: n }, (_, i) => deterministicLeaf(i + 1));
    const root = computeMerkleRoot(leaves);
    for (let i = 0; i < n; i += 1) {
      const proof = computeMerkleInclusionProof(leaves, i);
      const verified = verifyMerkleInclusionProof(proof);
      assert.equal(
        verified.ok,
        true,
        `M1 违反: n=${n}, i=${i} proof 应通过. root=${root.slice(0, 8)}`,
      );
    }
  }
});

test('M2: Merkle 篡改敏感性 — sibling 任一字节翻转 → verify false', () => {
  for (let n = 2; n <= 8; n += 1) {
    const leaves = Array.from({ length: n }, (_, i) => deterministicLeaf(i + 1));
    for (let i = 0; i < n; i += 1) {
      const proof = computeMerkleInclusionProof(leaves, i);
      // 翻转每个 sibling 的首字符（0-9 互转，确保真的变了）
      for (let s = 0; s < proof.siblings.length; s += 1) {
        const tampered = {
          ...proof,
          siblings: proof.siblings.map((sib, idx) => {
            if (idx !== s) return sib;
            const flipped = sib[0] === '0' ? '1' : '0';
            return flipped + sib.slice(1);
          }),
        };
        const verified = verifyMerkleInclusionProof(tampered);
        assert.equal(
          verified.ok,
          false,
          `M2 违反: n=${n}, i=${i}, sibling[${s}] 篡改未检出`,
        );
      }
    }
  }
});

test('M3: Merkle 根确定性 — 同叶集重算根一致（跨调用幂等）', () => {
  for (let n = 0; n <= 12; n += 1) {
    const leaves = Array.from({ length: n }, (_, i) => deterministicLeaf(i + 1));
    const rootA = computeMerkleRoot(leaves);
    const rootB = computeMerkleRoot(leaves);
    assert.equal(rootA, rootB, `M3 违反: n=${n} 根不稳定`);
    if (n === 0) {
      assert.equal(rootA, ZERO_MERKLE_ROOT, '空叶集根须为 ZERO_MERKLE_ROOT');
    }
  }
});

test('M4: canonical 键序无关 — 同对象不同键插入序 → canonicalJson 字节相等', () => {
  const samples: Array<[Record<string, unknown>, Record<string, unknown>]> = [
    [{ a: 1, b: 2, c: 3 }, { c: 3, b: 2, a: 1 }],
    [{ nested: { x: [1, 2, 3], y: 'str' } }, { nested: { y: 'str', x: [1, 2, 3] } }],
    [{ z: null, a: true, m: [{}] }, { m: [{}], a: true, z: null }],
    [{ deep: { level: { key: 'v' }, arr: [1, { a: 2, b: 3 }] } }, { deep: { arr: [1, { b: 3, a: 2 }], level: { key: 'v' } } }],
  ];
  for (const [a, b] of samples) {
    assert.equal(canonicalJson(a), canonicalJson(b), `M4 违反: 键序影响 canonical 输出`);
    assert.equal(hashCanonicalJson(a), hashCanonicalJson(b), 'M4 违反: 键序影响 hash');
  }
});

test('M5: canonical round-trip — canonicalJson(JSON.parse(canonicalJson(x))) === canonicalJson(x)', () => {
  const samples: readonly Record<string, unknown>[] = [
    { a: 1, b: [1, 2, { c: null }], d: 'str' },
    { nested: { arr: [true, false], obj: { k: 'v' } } },
    { empty: {}, list: [], mixed: [1, 'two', false, null] },
    { unicode: '中文 δ', special: 'tab\tnewline\n' },
  ];
  for (const sample of samples) {
    const once = canonicalJson(sample);
    const parsed = JSON.parse(once) as Record<string, unknown>;
    const twice = canonicalJson(parsed);
    assert.equal(twice, once, `M5 违反: round-trip 不幂等`);
  }
});

test('M6: canonical 拒 NaN/Infinity — 非有限数 fail-closed 抛错', () => {
  const badSamples: readonly unknown[] = [
    { a: NaN },
    { a: Infinity },
    { a: -Infinity },
    { nested: { deep: [1, NaN] } },
    { arr: [Infinity] },
  ];
  for (const bad of badSamples) {
    assert.throws(
      () => canonicalJson(bad),
      /NaN and Infinity|NaN|Infinity/,
      `M6 违反: 含非有限数未抛错: ${JSON.stringify(String(bad))}`,
    );
  }
});

test('M7: canonicalHash 确定性 — 同 canonical 输入跨调用一致且 64-hex', () => {
  const input = {
    stageId: 's1',
    cred: { modelId: 'm', dashscopeRequestId: null, reproHash: 'a'.repeat(64), gitCommitSha: 'b'.repeat(40), isoTimestamp: '2026-01-01T00:00:00Z' },
    payloadKind: 'hypothesis' as const,
    purposeTag: 'hypothesis' as const,
    prevHash: '0'.repeat(64),
  };
  const h1 = canonicalHash(input);
  const h2 = canonicalHash(input);
  assert.equal(h1, h2, 'M7 违反: canonicalHash 不稳定');
  assert.match(h1, /^[0-9a-f]{64}$/, 'M7 违反: 非 64-hex');
});
