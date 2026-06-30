/**
 * merkle_root —— 证据链 Merkle 完整性根 + 包含证明（inclusion proof）。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/09_repro_determinism.md §4（integrity root）+
 *            FINAL_PACKAGE/23_CI_AND_VALIDATION.md §5.2（tamper-evident trust root）。
 *
 * 职责（不与 verifyChainHead 重复·互补）：
 *   - verifyChainHead：逐条重算 current_hash + 校验 prev_hash 链式链接（顺序依赖·证明链未断）。
 *   - merkle_root：把整条链折叠成单一 64-hex 摘要（integrityRoot）+ 支持单条包含证明。
 *     价值：①一个可移植的「整链指纹」进 Repro Receipt；②inclusion proof 让外部审计方
 *     无需下载全部 call_records 即可密码学验证「证据 X 确实在 run R 的链内」。
 *
 * 跨语言字节相等契约（与 canonical_hash 同等强度的信任根）：
 *   combine(left, right) = sha256( utf8(left ++ right) )，left/right 均为 64-hex 字符串。
 *   叶 = call_records.current_hash（seq 升序）。全程纯 ASCII 字节拼接，无浮点 / 无键序 / 无数值规约歧义
 *   → TS computeMerkleRoot 与 Python compute_merkle_root 对同一叶集合产出**字节相同**的根
 *     （由 tests/evidence_log/merkle_cross_lang.test.ts spawnSync python3 逐位断言）。
 *
 * 算法（Bitcoin 风格·duplicate-last-on-odd·确定性·可复现）：
 *   - 0 叶 → ZERO_ROOT（诚实：空集无完整性）
 *   - 1 叶 → 根 = 该叶（单叶即根）
 *   - N≥2 叶 → 逐层 pairwise combine，奇数层末叶自复制凑偶，直到剩 1。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。叶校验 fail-fast（禁静默 coerce）。
 */

import { createHash } from 'node:crypto';

import type { Database } from 'better-sqlite3';

/** 空 Merkle 根（0 叶时的诚实占位·与 GENESIS_PREV_HASH 同形 64-hex）。 */
export const ZERO_MERKLE_ROOT = '0'.repeat(64);

/** 64 小写十六进制字符的正则（叶校验）。 */
const HEX64 = /^[0-9a-f]{64}$/;

/**
 * Merkle 树（按层存储·level 0 = 叶·末层 = [root]）。
 * levels 用于可视化 / 包含证明推导。
 */
export interface MerkleTree {
  /** 按层存储的节点哈希（levels[0] = 叶·levels[levels.length-1] = [root]）。 */
  readonly levels: readonly (readonly string[])[];
  /** 叶数量（= call_records 行数）。 */
  readonly leafCount: number;
  /** Merkle 根（64-hex·0 叶时为 ZERO_MERKLE_ROOT）。 */
  readonly root: string;
}

/** Merkle 包含证明（audit path）。 */
export interface MerkleInclusionProof {
  /** 叶的 seq 索引（在叶数组中的位置）。 */
  readonly leafIndex: number;
  /** 叶数量（验证方需知树形以正确折叠）。 */
  readonly leafCount: number;
  /** 叶哈希（被证明包含的 current_hash）。 */
  readonly leaf: string;
  /** 审计路径：每层的兄弟节点哈希（不含叶自身·按从叶到根的层序）。 */
  readonly siblings: readonly string[];
  /** 期望根（验证比对目标）。 */
  readonly expectedRoot: string;
}

/**
 * 组合两个 64-hex 节点为父节点：sha256( utf8(left ++ right) )。
 *
 * 跨语言字节相等的基石：输入是 ASCII hex 字符串拼接，TS 与 Python 产出相同字节 → 相同摘要。
 *
 * @throws Error 若 left/right 非 64-hex（fail-fast·禁静默 coerce 错误叶）
 */
export function combineHashes(left: string, right: string): string {
  assertHex64(left, 'combineHashes.left');
  assertHex64(right, 'combineHashes.right');
  return createHash('sha256').update(left + right, 'utf8').digest('hex');
}

/**
 * 由叶哈希数组构建 Merkle 树（duplicate-last-on-odd）。
 *
 * @param leafHashes 叶哈希数组（须按 seq 升序·通常为 call_records.current_hash 列）。
 * @returns MerkleTree（levels + leafCount + root）
 *
 * @throws {code:'MERKLE_LEAF_INVALID'} 任一叶非 64-hex
 */
export function buildMerkleTree(leafHashes: readonly string[]): MerkleTree {
  if (leafHashes.length === 0) {
    return { levels: [], leafCount: 0, root: ZERO_MERKLE_ROOT };
  }

  // 校验全部叶（先校验再建树·任一非法即 fail-fast，不产出半棵树）
  for (const [index, leaf] of leafHashes.entries()) {
    assertHex64(leaf, `buildMerkleTree.leafHashes[${index}]`);
  }

  // 用独立 initialLevel 让 current 类型确定为 string[]（避免 levels[0] 索引访问推断成
  // string[] | undefined·noUncheckedIndexedAccess 下会污染后续所有索引访问）。
  const initialLevel: string[] = [...leafHashes];
  const levels: string[][] = [initialLevel];
  let current = initialLevel;

  // 单叶：根 = 该叶（levels 仅一层·root = leaf）
  if (current.length === 1) {
    const root = current[0];
    if (root === undefined) {
      // 不可达（length===1 已守·防御性·禁 non-null 断言）
      throw new Error('buildMerkleTree: single-leaf level missing entry');
    }
    return { levels, leafCount: leafHashes.length, root };
  }

  // 逐层折叠（duplicate-last-on-odd）
  while (current.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      // 奇数末叶自复制：i+1 越界时 fallback 到 current[i]
      const right = current[i + 1] ?? current[i];
      if (left === undefined || right === undefined) {
        // 不可达（i < current.length·防御性·禁 non-null 断言·与 combineHashes 形参类型一致）
        throw new Error(`buildMerkleTree: level node undefined at index ${i}`);
      }
      next.push(combineHashes(left, right));
    }
    levels.push(next);
    current = next;
  }

  const root = current[0];
  if (root === undefined) {
    throw new Error('buildMerkleTree: failed to reduce to a single root');
  }
  return { levels, leafCount: leafHashes.length, root };
}

/**
 * 便捷：由叶哈希数组直接算 Merkle 根（不返回 levels·热路径用）。
 */
export function computeMerkleRoot(leafHashes: readonly string[]): string {
  return buildMerkleTree(leafHashes).root;
}

/**
 * 为指定叶索引推导包含证明（audit path）。
 *
 * @param leafHashes 叶哈希数组（须与建树同序）
 * @param leafIndex 被证明包含的叶索引（0-based）
 * @returns MerkleInclusionProof
 *
 * @throws {code:'MERKLE_LEAF_INVALID'} 叶非法
 * @throws {code:'MERKLE_INDEX_OUT_OF_RANGE'} leafIndex 越界
 * @throws {code:'MERKLE_EMPTY_TREE'} 空树无包含证明
 */
export function computeMerkleInclusionProof(
  leafHashes: readonly string[],
  leafIndex: number,
): MerkleInclusionProof {
  if (leafHashes.length === 0) {
    throw Object.assign(
      new Error('computeMerkleInclusionProof: empty tree has no inclusion proof'),
      { code: 'MERKLE_EMPTY_TREE' },
    );
  }
  if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= leafHashes.length) {
    throw Object.assign(
      new Error(
        `computeMerkleInclusionProof: leafIndex ${leafIndex} out of range [0, ${leafHashes.length})`,
      ),
      { code: 'MERKLE_INDEX_OUT_OF_RANGE', leafIndex, leafCount: leafHashes.length },
    );
  }

  const tree = buildMerkleTree(leafHashes);
  const siblings: string[] = [];
  let idx = leafIndex;

  // 逐层收集兄弟节点（levels[0] = 叶层）
  for (let level = 0; level < tree.levels.length - 1; level += 1) {
    const nodes = tree.levels[level];
    if (nodes === undefined) {
      throw new Error(`computeMerkleInclusionProof: level ${level} undefined`);
    }
    // 兄弟索引：偶数叶的兄弟在右（idx+1），奇数叶的兄弟在左（idx-1）；
    // 末叶为奇数时兄弟 = 自身（duplicate-last 的复制体）。
    const siblingIndex = idx % 2 === 0 ? idx + 1 : idx - 1;
    const sibling = nodes[siblingIndex] ?? nodes[idx]; // 越界 → 自复制兄弟
    if (sibling === undefined) {
      throw new Error(
        `computeMerkleInclusionProof: sibling undefined at level ${level} index ${siblingIndex}`,
      );
    }
    siblings.push(sibling);
    idx = Math.floor(idx / 2);
  }

  const leaf = leafHashes[leafIndex];
  if (leaf === undefined) {
    throw new Error('computeMerkleInclusionProof: leaf undefined');
  }

  return {
    leafIndex,
    leafCount: leafHashes.length,
    leaf,
    siblings,
    expectedRoot: tree.root,
  };
}

/**
 * 验证包含证明：用叶 + 审计路径重算根，与 expectedRoot 比对。
 *
 * @returns ok=true 表示叶确实在期望根对应的树内
 */
export function verifyMerkleInclusionProof(proof: MerkleInclusionProof): { ok: boolean } {
  let computed = proof.leaf;
  let idx = proof.leafIndex;

  for (const sibling of proof.siblings) {
    // 偶数索引：叶在左·combine(leaf, sibling)；奇数索引：叶在右·combine(sibling, leaf)
    computed = idx % 2 === 0 ? combineHashes(computed, sibling) : combineHashes(sibling, computed);
    idx = Math.floor(idx / 2);
  }

  // 单叶树（siblings 为空）：computed 仍 = leaf，应 = expectedRoot（单叶即根）
  return { ok: computed === proof.expectedRoot };
}

// ---------- DB 适配：从 call_records 取叶并算根/包含证明 ----------

/**
 * 链叶快照：hashes 与 seqs 平行数组（同序）。
 * seqs 用于把 API 的 seq 参数映射到叶索引（不假设 seq 连续·append-only 下稳健）。
 */
export interface ChainLeaves {
  readonly hashes: readonly string[];
  readonly seqs: readonly number[];
}

/**
 * 从 evidence_log 的 call_records 取 (seq, current_hash)（seq 升序）作为 Merkle 叶。
 * 跳过缺字段的损坏行（防御性·禁把 undefined 进 Merkle 树）。
 */
export function getChainLeaves(db: Database): ChainLeaves {
  const rows = db
    .prepare('SELECT seq, current_hash FROM call_records ORDER BY seq ASC')
    .all() as { seq?: number; current_hash?: string }[];
  const hashes: string[] = [];
  const seqs: number[] = [];
  for (const row of rows) {
    if (typeof row.seq === 'number' && typeof row.current_hash === 'string') {
      hashes.push(row.current_hash);
      seqs.push(row.seq);
    }
  }
  return { hashes, seqs };
}

/**
 * 从 evidence_log 的 call_records 表取 current_hash（seq 升序）作为叶，算 Merkle 根。
 *
 * @returns { root, leafCount } —— 整链完整性指纹
 */
export function computeChainMerkleRoot(db: Database): {
  readonly root: string;
  readonly leafCount: number;
} {
  const { hashes } = getChainLeaves(db);
  const tree = buildMerkleTree(hashes);
  return { root: tree.root, leafCount: tree.leafCount };
}

/**
 * 按 seq 推导该 call_record 在链内的 Merkle 包含证明。
 *
 * seq → leafIndex 映射用平行 seqs 数组定位（不假设 seq 连续·append-only 下稳健）。
 *
 * @throws {code:'MERKLE_SEQ_NOT_FOUND'} seq 不在链内
 */
export function computeChainInclusionProof(
  db: Database,
  seq: number,
): { readonly proof: MerkleInclusionProof; readonly leafIndex: number } {
  const { hashes, seqs } = getChainLeaves(db);
  const leafIndex = seqs.indexOf(seq);
  if (leafIndex === -1) {
    throw Object.assign(new Error(`computeChainInclusionProof: seq ${seq} not found in chain`), {
      code: 'MERKLE_SEQ_NOT_FOUND',
      seq,
    });
  }
  return { proof: computeMerkleInclusionProof(hashes, leafIndex), leafIndex };
}

// ---------- 内部校验 ----------

/**
 * 断言字符串为 64 小写十六进制（fail-fast·禁静默 coerce 非法叶进 Merkle 树）。
 *
 * @throws {code:'MERKLE_LEAF_INVALID'} 非 64-hex
 */
function assertHex64(value: unknown, context: string): void {
  if (typeof value !== 'string' || !HEX64.test(value)) {
    throw Object.assign(
      new Error(
        `${context}: expected 64-char lowercase hex SHA-256, got ${typeof value} "${value}"`,
      ),
      { code: 'MERKLE_LEAF_INVALID', context, value },
    );
  }
}
