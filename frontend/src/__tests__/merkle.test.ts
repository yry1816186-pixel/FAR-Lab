/**
 * merkle.test —— 浏览器侧 Merkle 重算的跨语言字节相等单元证明。
 *
 * Authority: 镜像后端 tests/evidence_log/merkle_cross_lang.test.ts（TS↔Python 字节相等）。
 *
 * 证明（用 Web Crypto 真算·crypto.subtle 由 test-setup 注入 Node WebCrypto）：
 *   - combine(leaf0, leaf1) === Node/Python golden（浏览器 Web Crypto 字节相等）
 *   - verifyInclusionProof(golden proof0) → ok=true（浏览器独立验证）
 *   - computeMerkleRoot(9 golden 叶) === GOLDEN_MERKLE_ROOT（整链根字节相等）
 *   - 篡改叶末位 → ok=false（tamper-evidence）
 *   - 边界：空→ZERO_MERKLE_ROOT·单叶→根=叶
 *
 * 零容忍：无 any / ts-ignore / 双重断言 / 桩。索引访问用 guard 收窄（禁 non-null 断言）。
 */
import { describe, it, expect } from 'vitest';
import {
  ZERO_MERKLE_ROOT,
  combineHashes,
  computeMerkleRoot,
  flipLastHexChar,
  verifyInclusionProof,
} from '@/lib/merkle';
import {
  GOLDEN_COMBINE_LEAF0_LEAF1,
  GOLDEN_LEAVES,
  GOLDEN_MERKLE_ROOT,
  GOLDEN_PROOF_LEAF0,
} from '@/lib/integrity-golden';

const LEAVES = GOLDEN_LEAVES.map((leaf) => leaf.expectedHex);

/** 安全取 golden 叶（noUncheckedIndexedAccess 下禁 non-null 断言·guard 收窄）。 */
function leafAt(idx: number): string {
  const value = LEAVES[idx];
  if (value === undefined) {
    throw new Error(`fixture: golden leaf ${idx} missing`);
  }
  return value;
}

describe('merkle (browser Web Crypto) — 跨语言字节相等', () => {
  it('combine(leaf0, leaf1) === Node/Python golden（浏览器 Web Crypto 字节相等）', async () => {
    const combined = await combineHashes(leafAt(0), leafAt(1));
    expect(combined).toBe(GOLDEN_COMBINE_LEAF0_LEAF1);
  });

  it('verifyInclusionProof(golden proof0) → ok=true·computedRoot === GOLDEN_MERKLE_ROOT', async () => {
    const result = await verifyInclusionProof(GOLDEN_PROOF_LEAF0);
    expect(result.ok).toBe(true);
    expect(result.computedRoot).toBe(GOLDEN_MERKLE_ROOT);
  });

  it('computeMerkleRoot(9 golden 叶) === GOLDEN_MERKLE_ROOT（整链根字节相等）', async () => {
    const root = await computeMerkleRoot(LEAVES);
    expect(root).toBe(GOLDEN_MERKLE_ROOT);
  });

  it('篡改叶末位 hex → verifyInclusionProof ok=false（tamper-evidence）', async () => {
    const tamperedProof = {
      ...GOLDEN_PROOF_LEAF0,
      leaf: flipLastHexChar(GOLDEN_PROOF_LEAF0.leaf),
    };
    const result = await verifyInclusionProof(tamperedProof);
    expect(result.ok).toBe(false);
  });

  it('computeMerkleRoot([]) === ZERO_MERKLE_ROOT（空集诚实占位）', async () => {
    expect(await computeMerkleRoot([])).toBe(ZERO_MERKLE_ROOT);
  });

  it('computeMerkleRoot([single]) === leaf（单叶即根）', async () => {
    const single = leafAt(0);
    expect(await computeMerkleRoot([single])).toBe(single);
  });

  it('flipLastHexChar 保持 64-hex·改末位·前 63 字符不变', () => {
    const original = leafAt(0);
    const flipped = flipLastHexChar(original);
    expect(flipped).toMatch(/^[0-9a-f]{64}$/);
    expect(flipped).not.toBe(original);
    expect(flipped.slice(0, 63)).toBe(original.slice(0, 63));
  });

  it('combineHashes 非 64-hex 输入 → 抛错（fail-fast·禁静默 coerce）', async () => {
    await expect(combineHashes('not-a-hex', leafAt(1))).rejects.toThrow(/64-char lowercase hex/);
  });
});
