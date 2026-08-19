/**
 * integrity-golden —— 跨语言 Merkle golden 向量（CrossLangHashVerifier 的对齐锚）。
 *
 * 来源：一次性脚本导出（脚本已删）·源自 src/evidence_log/golden_vectors.ts GOLDEN_VECTORS.slice(1)
 * 的 9 个真实 canonical hash 叶。这些叶的 merkle 根 / 包含证明由后端 Node computeMerkleRoot /
 * computeMerkleInclusionProof 真实计算，且经 tests/evidence_log/merkle_cross_lang.test.ts
 * spawnSync python3 逐位断言 TS === Python（字节相等）。
 *
 * 用途：前端用浏览器 Web Crypto（crypto.subtle.digest）独立重算 combine / root，与这里的
 * Node / Python golden 比对——证明「同一算法，浏览器 / Node / Python 三方产出字节相同的哈希」。
 * 这是 FAR-Lab 跨语言确定性承诺的可视化证据（CrossLangHashVerifier 卖点）。
 *
 * 这些数值是密码学常量（由输入确定性派生），非魔法数字。勿手改——若改输入请重跑生成脚本
 * 并同步 tests/evidence_log/merkle_cross_lang.test.ts 的回归锚。
 */

export interface GoldenLeaf {
  readonly name: string;
  readonly expectedHex: string;
}

/**
 * 9 个真实 canonical hash 叶（GOLDEN_VECTORS.slice(1)·跳过 meta_minimal_genesis fixture）。
 * 奇数叶数（9）→ 末叶自复制凑偶 → 验证 duplicate-last-on-odd 跨语言一致。
 */
export const GOLDEN_LEAVES: readonly GoldenLeaf[] = [
  { name: 'hypothesis_genesis', expectedHex: '164e34ad12145e4419708355178273a76c31d6cb2d3f458f3536930bc4082a05' },
  { name: 'experiment_code_gen', expectedHex: '0495346a4a72d838213ffcbfe61a702f319d766503580c95de673c8421efdcc5' },
  { name: 'observation_eval', expectedHex: '6d352ca20015312a51059e9e3132c5490c0f1a49a11b1ef0f7ecb7ebf3e023e9' },
  { name: 'understanding_narrative', expectedHex: '623b0b86507bb28baa2a7edb9b27a5b4dd2c8ebd1eb547b9ce1b76bc60e79d04' },
  { name: 'plan_scoring', expectedHex: '24eb03e1d165ef56d44ca48e7f99daa1d8cbe82ae2e1b405039e81a789d40441' },
  { name: 'feedback_gt_read', expectedHex: 'a8a3ee26825535c6916ac804383a8f9792be3e6f90ce0c0779f028bb82fafed7' },
  { name: 'integration_baseline_exempt', expectedHex: '5c3981bb3512488460173fe5595325acb7571ce3cce95e43092638a401464367' },
  { name: 'meta_viz_select', expectedHex: '11e8fb5b201b324d206fd70fdb9ab0a6b015078ab36f948be5c3dba6d8a0ba19' },
  { name: 'citation_dialogue', expectedHex: '88bd571729946ecf574b2099ef06684f678dc90f8abdc9b1090d3680823d6787' },
];

/** 9 叶 Merkle 根（Node + Python 字节相等·cross-lang 回归锚）。 */
export const GOLDEN_MERKLE_ROOT = '35bf58cb765b8482c451b987ad804d08ae20ff93335cae63bcc4bb3fba3d89c7';

/** combine(leaf0, leaf1) 的期望输出（浏览器重算应与此字节相等）。 */
export const GOLDEN_COMBINE_LEAF0_LEAF1 = 'dafba45d674ce58a91e2637717b0b4fd32a50953194f78a864a3711b1b1ac380';

/**
 * leaf0 的 Merkle 包含证明（audit path）。
 * 浏览器 verifyInclusionProof 应返回 ok=true·computedRoot === GOLDEN_MERKLE_ROOT。
 */
export const GOLDEN_PROOF_LEAF0 = {
  leafIndex: 0,
  leaf: '164e34ad12145e4419708355178273a76c31d6cb2d3f458f3536930bc4082a05',
  siblings: [
    '0495346a4a72d838213ffcbfe61a702f319d766503580c95de673c8421efdcc5',
    '5bb8bff250e656750a43f30c9c0dd67e95cdbaa9188fc9a9d9a74c681cdbabd5',
    'af871731675887bb6b7c3b6fbe226d8785056c1f19ecd8be5c1931b817699531',
    'dde975a14beffa8c96b0b17f1bbe36c3bdf38d958da30e7eec9c118e07b20f23',
  ],
  expectedRoot: GOLDEN_MERKLE_ROOT,
} as const;

/**
 * RFC 8785 contentHash 自检 fixture（CanonicalHashVerifier 自检锚）。
 * n=1e-7 刻意选用 RFC 8785 指数收敛边界样本（迁移前 TS/Python 在此分歧）。
 * 期望哈希由后端 src/evidence_log hashCanonicalJson 真实计算（密码学常量，勿手改）。
 */
export const GOLDEN_JCS_SELF_TEST = {
  obj: { claim: 'FAR-Lab browser-side JCS self-test', n: 1e-7, sorted: true },
  expectedHex: '60c0fc07ac42e758cdf37d2767ec7ba16249a01f4b7b3133df6708d5dab85516',
} as const;
