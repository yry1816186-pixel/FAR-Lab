/**
 * browser_reproof —— 浏览器侧 Merkle 独立重算（R2 恢复的 v1 能力）的判别性测试。
 *
 * 三层证据：
 *   1. crypto 层：golden 向量字节相等（浏览器 Web Crypto === Node/Python 锚）+
 *      tamper 检出 + 非法叶 fail-fast + 边界（空树/单叶/奇数叶）。
 *   2. 组件层：EvidencePage 包含证明 → 独立重算 → 一致徽标；篡改演示 → 不符徽标。
 *   3. golden 面板：三行全 PASS（combine / 9 叶整树 / golden 包含证明）。
 *
 * jsdom 环境若无 crypto.subtle（老 jsdom），由 Node webcrypto 补齐——
 * 生产浏览器 100% 自带 subtle，此注入仅为测试环境对齐。
 */

import { webcrypto } from 'node:crypto';

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import EvidencePage from '@/features/evidence/EvidencePage.tsx';
import { GoldenVerifier } from '@/features/evidence/BrowserReproof.tsx';
import {
  buildMerkleTree,
  combineHashes,
  computeMerkleRoot,
  flipLastHexChar,
  sha256Hex,
  verifyInclusionProof,
  ZERO_MERKLE_ROOT,
} from '@/shared/crypto/merkle.ts';
import {
  GOLDEN_COMBINE_LEAF0_LEAF1,
  GOLDEN_LEAVES,
  GOLDEN_MERKLE_ROOT,
  GOLDEN_PROOF_LEAF0,
} from '@/shared/crypto/integrity_golden.ts';
import { okJson, renderWithProviders, stubFetch } from './helpers.tsx';

beforeAll(() => {
  if (typeof globalThis.crypto === 'undefined' || typeof globalThis.crypto.subtle === 'undefined') {
    vi.stubGlobal('crypto', webcrypto);
  }
});

describe('shared/crypto/merkle', () => {
  it('sha256Hex produces 64 lowercase hex', async () => {
    const h = await sha256Hex('far-lab');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('combine(leaf0, leaf1) byte-equals the Node/Python golden', async () => {
    const [a, b] = GOLDEN_LEAVES;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    const combined = await combineHashes(a!.expectedHex, b!.expectedHex);
    expect(combined).toBe(GOLDEN_COMBINE_LEAF0_LEAF1);
  });

  it('rebuilds the golden Merkle root from 9 leaves (odd-leaf duplication path)', async () => {
    expect(GOLDEN_LEAVES.length).toBe(9); // odd → exercises duplicate-last-on-odd
    const root = await computeMerkleRoot(GOLDEN_LEAVES.map((l) => l.expectedHex));
    expect(root).toBe(GOLDEN_MERKLE_ROOT);
  });

  it('verifies the golden inclusion proof independently', async () => {
    const r = await verifyInclusionProof(GOLDEN_PROOF_LEAF0);
    expect(r.ok).toBe(true);
    expect(r.computedRoot).toBe(GOLDEN_MERKLE_ROOT);
  });

  it('detects a one-hex-char leaf tamper (tamper-evidence)', async () => {
    const tampered = flipLastHexChar(GOLDEN_PROOF_LEAF0.leaf);
    expect(tampered).not.toBe(GOLDEN_PROOF_LEAF0.leaf);
    expect(tampered).toMatch(/^[0-9a-f]{64}$/);
    const r = await verifyInclusionProof({ ...GOLDEN_PROOF_LEAF0, leaf: tampered });
    expect(r.ok).toBe(false);
    expect(r.computedRoot).not.toBe(GOLDEN_MERKLE_ROOT);
  });

  it('fails fast on non-64-hex leaves instead of coercing', async () => {
    await expect(buildMerkleTree(['not-hex'])).rejects.toThrow(/64-char/);
    await expect(combineHashes('zz'.repeat(32), GOLDEN_LEAVES[0]!.expectedHex)).rejects.toThrow(/64-char/);
    expect(() => flipLastHexChar('abc')).toThrow(/64-char/);
  });

  it('empty tree yields the honest zero root; single leaf is its own root', async () => {
    expect((await buildMerkleTree([])).root).toBe(ZERO_MERKLE_ROOT);
    const single = GOLDEN_LEAVES[0]!.expectedHex;
    const tree = await buildMerkleTree([single]);
    expect(tree.root).toBe(single);
    expect(tree.leafCount).toBe(1);
    const r = await verifyInclusionProof({ leafIndex: 0, leaf: single, siblings: [], expectedRoot: single });
    expect(r.ok).toBe(true);
  });
});

const GOLDEN_PROOF_DTO = {
  seq: 1,
  leafIndex: GOLDEN_PROOF_LEAF0.leafIndex,
  leaf: GOLDEN_PROOF_LEAF0.leaf,
  siblings: GOLDEN_PROOF_LEAF0.siblings,
  expectedRoot: GOLDEN_PROOF_LEAF0.expectedRoot,
  leafCount: 9,
};

describe('EvidencePage browser reproof', () => {
  it('recomputes a fetched inclusion proof and shows the match badge', async () => {
    const user = userEvent.setup();
    stubFetch((url) => {
      if (url === '/api/v1/integrity/root') {
        return okJson({ merkleRoot: GOLDEN_MERKLE_ROOT, leafCount: 9, chainHeadSeq: 9, chainHeadHash: 'ab'.repeat(32) });
      }
      if (url === '/api/v1/integrity/receipt') {
        return okJson({ schemaVersion: 1, merkleRoot: GOLDEN_MERKLE_ROOT, leafCount: 9, chainHeadSeq: 9, chainHeadHash: 'ab'.repeat(32), gitCommitSha: null, generatedAt: '2026-08-19T02:00:00Z' });
      }
      if (url === '/api/v1/integrity/proof/1') return okJson(GOLDEN_PROOF_DTO);
      if (url.startsWith('/api/v1/verdict?')) return okJson({ items: [], count: 0, limit: 25, offset: 0 });
      return undefined;
    });
    renderWithProviders(<EvidencePage />, ['/evidence']);

    await user.type(screen.getByLabelText(/记录序号/), '1');
    await user.click(screen.getByRole('button', { name: '获取证明' }));
    expect(await screen.findByTestId('proof-result')).toBeInTheDocument();

    await user.click(await screen.findByTestId('recompute-run'));
    await waitFor(() => expect(screen.getByTestId('recompute-result')).toBeInTheDocument());
    expect(await screen.findByText('重算一致 — 叶确在链内')).toBeInTheDocument();
    // 浏览器重算根与期望根双双展示（全量 64-hex 不截断）。
    expect((await screen.findAllByText(GOLDEN_MERKLE_ROOT)).length).toBeGreaterThanOrEqual(2);
  });

  it('tamper theatre: flipping one leaf hex char turns the badge to mismatch', async () => {
    const user = userEvent.setup();
    stubFetch((url) => {
      if (url === '/api/v1/integrity/root') {
        return okJson({ merkleRoot: GOLDEN_MERKLE_ROOT, leafCount: 9, chainHeadSeq: 9, chainHeadHash: 'ab'.repeat(32) });
      }
      if (url === '/api/v1/integrity/receipt') {
        return okJson({ schemaVersion: 1, merkleRoot: GOLDEN_MERKLE_ROOT, leafCount: 9, chainHeadSeq: 9, chainHeadHash: 'ab'.repeat(32), gitCommitSha: null, generatedAt: '2026-08-19T02:00:00Z' });
      }
      if (url === '/api/v1/integrity/proof/1') return okJson(GOLDEN_PROOF_DTO);
      if (url.startsWith('/api/v1/verdict?')) return okJson({ items: [], count: 0, limit: 25, offset: 0 });
      return undefined;
    });
    renderWithProviders(<EvidencePage />, ['/evidence']);

    await user.type(screen.getByLabelText(/记录序号/), '1');
    await user.click(screen.getByRole('button', { name: '获取证明' }));
    await screen.findByTestId('proof-result');

    await user.click(await screen.findByTestId('recompute-tamper'));
    await waitFor(() => expect(screen.getByTestId('recompute-result')).toBeInTheDocument());
    expect(await screen.findByText('重算不符 — 篡改/漂移可观测')).toBeInTheDocument();
    expect(screen.getByText(/预期内的不符/)).toBeInTheDocument();
  });
});

describe('GoldenVerifier', () => {
  it('recomputes combine + root + inclusion proof byte-equal to the golden anchors', async () => {
    const user = userEvent.setup();
    renderWithProviders(<GoldenVerifier />, ['/evidence']);
    await user.click(screen.getByTestId('golden-run'));
    await waitFor(() => expect(screen.getByTestId('golden-result')).toBeInTheDocument());
    const badges = await screen.findAllByText('PASS');
    expect(badges.length).toBe(3);
    expect(screen.queryByText('FAIL')).not.toBeInTheDocument();
    expect(await screen.findByText(GOLDEN_MERKLE_ROOT)).toBeInTheDocument();
  });
});
