/**
 * shared/crypto/merkle —— 浏览器侧 Merkle 包含证明独立重算（Live Reproof + Tamper Theatre 核心）。
 *
 * Authority: 镜像后端 src/evidence_log/merkle_root.ts 的 combineHashes +
 *            verifyMerkleInclusionProof 算法（spec 09_repro_determinism.md §4 integrity root）。
 * Provenance: 移植自 v1 前端 frontend/src/lib/merkle.ts（805592e 树·本仓库自有代码），
 *            v2 重写时一度丢失，R2 批次按原语义恢复（REUSE/ADAPT · 零新依赖）。
 *
 * 用 Web Crypto subtle.digest('SHA-256') 实现——浏览器原生、零依赖、经 FIPS 审计的密码学原语。
 * 生产浏览器（Chrome/Firefox/Safari/Edge）100% 提供 crypto.subtle；vitest jsdom 环境
 * 由 Node webcrypto 补齐 subtle（见 __tests__/browser_reproof.test.tsx 的防御性注入）。
 *
 * 跨语言字节相等契约（与后端 merkle_root.ts 注释同等强度）：
 *   combine(left, right) = sha256( utf8(left ++ right) )，left/right 均为 64-hex 字符串。
 *   全程纯 ASCII 字节拼接 → 浏览器 Web Crypto / Node createHash / Python hashlib 对同一输入
 *   产出**字节相同**的摘要（由 __tests__/browser_reproof.test.tsx 用 GOLDEN_* 断言）。
 *
 * 价值（Live Reproof 卖点）：外部审计方持有单条包含证明 + run 的 merkleRoot，即可在浏览器里
 *   独立验证「证据 X（seq=N）确实在 run R 的链内」——无需下载全部 call_records、无需信任服务端。
 *   Tamper Theatre 进一步演示：翻转任一叶的单个 hex 字符 → 重算根立即与期望根不符 → 篡改可观测。
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch / 桩。leaf 非 64-hex fail-fast 抛错。
 */

const HEX64 = /^[0-9a-f]{64}$/;

/** 空 Merkle 根（0 叶时的诚实占位·与后端 ZERO_MERKLE_ROOT 同形 64-hex）。 */
export const ZERO_MERKLE_ROOT = '0'.repeat(64);

/**
 * 浏览器侧 SHA-256(message) → 64 小写 hex（Web Crypto subtle.digest）。
 *
 * 用 TextEncoder 编码为 UTF-8 字节再摘要。返回 ArrayBuffer 转十六进制字符串。
 */
export async function sha256Hex(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const digestBuffer = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(digestBuffer));
}

/** Uint8Array → 64 小写 hex 字符串（每字节 2 字符零填充）。 */
function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i];
    if (byte === undefined) {
      // 不可达（i < bytes.length·防御性·禁 non-null 断言）
      throw new Error(`bytesToHex: byte undefined at index ${i}`);
    }
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * 组合两个 64-hex 节点为父节点：sha256(utf8(left + right))。
 *
 * 镜像后端 merkle_root.ts combineHashes——跨语言字节相等的基石。
 *
 * @throws Error 若 left/right 非 64-hex（fail-fast·禁静默 coerce 错误叶进 Merkle 树）
 */
export async function combineHashes(left: string, right: string): Promise<string> {
  assertHex64(left, 'combineHashes.left');
  assertHex64(right, 'combineHashes.right');
  return sha256Hex(left + right);
}

/**
 * 浏览器侧 Merkle 树（按层存储·level 0 = 叶·末层 = [root]）。
 * 镜像后端 merkle_root.ts MerkleTree（async 版·combine 用 Web Crypto）。
 */
export interface MerkleTree {
  readonly levels: readonly (readonly string[])[];
  readonly leafCount: number;
  readonly root: string;
}

/**
 * 由叶哈希数组构建 Merkle 树（duplicate-last-on-odd·镜像后端 buildMerkleTree）。
 *
 * @param leafHashes 叶哈希数组（须按 seq 升序·通常为 call_records.current_hash 列）
 * @returns MerkleTree（levels + leafCount + root）
 *
 * @throws Error 任一叶非 64-hex（fail-fast·先校验再建树·不产出半棵树）
 */
export async function buildMerkleTree(leafHashes: readonly string[]): Promise<MerkleTree> {
  for (const [index, leaf] of leafHashes.entries()) {
    assertHex64(leaf, `buildMerkleTree.leafHashes[${index}]`);
  }
  if (leafHashes.length === 0) {
    return { levels: [], leafCount: 0, root: ZERO_MERKLE_ROOT };
  }
  const initialLevel: string[] = [...leafHashes];
  const levels: string[][] = [initialLevel];
  let current = initialLevel;

  if (current.length === 1) {
    const root = current[0];
    if (root === undefined) {
      // 不可达（length===1 已守·防御性·禁 non-null 断言）
      throw new Error('buildMerkleTree: single-leaf level missing entry');
    }
    return { levels, leafCount: leafHashes.length, root };
  }

  while (current.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      // 奇数末叶自复制：i+1 越界时 fallback 到 current[i]
      const right = current[i + 1] ?? current[i];
      if (left === undefined || right === undefined) {
        throw new Error(`buildMerkleTree: level node undefined at index ${i}`);
      }
      next.push(await combineHashes(left, right));
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
 * 便捷：由叶哈希数组直接算 Merkle 根（不返回 levels）。
 * 镜像后端 merkle_root.ts computeMerkleRoot（async 版）。
 */
export async function computeMerkleRoot(leafHashes: readonly string[]): Promise<string> {
  return (await buildMerkleTree(leafHashes)).root;
}

/** 浏览器侧包含证明形状（镜像后端 MerkleInclusionProof / IntegrityProofDto 的证明子集）。 */
export interface InclusionProof {
  readonly leafIndex: number;
  readonly leaf: string;
  readonly siblings: readonly string[];
  readonly expectedRoot: string;
}

/**
 * 浏览器侧独立重算：用 leaf + 审计路径重算根，与 expectedRoot 比对。
 *
 * 镜像后端 merkle_root.ts verifyMerkleInclusionProof：
 *   - 偶数索引：叶在左 → combine(leaf, sibling)
 *   - 奇数索引：叶在右 → combine(sibling, leaf)
 *   - 逐层 idx = floor(idx / 2)
 *   - 单叶树（siblings 空）：computed 仍 = leaf，应 = expectedRoot（单叶即根）
 *
 * @returns { ok, computedRoot } —— ok=true 表示叶确实在期望根对应的树内
 *
 * @throws Error 若 leaf/任一 sibling 非 64-hex
 */
export async function verifyInclusionProof(
  proof: InclusionProof,
): Promise<{ readonly ok: boolean; readonly computedRoot: string }> {
  assertHex64(proof.leaf, 'verifyInclusionProof.leaf');
  let computed = proof.leaf;
  let idx = proof.leafIndex;
  for (const sibling of proof.siblings) {
    assertHex64(sibling, 'verifyInclusionProof.sibling');
    computed =
      idx % 2 === 0
        ? await combineHashes(computed, sibling)
        : await combineHashes(sibling, computed);
    idx = Math.floor(idx / 2);
  }
  return { ok: computed === proof.expectedRoot, computedRoot: computed };
}

/**
 * 翻转一个 64-hex 字符串的末位 hex 字符（保持 64-hex 合法·仅改一字节）。
 *
 * Tamper Theatre 用：模拟「篡改一条证据的哈希」。翻转后叶仍通过 HEX64 校验（合法格式），
 * 但语义已变——重算的 Merkle 根将与期望根不符，演示 tamper-evidence。
 *
 * @throws Error 若 value 非 64-hex
 */
export function flipLastHexChar(value: string): string {
  assertHex64(value, 'flipLastHexChar.value');
  const lastChar = value.charAt(63);
  const flipped = lastChar === 'a' ? 'b' : 'a';
  return value.slice(0, 63) + flipped;
}

/** 断言字符串为 64 小写十六进制（fail-fast·禁静默 coerce 非法叶）。 */
function assertHex64(value: unknown, context: string): void {
  if (typeof value !== 'string' || !HEX64.test(value)) {
    throw new Error(`${context}: expected 64-char lowercase hex SHA-256, got "${String(value)}"`);
  }
}
